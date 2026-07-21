const mongoose = require("mongoose");

const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// listAllPODs/listPendingPODApprovals: find().populate().populate().sort().skip().limit() (no .lean())
const plainFindChain = (result) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

// listPODsByDriver: find().populate().sort().skip().limit().lean()
const leanFindChain = (result) => {
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

  const JobPod = { find: jest.fn(), countDocuments: jest.fn() };
  jest.doMock("../models/jobPod", () => JobPod);
  jest.doMock("../models/job", () => ({}));
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/jobPodController"), JobPod };
};

const VALID_DRIVER_ID = "507f1f77bcf86cd799439011";

describe("GET /api/jobpods/admin/all (listAllPODs) — pagination/filter/sort", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults", async () => {
    const { controller, JobPod } = loadController();
    const chain = plainFindChain([{ _id: "p1" }]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.listAllPODs({ query: {}, user: { role: "admin", id: "admin1" } }, res);

    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("page 2 skip and custom limit", async () => {
    const { controller, JobPod } = loadController();
    const chain = plainFindChain([]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listAllPODs({ query: { page: "2", limit: "5" } }, res);

    expect(chain.skip).toHaveBeenCalledWith(5);
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  test("filter: status (approval status)", async () => {
    const { controller, JobPod } = loadController();
    const chain = plainFindChain([]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listAllPODs({ query: { status: "approved" } }, res);

    expect(JobPod.find).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" }));
  });

  test("filter: driverId", async () => {
    const { controller, JobPod } = loadController();
    const chain = plainFindChain([]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listAllPODs({ query: { driverId: VALID_DRIVER_ID } }, res);

    expect(JobPod.find).toHaveBeenCalledWith(expect.objectContaining({ driverId: VALID_DRIVER_ID }));
  });

  test("filter: date range (dateFrom/dateTo) on uploadDate", async () => {
    const { controller, JobPod } = loadController();
    const chain = plainFindChain([]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listAllPODs({ query: { dateFrom: "2026-07-01", dateTo: "2026-07-10" } }, res);

    const calledQuery = JobPod.find.mock.calls[0][0];
    expect(calledQuery.uploadDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(calledQuery.uploadDate.$lt.toISOString()).toBe("2026-07-11T00:00:00.000Z");
  });

  test("combined filter + pagination", async () => {
    const { controller, JobPod } = loadController();
    const chain = plainFindChain([{ _id: "p1" }]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.listAllPODs(
      { query: { status: "pending", driverId: VALID_DRIVER_ID, page: "1", limit: "10" } },
      res
    );

    const calledQuery = JobPod.find.mock.calls[0][0];
    expect(calledQuery.status).toBe("pending");
    expect(calledQuery.driverId).toBe(VALID_DRIVER_ID);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });
});

describe("GET /api/jobpods/admin/pending (listPendingPODApprovals) — pagination/filter", () => {
  afterEach(() => jest.restoreAllMocks());

  test("always fixes status to pending regardless of query", async () => {
    const { controller, JobPod } = loadController();
    const chain = plainFindChain([]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listPendingPODApprovals({ query: { status: "approved" } }, res);

    // status in query is ignored — this endpoint only ever returns pending.
    expect(JobPod.find).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
  });

  test("page 2 with driverId filter", async () => {
    const { controller, JobPod } = loadController();
    const chain = plainFindChain([]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listPendingPODApprovals({ query: { page: "2", driverId: VALID_DRIVER_ID } }, res);

    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(JobPod.find).toHaveBeenCalledWith(expect.objectContaining({ driverId: VALID_DRIVER_ID }));
  });
});

describe("GET /api/jobpods/driver/:driverId (listPODsByDriver) — pagination/filter, URL-scoped", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults, scoped to the URL driverId", async () => {
    const { controller, JobPod } = loadController();
    const chain = leanFindChain([{ _id: "p1" }]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(1);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: {},
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listPODsByDriver(req, res);

    expect(JobPod.find).toHaveBeenCalledWith(expect.objectContaining({ driverId: VALID_DRIVER_ID }));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("a query-string driverId cannot override the URL-scoped driver (security)", async () => {
    const { controller, JobPod } = loadController();
    const chain = leanFindChain([]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(0);

    const otherDriverId = "6a3dd1a321d92512aa6c18a8";
    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { driverId: otherDriverId },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listPODsByDriver(req, res);

    const calledQuery = JobPod.find.mock.calls[0][0];
    expect(calledQuery.driverId).toBe(VALID_DRIVER_ID);
  });

  test("filter: status still applies within the scoped driver", async () => {
    const { controller, JobPod } = loadController();
    const chain = leanFindChain([]);
    JobPod.find.mockReturnValueOnce(chain);
    JobPod.countDocuments.mockResolvedValueOnce(0);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { status: "approved", includeOlder: "true" },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listPODsByDriver(req, res);

    const calledQuery = JobPod.find.mock.calls[0][0];
    expect(calledQuery.status).toBe("approved");
    expect(calledQuery.driverId).toBe(VALID_DRIVER_ID);
  });
});
