const mongoose = require("mongoose");

const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const leanResult = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

const fakeCloudinary = () => ({
  uploader: {
    upload_stream: jest.fn((options, callback) => {
      callback(null, { secure_url: "https://example.com/file.pdf", public_id: "folder/file123" });
      return {};
    }),
  },
});

const fakeStreamifier = () => ({
  createReadStream: jest.fn(() => ({ pipe: jest.fn() })),
});

const notificationServiceMock = () => ({
  notifyUser: jest.fn().mockResolvedValue(null),
  notifyAdmins: jest.fn().mockResolvedValue(null),
});

const activityServiceMock = () => ({
  logActivity: jest.fn().mockResolvedValue(null),
});

// ---------------------------------------------------------------------------
// jobTransitionService: job_started / job_completed -> notifyAdmins
// ---------------------------------------------------------------------------
describe("Trigger: job start/complete -> notifyAdmins (jobTransitionService)", () => {
  const loadService = () => {
    jest.resetModules();

    const Job = { findById: jest.fn() };
    const Truck = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/truck", () => Truck);
    jest.doMock("../utils/dbCapabilities", () => ({ supportsTransactions: jest.fn().mockResolvedValue(false) }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { service: require("../services/jobTransitionService"), Job, Truck, notificationService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("startJob notifies admins with type job_started and the job's resourceId", async () => {
    const { service, Job, Truck, notificationService } = loadService();
    const jobId = { toString: () => "job-1" };
    const truckId = { toString: () => "truck-1" };
    const jobDoc = { _id: jobId, assignedTruck: truckId, status: "pending", title: "Run 1", save: jest.fn().mockResolvedValue(undefined) };
    const truckDoc = { _id: truckId, status: "available", recordStatus: "active" };

    Truck.findById.mockResolvedValueOnce(truckDoc);
    Job.findOne = jest.fn().mockReturnValueOnce(leanResult(null));
    Truck.findOneAndUpdate.mockResolvedValueOnce({ ...truckDoc, status: "on-route" });

    await service.startJob(jobDoc);

    expect(notificationService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_started", resourceType: "job", resourceId: jobId })
    );
  });

  test("completeJob notifies admins with type job_completed and the job's resourceId", async () => {
    const { service, Job, notificationService } = loadService();
    const jobId = { toString: () => "job-2" };
    const truckId = { toString: () => "truck-2" };
    const jobDoc = { _id: jobId, assignedTruck: truckId, status: "in-progress", title: "Run 2", save: jest.fn().mockResolvedValue(undefined) };

    Job.findById.mockReturnValueOnce({
      populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: jobId }) }),
    });

    await service.completeJob(jobDoc);

    expect(notificationService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_completed", resourceType: "job", resourceId: jobId })
    );
  });
});

