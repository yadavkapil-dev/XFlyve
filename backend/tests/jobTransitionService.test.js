const mongoose = require("mongoose");

const makeObjectId = (value = new mongoose.Types.ObjectId().toString()) => ({
  toString: () => value,
});

const leanResult = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

const makeJobDoc = ({ assignedTruck = makeObjectId(), status }) => ({
  _id: makeObjectId(),
  assignedTruck,
  status,
  save: jest.fn().mockResolvedValue(undefined),
});

const makeTruckDoc = ({ status = "available", recordStatus = "active" } = {}) => ({
  _id: makeObjectId(),
  status,
  recordStatus,
  assignedJob: null,
});

// Loads a fresh copy of the service with its model/capability dependencies
// mocked, so each test can control DB responses precisely without a real
// MongoDB connection.
const loadService = ({ transactionsSupported = false } = {}) => {
  jest.resetModules();

  const Job = {
    findById: jest.fn(),
    findOne: jest.fn(),
  };
  const Truck = {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const fakeSession = {
    withTransaction: jest.fn(async (fn) => fn()),
    endSession: jest.fn().mockResolvedValue(undefined),
  };

  jest.doMock("../models/job", () => Job);
  jest.doMock("../models/truck", () => Truck);
  jest.doMock("../utils/dbCapabilities", () => ({
    supportsTransactions: jest.fn().mockResolvedValue(transactionsSupported),
  }));
  jest.doMock("mongoose", () => {
    const actual = jest.requireActual("mongoose");
    return { ...actual, startSession: jest.fn().mockResolvedValue(fakeSession) };
  });

  const service = require("../services/jobTransitionService");
  const mockedMongoose = require("mongoose");

  return { service, Job, Truck, fakeSession, mockedMongoose };
};

describe("jobTransitionService.startJob", () => {
  afterEach(() => jest.restoreAllMocks());

  test("valid transition: claims the truck atomically and starts the job", async () => {
    const { service, Job, Truck } = loadService();
    const truckId = makeObjectId();
    const jobDoc = makeJobDoc({ assignedTruck: truckId, status: "pending" });
    const truckDoc = makeTruckDoc();

    Truck.findById.mockResolvedValueOnce(truckDoc);
    Job.findOne.mockReturnValueOnce(leanResult(null));
    Truck.findOneAndUpdate.mockResolvedValueOnce({ ...truckDoc, status: "on-route" });

    await service.startJob(jobDoc);

    expect(jobDoc.status).toBe("in-progress");
    expect(jobDoc.save).toHaveBeenCalledTimes(1);
    expect(Truck.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: truckDoc._id, status: "available", recordStatus: { $ne: "archived" } },
      { status: "on-route", assignedJob: jobDoc._id },
      { new: true }
    );
  });

  test("invalid transition: an already in-progress job cannot be started again", async () => {
    const { service } = loadService();
    const jobDoc = makeJobDoc({ status: "in-progress" });

    await expect(service.startJob(jobDoc)).rejects.toMatchObject({
      statusCode: 409,
      message: "Job is already in progress",
    });
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  test("truck availability: an out-of-service truck rejects the start", async () => {
    const { service, Truck } = loadService();
    const jobDoc = makeJobDoc({ status: "pending" });
    Truck.findById.mockResolvedValueOnce(makeTruckDoc({ status: "out-of-service" }));

    await expect(service.startJob(jobDoc)).rejects.toMatchObject({ statusCode: 409 });
    expect(jobDoc.save).not.toHaveBeenCalled();
    expect(Truck.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("concurrency: loses the race when another request already claimed the truck", async () => {
    const { service, Truck, Job } = loadService();
    const truckDoc = makeTruckDoc();
    const jobDoc = makeJobDoc({ assignedTruck: truckDoc._id, status: "pending" });

    Truck.findById.mockResolvedValueOnce(truckDoc);
    Job.findOne.mockReturnValueOnce(leanResult(null));
    // The atomic conditional update finds no matching (still-available) truck.
    Truck.findOneAndUpdate.mockResolvedValueOnce(null);

    await expect(service.startJob(jobDoc)).rejects.toMatchObject({
      statusCode: 409,
      message: "This truck is already on an in-progress job",
    });
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  test("rollback: releases the claimed truck if the job save fails (no transaction support)", async () => {
    const { service, Truck, Job } = loadService({ transactionsSupported: false });
    const truckDoc = makeTruckDoc();
    const jobDoc = makeJobDoc({ assignedTruck: truckDoc._id, status: "pending" });
    jobDoc.save.mockRejectedValueOnce(new Error("write conflict"));

    Truck.findById.mockResolvedValueOnce(truckDoc);
    Job.findOne.mockReturnValueOnce(leanResult(null));
    Truck.findOneAndUpdate.mockResolvedValueOnce({ ...truckDoc, status: "on-route" });

    await expect(service.startJob(jobDoc)).rejects.toThrow("write conflict");

    expect(Truck.updateOne).toHaveBeenCalledWith(
      { _id: truckDoc._id, recordStatus: { $ne: "archived" } },
      { status: "available", assignedJob: null }
    );
  });

  test("transaction wiring: uses a session end-to-end when the topology supports it", async () => {
    const { service, Truck, Job, mockedMongoose, fakeSession } = loadService({
      transactionsSupported: true,
    });
    const truckDoc = makeTruckDoc();
    const jobDoc = makeJobDoc({ assignedTruck: truckDoc._id, status: "pending" });

    Truck.findById.mockResolvedValueOnce(truckDoc);
    Job.findOne.mockReturnValueOnce(leanResult(null));
    Truck.findOneAndUpdate.mockResolvedValueOnce({ ...truckDoc, status: "on-route" });

    await service.startJob(jobDoc);

    expect(mockedMongoose.startSession).toHaveBeenCalledTimes(1);
    expect(fakeSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(fakeSession.endSession).toHaveBeenCalledTimes(1);
    expect(Truck.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ session: fakeSession })
    );
    expect(jobDoc.save).toHaveBeenCalledWith({ session: fakeSession });
  });
});

describe("jobTransitionService.completeJob", () => {
  afterEach(() => jest.restoreAllMocks());

  test("valid transition: completes the job and releases the truck", async () => {
    const { service, Truck, Job } = loadService();
    const truckId = makeObjectId();
    const jobDoc = makeJobDoc({ assignedTruck: truckId, status: "in-progress" });
    Job.findById.mockReturnValueOnce({
      populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: jobDoc._id }) }),
    });

    await service.completeJob(jobDoc);

    expect(jobDoc.status).toBe("completed");
    expect(Truck.updateOne).toHaveBeenCalledWith(
      { _id: truckId, recordStatus: { $ne: "archived" } },
      { status: "available", assignedJob: null }
    );
  });

  test("invalid transition: a pending job cannot be completed directly", async () => {
    const { service } = loadService();
    const jobDoc = makeJobDoc({ status: "pending" });

    await expect(service.completeJob(jobDoc)).rejects.toMatchObject({
      statusCode: 409,
      message: "Only an in-progress job can be completed",
    });
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  test("rollback: reverts job status if releasing the truck fails (no transaction support)", async () => {
    const { service, Truck } = loadService({ transactionsSupported: false });
    const jobDoc = makeJobDoc({ status: "in-progress" });
    Truck.updateOne.mockRejectedValueOnce(new Error("truck update failed"));

    await expect(service.completeJob(jobDoc)).rejects.toThrow("truck update failed");

    // First save marks it completed, second save (the compensation) reverts it.
    expect(jobDoc.save).toHaveBeenCalledTimes(2);
    expect(jobDoc.status).toBe("in-progress");
  });
});

describe("jobTransitionService.reassignJob", () => {
  afterEach(() => jest.restoreAllMocks());

  test("valid reassignment: releases the old truck and claims the new one", async () => {
    const { service, Truck, Job } = loadService();
    const oldTruckId = makeObjectId();
    const newTruckId = makeObjectId();
    const jobDoc = makeJobDoc({ assignedTruck: oldTruckId, status: "in-progress" });
    Truck.findOneAndUpdate.mockResolvedValueOnce({ _id: newTruckId, status: "on-route" });
    Job.findById.mockReturnValueOnce({
      populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: jobDoc._id }) }),
    });

    await service.reassignJob(jobDoc, newTruckId);

    expect(Truck.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: newTruckId, status: "available", recordStatus: { $ne: "archived" } },
      { status: "on-route", assignedJob: jobDoc._id },
      { new: true }
    );
    expect(Truck.updateOne).toHaveBeenCalledWith(
      { _id: oldTruckId, recordStatus: { $ne: "archived" } },
      { status: "available", assignedJob: null }
    );
    expect(jobDoc.assignedTruck).toBe(newTruckId);
  });

  test("invalid transition: only an in-progress job's truck can be reassigned this way", async () => {
    const { service } = loadService();
    const jobDoc = makeJobDoc({ status: "pending" });

    await expect(service.reassignJob(jobDoc, makeObjectId())).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test("concurrency: leaves the old truck untouched when the new truck is lost to a race", async () => {
    const { service, Truck } = loadService();
    const oldTruckId = makeObjectId();
    const jobDoc = makeJobDoc({ assignedTruck: oldTruckId, status: "in-progress" });
    Truck.findOneAndUpdate.mockResolvedValueOnce(null);

    await expect(service.reassignJob(jobDoc, makeObjectId())).rejects.toMatchObject({
      statusCode: 409,
      message: "New truck is not available for reassignment",
    });
    expect(Truck.updateOne).not.toHaveBeenCalled();
    expect(jobDoc.save).not.toHaveBeenCalled();
  });

  test("rollback: releases the newly claimed truck if the job save fails (no transaction support)", async () => {
    const { service, Truck } = loadService({ transactionsSupported: false });
    const oldTruckId = makeObjectId();
    const newTruckId = makeObjectId();
    const jobDoc = makeJobDoc({ assignedTruck: oldTruckId, status: "in-progress" });
    jobDoc.save.mockRejectedValueOnce(new Error("write conflict"));
    Truck.findOneAndUpdate.mockResolvedValueOnce({ _id: newTruckId, status: "on-route" });

    await expect(service.reassignJob(jobDoc, newTruckId)).rejects.toThrow("write conflict");

    expect(Truck.updateOne).toHaveBeenCalledWith(
      { _id: newTruckId, recordStatus: { $ne: "archived" } },
      { status: "available", assignedJob: null }
    );
  });
});
