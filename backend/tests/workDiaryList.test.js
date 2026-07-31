const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
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

  test("page 2 skip with includeOlder combined", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { page: "2", limit: "5", includeOlder: "true" },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    expect(chain.skip).toHaveBeenCalledWith(5);
    const calledQuery = WorkDiary.find.mock.calls[0][0];
    expect(calledQuery.driverId).toBe(VALID_DRIVER_ID);
    // includeOlder:"true" means no 30-day-cutoff $or should be applied.
    expect(calledQuery.$or).toBeUndefined();
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

  test("dateFrom/dateTo (with includeOlder=true, so no 30-day-cutoff $or to combine with) builds a workDate range with an uploadDate-when-null fallback", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { dateFrom: "2026-07-01", dateTo: "2026-07-31", includeOlder: "true" },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    const calledQuery = WorkDiary.find.mock.calls[0][0];
    const [workDateClause, fallbackClause] = calledQuery.$or;
    expect(workDateClause.workDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(workDateClause.workDate.$lt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(fallbackClause.workDate).toBeNull();
    expect(fallbackClause.uploadDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  test("dateFrom/dateTo WITHOUT includeOlder (default 30-day cutoff $or still applies) combines both $or clauses via $and instead of one clobbering the other", async () => {
    const { controller, WorkDiary } = loadController();
    const chain = leanFindChain([]);
    WorkDiary.find.mockReturnValueOnce(chain);
    WorkDiary.countDocuments.mockResolvedValueOnce(0);

    const req = {
      params: { driverId: VALID_DRIVER_ID },
      query: { dateFrom: "2026-07-01", dateTo: "2026-07-31" },
      user: { id: VALID_DRIVER_ID, role: "driver" },
    };
    const res = makeResponse();
    await controller.listWorkDiariesByDriver(req, res);

    const calledQuery = WorkDiary.find.mock.calls[0][0];
    // Neither the cutoff's $or nor the date-range's $or was silently
    // dropped — both survive as separate entries under $and.
    expect(calledQuery.$or).toBeUndefined();
    expect(calledQuery.$and).toHaveLength(2);
    const [cutoffEntry, dateRangeEntry] = calledQuery.$and;
    expect(cutoffEntry.$or).toBeDefined();
    expect(dateRangeEntry.$or[0].workDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
