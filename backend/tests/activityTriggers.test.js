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
// jobTransitionService: JOB_STARTED / JOB_COMPLETED
// ---------------------------------------------------------------------------
describe("Activity: job start/complete (jobTransitionService)", () => {
  const loadService = () => {
    jest.resetModules();

    const Job = { findById: jest.fn() };
    const Truck = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const Driver = { findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(leanResult({ name: "Test Driver" })) }) };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/truck", () => Truck);
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../utils/dbCapabilities", () => ({ supportsTransactions: jest.fn().mockResolvedValue(false) }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { service: require("../services/jobTransitionService"), Job, Truck, Driver, activityService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("startJob logs JOB_STARTED with the acting driver and the job's resourceId", async () => {
    const { service, Job, Truck, activityService } = loadService();
    const jobId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();
    const driverId = new mongoose.Types.ObjectId().toString();
    const jobDoc = { _id: jobId, assignedTruck: truckId, status: "pending", title: "Run 1", save: jest.fn().mockResolvedValue(undefined) };
    const truckDoc = { _id: truckId, status: "available", recordStatus: "active" };

    Truck.findById.mockResolvedValueOnce(truckDoc);
    Job.findOne = jest.fn().mockReturnValueOnce(leanResult(null));
    Truck.findOneAndUpdate.mockResolvedValueOnce({ ...truckDoc, status: "on-route" });

    await service.startJob(jobDoc, { id: driverId, role: "driver" });

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: driverId,
        actorRole: "driver",
        action: "JOB_STARTED",
        resourceType: "job",
        resourceId: jobId,
        relatedJobId: jobId,
      })
    );
  });

  test("completeJob logs JOB_COMPLETED with the acting driver and the job's resourceId", async () => {
    const { service, Job, activityService } = loadService();
    const jobId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();
    const driverId = new mongoose.Types.ObjectId().toString();
    const jobDoc = { _id: jobId, assignedTruck: truckId, status: "in-progress", title: "Run 2", save: jest.fn().mockResolvedValue(undefined) };

    Job.findById.mockReturnValueOnce({
      populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: jobId }) }),
    });

    await service.completeJob(jobDoc, { id: driverId, role: "driver" });

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: driverId,
        actorRole: "driver",
        action: "JOB_COMPLETED",
        resourceType: "job",
        resourceId: jobId,
        relatedJobId: jobId,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// jobController: JOB_CREATED / JOB_ASSIGNED / JOB_UPDATED
