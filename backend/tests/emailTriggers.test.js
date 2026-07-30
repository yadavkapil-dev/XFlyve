const mongoose = require("mongoose");

const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const leanResult = (value) => ({ lean: jest.fn().mockResolvedValue(value) });
const selectLeanResult = (value) => ({ select: jest.fn().mockReturnValue(leanResult(value)) });

const notificationServiceMock = () => ({
  notifyUser: jest.fn().mockResolvedValue(null),
  notifyAdmins: jest.fn().mockResolvedValue(null),
});

const activityServiceMock = () => ({
  logActivity: jest.fn().mockResolvedValue(null),
});

const emailServiceMock = () => ({
  sendJobAssignedEmail: jest.fn(),
  sendDocumentRejectedEmail: jest.fn(),
});

// ---------------------------------------------------------------------------
// jobController: create/reassign -> sendJobAssignedEmail
// (alongside notifyUser's job_assigned notification, not instead of it)
// ---------------------------------------------------------------------------
describe("Email trigger: job assigned (jobController)", () => {
  const loadController = () => {
    jest.resetModules();

    const Job = { create: jest.fn(), findById: jest.fn(), findOne: jest.fn(), updateOne: jest.fn() };
    const Driver = { findById: jest.fn() };
    const Truck = { findById: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();
    const emailService = emailServiceMock();

    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../models/truck", () => Truck);
    jest.doMock("../utils/logger", () => ({ error: jest.fn(), warn: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);
    jest.doMock("../services/emailService", () => emailService);

    return { controller: require("../controllers/jobController"), Job, Driver, Truck, notificationService, emailService };
  };

  afterEach(() => jest.restoreAllMocks());

  const dateInputValue = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  test("createJob sends the job-assigned email to the assigned driver, in addition to notifyUser", async () => {
    const { controller, Job, Driver, Truck, notificationService, emailService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();
    const createdJob = { _id: "new-job-1", assignedTo: driverId, title: "New Run" };

    Driver.findById.mockReturnValueOnce(leanResult({ _id: driverId, email: "driver@example.com" }));
    Truck.findById.mockReturnValueOnce(leanResult({ _id: truckId, status: "available", recordStatus: "active" }));
    Job.findOne.mockReturnValueOnce(leanResult(null));
    Job.create.mockResolvedValueOnce(createdJob);

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

    expect(emailService.sendJobAssignedEmail).toHaveBeenCalledWith("driver@example.com", createdJob);
    // Both the in-app notification and the email fire from the same event
    // — one doesn't replace the other.
    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "job_assigned" })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("updateJob (admin, reassigns to a new driver) sends the job-assigned email to the NEW driver", async () => {
    const { controller, Job, Driver, notificationService, emailService } = loadController();
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
    Driver.findById.mockReturnValueOnce(leanResult({ _id: newDriverId, email: "newdriver@example.com" }));

    const req = {
      params: { jobId: "job-3" },
      user: { id: "admin-1", role: "admin" },
      body: { assignedTo: newDriverId },
    };
    const res = makeResponse();

    await controller.updateJob(req, res);

    expect(emailService.sendJobAssignedEmail).toHaveBeenCalledWith("newdriver@example.com", jobDoc);
    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_assigned" })
    );
  });

  test("updateJob (admin edits a field, same driver) does NOT send a job-assigned email — only reassignment does", async () => {
    const { controller, Job, notificationService, emailService } = loadController();
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

    expect(emailService.sendJobAssignedEmail).not.toHaveBeenCalled();
    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_updated" })
    );
  });

  test("createJob still responds 201 even if the email service throws synchronously", async () => {
    const { controller, Job, Driver, Truck, emailService } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();

    Driver.findById.mockReturnValueOnce(leanResult({ _id: driverId, email: "driver@example.com" }));
    Truck.findById.mockReturnValueOnce(leanResult({ _id: truckId, status: "available", recordStatus: "active" }));
    Job.findOne.mockReturnValueOnce(leanResult(null));
    Job.create.mockResolvedValueOnce({ _id: "new-job-2", assignedTo: driverId, title: "New Run 2" });

    emailService.sendJobAssignedEmail.mockImplementationOnce(() => {
      throw new Error("Resend is down");
    });

    const req = {
      body: {
        title: "New Run 2",
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

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ---------------------------------------------------------------------------
// jobPodController / workDiaryController / workLogController:
// reject -> sendDocumentRejectedEmail (alongside notifyUser's *_rejected
// notification, not instead of it)
// ---------------------------------------------------------------------------
describe("Email trigger: document rejected (POD / work diary / work log)", () => {
  const loadPodController = () => {
    jest.resetModules();

    const JobPod = jest.fn().mockImplementation((data) => ({ ...data, _id: "pod-1", save: jest.fn().mockResolvedValue(undefined) }));
    JobPod.findById = jest.fn();
    const Job = { findById: jest.fn(), updateOne: jest.fn() };
    const Driver = { findById: jest.fn() };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();
    const emailService = emailServiceMock();

    jest.doMock("../models/jobPod", () => JobPod);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../utils/logger", () => ({ error: jest.fn(), warn: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);
    jest.doMock("../services/emailService", () => emailService);

    return { controller: require("../controllers/jobPodController"), JobPod, Driver, notificationService, emailService };
  };

  const loadDiaryController = () => {
    jest.resetModules();

    const WorkDiary = jest.fn().mockImplementation((data) => ({ ...data, _id: "diary-1", save: jest.fn().mockResolvedValue(undefined) }));
    WorkDiary.findById = jest.fn();
    const Job = { findById: jest.fn(), updateOne: jest.fn() };
    const Driver = { findById: jest.fn() };
    const notificationService = notificationServiceMock();
    const activityService = activityServiceMock();
    const emailService = emailServiceMock();

    jest.doMock("../models/workDiary", () => WorkDiary);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../models/driver", () => Driver);
    jest.doMock("../utils/logger", () => ({ error: jest.fn(), warn: jest.fn() }));
    jest.doMock("../services/notificationService", () => notificationService);
    jest.doMock("../services/activityService", () => activityService);
    jest.doMock("../services/emailService", () => emailService);

    return { controller: require("../controllers/workDiaryController"), WorkDiary, Driver, notificationService, emailService };
  };

  afterEach(() => jest.restoreAllMocks());

  test("rejectPOD sends a document-rejected email (documentType 'pod') with the rejection reason, alongside notifyUser", async () => {
    const { controller, JobPod, Driver, notificationService, emailService } = loadPodController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const podId = new mongoose.Types.ObjectId().toString();
    const pod = { _id: podId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    JobPod.findById.mockResolvedValueOnce(pod);
    Driver.findById.mockReturnValueOnce(selectLeanResult({ email: "driver@example.com" }));

    const req = { params: { podId }, body: { rejectionReason: "blurry photo" }, user: { id: "admin-1", role: "admin" } };
    const res = makeResponse();

    await controller.rejectPOD(req, res);

    expect(emailService.sendDocumentRejectedEmail).toHaveBeenCalledWith("driver@example.com", {
      documentType: "pod",
      reason: "blurry photo",
    });
    expect(notificationService.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: driverId, type: "pod_rejected" })
    );
  });

  test("rejectWorkDiary sends a document-rejected email (documentType 'diary') with the rejection reason", async () => {
    const { controller, WorkDiary, Driver, emailService } = loadDiaryController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const diaryId = new mongoose.Types.ObjectId().toString();
    const diary = { _id: diaryId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    WorkDiary.findById.mockResolvedValueOnce(diary);
    Driver.findById.mockReturnValueOnce(selectLeanResult({ email: "driver2@example.com" }));

    const req = { params: { id: diaryId }, body: { rejectionReason: "missing pages" }, user: { id: "admin-1", role: "admin" } };
    const res = makeResponse();

    await controller.rejectWorkDiary(req, res);

    expect(emailService.sendDocumentRejectedEmail).toHaveBeenCalledWith("driver2@example.com", {
      documentType: "diary",
      reason: "missing pages",
    });
  });

  test("rejectPOD still responds 200 and the rejection still persists even if the driver-email lookup fails", async () => {
    const { controller, JobPod, Driver, emailService } = loadPodController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const podId = new mongoose.Types.ObjectId().toString();
    const pod = { _id: podId, driverId, save: jest.fn().mockResolvedValue(undefined) };
    JobPod.findById.mockResolvedValueOnce(pod);
    Driver.findById.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error("DB blip")) }),
    });

    const req = { params: { podId }, body: { rejectionReason: "blurry photo" }, user: { id: "admin-1", role: "admin" } };
    const res = makeResponse();

    await controller.rejectPOD(req, res);

    expect(emailService.sendDocumentRejectedEmail).not.toHaveBeenCalled();
    expect(pod.save).toHaveBeenCalled();
    expect(pod.status).toBe("rejected");
    expect(res.status).toHaveBeenCalledWith(200);
  });

});
