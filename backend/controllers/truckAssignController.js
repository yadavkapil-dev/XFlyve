const mongoose = require("mongoose");
const TruckAssignment = require("../models/dailyTruckAssignment");
const Truck = require("../models/truck");
const logger = require("../utils/logger");
const { isTruckUnavailable } = require("../services/jobTransitionService");

const normalizeDateOnly = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
};

const dateRangeFor = (value) => {
  const start = normalizeDateOnly(value);
  if (!start) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const findAssignmentConflict = async ({ driverId, truckId, date, excludeId }) => {
  const range = dateRangeFor(date);
  if (!range) return { type: "invalid-date" };

  const baseQuery = {
    date: { $gte: range.start, $lt: range.end },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  };

  const [driverConflict, truckConflict] = await Promise.all([
    TruckAssignment.findOne({ ...baseQuery, driverId }).lean(),
    TruckAssignment.findOne({ ...baseQuery, truckId }).lean(),
  ]);

  if (driverConflict) return { type: "driver", assignment: driverConflict };
  if (truckConflict) return { type: "truck", assignment: truckConflict };
  return null;
};

/**
 * @desc Assign a truck to a driver on a specific date
 * @route POST /api/truck-assignments
 * @access Admin only
 */
exports.assignTruck = async (req, res) => {
  const { truckId, driverId, date } = req.body;

  if (!mongoose.Types.ObjectId.isValid(truckId) || !mongoose.Types.ObjectId.isValid(driverId) || !date) {
    return res.status(400).json({ success: false, message: "Invalid input data" });
  }

  try {
    const normalizedDate = normalizeDateOnly(date);
    if (!normalizedDate) {
      return res.status(400).json({ success: false, message: "Invalid date" });
    }

    const truck = await Truck.findById(truckId).lean();
    if (isTruckUnavailable(truck)) {
      return res.status(409).json({
        success: false,
        message: "Truck is not available for assignment",
      });
    }

    const conflict = await findAssignmentConflict({ truckId, driverId, date: normalizedDate });
    if (conflict?.type === "driver") {
      return res.status(409).json({
        success: false,
        message: "This driver already has a truck assignment on the selected date",
      });
    }
    if (conflict?.type === "truck") {
      return res.status(409).json({
        success: false,
        message: "This truck is already assigned to another driver on the selected date",
      });
    }

    const assignment = new TruckAssignment({ truckId, driverId, date: normalizedDate });
    await assignment.save();

    return res.status(201).json({
      success: true,
      message: "Truck assigned successfully",
      data: assignment,
    });
  } catch (err) {
    // A concurrent request can win the pre-check race above; the schema's
    // unique indexes on {driverId,date}/{truckId,date} still guarantee no
    // double-booking, so surface that as a normal conflict, not a 500.
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This driver or truck already has a conflicting assignment on the selected date",
      });
    }

    logger.error("Assign truck error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Get all daily truck assignments (Admin only)
 * @route GET /api/truck-assignments
 */
exports.getAllAssignments = async (req, res) => {
  try {
    const assignments = await TruckAssignment.find()
      .sort({ date: -1 })
      .populate("truckId")
      .populate("driverId")
      .lean();

    return res.status(200).json({
      success: true,
      message: "All assignments fetched successfully",
      data: assignments,
    });
  } catch (err) {
    logger.error("Get assignments error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Get a driver's truck assignment for a specific date
 * @route GET /api/truck-assignments/:driverId/:date
 * @access Admin and driver themselves
 */
exports.getDriverAssignment = async (req, res) => {
  const { driverId, date } = req.params;

  if (!mongoose.Types.ObjectId.isValid(driverId) || !date) {
    return res.status(400).json({ success: false, message: "Invalid driverId or date" });
  }

  // Authorization: admin or driver themselves
  if (req.user.role !== "admin" && req.user.id !== driverId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  try {
    const range = dateRangeFor(date);
    if (!range) {
      return res.status(400).json({ success: false, message: "Invalid date" });
    }

    const assignment = await TruckAssignment.findOne({
      driverId,
      date: { $gte: range.start, $lt: range.end },
    })
      .populate("truckId")
      .lean();

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "No assignment found for the given driver and date",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Assignment found",
      data: assignment,
    });
  } catch (err) {
    logger.error("Get driver assignment error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Update a truck assignment by ID (Admin only)
 * @route PUT /api/truck-assignments/:assignmentId
 */
exports.updateAssignment = async (req, res) => {
  const { assignmentId } = req.params;
  const { truckId, driverId, date } = req.body;

  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    return res.status(400).json({ success: false, message: "Invalid assignment ID" });
  }
  if (!mongoose.Types.ObjectId.isValid(truckId) || !mongoose.Types.ObjectId.isValid(driverId) || !date) {
    return res.status(400).json({ success: false, message: "Invalid input data" });
  }

  try {
    const normalizedDate = normalizeDateOnly(date);
    if (!normalizedDate) {
      return res.status(400).json({ success: false, message: "Invalid date" });
    }

    const truck = await Truck.findById(truckId).lean();
    if (isTruckUnavailable(truck)) {
      return res.status(409).json({
        success: false,
        message: "Truck is not available for assignment",
      });
    }

    const conflict = await findAssignmentConflict({
      truckId,
      driverId,
      date: normalizedDate,
      excludeId: assignmentId,
    });
    if (conflict?.type === "driver") {
      return res.status(409).json({
        success: false,
        message: "This driver already has a truck assignment on the selected date",
      });
    }
    if (conflict?.type === "truck") {
      return res.status(409).json({
        success: false,
        message: "This truck is already assigned to another driver on the selected date",
      });
    }

    const updated = await TruckAssignment.findByIdAndUpdate(
      assignmentId,
      { truckId, driverId, date: normalizedDate },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Assignment updated successfully",
      data: updated,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This driver or truck already has a conflicting assignment on the selected date",
      });
    }

    logger.error("Update assignment error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Delete a truck assignment by ID (Admin only)
 * @route DELETE /api/truck-assignments/:assignmentId
 */
exports.deleteAssignment = async (req, res) => {
  const { assignmentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
    return res.status(400).json({ success: false, message: "Invalid assignment ID" });
  }

  try {
    const deleted = await TruckAssignment.findByIdAndDelete(assignmentId);

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Assignment deleted successfully",
    });
  } catch (err) {
    logger.error("Delete assignment error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
