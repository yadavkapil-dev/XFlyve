const mongoose = require("mongoose");
const DailyWorkLog = require("../models/dailyWorkLog");
const Job = require("../models/job");
const logger = require("../utils/logger");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { buildDateRangeFilter, normalizeDateOnly: normalizeQueryDate, getMondayStartWeekRange } = require("../utils/dateRange");

const WORKLOG_SORT_FIELDS = ["workDate", "date", "createdAt"];
const WORKLOG_DEFAULT_SORT = { workDate: -1, date: -1 };

const normalizeDateOnly = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
};

const toNumber = (value) => {
  if (value === "" || value === undefined || value === null) return undefined;
  return Number(value);
};

const validateNonNegativeNumber = (value, label, required = false) => {
  const numberValue = toNumber(value);
  if (numberValue === undefined) {
    return required ? `${label} is required` : null;
  }
  if (Number.isNaN(numberValue) || numberValue < 0) {
    return `${label} must be a non-negative number`;
  }
  return null;
};

const getPrimaryJobId = (body, fallbackLog) => {
  const normalizeId = (value) => {
    if (!value) return null;
    if (typeof value === "object") return value._id || value.id || null;
    return value;
  };

  if (body.jobId) return normalizeId(body.jobId);
  if (Array.isArray(body.jobIds) && body.jobIds.length > 0) return normalizeId(body.jobIds[0]);
  if (fallbackLog?.jobIds?.length) return normalizeId(fallbackLog.jobIds[0]);
  return null;
};

const findDriverJob = async (jobId, driverId) => {
  if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) return null;
  return Job.findOne({
    _id: jobId,
    assignedTo: driverId,
    recordStatus: { $ne: "archived" },
  }).lean();
};

const validateAndBuildWorkLogFields = async ({ body, driverId, existingLog }) => {
  const jobId = getPrimaryJobId(body, existingLog);
  const job = await findDriverJob(jobId, driverId);
  if (!job) {
    return { error: "A valid assigned job is required" };
  }

  const deliveriesError = validateNonNegativeNumber(body.deliveriesDone, "Number of deliveries", true);
  if (deliveriesError) return { error: deliveriesError };

  if (job.jobType === "local") {
    if (!body.localStartTime) return { error: "Truck pickup time is required" };
    if (!body.localEndTime) return { error: "Finish time is required" };

    const hoursError = validateNonNegativeNumber(body.hours, "Total hours", true);
    if (hoursError) return { error: hoursError };

    return {
      job,
      fields: {
        jobIds: [job._id],
        hours: Number(body.hours),
        kilometers: 0,
        localStartTime: body.localStartTime,
        localEndTime: body.localEndTime,
        interstateStartKm: undefined,
        interstateEndKm: undefined,
        deliveriesDone: Number(body.deliveriesDone),
      },
    };
  }

  const startKmError = validateNonNegativeNumber(body.interstateStartKm, "Start kilometres", true);
  if (startKmError) return { error: startKmError };

  const endKmError = validateNonNegativeNumber(body.interstateEndKm, "End kilometres", true);
  if (endKmError) return { error: endKmError };

  const startKm = Number(body.interstateStartKm);
  const endKm = Number(body.interstateEndKm);
  if (endKm < startKm) {
    return { error: "End kilometres cannot be less than start kilometres" };
  }

  return {
    job,
    fields: {
      jobIds: [job._id],
      hours: 0,
      kilometers: endKm - startKm,
      localStartTime: undefined,
      localEndTime: undefined,
      interstateStartKm: startKm,
      interstateEndKm: endKm,
      deliveriesDone: Number(body.deliveriesDone),
    },
  };
};

/**
 * Create a new daily work log.
 * Uses driverId from JWT token (req.user.id)
 * Driver-created records are independent daily work and are not job-linked.
 */
exports.createWorkLog = async (req, res) => {
  const { date, workDate, notes, deliveryLocations } = req.body;
  const driverId = req.user.id || req.user._id; // use driverId from token
  const effectiveDate = workDate || date;

  if (!driverId || !effectiveDate || !mongoose.Types.ObjectId.isValid(driverId)) {
    return res.status(400).json({
      success: false,
      message: "Valid driverId (from token) and work date are required",
    });
  }

  try {
    const normalizedWorkDate = normalizeDateOnly(effectiveDate);
    if (!normalizedWorkDate) {
      return res.status(400).json({ success: false, message: "Invalid work date" });
    }

    const validation = await validateAndBuildWorkLogFields({ body: req.body, driverId });
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const newLog = new DailyWorkLog({
      driverId,
      date: normalizedWorkDate,
      workDate: normalizedWorkDate,
      notes,
      deliveryLocations,
      ...validation.fields,
    });

    await newLog.save();

    return res.status(201).json({
      success: true,
      message: "Work log created",
      data: newLog,
    });
  } catch (err) {
    logger.error("Create WorkLog error: %o", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Server error",
    });
  }
};

/**
 * Get all daily work logs for a specific driver.
 * Only allows driver to get their own logs.
 */
