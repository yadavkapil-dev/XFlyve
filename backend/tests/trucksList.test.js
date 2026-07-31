const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Chainable mock matching Truck.find(query).populate().sort().skip().limit().lean()
const findChain = (result) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

const loadController = () => {
  jest.resetModules();

  const Truck = { find: jest.fn(), countDocuments: jest.fn() };
  const Job = {};
  const TruckAssignment = {};

  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/dailyTruckAssignment", () => TruckAssignment);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/truckController"), Truck };
};

describe("GET /api/admin/trucks (getAllTrucks) — pagination/search/filter/sort", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([{ _id: "t1" }]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.getAllTrucks({ query: {} }, res);

    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.sort).toHaveBeenCalledWith({ truckNumber: 1 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("page 2 skip", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllTrucks({ query: { page: "2", limit: "5" } }, res);

    expect(chain.skip).toHaveBeenCalledWith(5);
  });

  test("invalid limit falls back to default (20)", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllTrucks({ query: { limit: "xyz" } }, res);

    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  test("sorting override", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllTrucks({ query: { sort: "-createdAt" } }, res);

    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  test("filter: status", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllTrucks({ query: { status: "out-of-service" } }, res);

    expect(Truck.find).toHaveBeenCalledWith(expect.objectContaining({ status: "out-of-service" }));
  });

  test("search: matches by truckNumber", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllTrucks({ query: { search: "T-101" } }, res);

    const calledQuery = Truck.find.mock.calls[0][0];
    expect(calledQuery.$or).toEqual([{ truckNumber: expect.any(RegExp) }]);
  });

  test("combined search + filter + pagination", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([{ _id: "t1" }]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(1);
    Truck.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllTrucks(
      { query: { search: "T-1", status: "available", page: "1", limit: "10" } },
      res
    );

    const calledQuery = Truck.find.mock.calls[0][0];
    expect(calledQuery.status).toBe("available");
    expect(calledQuery.$or).toBeDefined();
    expect(chain.limit).toHaveBeenCalledWith(10);
  });
});

describe("GET /api/admin/trucks — fleet-wide outOfServiceCount", () => {
  afterEach(() => jest.restoreAllMocks());

  test("outOfServiceCount reflects the whole fleet, not just the current page", async () => {
    const { controller, Truck } = loadController();
    // Page 1, limit 1 — only one truck comes back on this page, but 7 trucks
    // fleet-wide are out of service/maintenance.
    const chain = findChain([{ _id: "t1", status: "available" }]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(50); // total matching the list query
    Truck.countDocuments.mockResolvedValueOnce(7); // fleet-wide out-of-service count

    const res = makeResponse();
    await controller.getAllTrucks({ query: { page: "1", limit: "1" } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ outOfServiceCount: 7 }));
  });

  test("outOfServiceCount query is independent of the current status/search filters", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(0);
    Truck.countDocuments.mockResolvedValueOnce(3);

    const res = makeResponse();
    await controller.getAllTrucks({ query: { status: "available", search: "T-1" } }, res);

    // The second countDocuments call (out-of-service tally) must not be
    // scoped by the admin's current status/search filters.
    const outOfServiceQuery = Truck.countDocuments.mock.calls[1][0];
    expect(outOfServiceQuery).toEqual({
      recordStatus: { $ne: "archived" },
      status: { $in: ["out-of-service", "maintenance"] },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ outOfServiceCount: 3 }));
  });

  test("outOfServiceCount excludes archived trucks", async () => {
    const { controller, Truck } = loadController();
    const chain = findChain([]);
    Truck.find.mockReturnValueOnce(chain);
    Truck.countDocuments.mockResolvedValueOnce(0);
    Truck.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllTrucks({ query: {} }, res);

    const outOfServiceQuery = Truck.countDocuments.mock.calls[1][0];
    expect(outOfServiceQuery.recordStatus).toEqual({ $ne: "archived" });
  });
});
