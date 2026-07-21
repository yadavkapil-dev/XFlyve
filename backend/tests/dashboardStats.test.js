const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const loadController = () => {
  jest.resetModules();

  const Driver = { countDocuments: jest.fn() };
  const Job = { aggregate: jest.fn() };
  const Truck = { countDocuments: jest.fn() };
  const DailyWorkLog = { distinct: jest.fn(), aggregate: jest.fn(), countDocuments: jest.fn() };
  const JobPod = {};

  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../models/dailyWorkLog", () => DailyWorkLog);
  jest.doMock("../models/jobPod", () => JobPod);
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

  return { controller: require("../controllers/adminController"), Driver, Job, Truck, DailyWorkLog };
};

describe("GET /api/admin/dashboard-stats", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns all the metrics HomePage.jsx displays, computed for the given date", async () => {
    const { controller, Driver, Job, Truck, DailyWorkLog } = loadController();

    Job.aggregate.mockResolvedValueOnce([
      { _id: "completed", count: 2 },
      { _id: "pending", count: 3 },
      { _id: "in-progress", count: 1 },
    ]);
    Driver.countDocuments.mockResolvedValueOnce(10);
    DailyWorkLog.distinct.mockResolvedValueOnce(["driver1", "driver2"]);
    Truck.countDocuments.mockResolvedValueOnce(1);
    DailyWorkLog.aggregate.mockResolvedValueOnce([{ _id: null, count: 15, hours: 120.5, kilometers: 3400 }]);

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: {
        date: "2026-07-20",
        todaysJobs: 6,
        completedToday: 2,
        pendingJobs: 3,
        totalDrivers: 10,
        missingWorkLogs: 8,
        trucksOutOfService: 1,
        weeklyLogs: 15,
        weeklyHours: 120.5,
        weeklyKilometres: 3400,
      },
    });
  });

  test("today's job query matches the exact UTC day range for the given date", async () => {
    const { controller, Job, Driver, Truck, DailyWorkLog } = loadController();

    Job.aggregate.mockResolvedValueOnce([]);
    Driver.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.distinct.mockResolvedValueOnce([]);
    Truck.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jobMatchStage = Job.aggregate.mock.calls[0][0][0].$match;
    expect(jobMatchStage.jobDate.$gte.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(jobMatchStage.jobDate.$lt.toISOString()).toBe("2026-07-21T00:00:00.000Z");
    expect(jobMatchStage.recordStatus).toEqual({ $ne: "archived" });
  });

  test("week range is Monday-start, matching the frontend's existing week logic", async () => {
    const { controller, Job, Driver, Truck, DailyWorkLog } = loadController();

    Job.aggregate.mockResolvedValueOnce([]);
    Driver.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.distinct.mockResolvedValueOnce([]);
    Truck.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    // 2026-07-20 is a Monday.
    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const weekMatchStage = DailyWorkLog.aggregate.mock.calls[0][0][0].$match;
    expect(weekMatchStage.date.$gte.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(weekMatchStage.date.$lt.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  test("week range for a mid-week date still resolves to that week's Monday", async () => {
    const { controller, Job, Driver, Truck, DailyWorkLog } = loadController();

    Job.aggregate.mockResolvedValueOnce([]);
    Driver.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.distinct.mockResolvedValueOnce([]);
    Truck.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    // 2026-07-23 is a Thursday; that week's Monday is 2026-07-20.
    const req = { query: { date: "2026-07-23" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const weekMatchStage = DailyWorkLog.aggregate.mock.calls[0][0][0].$match;
    expect(weekMatchStage.date.$gte.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(weekMatchStage.date.$lt.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  test("falls back to today's server date when no date param is given, rather than erroring", async () => {
    const { controller, Job, Driver, Truck, DailyWorkLog } = loadController();

    Job.aggregate.mockResolvedValueOnce([]);
    Driver.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.distinct.mockResolvedValueOnce([]);
    Truck.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    const req = { query: {} };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("missingWorkLogs never goes negative", async () => {
    const { controller, Job, Driver, Truck, DailyWorkLog } = loadController();

    Job.aggregate.mockResolvedValueOnce([]);
    Driver.countDocuments.mockResolvedValueOnce(2);
    // More distinct drivers with logs than total drivers shouldn't happen,
    // but the calculation must stay clamped at 0 either way.
    DailyWorkLog.distinct.mockResolvedValueOnce(["d1", "d2", "d3"]);
    Truck.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.aggregate.mockResolvedValueOnce([]);

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.missingWorkLogs).toBe(0);
  });

  test("handles an empty weekly aggregate (no logs this week) without crashing", async () => {
    const { controller, Job, Driver, Truck, DailyWorkLog } = loadController();

    Job.aggregate.mockResolvedValueOnce([]);
    Driver.countDocuments.mockResolvedValueOnce(5);
    DailyWorkLog.distinct.mockResolvedValueOnce([]);
    Truck.countDocuments.mockResolvedValueOnce(0);
    DailyWorkLog.aggregate.mockResolvedValueOnce([]); // no $group result at all

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.weeklyLogs).toBe(0);
    expect(jsonArg.data.weeklyHours).toBe(0);
    expect(jsonArg.data.weeklyKilometres).toBe(0);
  });

  test("returns 500 on an unexpected error", async () => {
    const { controller, Job } = loadController();
    Job.aggregate.mockRejectedValueOnce(new Error("db down"));

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