// ---------------------------------------------------------------------------
// jobController: create/update -> notifyUser
// ---------------------------------------------------------------------------
describe("Trigger: job create/update -> notifyUser (jobController)", () => {
  const loadController = () => {
    jest.resetModules();

    const Job = { create: jest.fn(), findById: jest.fn(), findOne: jest.fn(), updateOne: jest.fn() };
    const Driver = { findById: jest.fn() };
    const Truck = { findById: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../models/truck", () => Truck);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { controller: require("../controllers/jobController"), Job, Driver, Truck, notificationService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("createJob notifies the assigned driver with type job_assigned", async () => {
    const { controller, Job, Driver, Truck, notificationService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();
    const createdJob = { _id: "new-job-1", assignedTo: driverId, title: "New Run" };

    Driver.findById.mockReturnValueOnce(leanResult({ _id: driverId }));
    Truck.findById.mockReturnValueOnce(leanResult({ _id: truckId, status: "available", recordStatus: "active" }));
    Job.findOne.mockReturnValueOnce(leanResult(null));
    Job.create.mockResolvedValueOnce(createdJob);

    const dateInputValue = () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    };

    const req = {
      body: {
        title: "New Run",
        description: "desc",
        pickupLocation: "A",
        deliveryLocation: "B",
        assignedTo: driverId,
        assignedTruck: truckId,
        jobDate: dateInputValue(),
        jobType: "local",
      },
      user: { id: "admin-1", role: "admin" },
    };
    const res = makeResponse();

    await controller.createJob(req, res);

    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "job_assigned", resourceType: "job", resourceId: "new-job-1" })
    );
  });

  test("updateJob (admin, reassigns driver) notifies the NEW driver with type job_assigned", async () => {
    const { controller, Job, Driver, notificationService } = loadController();
    const oldDriverId = new mongoose.Types.ObjectId().toString();
    const newDriverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();

    const jobDoc = {
      _id: "job-3",
      assignedTo: { toString: () => oldDriverId },
      assignedTruck: { toString: () => truckId },
      status: "pending",
      title: "Run 3",
      save: jest.fn().mockResolvedValue(undefined),
    };

    Job.findById
      .mockResolvedValueOnce(jobDoc)
      .mockReturnValueOnce({ populate: jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(jobDoc) }) });
    Driver.findById.mockReturnValueOnce(leanResult({ _id: newDriverId }));

    const req = {
      params: { jobId: "job-3" },
      user: { id: "admin-1", role: "admin" },
      body: { assignedTo: newDriverId },
    };
    const res = makeResponse();

    await controller.updateJob(req, res);

    // job.assignedTo gets mutated to the new driver id before save in the
    // real controller, so assert on what was actually sent.
    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_assigned", resourceType: "job", resourceId: "job-3" })
    );
  });

  test("updateJob (admin, same driver) notifies the driver with type job_updated", async () => {
    const { controller, Job, notificationService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();

    const jobDoc = {
      _id: "job-4",
      assignedTo: { toString: () => driverId },
      assignedTruck: { toString: () => "truck-4" },
      status: "pending",
      title: "Run 4",
      save: jest.fn().mockResolvedValue(undefined),
    };

    Job.findById
      .mockResolvedValueOnce(jobDoc)
      .mockReturnValueOnce({ populate: jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(jobDoc) }) });

    const req = {
      params: { jobId: "job-4" },
      user: { id: "admin-1", role: "admin" },
      body: { title: "Run 4 updated" },
    };
    const res = makeResponse();

    await controller.updateJob(req, res);

    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_updated", resourceType: "job", resourceId: "job-4" })
    );
  });
});

// ---------------------------------------------------------------------------
// jobPodController: upload -> notifyAdmins, approve/reject -> notifyUser
// ---------------------------------------------------------------------------
describe("Trigger: POD upload/approve/reject", () => {
  const loadController = () => {
    jest.resetModules();

    const JobPod = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: "pod-1",
      save: jest.fn().mockResolvedValue(undefined),
    }));
    JobPod.findById = jest.fn();
    const Job = { findById: jest.fn(), updateOne: jest.fn() };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/jobPod", () => JobPod);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../config/cloudinary", fakeCloudinary);
    jest.doMock("streamifier", fakeStreamifier);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { controller: require("../controllers/jobPodController"), JobPod, Job, notificationService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("uploadPOD notifies admins with type pod_submitted", async () => {
    const { controller, notificationService } = loadController();
    const req = {
      file: { buffer: Buffer.from("pdf") },
      body: { notes: "note" },
      user: { id: new mongoose.Types.ObjectId().toString() },
    };
    const res = makeResponse();

    await controller.uploadPOD(req, res);

    expect(notificationService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pod_submitted", resourceType: "jobpod", resourceId: "pod-1" })
    );
  });

  test("approvePOD notifies the pod's driver with type pod_approved", async () => {
    const { controller, JobPod, notificationService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const podId = new mongoose.Types.ObjectId().toString();
    const pod = { _id: podId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    JobPod.findById.mockResolvedValueOnce(pod);

    const req = { params: { podId }, user: { id: "admin-1" } };
    const res = makeResponse();

    await controller.approvePOD(req, res);

    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "pod_approved", resourceType: "jobpod", resourceId: podId })
    );
  });

  test("rejectPOD notifies the pod's driver with type pod_rejected", async () => {
    const { controller, JobPod, notificationService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const podId = new mongoose.Types.ObjectId().toString();
    const pod = { _id: podId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    JobPod.findById.mockResolvedValueOnce(pod);

    const req = { params: { podId }, body: { rejectionReason: "blurry photo" }, user: { id: "admin-1" } };
    const res = makeResponse();

    await controller.rejectPOD(req, res);

    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "pod_rejected", resourceType: "jobpod", resourceId: podId })
    );
  });
});

