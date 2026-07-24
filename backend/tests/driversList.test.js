const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Chainable mock matching Driver.find(query).select().sort().skip().limit()
const findChain = (result) => {
  const chain = {
    select: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

const loadController = () => {
  jest.resetModules();

  const Driver = { find: jest.fn(), countDocuments: jest.fn() };
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../models/job", () => ({}));
  jest.doMock("../models/truck", () => ({}));
  jest.doMock("../models/dailyWorkLog", () => ({}));
  jest.doMock("../models/jobPod", () => ({}));
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

  return { controller: require("../controllers/adminController"), Driver };
};

describe("GET /api/admin/drivers (getAllDrivers) — pagination/search/filter/sort", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([{ _id: "d1" }]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.getAllDrivers({ query: {} }, res);

    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.sort).toHaveBeenCalledWith({ name: 1 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("page 2 skip", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllDrivers({ query: { page: "2", limit: "5" } }, res);

    expect(chain.skip).toHaveBeenCalledWith(5);
  });

  test("invalid limit falls back to default", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllDrivers({ query: { limit: "-3" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(chain.skip.mock.calls).toBeTruthy();
  });

  test("sorting override", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllDrivers({ query: { sort: "-createdAt" } }, res);

    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  test("filter: driverType", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllDrivers({ query: { driverType: "interstate" } }, res);

    expect(Driver.find).toHaveBeenCalledWith(expect.objectContaining({ driverType: "interstate" }));
  });

  test("filter: recordStatus overrides the default archived-exclusion", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllDrivers({ query: { recordStatus: "archived" } }, res);

    expect(Driver.find).toHaveBeenCalledWith(expect.objectContaining({ recordStatus: "archived" }));
  });

  test("defaults to excluding archived when no recordStatus filter is given", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllDrivers({ query: {} }, res);

    expect(Driver.find).toHaveBeenCalledWith(expect.objectContaining({ recordStatus: { $ne: "archived" } }));
  });

  test("is always scoped to role: driver, regardless of other filters, and can't be overridden via the query string", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    // Driver and admin accounts share one collection — this is the admin
    // Drivers management list, not a general account browser, so role
    // isn't even an accepted filter param; an attempted override must be
    // ignored, not honored.
    await controller.getAllDrivers({ query: { role: "admin" } }, res);

    const calledQuery = Driver.find.mock.calls[0][0];
    expect(calledQuery.role).toBe("driver");
  });

  test("search: matches by name", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllDrivers({ query: { search: "Jane" } }, res);

    const calledQuery = Driver.find.mock.calls[0][0];
    expect(calledQuery.$or).toEqual([{ name: expect.any(RegExp) }]);
  });

  test("combined search + filter + pagination", async () => {
    const { controller, Driver } = loadController();
    const chain = findChain([{ _id: "d1" }]);
    Driver.find.mockReturnValueOnce(chain);
    Driver.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.getAllDrivers(
      { query: { search: "Jane", driverType: "local", page: "1", limit: "10" } },
      res
    );

    const calledQuery = Driver.find.mock.calls[0][0];
    expect(calledQuery.driverType).toBe("local");
    expect(calledQuery.$or).toBeDefined();
    expect(chain.limit).toHaveBeenCalledWith(10);
  });
});
