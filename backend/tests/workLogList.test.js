const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// find().populate().populate().sort().skip().limit() (no .lean() in this controller)
const findChain = (result) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    skip: jest.fn(() => chain),
    limit: jest.fn().mockResolvedValue(result),
  };
  return chain;
};

const loadController = () => {
  jest.resetModules();

  const DailyWorkLog = { find: jest.fn(), countDocuments: jest.fn(), aggregate: jest.fn() };
  jest.doMock("../models/dailyWorkLog", () => DailyWorkLog);
  jest.doMock("../models/job", () => ({}));
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return { controller: require("../controllers/workLogController"), DailyWorkLog };
};

const VALID_DRIVER_ID = "507f1f77bcf86cd799439011";

describe("GET /api/worklogs/admin (getAllLogsForAdmin) — pagination/filter/sort", () => {
  afterEach(() => jest.restoreAllMocks());

  test("page 1 defaults", async () => {
    const { controller, DailyWorkLog } = loadController();
    const chain = findChain([{ _id: "log1" }]);
    DailyWorkLog.find.mockReturnValueOnce(chain);
    DailyWorkLog.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.getAllLogsForAdmin({ params: {}, query: {} }, res);

    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.sort).toHaveBeenCalledWith({ workDate: -1, date: -1 });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
    );
  });

  test("page 2 skip", async () => {
    const { controller, DailyWorkLog } = loadController();
    const chain = findChain([]);
    DailyWorkLog.find.mockReturnValueOnce(chain);
    DailyWorkLog.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllLogsForAdmin({ params: {}, query: { page: "2", limit: "10" } }, res);

    expect(chain.skip).toHaveBeenCalledWith(10);
  });

  test("invalid page falls back to page 1", async () => {
    const { controller, DailyWorkLog } = loadController();
    const chain = findChain([]);
    DailyWorkLog.find.mockReturnValueOnce(chain);
    DailyWorkLog.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllLogsForAdmin({ params: {}, query: { page: "-9" } }, res);

    expect(chain.skip).toHaveBeenCalledWith(0);
  });

  test("driverId from the URL param scopes the query", async () => {
    const { controller, DailyWorkLog } = loadController();
    const chain = findChain([]);
    DailyWorkLog.find.mockReturnValueOnce(chain);
    DailyWorkLog.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllLogsForAdmin({ params: { driverId: VALID_DRIVER_ID }, query: {} }, res);

    expect(DailyWorkLog.find).toHaveBeenCalledWith(expect.objectContaining({ driverId: VALID_DRIVER_ID }));
  });

  test("filter: date range on workDate", async () => {
    const { controller, DailyWorkLog } = loadController();
    const chain = findChain([]);
    DailyWorkLog.find.mockReturnValueOnce(chain);
    DailyWorkLog.countDocuments.mockResolvedValueOnce(0);

    const res = makeResponse();
    await controller.getAllLogsForAdmin({ params: {}, query: { dateFrom: "2026-07-01", dateTo: "2026-07-07" } }, res);

    const calledQuery = DailyWorkLog.find.mock.calls[0][0];
    expect(calledQuery.workDate.$gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(calledQuery.workDate.$lt.toISOString()).toBe("2026-07-08T00:00:00.000Z");
  });

  test("combined driverId + date range + pagination", async () => {
    const { controller, DailyWorkLog } = loadController();
    const chain = findChain([{ _id: "log1" }]);
    DailyWorkLog.find.mockReturnValueOnce(chain);
    DailyWorkLog.countDocuments.mockResolvedValueOnce(1);

    const res = makeResponse();
    await controller.getAllLogsForAdmin(
      {
        params: { driverId: VALID_DRIVER_ID },
        query: { dateFrom: "2026-07-01", page: "1", limit: "5" },
      },
      res
    );

    const calledQuery = DailyWorkLog.find.mock.calls[0][0];
    expect(calledQuery.driverId).toBe(VALID_DRIVER_ID);
    expect(calledQuery.workDate.$gte).toBeDefined();
    expect(chain.limit).toHaveBeenCalledWith(5);
  });
});

describe("GET /api/worklogs/admin/weekly-stats (getWeeklyStatsForAdmin) — real week aggregate, not the loaded page", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns the week's totals from the aggregate, not page-limited data", async () => {
    const { controller, DailyWorkLog } = loadController();
    DailyWorkLog.aggregate.mockResolvedValueOnce([
      { _id: null, count: 42, hours: 310.5, kilometers: 9800, deliveries: 96 },
    ]);

    const res = makeResponse();
    await controller.getWeeklyStatsForAdmin({ query: { date: "2026-07-20" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        weeklyLogs: 42,
        weeklyHours: 310.5,
        weeklyKilometres: 9800,
        weeklyDeliveries: 96,
      },
    });
  });

  test("week range is Monday-start, matching the dashboard-stats endpoint's shared helper", async () => {
    const { controller, DailyWorkLog } = loadController();
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    // 2026-07-20 is a Monday.
    const res = makeResponse();
    await controller.getWeeklyStatsForAdmin({ query: { date: "2026-07-20" } }, res);

    const matchStage = DailyWorkLog.aggregate.mock.calls[0][0][0].$match;
    expect(matchStage.date.$gte.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(matchStage.date.$lt.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  test("a mid-week date still resolves to that week's Monday", async () => {
    const { controller, DailyWorkLog } = loadController();
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    // 2026-07-23 is a Thursday; that week's Monday is 2026-07-20.
    const res = makeResponse();
    await controller.getWeeklyStatsForAdmin({ query: { date: "2026-07-23" } }, res);

    const matchStage = DailyWorkLog.aggregate.mock.calls[0][0][0].$match;
    expect(matchStage.date.$gte.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(matchStage.date.$lt.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  test("optional driverId scopes the aggregate to one driver", async () => {
    const { controller, DailyWorkLog } = loadController();
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    const res = makeResponse();
    await controller.getWeeklyStatsForAdmin({ query: { date: "2026-07-20", driverId: VALID_DRIVER_ID } }, res);

    const matchStage = DailyWorkLog.aggregate.mock.calls[0][0][0].$match;
    expect(matchStage.driverId.toString()).toBe(VALID_DRIVER_ID);
  });

  test("an invalid driverId is ignored rather than scoping to garbage", async () => {
    const { controller, DailyWorkLog } = loadController();
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    const res = makeResponse();
    await controller.getWeeklyStatsForAdmin({ query: { date: "2026-07-20", driverId: "not-an-id" } }, res);

    const matchStage = DailyWorkLog.aggregate.mock.calls[0][0][0].$match;
    expect(matchStage.driverId).toBeUndefined();
  });

  test("falls back to today's server date when no date param is given", async () => {
    const { controller, DailyWorkLog } = loadController();
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    const res = makeResponse();
    await controller.getWeeklyStatsForAdmin({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("handles an empty aggregate (no logs this week) without crashing", async () => {
    const { controller, DailyWorkLog } = loadController();
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    const res = makeResponse();
    await controller.getWeeklyStatsForAdmin({ query: { date: "2026-07-20" } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { weeklyLogs: 0, weeklyHours: 0, weeklyKilometres: 0, weeklyDeliveries: 0 },
    });
  });

  test("returns 500 on an unexpected error", async () => {
    const { controller, DailyWorkLog } = loadController();
    DailyWorkLog.aggregate.mockRejectedValueOnce(new Error("db down"));

    const res = makeResponse();
    await controller.getWeeklyStatsForAdmin({ query: { date: "2026-07-20" } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
