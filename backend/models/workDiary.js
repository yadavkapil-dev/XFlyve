const mongoose = require("mongoose");

const workDiarySchema = new mongoose.Schema(
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
    truckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Truck",
      default: null,
    },
    workDate: {
      type: Date,
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
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Driver work diary history (listWorkDiariesByDriver, hit on every driver/admin work diary view): WorkDiary.find({ driverId })
workDiarySchema.index({ driverId: 1 });

module.exports = mongoose.model("WorkDiary", workDiarySchema);
