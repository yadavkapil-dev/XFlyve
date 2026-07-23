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

const dateInputValue = (dayOffset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const leanResult = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const driverLookup = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const populatedFindById = (job) => ({
  populate: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(job),
  }),
});

const makeJobDoc = ({
  assignedTo,
  assignedTruck = new mongoose.Types.ObjectId().toString(),
  status,
}) => ({
  _id: makeObjectId(),
  assignedTo: makeObjectId(assignedTo),
  assignedTruck: makeObjectId(assignedTruck),
  status,
  save: jest.fn().mockResolvedValue(undefined),
});

const makeTruckDoc = ({
  status = "available",
  recordStatus = "active",
} = {}) => ({
  _id: makeObjectId(),
  status,
  recordStatus,
  assignedJob: null,
  save: jest.fn().mockResolvedValue(undefined),
});

const loadJobController = () => {
  jest.resetModules();

  const Job = {
    create: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    findReadyForInvoicing: jest.fn(),
    populate: jest.fn(),
    updateOne: jest.fn(),
  };
  const Driver = {
    findById: jest.fn(),
  };
  const Truck = {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const notificationService = {
    notifyUser: jest.fn().mockResolvedValue(null),
    notifyAdmins: jest.fn().mockResolvedValue(null),
  };
  const activityService = {
    logActivity: jest.fn().mockResolvedValue(null),
  };

  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/driver", () => Driver);
  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
  jest.doMock("../services/notificationService", () => notificationService);
  jest.doMock("../services/activityService", () => activityService);

  return {
    controller: require("../controllers/jobController"),
    Job,
    Driver,
    Truck,
    notificationService,
    activityService,
  };
};

const loadTruckController = () => {
  jest.resetModules();

  const Truck = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const Job = {
    exists: jest.fn(),
  };
  const TruckAssignment = {
    exists: jest.fn(),
  };

  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/dailyTruckAssignment", () => TruckAssignment);
  jest.doMock("../utils/logger", () => ({ error: jest.fn() }));

  return {
    controller: require("../controllers/truckController"),
    Truck,
    Job,
    TruckAssignment,
  };
};

const loadJobModel = () => {
  jest.resetModules();
  jest.dontMock("../models/job");
  jest.dontMock("../models/driver");
  jest.dontMock("../models/truck");
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

  test("creates a pending job for an available truck without changing truck status", async () => {
    const { controller, Job, Driver, Truck } = loadJobController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();
    const createdJob = { _id: new mongoose.Types.ObjectId().toString(), status: "pending" };

    Driver.findById.mockReturnValueOnce(driverLookup({ _id: driverId }));
    Truck.findById.mockReturnValueOnce(leanResult({ _id: truckId, status: "available", recordStatus: "active" }));
    Job.findOne.mockReturnValueOnce(leanResult(null));
    Job.create.mockResolvedValueOnce(createdJob);

    const req = {
      body: {
        title: "Local delivery",
        description: "Drop freight",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: driverId,
        assignedTruck: truckId,
        jobDate: dateInputValue(),
        jobType: "local",
      },
      user: { id: new mongoose.Types.ObjectId().toString(), role: "admin" },
    };
    const res = makeResponse();

    await controller.createJob(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Job.create).toHaveBeenCalledWith(expect.objectContaining({
      assignedTruck: truckId,
      status: "pending",
    }));
    expect(Truck.updateOne).not.toHaveBeenCalled();
  });

  test("rejects creating a job with a past calendar date", async () => {
    const { controller, Job, Driver, Truck } = loadJobController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();

    Driver.findById.mockReturnValueOnce(driverLookup({ _id: driverId }));
    Truck.findById.mockReturnValueOnce(leanResult({ _id: truckId, status: "available", recordStatus: "active" }));

    const req = {
      body: {
        title: "Past delivery",
        description: "Drop freight",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: driverId,
        assignedTruck: truckId,
        jobDate: dateInputValue(-1),
        jobType: "local",
      },
      user: { id: new mongoose.Types.ObjectId().toString(), role: "admin" },
    };
    const res = makeResponse();

    await controller.createJob(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: "Job date cannot be in the past.",
    });
    expect(Job.findOne).not.toHaveBeenCalled();
    expect(Job.create).not.toHaveBeenCalled();
  });

  test("allows creating a job with a future calendar date", async () => {
    const { controller, Job, Driver, Truck } = loadJobController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();
    const createdJob = { _id: new mongoose.Types.ObjectId().toString(), status: "pending" };

    Driver.findById.mockReturnValueOnce(driverLookup({ _id: driverId }));
    Truck.findById.mockReturnValueOnce(leanResult({ _id: truckId, status: "available", recordStatus: "active" }));
    Job.findOne.mockReturnValueOnce(leanResult(null));
    Job.create.mockResolvedValueOnce(createdJob);

    const req = {
      body: {
        title: "Future delivery",
        description: "Drop freight",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: driverId,
        assignedTruck: truckId,
        jobDate: dateInputValue(1),
        jobType: "local",
      },
      user: { id: new mongoose.Types.ObjectId().toString(), role: "admin" },
    };
    const res = makeResponse();

    await controller.createJob(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Job.create).toHaveBeenCalledWith(expect.objectContaining({
      jobDate: expect.any(Date),
      status: "pending",
    }));
  });

  describe("driver status transitions", () => {
    test("allows pending to move to in-progress and marks the truck on-route", async () => {
      const { controller, Job, Truck } = loadJobController();
      const driverId = new mongoose.Types.ObjectId().toString();
      const truckId = new mongoose.Types.ObjectId().toString();
      const jobDoc = makeJobDoc({ assignedTo: driverId, assignedTruck: truckId, status: "pending" });
      const truckDoc = makeTruckDoc();
      const claimedTruck = { ...truckDoc, status: "on-route", assignedJob: jobDoc._id };
      const updatedJob = { _id: jobDoc._id.toString(), status: "in-progress" };

      Job.findById
        .mockResolvedValueOnce(jobDoc)
        .mockReturnValueOnce(populatedFindById(updatedJob));
      Truck.findById.mockResolvedValueOnce(truckDoc);
      Job.findOne.mockReturnValueOnce(leanResult(null));
      Truck.findOneAndUpdate.mockResolvedValueOnce(claimedTruck);

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
      // The truck claim is an atomic conditional update (only succeeds while
      // still "available"), not a read-then-save — that's what actually
      // prevents two concurrent start requests from both winning the truck.
      expect(Truck.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: truckDoc._id, status: "available", recordStatus: { $ne: "archived" } },
        { status: "on-route", assignedJob: jobDoc._id },
        { new: true }
      );
    });

    test("rejects starting a job when a concurrent request already claimed the truck", async () => {
      const { controller, Job, Truck } = loadJobController();
      const driverId = new mongoose.Types.ObjectId().toString();
      const truckId = new mongoose.Types.ObjectId().toString();
      const jobDoc = makeJobDoc({ assignedTo: driverId, assignedTruck: truckId, status: "pending" });
      const truckDoc = makeTruckDoc();

      Job.findById.mockResolvedValueOnce(jobDoc);
      Truck.findById.mockResolvedValueOnce(truckDoc);
      Job.findOne.mockReturnValueOnce(leanResult(null));
      // Another request won the race and flipped the truck first.
      Truck.findOneAndUpdate.mockResolvedValueOnce(null);

      const req = {
        params: { jobId: new mongoose.Types.ObjectId().toString() },
        user: { id: driverId, role: "driver" },
        body: { status: "in-progress" },
      };
      const res = makeResponse();

      await controller.updateJob(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(jobDoc.save).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        status: "fail",
        message: "This truck is already on an in-progress job",
      });
    });

    test("allows in-progress to move to completed and marks the truck available", async () => {
      const { controller, Job, Truck } = loadJobController();
      const driverId = new mongoose.Types.ObjectId().toString();
      const truckId = new mongoose.Types.ObjectId().toString();
      const jobDoc = makeJobDoc({ assignedTo: driverId, assignedTruck: truckId, status: "in-progress" });
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
      expect(Truck.updateOne).toHaveBeenCalledWith(
        { _id: jobDoc.assignedTruck, recordStatus: { $ne: "archived" } },
        { status: "available", assignedJob: null }
      );
    });

    test.each([
      ["pending", "completed"],
      ["completed", "pending"],
      ["completed", "in-progress"],
      ["in-progress", "pending"],
    ])("rejects invalid transition %s to %s with HTTP 409", async (currentStatus, nextStatus) => {
      const { controller, Job } = loadJobController();
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
    const { controller, Job } = loadJobController();
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
    const { controller, Job } = loadJobController();
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
    const { controller, Job } = loadJobController();
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

  test("job cannot start if its truck is out of service", async () => {
    const { controller, Job, Truck } = loadJobController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const jobDoc = makeJobDoc({ assignedTo: driverId, status: "pending" });
    const truckDoc = makeTruckDoc({ status: "out-of-service" });

    Job.findById.mockResolvedValueOnce(jobDoc);
    Truck.findById.mockResolvedValueOnce(truckDoc);

    const req = {
      params: { jobId: new mongoose.Types.ObjectId().toString() },
      user: { id: driverId, role: "driver" },
      body: { status: "in-progress" },
    };
    const res = makeResponse();

    await controller.updateJob(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(jobDoc.save).not.toHaveBeenCalled();
    expect(truckDoc.save).not.toHaveBeenCalled();
  });

  test("prevents two active jobs from putting the same truck on-route", async () => {
    const { controller, Job, Truck } = loadJobController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const jobDoc = makeJobDoc({ assignedTo: driverId, status: "pending" });
    const truckDoc = makeTruckDoc();

    Job.findById.mockResolvedValueOnce(jobDoc);
    Truck.findById.mockResolvedValueOnce(truckDoc);
    Job.findOne.mockReturnValueOnce(leanResult({ _id: new mongoose.Types.ObjectId() }));

    const req = {
      params: { jobId: new mongoose.Types.ObjectId().toString() },
      user: { id: driverId, role: "driver" },
      body: { status: "in-progress" },
    };
    const res = makeResponse();

    await controller.updateJob(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(jobDoc.save).not.toHaveBeenCalled();
    expect(truckDoc.save).not.toHaveBeenCalled();
  });

  test("out-of-service truck cannot be assigned to a new job", async () => {
    const { controller, Job, Driver, Truck } = loadJobController();
    const driverId = new mongoose.Types.ObjectId().toString();
    const truckId = new mongoose.Types.ObjectId().toString();

    Driver.findById.mockReturnValueOnce(driverLookup({ _id: driverId }));
    Truck.findById.mockReturnValueOnce(leanResult({ _id: truckId, status: "out-of-service", recordStatus: "active" }));

    const req = {
      body: {
        title: "Local delivery",
        description: "Drop freight",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: driverId,
        assignedTruck: truckId,
        jobDate: dateInputValue(),
        jobType: "local",
      },
      user: { id: new mongoose.Types.ObjectId().toString(), role: "admin" },
    };
    const res = makeResponse();

    await controller.createJob(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(Job.create).not.toHaveBeenCalled();
  });

  test("completing a job does not change an archived truck to available", async () => {
    const { controller, Job, Truck } = loadJobController();
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

    expect(Truck.updateOne).toHaveBeenCalledWith(
      { _id: jobDoc.assignedTruck, recordStatus: { $ne: "archived" } },
      { status: "available", assignedJob: null }
    );
  });
});

describe("Truck admin status workflow", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("admin can mark a truck out of service and return it to service", async () => {
    const { controller, Truck, Job } = loadTruckController();
    const truckDoc = makeTruckDoc();
    Truck.findById.mockResolvedValue(truckDoc);
    Job.exists.mockResolvedValue(null);

    const outRes = makeResponse();
    await controller.updateTruck(
      { params: { truckId: new mongoose.Types.ObjectId().toString() }, body: { status: "out-of-service" } },
      outRes
    );

    expect(outRes.status).toHaveBeenCalledWith(200);
    expect(truckDoc.status).toBe("out-of-service");
    expect(truckDoc.save).toHaveBeenCalledTimes(1);

    const availableRes = makeResponse();
    await controller.updateTruck(
      { params: { truckId: new mongoose.Types.ObjectId().toString() }, body: { status: "available" } },
      availableRes
    );

    expect(availableRes.status).toHaveBeenCalledWith(200);
    expect(truckDoc.status).toBe("available");
    expect(truckDoc.save).toHaveBeenCalledTimes(2);
  });

  test("admin cannot mark a truck out of service while it has an in-progress job", async () => {
    const { controller, Truck, Job } = loadTruckController();
    const truckDoc = makeTruckDoc();
    Truck.findById.mockResolvedValueOnce(truckDoc);
    Job.exists.mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId() });

    const res = makeResponse();
    await controller.updateTruck(
      { params: { truckId: new mongoose.Types.ObjectId().toString() }, body: { status: "out-of-service" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(truckDoc.save).not.toHaveBeenCalled();
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

    test.each(["pending", "in-progress"])(
      "a %s job is never invoice ready, regardless of POD/diary approval, and never even checks them",
      async (status) => {
        const Job = loadJobModel();
        mockDocumentChecks(Job, { hasPod: true, hasDiary: true });
        const job = new Job({
          title: "Local delivery",
          pickupLocation: "Depot",
          deliveryLocation: "Customer",
          assignedTo: new mongoose.Types.ObjectId(),
          assignedTruck: new mongoose.Types.ObjectId(),
          jobDate: new Date("2026-07-10T00:00:00.000Z"),
          jobType: "local",
          status,
        });

        await expect(job.isInvoiceReady()).resolves.toBe(false);
        // Short-circuits on status before ever querying JobPod/WorkDiary —
        // an in-progress job with a stray approved POD from a prior run
        // shouldn't trigger a real query just to say "no".
        const modelMongoose = Job.base;
        expect(modelMongoose.models.JobPod.exists).not.toHaveBeenCalled();
      }
    );

    test("an archived job is never invoice ready even if otherwise complete and approved", async () => {
      const Job = loadJobModel();
      mockDocumentChecks(Job, { hasPod: true, hasDiary: true });
      const job = new Job({
        title: "Local delivery",
        pickupLocation: "Depot",
        deliveryLocation: "Customer",
        assignedTo: new mongoose.Types.ObjectId(),
        assignedTruck: new mongoose.Types.ObjectId(),
        jobDate: new Date("2026-07-10T00:00:00.000Z"),
        jobType: "local",
        status: "completed",
        recordStatus: "archived",
      });

      await expect(job.isInvoiceReady()).resolves.toBe(false);
    });

    test.each(["invoiced", "paid"])(
      "a job already marked '%s' is not invoice ready again — prevents double-invoicing",
      async (invoiceStatus) => {
        const Job = loadJobModel();
        mockDocumentChecks(Job, { hasPod: true, hasDiary: true });
        const job = new Job({
          title: "Local delivery",
          pickupLocation: "Depot",
          deliveryLocation: "Customer",
          assignedTo: new mongoose.Types.ObjectId(),
          assignedTruck: new mongoose.Types.ObjectId(),
          jobDate: new Date("2026-07-10T00:00:00.000Z"),
          jobType: "local",
          status: "completed",
          invoiceStatus,
        });

        await expect(job.isInvoiceReady()).resolves.toBe(false);
      }
    );

    test("a local job without an approved POD is not invoice ready", async () => {
      const Job = loadJobModel();
      mockDocumentChecks(Job, { hasPod: false, hasDiary: false });
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

      await expect(job.isInvoiceReady()).resolves.toBe(false);
    });

    describe("findReadyForInvoicing", () => {
      test("queries completed, non-archived jobs with pending/ready invoiceStatus, then keeps only the ones that pass isInvoiceReady", async () => {
        const Job = loadJobModel();
        const readyJob = { isInvoiceReady: jest.fn().mockResolvedValue(true) };
        const notReadyJob = { isInvoiceReady: jest.fn().mockResolvedValue(false) };
        jest.spyOn(Job, "find").mockResolvedValueOnce([readyJob, notReadyJob]);

        const result = await Job.findReadyForInvoicing();

        expect(Job.find).toHaveBeenCalledWith({
          status: "completed",
          recordStatus: { $ne: "archived" },
          invoiceStatus: { $in: ["pending", "ready"] },
        });
        expect(result).toEqual([readyJob]);
      });

      test("returns an empty array when no completed job passes isInvoiceReady", async () => {
        const Job = loadJobModel();
        const notReadyJob = { isInvoiceReady: jest.fn().mockResolvedValue(false) };
        jest.spyOn(Job, "find").mockResolvedValueOnce([notReadyJob]);

        await expect(Job.findReadyForInvoicing()).resolves.toEqual([]);
      });

      test("returns an empty array when no jobs match the base query at all", async () => {
        const Job = loadJobModel();
        jest.spyOn(Job, "find").mockResolvedValueOnce([]);

        await expect(Job.findReadyForInvoicing()).resolves.toEqual([]);
      });
    });
  });
});
