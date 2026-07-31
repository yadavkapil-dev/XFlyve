const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    pickupLocation: {
      type: String,
      trim: true,
      required: true,
    },
    deliveryLocation: {
      type: String,
      trim: true,
      required: true,
    },
    customerReference: {
      type: String,
      trim: true,
    },
    jobRate: {
      type: Number,
      min: 0,
    },
    invoiceStatus: {
      type: String,
      enum: ["pending", "ready", "invoiced", "paid"],
      default: "pending",
    },
    recordStatus: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
    },
    assignedTo: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Driver",
      required: true,
    },
    assignedTruck: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: "Truck",
      required: true,
    },
    podIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JobPod",
      },
    ],
    diaryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WorkDiary",
      },
    ],
    jobDate: {
      type: Date,
      required: true,
    },
    // Required on create (createJobValidator) but deliberately NOT
    // schema-required: jobTransitionService's startJob/completeJob call
    // job.save() on every status transition, and making this a hard schema
    // requirement would break saving any job created before this field
    // existed (every driver start/complete on legacy data would start
    // failing validation). "Required" is enforced at the create-time
    // validator and the admin edit-dialog UI instead.
    startTime: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    podUrl: {
      type: String,
    },
    jobType: {
      type: String,
      enum: ["interstate", "local"],
      required: true,
    },
  }, 
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Driver's own job list (getMyJobs/getAssignedJobs): Job.find({ assignedTo, recordStatus: { $ne: "archived" } })
jobSchema.index({ assignedTo: 1, recordStatus: 1 });

// Truck-conflict check on create/update: Job.findOne({ assignedTruck, jobDate: {$gte,$lt}, recordStatus: {$ne:"archived"} })
jobSchema.index({ assignedTruck: 1, jobDate: 1 });

// In-progress-on-truck checks on start/delete/out-of-service: Job.findOne/exists({ assignedTruck, status, recordStatus: {$ne:"archived"} })
jobSchema.index({ assignedTruck: 1, status: 1 });

// Phase 4: admin job list (getAllJobs) — Job.find({ recordStatus: {$ne} }).sort({ jobDate }), hit on every
// paginated admin Jobs page load. Confirmed via explain() this was a COLLSCAN without this index.
jobSchema.index({ recordStatus: 1, jobDate: 1 });

jobSchema.virtual("assignedDriver").get(function () {
  return this.assignedTo;
});

jobSchema.virtual("assignedDriver").set(function (value) {
  this.assignedTo = value;
});

jobSchema.methods.hasApprovedPod = async function () {
  const JobPod = mongoose.model("JobPod");
  const linkedPodIds = this.podIds || [];

  const approvedPod = await JobPod.exists({
    status: "approved",
    $or: [
      { jobId: this._id },
      ...(linkedPodIds.length ? [{ _id: { $in: linkedPodIds } }] : []),
    ],
  });

  return Boolean(approvedPod);
};

// A job is invoice-ready once its POD is approved — full stop, for both
// local and interstate jobs. Work diaries/logs are still required for the
// driver to submit (neither has an approval workflow — both are just
// submitted records); they just no longer gate invoice-readiness.
// (Previously interstate jobs also required an approved diary here;
// removed per a deliberate business rule change — see Phase 16.)
//
// job.status === "completed" is still required. Uploading/approving a POD
// has no dependency on the linked job's status anywhere in this codebase
// (uploadPOD and approvePOD in jobPodController.js never check it) — in
// practice a POD can be, and per the normal driver flow often is, approved
// before the job itself is flipped to "completed" (the driver typically
// completes the job first and only then sees the "Upload POD" action, but
// nothing technically prevents uploading earlier). That's a sequencing
// quirk of the upload/approval flow, not a reason to invoice work the job
// record itself doesn't yet call finished — invoicing a job that isn't
// completed would be wrong regardless of paperwork status, so this check
// stays.
jobSchema.methods.isInvoiceReady = async function () {
  if (this.status !== "completed") return false;
  if (this.recordStatus === "archived") return false;
  if (!["pending", "ready"].includes(this.invoiceStatus || "pending")) return false;

  return this.hasApprovedPod();
};

jobSchema.statics.findReadyForInvoicing = async function () {
  const jobs = await this.find({
    status: "completed",
    recordStatus: { $ne: "archived" },
    invoiceStatus: { $in: ["pending", "ready"] },
  });

  const readiness = await Promise.all(
    jobs.map(async (job) => ((await job.isInvoiceReady()) ? job : null))
  );

  return readiness.filter(Boolean);
};

jobSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    const now = new Date();

    if (this.status === "in-progress" && !this.startedAt) {
      this.startedAt = now;
    }

    if (this.status === "completed" && !this.completedAt) {
      this.completedAt = now;
    }
  }

  next();
});

module.exports = mongoose.model("Job", jobSchema);