// ---------------------------------------------------------------------------
describe("Activity: job create/update (jobController)", () => {
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
    // .warn included: createJob/updateJob's job-assigned email hits this
    // branch whenever RESEND_API_KEY is unset (the case here), same as in
    // any other test env.
    jest.doMock("../utils/logger", () => ({ error: jest.fn(), warn: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { controller: require("../controllers/jobController"), Job, Driver, Truck, activityService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("createJob logs both JOB_CREATED and JOB_ASSIGNED, actor = admin, resource = the new job", async () => {
    const { controller, Job, Driver, Truck, activityService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
    const createdJob = { _id: "new-job-1", assignedTo: driverId, title: "New Run", status: "pending" };

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
      user: { id: adminId, role: "admin" },
    };
    const res = makeResponse();

    await controller.createJob(req, res);

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        actorRole: "admin",
        action: "JOB_CREATED",
        resourceType: "job",
        resourceId: "new-job-1",
        relatedJobId: "new-job-1",
      })
    );
    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        actorRole: "admin",
        action: "JOB_ASSIGNED",
        resourceType: "job",
        resourceId: "new-job-1",
        relatedJobId: "new-job-1",
      })
    );
  });

  test("updateJob (admin, reassigns driver) logs JOB_ASSIGNED with before/after assignedTo", async () => {
    const { controller, Job, Driver, activityService } = loadController();
    const oldDriverId = new mongoose.Types.ObjectId().toString();
    const newDriverId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
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
      user: { id: adminId, role: "admin" },
      body: { assignedTo: newDriverId },
    };
    const res = makeResponse();

    await controller.updateJob(req, res);

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        actorRole: "admin",
        action: "JOB_ASSIGNED",
        resourceType: "job",
        resourceId: "job-3",
        relatedJobId: "job-3",
        before: { assignedTo: oldDriverId },
        after: { assignedTo: newDriverId },
      })
    );
  });

  test("updateJob (admin, same driver) logs JOB_UPDATED with a before/after snapshot", async () => {
    const { controller, Job, activityService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();

    const jobDoc = {
      _id: "job-4",
      title: "Run 4",
      description: "old desc",
      pickupLocation: "A",
      deliveryLocation: "B",
      jobRate: 100,
      invoiceStatus: "pending",
      assignedTo: { toString: () => driverId },
      assignedTruck: { toString: () => "truck-4" },
      jobDate: "2026-07-01",
      jobType: "local",
      status: "pending",
      save: jest.fn().mockResolvedValue(undefined),
    };

    Job.findById
      .mockResolvedValueOnce(jobDoc)
      .mockReturnValueOnce({ populate: jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(jobDoc) }) });

    const req = {
      params: { jobId: "job-4" },
      user: { id: adminId, role: "admin" },
      body: { title: "Run 4 updated" },
    };
    const res = makeResponse();

    await controller.updateJob(req, res);

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        actorRole: "admin",
        action: "JOB_UPDATED",
        resourceType: "job",
        resourceId: "job-4",
        relatedJobId: "job-4",
        before: expect.objectContaining({ title: "Run 4" }),
        after: expect.objectContaining({ title: "Run 4 updated" }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// jobPodController: POD_SUBMITTED / POD_APPROVED / POD_REJECTED
// ---------------------------------------------------------------------------
describe("Activity: POD upload/approve/reject", () => {
  const loadController = () => {
    jest.resetModules();

    const JobPod = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: "pod-1",
      status: "pending",
      save: jest.fn().mockResolvedValue(undefined),
    }));
    JobPod.findById = jest.fn();
    const Job = { findById: jest.fn(), updateOne: jest.fn() };
    const Driver = { findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(leanResult({ name: "Test Driver" })) }) };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/jobPod", () => JobPod);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../config/cloudinary", fakeCloudinary);
    jest.doMock("streamifier", fakeStreamifier);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { controller: require("../controllers/jobPodController"), JobPod, Job, Driver, activityService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("uploadPOD logs POD_SUBMITTED, actor = driver, resource = the new POD", async () => {
    const { controller, activityService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const req = {
      file: { buffer: Buffer.from("pdf") },
      body: { notes: "note" },
      user: { id: driverId, role: "driver" },
    };
    const res = makeResponse();

    await controller.uploadPOD(req, res);

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: driverId,
        actorRole: "driver",
        action: "POD_SUBMITTED",
        resourceType: "jobpod",
        resourceId: "pod-1",
      })
    );
  });

  test("approvePOD logs POD_APPROVED, actor = admin, resource = the pod, relatedJobId = pod.jobId", async () => {
    const { controller, JobPod, Job, activityService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const podId = new mongoose.Types.ObjectId().toString();
    const jobId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
    const pod = { _id: podId, driverId, jobId, status: "pending", save: jest.fn().mockResolvedValue(undefined) };
    JobPod.findById.mockResolvedValueOnce(pod);
    // approvePOD now also looks up the linked job's title for the
    // pod_approved notification wording.
    Job.findById.mockReturnValueOnce({ select: jest.fn().mockReturnValue(leanResult(null)) });

    const req = { params: { podId }, user: { id: adminId, role: "admin" } };
    const res = makeResponse();

    await controller.approvePOD(req, res);

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        actorRole: "admin",
        action: "POD_APPROVED",
        resourceType: "jobpod",
        resourceId: podId,
        relatedJobId: jobId,
        before: { status: "pending" },
        after: { status: "approved" },
      })
    );
  });

  test("rejectPOD logs POD_REJECTED with the rejection reason in metadata", async () => {
    const { controller, JobPod, activityService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const podId = new mongoose.Types.ObjectId().toString();
    const adminId = new mongoose.Types.ObjectId().toString();
    const pod = { _id: podId, driverId, jobId: null, status: "pending", save: jest.fn().mockResolvedValue(undefined) };
    JobPod.findById.mockResolvedValueOnce(pod);

    const req = { params: { podId }, body: { rejectionReason: "blurry photo" }, user: { id: adminId, role: "admin" } };
    const res = makeResponse();

    await controller.rejectPOD(req, res);

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminId,
        actorRole: "admin",
        action: "POD_REJECTED",
        resourceType: "jobpod",
        resourceId: podId,
        relatedJobId: null,
        metadata: { rejectionReason: "blurry photo" },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// workDiaryController: DIARY_SUBMITTED
// ---------------------------------------------------------------------------
describe("Activity: work diary upload", () => {
  const loadController = () => {
    jest.resetModules();

    const WorkDiary = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: "diary-1",
      save: jest.fn().mockResolvedValue(undefined),
    }));
    const Job = { findById: jest.fn(), updateOne: jest.fn() };
    const Driver = { findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(leanResult({ name: "Test Driver" })) }) };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/workDiary", () => WorkDiary);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../config/cloudinary", fakeCloudinary);
    jest.doMock("streamifier", fakeStreamifier);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { controller: require("../controllers/workDiaryController"), WorkDiary, Job, Driver, activityService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("uploadWorkDiary logs DIARY_SUBMITTED, actor = driver, resource = the new diary", async () => {
    const { controller, activityService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const req = {
      file: { buffer: Buffer.from("pdf") },
      body: { notes: "note" },
      user: { id: driverId, role: "driver" },
    };
    const res = makeResponse();

    await controller.uploadWorkDiary(req, res);

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: driverId,
        actorRole: "driver",
        action: "DIARY_SUBMITTED",
        resourceType: "workdiary",
        resourceId: "diary-1",
      })
    );
  });

});

// ---------------------------------------------------------------------------
// workLogController: WORK_LOG_SUBMITTED — work logs have no approval/
// rejection concept, so there is no APPROVED/REJECTED activity to test.
// ---------------------------------------------------------------------------
describe("Activity: work log create", () => {
  const loadController = () => {
    jest.resetModules();

    const DailyWorkLog = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: "log-1",
      save: jest.fn().mockResolvedValue(undefined),
    }));
    const Job = { findOne: jest.fn() };
    const Driver = { findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue(leanResult({ name: "Test Driver" })) }) };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();

    jest.doMock("../models/dailyWorkLog", () => DailyWorkLog);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);

    return { controller: require("../controllers/workLogController"), DailyWorkLog, Job, Driver, activityService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("createWorkLog logs WORK_LOG_SUBMITTED, actor = driver, resource = the new log", async () => {
    const { controller, Job, activityService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const jobId = new mongoose.Types.ObjectId().toString();
    Job.findOne.mockReturnValueOnce(leanResult({ _id: jobId, jobType: "local" }));

    const req = {
      user: { id: driverId, role: "driver" },
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

    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: driverId,
        actorRole: "driver",
        action: "WORK_LOG_SUBMITTED",
        resourceType: "worklog",
        resourceId: "log-1",
        relatedJobId: jobId,
      })
    );
  });

});
