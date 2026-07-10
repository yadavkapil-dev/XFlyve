const mongoose = require("mongoose");

const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeObjectId = (value = new mongoose.Types.ObjectId().toString()) => ({
  toString: () => value,
});

const makeJobDoc = ({ assignedTo, status }) => ({
  _id: makeObjectId(),
  assignedTo: makeObjectId(assignedTo),
  status,
  save: jest.fn().mockResolvedValue(undefined),
});

const populatedFindById = (job) => ({
  populate: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(job),
  }),
});

const loadController = () => {
  jest.resetModules();

  const Job = {
    findById: jest.fn(),
    findReadyForInvoicing: jest.fn(),
    populate: jest.fn(),
  };
  const Driver = {
    findById: jest.fn(),
  };

  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return {
    controller: require("../controllers/jobController"),
    Job,
    Driver,
  };
};

const loadJobModel = () => {
  jest.resetModules();
  jest.dontMock("../models/job");
  jest.dontMock("../models/driver");
  jest.dontMock("../utils/logger");

  if (mongoose.models.Job) {
    mongoose.deleteModel("Job");
  }

  return require("../models/job");
};

const runPreSave = (Job, doc) =>
  new Promise((resolve, reject) => {
    Job.schema.s.hooks.execPre("save", doc, [], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

describe("Job workflow controller", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("driver status transitions", () => {
    test("allows pending to move to in-progress", async () => {
      const { controller, Job } = loadController();
      const driverId = new mongoose.Types.ObjectId().toString();
      const jobDoc = makeJobDoc({ assignedTo: driverId, status: "pending" });
      const updatedJob = { _id: jobDoc._id.toString(), status: "in-progress" };
      Job.findById
        .mockResolvedValueOnce(jobDoc)
        .mockReturnValueOnce(populatedFindById(updatedJob));

      const req = {
        params: { jobId: new mongoose.Types.ObjectId().toString() },
        user: { id: driverId, role: "driver" },
        body: { status: "in-progress" },
      };
      const res = makeResponse();

      await controller.updateJob(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(jobDoc.status).toBe("in-progress");
      expect(jobDoc.save).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ status: "success", data: updatedJob });
    });

    test("allows in-progress to move to completed", async () => {
      const { controller, Job } = loadController();
      const driverId = new mongoose.Types.ObjectId().toString();
      const jobDoc = makeJobDoc({ assignedTo: driverId, status: "in-progress" });
      const updatedJob = { _id: jobDoc._id.toString(), status: "completed" };
      Job.findById
        .mockResolvedValueOnce(jobDoc)
        .mockReturnValueOnce(populatedFindById(updatedJob));

      const req = {
        params: { jobId: new mongoose.Types.ObjectId().toString() },
        user: { id: driverId, role: "driver" },
        body: { status: "completed" },
      };
      const res = makeResponse();

      await controller.updateJob(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(jobDoc.status).toBe("completed");
      expect(jobDoc.save).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith({ status: "success", data: updatedJob });
    });

    test.each([
      ["pending", "completed"],
      ["completed", "pending"],
      ["completed", "in-progress"],
      ["in-progress", "pending"],
    ])("rejects invalid transition %s to %s with HTTP 409", async (currentStatus, nextStatus) => {
      const { controller, Job } = loadController();
      const driverId = new mongoose.Types.ObjectId().toString();
      const jobDoc = makeJobDoc({ assignedTo: driverId, status: currentStatus });
      Job.findById.mockResolvedValueOnce(jobDoc);

      const req = {
        params: { jobId: new mongoose.Types.ObjectId().toString() },
        user: { id: driverId, role: "driver" },
        body: { status: nextStatus },
      };
      const res = makeResponse();

      await controller.updateJob(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(jobDoc.save).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "fail" })
      );
    });
  });

  test("driver cannot start another driver's job", async () => {
    const { controller, Job } = loadController();
    const jobDoc = makeJobDoc({
      assignedTo: new mongoose.Types.ObjectId().toString(),
      status: "pending",
    });
    Job.findById.mockResolvedValueOnce(jobDoc);

    const req = {
      params: { jobId: new mongoose.Types.ObjectId().toString() },
      user: { id: new mongoose.Types.ObjectId().toString(), role: "driver" },
      body: { status: "in-progress" },
    };
    const res = makeResponse();

    await controller.updateJob(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  test("driver cannot complete another driver's job", async () => {
    const { controller, Job } = loadController();
    const jobDoc = makeJobDoc({
      assignedTo: new mongoose.Types.ObjectId().toString(),
      status: "in-progress",
    });
    Job.findById.mockResolvedValueOnce(jobDoc);

    const req = {
      params: { jobId: new mongoose.Types.ObjectId().toString() },
      user: { id: new mongoose.Types.ObjectId().toString(), role: "driver" },
    };
    const res = makeResponse();

    await controller.markJobComplete(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  test("completion endpoint cannot complete a pending job directly", async () => {
    const { controller, Job } = loadController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const jobDoc = makeJobDoc({ assignedTo: driverId, status: "pending" });
    Job.findById.mockResolvedValueOnce(jobDoc);

    const req = {
      params: { jobId: new mongoose.Types.ObjectId().toString() },
      user: { id: driverId, role: "driver" },
    };
    const res = makeResponse();

    await controller.markJobComplete(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(jobDoc.save).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Only an in-progress job can be completed",
    });
  });
});

describe("Job workflow model", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("starting a job sets startedAt once", async () => {
    const Job = loadJobModel();
    const job = new Job({
      title: "Local delivery",
      pickupLocation: "Depot",
      deliveryLocation: "Customer",
      assignedTo: new mongoose.Types.ObjectId(),
      assignedTruck: new mongoose.Types.ObjectId(),
      jobDate: new Date("2026-07-10T00:00:00.000Z"),
      jobType: "local",
      status: "pending",
    });

    job.status = "in-progress";
    await runPreSave(Job, job);
    const firstStartedAt = job.startedAt;

    await runPreSave(Job, job);

    expect(firstStartedAt).toBeInstanceOf(Date);
    expect(job.startedAt).toBe(firstStartedAt);
  });

  test("completing a job sets completedAt once", async () => {
    const Job = loadJobModel();
    const job = new Job({
      title: "Local delivery",
      pickupLocation: "Depot",
      deliveryLocation: "Customer",
      assignedTo: new mongoose.Types.ObjectId(),
      assignedTruck: new mongoose.Types.ObjectId(),
      jobDate: new Date("2026-07-10T00:00:00.000Z"),
      jobType: "local",
      status: "in-progress",
    });

    job.status = "completed";
    await runPreSave(Job, job);
    const firstCompletedAt = job.completedAt;

    await runPreSave(Job, job);

    expect(firstCompletedAt).toBeInstanceOf(Date);
    expect(job.completedAt).toBe(firstCompletedAt);
  });

  describe("invoice readiness", () => {
    const mockDocumentChecks = (Job, { hasPod, hasDiary }) => {
      const modelMongoose = Job.base;
      const JobPod =
        modelMongoose.models.JobPod || modelMongoose.model("JobPod", new modelMongoose.Schema({}));
      const WorkDiary =
        modelMongoose.models.WorkDiary || modelMongoose.model("WorkDiary", new modelMongoose.Schema({}));

      jest.spyOn(JobPod, "exists").mockResolvedValue(hasPod ? { _id: new modelMongoose.Types.ObjectId() } : null);
      jest.spyOn(WorkDiary, "exists").mockResolvedValue(hasDiary ? { _id: new modelMongoose.Types.ObjectId() } : null);
    };

    test("local job with completed status and approved POD is invoice ready", async () => {
      const Job = loadJobModel();
      mockDocumentChecks(Job, { hasPod: true, hasDiary: false });
      const job = new Job({
        title: "Local delivery",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: new mongoose.Types.ObjectId(),
        assignedTruck: new mongoose.Types.ObjectId(),
        jobDate: new Date("2026-07-10T00:00:00.000Z"),
        jobType: "local",
        status: "completed",
      });

      await expect(job.isInvoiceReady()).resolves.toBe(true);
    });

    test("interstate job with completed status and approved POD but no approved diary is not invoice ready", async () => {
      const Job = loadJobModel();
      mockDocumentChecks(Job, { hasPod: true, hasDiary: false });
      const job = new Job({
        title: "Interstate delivery",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: new mongoose.Types.ObjectId(),
        assignedTruck: new mongoose.Types.ObjectId(),
        jobDate: new Date("2026-07-10T00:00:00.000Z"),
        jobType: "interstate",
        status: "completed",
      });

      await expect(job.isInvoiceReady()).resolves.toBe(false);
    });

    test("interstate job with completed status, approved POD, and approved diary is invoice ready", async () => {
      const Job = loadJobModel();
      mockDocumentChecks(Job, { hasPod: true, hasDiary: true });
      const job = new Job({
        title: "Interstate delivery",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: new mongoose.Types.ObjectId(),
        assignedTruck: new mongoose.Types.ObjectId(),
        jobDate: new Date("2026-07-10T00:00:00.000Z"),
        jobType: "interstate",
        status: "completed",
      });

      await expect(job.isInvoiceReady()).resolves.toBe(true);
    });
  });
});
