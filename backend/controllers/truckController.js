const mongoose = require("mongoose");
const Truck = require("../models/truck");
const Job = require("../models/job");
const TruckAssignment = require("../models/dailyTruckAssignment");
const logger = require("../utils/logger");

/**
 * @desc Get all trucks
 * @route GET /api/trucks
 * @access Admin only (or configurable)
 */
exports.getAllTrucks = async (req, res) => {
  try {
    const trucks = await Truck.find({ recordStatus: { $ne: "archived" } })
      .populate("assignedDriver", "name email")
      .lean();

    return res.status(200).json({
      success: true,
      message: "All trucks fetched",
      data: trucks,
    });
  } catch (err) {
    logger.error("Get all trucks error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Add a new truck
 * @route POST /api/trucks
 * @access Admin only
 */
exports.addTruck = async (req, res) => {
  try {
    const { truckNumber, model, capacity, status, recordStatus, assignedDriver, lastMaintenanceDate } = req.body;
    const normalizedTruckNumber = truckNumber.trim().toUpperCase();

    const existingTruck = await Truck.findOne({ truckNumber: normalizedTruckNumber });
    if (existingTruck && existingTruck.recordStatus !== "archived") {
      return res.status(409).json({
        success: false,
        message: "A truck with this truck number already exists",
      });
    }

    if (existingTruck) {
      existingTruck.capacity = capacity;
      existingTruck.status = status === "out-of-service" ? "out-of-service" : "available";
      existingTruck.recordStatus = "active";
      existingTruck.assignedDriver = assignedDriver;
      existingTruck.assignedJob = null;
      existingTruck.lastMaintenanceDate = lastMaintenanceDate;
      await existingTruck.save();

      return res.status(201).json({
        success: true,
        message: "Truck added",
        data: existingTruck,
      });
    }

    const newTruck = new Truck({
      truckNumber: normalizedTruckNumber,
      model,
      capacity,
      status: status === "out-of-service" ? "out-of-service" : "available",
      recordStatus,
      assignedDriver,
      lastMaintenanceDate,
    });

    await newTruck.save();

    return res.status(201).json({
      success: true,
      message: "Truck added",
      data: newTruck,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A truck with this truck number already exists",
      });
    }

    logger.error("Add truck error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Update a truck by ID
 * @route PUT /api/trucks/:truckId
 * @access Admin only
 */
exports.updateTruck = async (req, res) => {
  const { truckId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(truckId)) {
    return res.status(400).json({ success: false, message: "Invalid truck ID" });
  }

  try {
    const truck = await Truck.findById(truckId);

    if (!truck) {
      return res.status(404).json({ success: false, message: "Truck not found" });
    }

    const { truckNumber, capacity, status, recordStatus, assignedDriver, lastMaintenanceDate } = req.body;

    if (status === "out-of-service") {
      const activeJob = await Job.exists({
        assignedTruck: truckId,
        status: "in-progress",
        recordStatus: { $ne: "archived" },
      });

      if (activeJob) {
        return res.status(409).json({
          success: false,
          message: "Cannot mark truck out of service while it has an in-progress job",
        });
      }
    }

    if (truckNumber !== undefined) truck.truckNumber = truckNumber;
    if (capacity !== undefined) truck.capacity = capacity;
    if (status !== undefined) truck.status = status;
    if (recordStatus !== undefined) truck.recordStatus = recordStatus;
    if (assignedDriver !== undefined) truck.assignedDriver = assignedDriver;
    if (lastMaintenanceDate !== undefined) truck.lastMaintenanceDate = lastMaintenanceDate;

    await truck.save();

    return res.status(200).json({
      success: true,
      message: "Truck updated",
      data: truck,
    });
  } catch (err) {
    logger.error("Update truck error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Delete a truck by ID
 * @route DELETE /api/trucks/:truckId
 * @access Admin only
 */
exports.deleteTruck = async (req, res) => {
  const { truckId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(truckId)) {
    return res.status(400).json({ success: false, message: "Invalid truck ID" });
  }

  try {
    const [activeJob, assignment] = await Promise.all([
      Job.exists({ assignedTruck: truckId, status: { $in: ["pending", "in-progress"] }, recordStatus: { $ne: "archived" } }),
      TruckAssignment.exists({ truckId }),
    ]);

    if (activeJob || assignment) {
      return res.status(409).json({
        success: false,
        message: "Cannot archive truck because it is referenced by active jobs or assignments",
      });
    }

    const truck = await Truck.findById(truckId);

    if (!truck) {
      return res.status(404).json({ success: false, message: "Truck not found" });
    }

    truck.recordStatus = "archived";
    await truck.save();

    return res.status(200).json({ success: true, message: "Truck archived", data: truck });
  } catch (err) {
    logger.error("Delete truck error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
