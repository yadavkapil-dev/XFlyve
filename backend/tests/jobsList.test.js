const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Chainable mock matching Job.find(query).populate().populate().sort().skip().limit().lean()
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

  const Job = { find: jest.fn(), countDocuments: jest.fn() };
  const Driver = {};
  const Truck = {};

  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/jobController"), Job };
};

describe("GET /api/jobs (getAllJobs) — pagination/filter/sort", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 uses the default page/limit and skip 0", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([{ _id: "job1" }]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.getAllJobs({ query: {} }, res);

    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })
    );
  });

  test("page 2 computes the correct skip", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(45);

    const res = makeResponse();
    await controller.getAllJobs({ query: { page: "2", limit: "20" } }, res);

    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 2, limit: 20, total: 45, totalPages: 3 } })
    );
  });

  test("invalid limit falls back to the default instead of erroring", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { limit: "not-a-number" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  test("limit above the server cap is clamped to 100", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { limit: "500" } }, res);

    expect(chain.limit).toHaveBeenCalledWith(100);
  });

  test("sorting: a valid sort param is applied", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { sort: "-createdAt" } }, res);

    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  test("sorting: an unrecognized sort field falls back to the default", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { sort: "password" } }, res);

    expect(chain.sort).toHaveBeenCalledWith({ jobDate: -1 });
  });

  test("filter: status", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { status: "in-progress" } }, res);

    expect(Job.find).toHaveBeenCalledWith(expect.objectContaining({ status: "in-progress" }));
    expect(Job.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ status: "in-progress" }));
  });

  test("filter: jobType", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { jobType: "interstate" } }, res);

    expect(Job.find).toHaveBeenCalledWith(expect.objectContaining({ jobType: "interstate" }));
  });

  test("filter: assignedTo (driver)", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);
    const driverId = "507f1f77bcf86cd799439011";

    const res = makeResponse();
    await controller.getAllJobs({ query: { assignedTo: driverId } }, res);

    expect(Job.find).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: driverId }));
  });

  test("filter: assignedTruck ignores an invalid ObjectId rather than erroring", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { assignedTruck: "not-an-id" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const calledQuery = Job.find.mock.calls[0][0];
    expect(calledQuery.assignedTruck).toBeUndefined();
  });

  test("filter: date range (dateFrom/dateTo) on jobDate", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { dateFrom: "2026-07-01", dateTo: "2026-07-10" } }, res);

    const calledQuery = Job.find.mock.calls[0][0];
    expect(calledQuery.jobDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(calledQuery.jobDate.$lt.toISOString()).toBe("2026-07-11T00:00:00.000Z");
  });

  test("getAllJobs never builds a $or clause — job search was removed entirely, not just from the UI", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    // Even if a caller still sends ?search=, getAllJobs has no code path
    // left that reads it.
    await controller.getAllJobs({ query: { search: "Woolworths" } }, res);

    const calledQuery = Job.find.mock.calls[0][0];
    expect(calledQuery.$or).toBeUndefined();
  });

  test("combined filter + pagination all apply together", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([{ _id: "job1" }]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.getAllJobs(
      {
        query: {
          status: "pending",
          jobType: "local",
          page: "2",
          limit: "5",
          sort: "-jobDate",
        },
      },
      res
    );

    const calledQuery = Job.find.mock.calls[0][0];
    expect(calledQuery.status).toBe("pending");
    expect(calledQuery.jobType).toBe("local");
    expect(chain.skip).toHaveBeenCalledWith(5);
    expect(chain.limit).toHaveBeenCalledWith(5);
    expect(chain.sort).toHaveBeenCalledWith({ jobDate: -1 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 2, limit: 5, total: 1, totalPages: 1 } })
    );
  });

  test("always excludes archived jobs regardless of other filters", async () => {
    const { controller, Job } = loadController();
    const chain = findChain([]);
    Job.find.mockReturnValueOnce(chain);
    Job.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllJobs({ query: { status: "completed" } }, res);

    const calledQuery = Job.find.mock.calls[0][0];
    expect(calledQuery.recordStatus).toEqual({ $ne: "archived" });
  });
});