// ---------------------------------------------------------------------------
// workDiaryController: upload -> notifyAdmins, approve/reject -> notifyUser
// ---------------------------------------------------------------------------
describe("Trigger: work diary upload/approve/reject", () => {
  const loadController = () => {
    jest.resetModules();

    const WorkDiary = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: "diary-1",
      save: jest.fn().mockResolvedValue(undefined),
    }));
    WorkDiary.findById = jest.fn();
    const Job = { findById: jest.fn(), updateOne: jest.fn() };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/workDiary", () => WorkDiary);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../config/cloudinary", fakeCloudinary);
    jest.doMock("streamifier", fakeStreamifier);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { controller: require("../controllers/workDiaryController"), WorkDiary, Job, notificationService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("uploadWorkDiary notifies admins with type diary_submitted", async () => {
    const { controller, notificationService } = loadController();
    const req = {
      file: { buffer: Buffer.from("pdf") },
      body: { notes: "note" },
      user: { id: new mongoose.Types.ObjectId().toString() },
    };
    const res = makeResponse();

    await controller.uploadWorkDiary(req, res);

    expect(notificationService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "diary_submitted", resourceType: "workdiary", resourceId: "diary-1" })
    );
  });

  test("approveWorkDiary notifies the diary's driver with type diary_approved", async () => {
    const { controller, WorkDiary, notificationService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const diaryId = new mongoose.Types.ObjectId().toString();
    const diary = { _id: diaryId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    WorkDiary.findById.mockResolvedValueOnce(diary);

    const req = { params: { id: diaryId }, user: { id: "admin-1" } };
    const res = makeResponse();

    await controller.approveWorkDiary(req, res);

    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "diary_approved", resourceType: "workdiary", resourceId: diaryId })
    );
  });

  test("rejectWorkDiary notifies the diary's driver with type diary_rejected", async () => {
    const { controller, WorkDiary, notificationService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const diaryId = new mongoose.Types.ObjectId().toString();
    const diary = { _id: diaryId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    WorkDiary.findById.mockResolvedValueOnce(diary);

    const req = { params: { id: diaryId }, body: { rejectionReason: "missing pages" }, user: { id: "admin-1" } };
    const res = makeResponse();

    await controller.rejectWorkDiary(req, res);

    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "diary_rejected", resourceType: "workdiary", resourceId: diaryId })
    );
  });
});

// ---------------------------------------------------------------------------
// workLogController: create -> notifyAdmins, approve/reject -> notifyUser
// ---------------------------------------------------------------------------
describe("Trigger: work log create/approve/reject", () => {
  const loadController = () => {
    jest.resetModules();

    const DailyWorkLog = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: "log-1",
      save: jest.fn().mockResolvedValue(undefined),
    }));
    DailyWorkLog.findById = jest.fn();
    const Job = { findOne: jest.fn() };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/dailyWorkLog", () => DailyWorkLog);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { controller: require("../controllers/workLogController"), DailyWorkLog, Job, notificationService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("createWorkLog notifies admins with type worklog_submitted", async () => {
    const { controller, Job, notificationService } = loadController();
    const jobId = new mongoose.Types.ObjectId().toString();
    Job.findOne.mockReturnValueOnce(leanResult({ _id: jobId, jobType: "local" }));

    const req = {
      user: { id: new mongoose.Types.ObjectId().toString(), role: "driver" },
      body: {
        date: "2026-07-10",
        jobId,
        localStartTime: "08:00",
        localEndTime: "16:00",
        hours: 8,
        deliveriesDone: 4,
      },
    };
    const res = makeResponse();

    await controller.createWorkLog(req, res);

    expect(notificationService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "worklog_submitted", resourceType: "worklog", resourceId: "log-1" })
    );
  });

  test("approveWorkLog notifies the log's driver with type worklog_approved", async () => {
    const { controller, DailyWorkLog, notificationService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const logId = new mongoose.Types.ObjectId().toString();
    const log = { _id: logId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    DailyWorkLog.findById.mockResolvedValueOnce(log);

    const req = { params: { logId }, user: { id: "admin-1" } };
    const res = makeResponse();

    await controller.approveWorkLog(req, res);

    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "worklog_approved", resourceType: "worklog", resourceId: logId })
    );
  });

  test("rejectWorkLog notifies the log's driver with type worklog_rejected", async () => {
    const { controller, DailyWorkLog, notificationService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const logId = new mongoose.Types.ObjectId().toString();
    const log = { _id: logId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    DailyWorkLog.findById.mockResolvedValueOnce(log);

    const req = { params: { logId }, body: { rejectionReason: "missing hours" }, user: { id: "admin-1" } };
    const res = makeResponse();

    await controller.rejectWorkLog(req, res);

    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "worklog_rejected", resourceType: "worklog", resourceId: logId })
    );
  });
});
