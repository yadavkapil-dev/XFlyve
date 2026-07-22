const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "job_assigned",
  "job_updated",
  "job_started",
  "job_completed",
  "pod_submitted",
  "pod_approved",
  "pod_rejected",
  "diary_submitted",
  "diary_approved",
  "diary_rejected",
  "worklog_submitted",
  "worklog_approved",
  "worklog_rejected",
];

const RESOURCE_TYPES = ["job", "jobpod", "workdiary", "worklog"];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
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
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Every access pattern here is scoped to one recipient: "this user's
// notifications, newest first" (GET /notifications) and "this user's unread
// count" (the bell badge). The compound index serves the unread-count query
// as an index-only count (recipient+read prefix), and an unread-only
// paginated list is fully satisfied in index order (equality on
// recipient+read, sorted by createdAt). A combined all-notifications list
// only uses the recipient-equality prefix and falls back to an in-memory
// sort on createdAt — acceptable at per-user notification volumes.
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
Notification.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
Notification.RESOURCE_TYPES = RESOURCE_TYPES;

module.exports = Notification;
