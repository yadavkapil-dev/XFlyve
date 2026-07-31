const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Every mock has a persistent default (mockResolvedValue, not Once) so a
// test only needs to override the specific call(s) its assertions actually
// care about — the rest of Phase 11's new parallel queries fall through to
// a harmless empty/zero default instead of needing to be re-stubbed in
// every single test.
const loadController = () => {
  jest.resetModules();

  const Driver = { countDocuments: jest.fn().mockResolvedValue(0) };
  const Job = {
    aggregate: jest.fn().mockResolvedValue([]),
    findReadyForInvoicing: jest.fn().mockResolvedValue([]),
  };
  const Truck = {
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
  };
  const DailyWorkLog = {
    distinct: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue([]),
  };
  const JobPod = { aggregate: jest.fn().mockResolvedValue([]) };
  const WorkDiary = {};

  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../models/dailyWorkLog", () => DailyWorkLog);
  jest.doMock("../models/jobPod", () => JobPod);
  jest.doMock("../models/workDiary", () => WorkDiary);
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

  return { controller: require("../controllers/adminController"), Driver, Job, Truck, DailyWorkLog, JobPod };
};

describe("GET /api/admin/dashboard-stats", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns all the metrics HomePage.jsx displays, computed for the given date", async () => {
    const { controller, Driver, Job, Truck, DailyWorkLog, JobPod } = loadController();

    // 1st Job.aggregate call: jobStatusToday. 2nd: jobsByStatus (all jobs,
    // any date). 3rd: jobVolumeTrend.
    Job.aggregate
      .mockResolvedValueOnce([
        { _id: "completed", count: 2 },
        { _id: "pending", count: 3 },
        { _id: "in-progress", count: 1 },
      ])
      .mockResolvedValueOnce([
        { _id: "completed", count: 20 },
        { _id: "pending", count: 5 },
        { _id: "in-progress", count: 2 },
      ])
      .mockResolvedValueOnce([{ _id: "2026-07-20", count: 6 }]);
    Job.findReadyForInvoicing.mockResolvedValueOnce([{ _id: "job1" }, { _id: "job2" }]);
    Driver.countDocuments.mockResolvedValueOnce(10);
    DailyWorkLog.distinct.mockResolvedValueOnce(["driver1", "driver2"]);
    Truck.countDocuments.mockResolvedValueOnce(1);
    DailyWorkLog.aggregate.mockResolvedValueOnce([{ _id: null, count: 15, hours: 120.5, kilometers: 3400 }]);
    Truck.aggregate.mockResolvedValueOnce([
      { _id: "available", count: 4 },
      { _id: "on-route", count: 2 },
      { _id: "out-of-service", count: 1 },
    ]);
    JobPod.aggregate.mockResolvedValueOnce([
      { _id: "approved", count: 7 },
      { _id: "rejected", count: 3 },
      { _id: "pending", count: 2 },
    ]);

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
        invoiceReadyJobs: 2,
        pendingPodApprovals: 2,
        podApprovalRate: 70, // 7 approved / (7 approved + 3 rejected) = 70%
        truckStatusBreakdown: { available: 4, "on-route": 2, "out-of-service": 1 },
        jobsByStatus: { pending: 5, "in-progress": 2, completed: 20 },
        jobVolumeTrend: expect.any(Array),
      },
    });
  });

  test("today's job query matches the exact UTC day range for the given date", async () => {
    const { controller, Job, Driver, Truck, DailyWorkLog } = loadController();

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jobMatchStage = Job.aggregate.mock.calls[0][0][0].$match;
    expect(jobMatchStage.jobDate.$gte.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(jobMatchStage.jobDate.$lt.toISOString()).toBe("2026-07-21T00:00:00.000Z");
    expect(jobMatchStage.recordStatus).toEqual({ $ne: "archived" });
  });

  test("totalDrivers query is scoped to role: driver, not every account in the shared Driver/admin collection", async () => {
    const { controller, Driver } = loadController();

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    expect(Driver.countDocuments).toHaveBeenCalledWith({ role: "driver", recordStatus: { $ne: "archived" } });
  });

  test("week range is Monday-start, matching the frontend's existing week logic", async () => {
    const { controller, DailyWorkLog } = loadController();

    // 2026-07-20 is a Monday.
    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const weekMatchStage = DailyWorkLog.aggregate.mock.calls[0][0][0].$match;
    expect(weekMatchStage.date.$gte.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(weekMatchStage.date.$lt.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  test("week range for a mid-week date still resolves to that week's Monday", async () => {
    const { controller, DailyWorkLog } = loadController();

    // 2026-07-23 is a Thursday; that week's Monday is 2026-07-20.
    const req = { query: { date: "2026-07-23" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const weekMatchStage = DailyWorkLog.aggregate.mock.calls[0][0][0].$match;
    expect(weekMatchStage.date.$gte.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(weekMatchStage.date.$lt.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  test("falls back to today's server date when no date param is given, rather than erroring", async () => {
    const { controller } = loadController();

    const req = { query: {} };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("missingWorkLogs never goes negative", async () => {
    const { controller, Driver, DailyWorkLog } = loadController();

    Driver.countDocuments.mockResolvedValueOnce(2);
    // More distinct drivers with logs than total drivers shouldn't happen,
    // but the calculation must stay clamped at 0 either way.
    DailyWorkLog.distinct.mockResolvedValueOnce(["d1", "d2", "d3"]);

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.missingWorkLogs).toBe(0);
  });

  test("handles an empty weekly aggregate (no logs this week) without crashing", async () => {
    const { controller } = loadController();

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.weeklyLogs).toBe(0);
    expect(jsonArg.data.weeklyHours).toBe(0);
    expect(jsonArg.data.weeklyKilometres).toBe(0);
  });

  test("truckStatusBreakdown defaults every known status to 0, not just the ones present", async () => {
    const { controller, Truck } = loadController();

    // Only "available" trucks exist right now — on-route/out-of-service
    // must still appear as 0, not be missing from the object entirely.
    Truck.aggregate.mockResolvedValueOnce([{ _id: "available", count: 3 }]);

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.truckStatusBreakdown).toEqual({ available: 3, "on-route": 0, "out-of-service": 0 });
  });

  test("podApprovalRate is null (not 0) when no PODs have been decided yet", async () => {
    const { controller, JobPod } = loadController();

    JobPod.aggregate.mockResolvedValueOnce([{ _id: "pending", count: 5 }]);

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.podApprovalRate).toBeNull();
  });

  test("podApprovalRate excludes still-pending PODs from the denominator", async () => {
    const { controller, JobPod } = loadController();

    // 1 approved, 1 rejected, 1 pending — rate should be 50%, not diluted
    // by the pending one.
    JobPod.aggregate.mockResolvedValueOnce([
      { _id: "approved", count: 1 },
      { _id: "rejected", count: 1 },
      { _id: "pending", count: 1 },
    ]);

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.podApprovalRate).toBe(50);
  });

  test("jobVolumeTrend covers exactly 14 trailing days ending on the given date, zero-filled where no jobs exist", async () => {
    const { controller, Job } = loadController();

    Job.aggregate
      .mockResolvedValueOnce([]) // jobStatusToday
      .mockResolvedValueOnce([]) // jobsByStatus
      .mockResolvedValueOnce([{ _id: "2026-07-20", count: 4 }]); // jobVolumeTrend

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    const trend = jsonArg.data.jobVolumeTrend;
    expect(trend).toHaveLength(14);
    expect(trend[0].date).toBe("2026-07-07"); // 13 days before 2026-07-20
    expect(trend[trend.length - 1].date).toBe("2026-07-20");
    expect(trend.find((d) => d.date === "2026-07-20").count).toBe(4);
    expect(trend.find((d) => d.date === "2026-07-19").count).toBe(0);
  });

  test("invoiceReadyJobs reuses Job.findReadyForInvoicing() rather than re-deriving eligibility", async () => {
    const { controller, Job } = loadController();

    Job.findReadyForInvoicing.mockResolvedValueOnce([{ _id: "a" }, { _id: "b" }, { _id: "c" }]);

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.invoiceReadyJobs).toBe(3);
    expect(Job.findReadyForInvoicing).toHaveBeenCalledTimes(1);
  });

  test("returns 500 on an unexpected error", async () => {
    const { controller, Job } = loadController();
    Job.aggregate.mockReset().mockRejectedValueOnce(new Error("db down"));

    const req = { query: { date: "2026-07-20" } };
    const res = makeResponse();
    await controller.getDashboardStats(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
