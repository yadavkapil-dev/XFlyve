const mongoose = require("mongoose");

const truckSchema = new mongoose.Schema({
  truckNumber: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true,
    trim: true,
  },
  status: {
    type: String, 
    enum: ["available", "on-route", "out-of-service"], 
    default: "available" 
  },
  recordStatus: {
    type: String,
    enum: ["active", "inactive", "archived"],
    default: "active",
  },
  assignedDriver: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Driver" 
  },
   assignedJob: {  
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    default: null,
  },
  lastMaintenanceDate: { type: Date },
}, { timestamps: true });

// Normalize legacy/status values before validation and saving.
truckSchema.pre("validate", function(next) {
  if (this.isModified("truckNumber")) {
    this.truckNumber = this.truckNumber.toUpperCase();
  }
  if (this.status === "on route") this.status = "on-route";
  if (this.status === "maintenance") this.status = "out-of-service";
  next();
});

module.exports = mongoose.model("Truck", truckSchema);
