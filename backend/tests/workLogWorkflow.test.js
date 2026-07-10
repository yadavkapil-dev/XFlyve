const mongoose = require("mongoose");

const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const leanResult = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const loadController = () => {
  jest.resetModules();

  const DailyWorkLog = jest.fn().mockImplementation((data) => ({
    ...data,
    save: jest.fn().mockResolvedValue(undefined),
  }));

  const Job = {
    findOne: jest.fn(),
  };

  jest.doMock("../models/dailyWorkLog", () => DailyWorkLog);
  jest.doMock("../models/job", () => Job);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return {
    controller: require("../controllers/workLogController"),
    DailyWorkLog,
    Job,
  };
};

const makeReq = (body) => ({
  user: { id: new mongoose.Types.ObjectId().toString(), role: "driver" },
  body: {
    date: "2026-07-10",
    ...body,
  },
});

describe("Work log job-type validation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("local job accepts local fields without kilometre fields", async () => {
    const { controller, DailyWorkLog, Job } = loadController();
    const jobId = new mongoose.Types.ObjectId().toString();
    const req = makeReq({
      jobId,
      localStartTime: "08:00",
      localEndTime: "16:00",
      hours: 8,
      deliveriesDone: 4,
    });
    const res = makeResponse();

    Job.findOne.mockReturnValueOnce(leanResult({ _id: jobId, jobType: "local" }));

    await controller.createWorkLog(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(DailyWorkLog).toHaveBeenCalledWith(expect.objectContaining({
      jobIds: [jobId],
      localStartTime: "08:00",
      localEndTime: "16:00",
      hours: 8,
      deliveriesDone: 4,
      kilometers: 0,
      interstateStartKm: undefined,
      interstateEndKm: undefined,
    }));
  });

  test("local job rejects missing required local fields", async () => {
    const { controller, DailyWorkLog, Job } = loadController();
    const jobId = new mongoose.Types.ObjectId().toString();
    const req = makeReq({
      jobId,
      deliveriesDone: 4,
    });
    const res = makeResponse();

    Job.findOne.mockReturnValueOnce(leanResult({ _id: jobId, jobType: "local" }));

    await controller.createWorkLog(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "Truck pickup time is required" });
    expect(DailyWorkLog).not.toHaveBeenCalled();
  });

  test("interstate job accepts kilometre fields without local time or hour fields", async () => {
    const { controller, DailyWorkLog, Job } = loadController();
    const jobId = new mongoose.Types.ObjectId().toString();
    const req = makeReq({
      jobId,
      interstateStartKm: 1200,
      interstateEndKm: 1450,
      deliveriesDone: 2,
    });
    const res = makeResponse();

    Job.findOne.mockReturnValueOnce(leanResult({ _id: jobId, jobType: "interstate" }));

    await controller.createWorkLog(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(DailyWorkLog).toHaveBeenCalledWith(expect.objectContaining({
      jobIds: [jobId],
      interstateStartKm: 1200,
      interstateEndKm: 1450,
      kilometers: 250,
      deliveriesDone: 2,
      hours: 0,
      localStartTime: undefined,
      localEndTime: undefined,
    }));
  });

  test("interstate job rejects missing kilometre fields", async () => {
    const { controller, DailyWorkLog, Job } = loadController();
    const jobId = new mongoose.Types.ObjectId().toString();
    const req = makeReq({
      jobId,
      deliveriesDone: 2,
    });
    const res = makeResponse();

    Job.findOne.mockReturnValueOnce(leanResult({ _id: jobId, jobType: "interstate" }));

    await controller.createWorkLog(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: "Start kilometres is required" });
    expect(DailyWorkLog).not.toHaveBeenCalled();
  });

  test("interstate job rejects end kilometres lower than start kilometres", async () => {
    const { controller, DailyWorkLog, Job } = loadController();
    const jobId = new mongoose.Types.ObjectId().toString();
    const req = makeReq({
      jobId,
      interstateStartKm: 1450,
      interstateEndKm: 1200,
      deliveriesDone: 2,
    });
    const res = makeResponse();

    Job.findOne.mockReturnValueOnce(leanResult({ _id: jobId, jobType: "interstate" }));

    await controller.createWorkLog(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "End kilometres cannot be less than start kilometres",
    });
    expect(DailyWorkLog).not.toHaveBeenCalled();
  });
});
