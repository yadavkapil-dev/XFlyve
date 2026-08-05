const mongoose = require("mongoose");

const ACTIVITY_ACTIONS = [
  "JOB_CREATED",
  "JOB_ASSIGNED",
  "JOB_UPDATED",
  "JOB_STARTED",
  "JOB_COMPLETED",
  "POD_SUBMITTED",
  "POD_APPROVED",
  "POD_REJECTED",
  "DIARY_SUBMITTED",
  "WORK_LOG_SUBMITTED",
];

const RESOURCE_TYPES = ["job", "jobpod", "workdiary", "worklog"];

const activitySchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    actorRole: {
      type: String,
      enum: ["admin", "driver"],
      required: true,
    },
    action: {
      type: String,
      enum: ACTIVITY_ACTIONS,
      required: true,
    },
    resourceType: {
      type: String,
      enum: RESOURCE_TYPES,
      required: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Not part of the literal field list requested, but necessary: POD/diary/
    // worklog activities have resourceId pointing at their OWN document, not
    // the job's. Without a job-correlation field, the job-detail timeline
    // (the one UI this phase requires) could only ever show job-status
    // events and would silently omit POD/diary/worklog history for that job
    // — which the spec's own acceptance walkthrough ("POD submit -> approve"
    // showing up on the job detail page) requires. Null when the resource
    // isn't linked to a job (e.g. a POD uploaded without a job).
    relatedJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    requestId: {
      type: String,
      default: null,
    },
  },
  // Append-only, write-once: createdAt only, no updatedAt — there is no
  // legitimate "this activity record was later modified" concept.
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Primary access pattern: "this job's full activity history, chronological"
// — the one UI this phase adds (job detail timeline).
activitySchema.index({ relatedJobId: 1, createdAt: 1 });

const Activity = mongoose.model("Activity", activitySchema);
Activity.ACTIVITY_ACTIONS = ACTIVITY_ACTIONS;
Activity.RESOURCE_TYPES = RESOURCE_TYPES;

module.exports = Activity;
