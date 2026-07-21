const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// listPendingWorkDiaryApprovals: find().populate().populate().populate().sort().skip().limit() (no .lean())
const plainFindChain = (result) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

// listWorkDiariesByDriver: find().populate().populate().sort().skip().limit().lean()
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

  const WorkDiary = { find: jest.fn(), countDocuments: jest.fn() };
  jest.doMock("../models/workDiary", () => WorkDiary);
  jest.doMock("../models/job", () => ({}));
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/workDiaryController"), WorkDiary };
};

const VALID_DRIVER_ID = "507f1f77bcf86cd799439011";

describe("GET /api/workdiaries/admin/pending (listPendingWorkDiaryApprovals) — pagination/filter", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults, fixed to status pending", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = plainFindChain([{ _id: "wd1" }]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.listPendingWorkDiaryApprovals({ query: {} }, res);

    expect(WorkDiary.find).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("page 2 skip", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = plainFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listPendingWorkDiaryApprovals({ query: { page: "2", limit: "10" } }, res);

    expect(chain.skip).toHaveBeenCalledWith(10);
  });

  test("invalid limit falls back to default", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = plainFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listPendingWorkDiaryApprovals({ query: { limit: "0" } }, res);

    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  test("filter: driverId", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = plainFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listPendingWorkDiaryApprovals({ query: { driverId: VALID_DRIVER_ID } }, res);

    expect(WorkDiary.find).toHaveBeenCalledWith(expect.objectContaining({ driverId: VALID_DRIVER_ID }));
  });

  test("filter: date range on uploadDate", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = plainFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.listPendingWorkDiaryApprovals({ query: { dateFrom: "2026-07-01" } }, res);

    const calledQuery = WorkDiary.find.mock.calls[0][0];
    expect(calledQuery.uploadDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("GET /api/workdiaries/driver/:driverId (listWorkDiariesByDriver) — pagination/filter, URL-scoped", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults, scoped to the URL driverId", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([{ _id: "wd1" }]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(1);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: {},
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    expect(WorkDiary.find).toHaveBeenCalledWith(expect.objectContaining({ driverId: VALID_DRIVER_ID }));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("page 2 skip with a status filter combined", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { page: "2", limit: "5", status: "rejected", includeOlder: "true" },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    expect(chain.skip).toHaveBeenCalledWith(5);
    const calledQuery = WorkDiary.find.mock.calls[0][0];
    expect(calledQuery.status).toBe("rejected");
    expect(calledQuery.driverId).toBe(VALID_DRIVER_ID);
  });

  test("sort override to workDate", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { sort: "workDate" },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    expect(chain.sort).toHaveBeenCalledWith({ workDate: 1 });
  });
});
