const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const loadController = () => {
  jest.resetModules();

  const Job = { countDocuments: jest.fn().mockResolvedValue(0) };
  const Driver = { countDocuments: jest.fn().mockResolvedValue(0) };
  const Truck = { countDocuments: jest.fn().mockResolvedValue(0) };
  const DailyWorkLog = { countDocuments: jest.fn().mockResolvedValue(0) };

  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../models/dailyWorkLog", () => DailyWorkLog);
  jest.doMock("../models/jobPod", () => ({}));
  jest.doMock("../models/workDiary", () => ({ countDocuments: jest.fn().mockResolvedValue(0) }));
  jest.doMock("../utils/logger", () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

  return { controller: require("../controllers/adminController"), Job, Driver, Truck, DailyWorkLog };
};

describe("GET /api/admin/stats (getSystemStats)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns the four fleet-wide totals", async () => {
    const { controller, Job, Driver, Truck, DailyWorkLog } = loadController();

    Job.countDocuments.mockResolvedValueOnce(128);
    Driver.countDocuments.mockResolvedValueOnce(14);
    Truck.countDocuments.mockResolvedValueOnce(9);
    DailyWorkLog.countDocuments.mockResolvedValueOnce(340);

    const res = makeResponse();
    await controller.getSystemStats({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      status: "success",
      data: { totalJobs: 128, totalDrivers: 14, totalTrucks: 9, totalLogs: 340 },
    });
  });

  test("totalDrivers is scoped to role: driver, excluding archived — Driver and admin accounts share one collection", async () => {
    const { controller, Driver } = loadController();

    const res = makeResponse();
    await controller.getSystemStats({}, res);

    expect(Driver.countDocuments).toHaveBeenCalledWith({ role: "driver", recordStatus: { $ne: "archived" } });
  });

  test("returns 500 on an unexpected error", async () => {
    const { controller, Job } = loadController();
    Job.countDocuments.mockRejectedValueOnce(new Error("db down"));

    const res = makeResponse();
    await controller.getSystemStats({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
