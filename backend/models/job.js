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
    customerName: {
      type: String,
      trim: true,
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

jobSchema.methods.hasApprovedDiary = async function () {
  const WorkDiary = mongoose.model("WorkDiary");
  const linkedDiaryIds = this.diaryIds || [];

  const approvedDiary = await WorkDiary.exists({
    status: "approved",
    $or: [
      { jobId: this._id },
      ...(linkedDiaryIds.length ? [{ _id: { $in: linkedDiaryIds } }] : []),
    ],
  });

  return Boolean(approvedDiary);
};

jobSchema.methods.isInvoiceReady = async function () {
  if (this.status !== "completed") return false;
  if (this.recordStatus === "archived") return false;
  if (!["pending", "ready"].includes(this.invoiceStatus || "pending")) return false;

  const hasPod = await this.hasApprovedPod();
  if (!hasPod) return false;

  // Local work requires approved delivery proof only. Interstate work also
  // requires an approved compliance/work diary before invoicing.
  if (this.jobType === "local") return true;

  return this.hasApprovedDiary();
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