exports.getLogsByDriver = async (req, res) => {
  const { driverId } = req.params;
  const userId = req.user.id || req.user._id;

  if (!mongoose.Types.ObjectId.isValid(driverId)) {
    return res.status(400).json({ success: false, message: "Invalid driverId" });
  }

  if (String(driverId) !== String(userId)) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  try {
    const logs = await DailyWorkLog.find({ driverId })
      .populate("jobIds", "title pickupLocation deliveryLocation jobDate status jobType");
    return res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err) {
    logger.error("Get Logs By Driver error: %o", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Get logs for the current logged-in driver (no param needed)
 */
exports.getMyLogs = async (req, res) => {
  const driverId = req.user.id || req.user._id;

  if (!mongoose.Types.ObjectId.isValid(driverId)) {
    return res.status(400).json({ success: false, message: "Invalid driverId" });
  }

  try {
    const logs = await DailyWorkLog.find({ driverId })
      .populate("jobIds", "title pickupLocation deliveryLocation jobDate status jobType");
    return res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err) {
    logger.error("Get My Logs error: %o", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Update a work log by its ID.
 * Only allows updating specified fields.
 */
exports.updateWorkLog = async (req, res) => {
  const { logId } = req.params;
  const userId = req.user.id || req.user._id;
  const userRole = req.user.role;

  if (!mongoose.Types.ObjectId.isValid(logId)) {
    return res.status(400).json({ success: false, message: "Invalid logId" });
  }

  const allowedUpdates = [
    "date",
    "workDate",
    "hours",
    "kilometers",
    "notes",
    "jobId",
    "jobIds",
    "localStartTime",
    "localEndTime",
    "interstateStartKm",
    "interstateEndKm",
    "deliveriesDone",
    "deliveryLocations",
  ];
  const updates = {};
  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  if (updates.deliveryLocations && !Array.isArray(updates.deliveryLocations)) {
    updates.deliveryLocations = [];
  }

  try {
    const log = await DailyWorkLog.findById(logId);
    if (!log) {
      return res.status(404).json({ success: false, message: "Work log not found" });
    }

    if (userRole !== "admin" && String(log.driverId) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (userRole === "driver" && log.status === "approved") {
      return res.status(409).json({
        success: false,
        message: "Approved records are locked and cannot be edited",
      });
    }

    if (updates.date || updates.workDate) {
      const normalizedWorkDate = normalizeDateOnly(updates.workDate || updates.date);
      if (!normalizedWorkDate) {
        return res.status(400).json({ success: false, message: "Invalid work date" });
      }
      updates.date = normalizedWorkDate;
      updates.workDate = normalizedWorkDate;
    }

    if (updates.jobId !== undefined || updates.jobIds !== undefined || log.jobIds?.length) {
      const validationBody = {
        jobIds: log.jobIds,
        hours: log.hours,
        localStartTime: log.localStartTime,
        localEndTime: log.localEndTime,
        interstateStartKm: log.interstateStartKm,
        interstateEndKm: log.interstateEndKm,
        deliveriesDone: log.deliveriesDone,
        ...req.body,
        ...updates,
      };
      const validation = await validateAndBuildWorkLogFields({
        body: validationBody,
        driverId: log.driverId,
        existingLog: log,
      });
      if (validation.error) {
        return res.status(400).json({ success: false, message: validation.error });
      }
      Object.assign(updates, validation.fields);
      delete updates.jobId;
    }

    Object.assign(log, updates);

    if (userRole === "driver" && log.status === "rejected") {
      log.status = "pending";
      log.rejectedBy = null;
      log.rejectedAt = null;
      log.rejectionReason = undefined;
    }

    await log.save();

    return res.status(200).json({
      success: true,
      message: "Work log updated",
      data: log,
    });
  } catch (err) {
    logger.error("Update WorkLog error: %o", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Server error",
    });
  }
};

/**
 * Delete a work log by its ID.
 */
exports.deleteWorkLog = async (req, res) => {
  const { logId } = req.params;
  const userId = req.user.id || req.user._id;
  const userRole = req.user.role;

  if (!mongoose.Types.ObjectId.isValid(logId)) {
    return res.status(400).json({ success: false, message: "Invalid logId" });
  }

  try {
    const log = await DailyWorkLog.findById(logId);
    if (!log) {
      return res.status(404).json({ success: false, message: "Work log not found" });
    }

    if (userRole !== "admin" && String(log.driverId) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (userRole === "driver" && log.status === "approved") {
      return res.status(409).json({
        success: false,
        message: "Approved records are locked and cannot be deleted",
      });
    }

    await log.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Work log deleted",
    });
  } catch (err) {
    logger.error("Delete WorkLog error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.approveWorkLog = async (req, res) => {
  const { logId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(logId)) {
    return res.status(400).json({ success: false, message: "Invalid logId" });
  }

  try {
    const log = await DailyWorkLog.findById(logId);
    if (!log) return res.status(404).json({ success: false, message: "Work log not found" });

    log.status = "approved";
    log.approvedBy = req.user.id;
    log.approvedAt = new Date();
    log.rejectedBy = null;
    log.rejectedAt = null;
    log.rejectionReason = undefined;

    await log.save();

    return res.status(200).json({ success: true, message: "Daily record approved", data: log });
  } catch (err) {
    logger.error("Approve WorkLog error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.rejectWorkLog = async (req, res) => {
  const { logId } = req.params;
  const { rejectionReason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(logId)) {
    return res.status(400).json({ success: false, message: "Invalid logId" });
  }

  try {
    const log = await DailyWorkLog.findById(logId);
    if (!log) return res.status(404).json({ success: false, message: "Work log not found" });

    log.status = "rejected";
    log.rejectedBy = req.user.id;
    log.rejectedAt = new Date();
    log.rejectionReason = rejectionReason;
    log.approvedBy = null;
    log.approvedAt = null;

    await log.save();

    return res.status(200).json({ success: true, message: "Daily record rejected", data: log });
  } catch (err) {
    logger.error("Reject WorkLog error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------- NEW: Admin Get All Work Logs or by Driver -------------
/**
 * @desc Get all daily work logs or filter by driverId (Admin only)
 * @route GET /api/worklogs/admin/:driverId?
 * @access Admin only
 */
// Query params: page, limit, sort (workDate|date|createdAt), status,
// dateFrom/dateTo (workDate range). driverId comes from the URL param
// (GET /worklogs/admin/:driverId) when present.
exports.getAllLogsForAdmin = async (req, res) => {
  const { driverId } = req.params;

  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, WORKLOG_SORT_FIELDS, WORKLOG_DEFAULT_SORT);

    let query = {};
    if (driverId) {
      if (!mongoose.Types.ObjectId.isValid(driverId)) {
        return res.status(400).json({ success: false, message: "Invalid driverId" });
      }
      query.driverId = driverId;
    }

    if (req.query.status) query.status = req.query.status;

    const dateFilter = buildDateRangeFilter("workDate", { from: req.query.dateFrom, to: req.query.dateTo });
    if (dateFilter) Object.assign(query, dateFilter);

    // Populate driver details and job details for admin view
    const [logs, total] = await Promise.all([
      DailyWorkLog.find(query)
        .populate("driverId", "name email")  // adjust fields as per your driver model
        .populate("jobIds", "title pickupLocation deliveryLocation jobDate status jobType")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      DailyWorkLog.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("Admin get all logs error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Query params: page, limit, sort (workDate|date|createdAt), driverId,
// dateFrom/dateTo (workDate range).
exports.getPendingLogsForAdmin = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, WORKLOG_SORT_FIELDS, WORKLOG_DEFAULT_SORT);

    const query = { status: "pending" };
    if (req.query.driverId && mongoose.Types.ObjectId.isValid(req.query.driverId)) {
      query.driverId = req.query.driverId;
    }
    const dateFilter = buildDateRangeFilter("workDate", { from: req.query.dateFrom, to: req.query.dateTo });
    if (dateFilter) Object.assign(query, dateFilter);

    const [logs, total] = await Promise.all([
      DailyWorkLog.find(query)
        .populate("driverId", "name email")
        .populate("jobIds", "title pickupLocation deliveryLocation jobDate status jobType")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      DailyWorkLog.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("Admin get pending logs error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/worklogs/admin/weekly-stats
// Query params: date (YYYY-MM-DD, defaults to the server's current date),
// driverId (optional — scopes the aggregate to one driver, matching
// whatever the admin currently has the Work Logs list filtered to).
// Computed via server-side aggregation over the full week's logs rather
// than whatever page happens to be loaded client-side, using the same
// Monday-start week boundary as the dashboard-stats endpoint (see
// utils/dateRange.getMondayStartWeekRange) so both stay in sync.
exports.getWeeklyStatsForAdmin = async (req, res) => {
  try {
    const today = normalizeQueryDate(req.query.date) || normalizeQueryDate(new Date().toISOString().slice(0, 10));
    const { weekStart, weekEnd } = getMondayStartWeekRange(today);

    const match = { date: { $gte: weekStart, $lt: weekEnd } };
    if (req.query.driverId && mongoose.Types.ObjectId.isValid(req.query.driverId)) {
      match.driverId = new mongoose.Types.ObjectId(req.query.driverId);
    }

    const agg = await DailyWorkLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          hours: { $sum: "$hours" },
          kilometers: { $sum: "$kilometers" },
          deliveries: { $sum: "$deliveriesDone" },
        },
      },
    ]);

    const weekly = agg[0] || { count: 0, hours: 0, kilometers: 0, deliveries: 0 };

    return res.status(200).json({
      success: true,
      data: {
        weeklyLogs: weekly.count || 0,
        weeklyHours: weekly.hours || 0,
        weeklyKilometres: weekly.kilometers || 0,
        weeklyDeliveries: weekly.deliveries || 0,
      },
    });
  } catch (err) {
    logger.error("Admin get weekly work log stats error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
