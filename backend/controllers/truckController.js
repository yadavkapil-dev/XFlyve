const mongoose = require("mongoose");
const Truck = require("../models/truck");
const Job = require("../models/job");
const TruckAssignment = require("../models/dailyTruckAssignment");
const logger = require("../utils/logger");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { buildSearchOr } = require("../utils/search");

const TRUCK_SORT_FIELDS = ["truckNumber", "createdAt"];
const TRUCK_DEFAULT_SORT = { truckNumber: 1 };

/**
 * @desc Get all trucks — paginated, searchable, filterable
 * @route GET /api/trucks
 * @access Admin only (or configurable)
 * Query params: page, limit, sort (truckNumber|createdAt), search
 * (matches truckNumber), status, recordStatus (defaults to excluding archived).
 */
exports.getAllTrucks = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, TRUCK_SORT_FIELDS, TRUCK_DEFAULT_SORT);

    const query = req.query.recordStatus
      ? { recordStatus: req.query.recordStatus }
      : { recordStatus: { $ne: "archived" } };

    const searchOr = buildSearchOr(req.query.search, ["truckNumber"]);
    if (searchOr) Object.assign(query, searchOr);

    if (req.query.status) query.status = req.query.status;

    // Fleet-wide out-of-service count for the admin UI's alert banner —
    // deliberately independent of the current page/search/status filters
    // (it's a "how many of the whole fleet need attention" figure, not a
    // "how many on this page" figure), so it stays correct once the list
    // itself becomes paginated.
    const [trucks, total, outOfServiceCount] = await Promise.all([
      Truck.find(query)
        .populate("assignedDriver", "name email")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Truck.countDocuments(query),
      Truck.countDocuments({ recordStatus: { $ne: "archived" }, status: { $in: ["out-of-service", "maintenance"] } }),
    ]);

    return res.status(200).json({
      success: true,
      message: "All trucks fetched",
      data: trucks,
      pagination: buildPaginationMeta({ page, limit, total }),
      outOfServiceCount,
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
    const { truckNumber, model, status, recordStatus, assignedDriver, lastMaintenanceDate } = req.body;
    const normalizedTruckNumber = truckNumber.trim().toUpperCase();

    const existingTruck = await Truck.findOne({ truckNumber: normalizedTruckNumber });
    if (existingTruck && existingTruck.recordStatus !== "archived") {
      return res.status(409).json({
        success: false,
        message: "A truck with this truck number already exists",
      });
    }

    if (existingTruck) {
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

    const { truckNumber, status, recordStatus, assignedDriver, lastMaintenanceDate } = req.body;

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
    const startOfToday = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

    const [activeJob, assignment] = await Promise.all([
      Job.exists({ assignedTruck: truckId, status: { $in: ["pending", "in-progress"] }, recordStatus: { $ne: "archived" } }),
      // date-scoped to today-or-later — a truck assignment is a one-day
      // booking (see assignTruck's own date-keyed conflict checks), not a
      // permanent binding. Deliberately NOT an unscoped exists({ truckId }):
      // that would match any assignment ever made for this truck, including
      // ones whose date has long passed, and permanently block archiving a
      // truck that's had zero current activity for months.
      TruckAssignment.exists({ truckId, date: { $gte: startOfToday } }),
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
