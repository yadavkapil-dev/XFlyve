const mongoose = require("mongoose");

const dailyWorkLogSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    workDate: {
      type: Date,
      default: null,
    },
    hours: {
      type: Number,
      default: 0,
      min: 0,
    },
    kilometers: {
      type: Number,
      default: 0,
      min: 0,
    },

    // New fields
    localStartTime: {
      type: String, // could be "HH:mm" string, or Date with only time part
      trim: true,
    },
    localEndTime: {
      type: String,
      trim: true,
    },
    interstateStartKm: {
      type: Number,
      min: 0,
    },
    interstateEndKm: {
      type: Number,
      min: 0,
    },
    deliveriesDone: {
      type: Number,
      min: 0,
      default: 0,
    },
    deliveryLocations: [
      {
        type: String,
        trim: true,
      },
    ],

    jobIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
      },
    ],
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

// Driver's own work log history (getLogsByDriver/getMyLogs, admin per-driver filter): DailyWorkLog.find({ driverId })
dailyWorkLogSchema.index({ driverId: 1 });

dailyWorkLogSchema.pre("validate", function (next) {
  if (!this.workDate && this.date) {
    this.workDate = this.date;
  }

  if (!this.date && this.workDate) {
    this.date = this.workDate;
  }

  next();
});

module.exports = mongoose.model("DailyWorkLog", dailyWorkLogSchema);
