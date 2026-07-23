const mongoose = require("mongoose");
const Job = require("../models/job");
const Truck = require("../models/truck");
const { supportsTransactions } = require("../utils/dbCapabilities");
const { notifyAdmins } = require("./notificationService");
const { logActivity } = require("./activityService");

/**
 * Domain-rule error for job/truck transitions. Controllers translate this
 * into an HTTP response using statusCode + message; anything else is an
 * unexpected error and should fall through to the generic 500 handler.
 */
class JobTransitionError extends Error {
  constructor(message, statusCode = 409) {
    super(message);
    this.name = "JobTransitionError";
    this.statusCode = statusCode;
  }
}

const isTruckUnavailable = (truck) =>
  !truck || truck.recordStatus === "archived" || truck.status !== "available";

const findInProgressTruckJob = async ({ assignedTruck, excludeJobId }) =>
  Job.findOne({
    assignedTruck,
    status: "in-progress",
    recordStatus: { $ne: "archived" },
    ...(excludeJobId ? { _id: { $ne: excludeJobId } } : {}),
  }).lean();

// Passing an explicit `{ session: undefined }` still counts as a distinct
// call argument, so these omit it entirely outside a transaction rather
// than passing it as undefined.
const saveWithSession = (doc, session) => (session ? doc.save({ session }) : doc.save());

const releaseTruck = (truckId, session) => {
  const filter = { _id: truckId, recordStatus: { $ne: "archived" } };
  const update = { status: "available", assignedJob: null };
  return session ? Truck.updateOne(filter, update, { session }) : Truck.updateOne(filter, update);
};

/**
 * Runs `fn` inside a MongoDB transaction when the connected topology
 * supports one (replica set / mongos). On a standalone deployment (e.g.
 * local dev), runs `fn` without a session and instead relies on `fn` to
 * perform its own best-effort compensation if a later step fails — true
 * atomicity isn't available there, so this is the safest practical
 * fallback without changing local infrastructure.
 */
const withOptionalTransaction = async (fn) => {
  const canUseTransactions = await supportsTransactions();
  if (!canUseTransactions) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Starts a job: pending -> in-progress, and claims its truck (-> on-route).
 * The truck claim is a single atomic conditional update
 * (`status: "available"` in the filter), which is what actually prevents
 * two concurrent start requests from both winning the same truck — that
 * guarantee holds on MongoDB regardless of transaction/replica-set support.
 */
const startJob = async (job, actor) => {
  if (job.status !== "pending") {
    throw new JobTransitionError(
      job.status === "in-progress"
        ? "Job is already in progress"
        : "Only a pending job can be started",
      409
    );
  }

  const truck = await Truck.findById(job.assignedTruck);
  if (isTruckUnavailable(truck)) {
    throw new JobTransitionError("Truck is out of service and cannot start a job", 409);
  }

  const activeTruckJob = await findInProgressTruckJob({
    assignedTruck: job.assignedTruck,
    excludeJobId: job._id,
  });
  if (activeTruckJob) {
    throw new JobTransitionError("This truck is already on an in-progress job", 409);
  }

  const result = await withOptionalTransaction(async (session) => {
    const claimedTruck = await Truck.findOneAndUpdate(
      { _id: truck._id, status: "available", recordStatus: { $ne: "archived" } },
      { status: "on-route", assignedJob: job._id },
      { new: true, ...(session ? { session } : {}) }
    );

    if (!claimedTruck) {
      throw new JobTransitionError("This truck is already on an in-progress job", 409);
    }

    try {
      job.status = "in-progress";
      await saveWithSession(job, session);
    } catch (err) {
      if (!session) {
        // No transaction available to auto-rollback the claim — compensate manually.
        await releaseTruck(truck._id, null).catch(() => {});
      }
      throw err;
    }

    return job;
  });

  // Centralized here (not in each controller that calls startJob) so every
  // caller — the driver-facing updateJob transition and any future one —
  // gets this notification (and the matching activity record) for free.
  await notifyAdmins({
    type: "job_started",
    title: "Job started",
    message: `${job.title || "A job"} has been started.`,
    resourceType: "job",
    resourceId: job._id,
  });

  await logActivity({
    actorId: actor?.id,
    actorRole: actor?.role,
    action: "JOB_STARTED",
    resourceType: "job",
    resourceId: job._id,
    relatedJobId: job._id,
    before: { status: "pending" },
    after: { status: "in-progress" },
  });

  return result;
};

/**
 * Completes a job: in-progress -> completed, and releases its truck
 * (-> available). `job` must already be the mongoose document the caller
 * has authorized against (ownership/role checks stay in the controller).
 */
const completeJob = async (job, actor) => {
  if (job.status !== "in-progress") {
    throw new JobTransitionError("Only an in-progress job can be completed", 409);
  }

  await withOptionalTransaction(async (session) => {
    const previousStatus = job.status;
    job.status = "completed";
    await saveWithSession(job, session);

    try {
      await releaseTruck(job.assignedTruck, session);
    } catch (err) {
      if (!session) {
        job.status = previousStatus;
        await job.save().catch(() => {});
      }
      throw err;
    }
  });

  const result = await Job.findById(job._id).populate("assignedTruck", "truckNumber").lean();

  await notifyAdmins({
    type: "job_completed",
    title: "Job completed",
    message: `${job.title || "A job"} has been completed.`,
    resourceType: "job",
    resourceId: job._id,
  });

  await logActivity({
    actorId: actor?.id,
    actorRole: actor?.role,
    action: "JOB_COMPLETED",
    resourceType: "job",
    resourceId: job._id,
    relatedJobId: job._id,
    before: { status: "in-progress" },
    after: { status: "completed" },
  });

  return result;
};

/**
 * Moves an in-progress job to a different truck: releases the old truck
 * (-> available) and atomically claims the new one (-> on-route). Only
 * applies to in-progress jobs — reassigning a pending job's truck is a
 * plain field edit with no truck-status side effects, handled directly by
 * the caller as before.
 */
const reassignJob = async (job, newAssignedTruckId) => {
  if (job.status !== "in-progress") {
    throw new JobTransitionError("Only an in-progress job's truck can be reassigned this way", 400);
  }

  const oldTruckId = job.assignedTruck;
  if (oldTruckId.toString() === newAssignedTruckId.toString()) {
    return job;
  }

  await withOptionalTransaction(async (session) => {
    const claimedTruck = await Truck.findOneAndUpdate(
      { _id: newAssignedTruckId, status: "available", recordStatus: { $ne: "archived" } },
      { status: "on-route", assignedJob: job._id },
      { new: true, ...(session ? { session } : {}) }
    );

    if (!claimedTruck) {
      throw new JobTransitionError("New truck is not available for reassignment", 409);
    }

    try {
      await releaseTruck(oldTruckId, session);

      job.assignedTruck = newAssignedTruckId;
      await saveWithSession(job, session);
    } catch (err) {
      if (!session) {
        // Best-effort compensation: release the newly claimed truck and
        // leave the old truck's state untouched.
        await releaseTruck(newAssignedTruckId, null).catch(() => {});
      }
      throw err;
    }
  });

  return Job.findById(job._id).populate("assignedTruck", "truckNumber").lean();
};

module.exports = {
  JobTransitionError,
  isTruckUnavailable,
  findInProgressTruckJob,
  startJob,
  completeJob,
  reassignJob,
};
