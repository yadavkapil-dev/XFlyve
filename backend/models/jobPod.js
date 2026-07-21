const mongoose = require("mongoose");

const jobPodSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Driver POD history (listPodsByDriver, hit on every driver/admin POD view): JobPod.find({ driverId })
jobPodSchema.index({ driverId: 1 });

// Phase 4: pending-approvals queue (listPendingPODApprovals/listAllPODs) — JobPod.find({ status }).sort({ createdAt })
jobPodSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("JobPod", jobPodSchema);
