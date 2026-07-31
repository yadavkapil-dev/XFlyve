const mongoose = require("mongoose");
const Driver = require("../models/driver");
const Job = require("../models/job");
const Truck = require("../models/truck");
const DailyWorkLog = require("../models/dailyWorkLog");
const JobPod = require("../models/jobPod");
const WorkDiary = require("../models/workDiary");

const exportToExcel = require("../utils/excelExport");
const generateZip = require("../utils/zipGenerator");
const logger = require("../utils/logger");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { buildSearchOr } = require("../utils/search");
const { normalizeDateOnly, buildDateRangeFilter, getMondayStartWeekRange } = require("../utils/dateRange");

const ADMIN_ROLE = "admin"; // Use constants for roles

const DRIVER_SORT_FIELDS = ["name", "createdAt", "email"];
const DRIVER_DEFAULT_SORT = { name: 1 };

// GET /api/admin/drivers — paginated, searchable, filterable
// Query params: page, limit, sort (name|createdAt|email), search (matches
// name), recordStatus (defaults to excluding archived).
exports.getAllDrivers = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, DRIVER_SORT_FIELDS, DRIVER_DEFAULT_SORT);

    const query = req.query.recordStatus
      ? { recordStatus: req.query.recordStatus }
      : { recordStatus: { $ne: "archived" } };
    // Always scoped to drivers, never client-overridable — this is the admin
    // Drivers management list, not a general Driver/admin account browser.
    // Driver and admin accounts share one collection (see the same gap
    // fixed in getDashboardStats), so without this an admin account would
    // show up as a row here.
    query.role = "driver";

    const searchOr = buildSearchOr(req.query.search, ["name"]);
    if (searchOr) Object.assign(query, searchOr);

    const [drivers, total] = await Promise.all([
      Driver.find(query).select("-password").sort(sort).skip(skip).limit(limit),
      Driver.countDocuments(query),
    ]);

    return res.status(200).json({
      status: "success",
      data: drivers,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("Failed to get all drivers: %o", err);
    return res.status(500).json({ status: "error", message: "Server error fetching drivers" });
  }
};

// GET /api/admin/export-drivers
exports.exportDriversExcel = async (req, res) => {
  try {
    const drivers = await Driver.find().select("-password").lean();

    const headers = [
      { label: "Name", key: "name" },
      { label: "Email", key: "email" },
      { label: "Phone", key: "phone" },
      { label: "Role", key: "role" },
    ];

    const filename = `drivers_${Date.now()}`;
    await exportToExcel(drivers, headers, filename, res);
  } catch (err) {
    logger.error("Failed to export drivers to Excel: %o", err);
    res.status(500).json({ status: "error", message: "Server error exporting drivers" });
  }
};

// DELETE /api/admin/drivers/:driverId
exports.deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    // Basic driverId format validation (fallback)
    if (!driverId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid driver ID",
      });
    }

    // Prevent admin from deleting own account
    if (req.user.id.toString() === driverId.toString()) {
      return res.status(400).json({
        status: "fail",
        message: "You cannot delete your own admin account",
      });
    }

    const activeJob = await Job.exists({ assignedTo: driverId, status: { $in: ["pending", "in-progress"] }, recordStatus: { $ne: "archived" } });

    if (activeJob) {
      return res.status(409).json({
        status: "fail",
        message: "Cannot archive driver while they have active jobs",
      });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ status: "fail", message: "Driver not found" });
    }

    driver.recordStatus = "archived";
    driver.active = false;
    await driver.save();

    return res.status(200).json({ status: "success", message: "Driver archived", data: driver });
  } catch (err) {
    logger.error("Failed to delete driver %s: %o", req.params.driverId, err);
    return res.status(500).json({ status: "error", message: "Server error deleting driver" });
  }
};

// GET /api/admin/stats
exports.getSystemStats = async (req, res) => {
  try {
    const [jobCount, driverCount, truckCount, logCount] = await Promise.all([
      Job.countDocuments(),
      // Same role-scoping as getDashboardStats/getAllDrivers — Driver and
      // admin accounts share one collection, so an unscoped count here
      // would fold admins into "Total Drivers".
      Driver.countDocuments({ role: "driver", recordStatus: { $ne: "archived" } }),
      Truck.countDocuments(),
      DailyWorkLog.countDocuments(),
    ]);

    return res.status(200).json({
      status: "success",
      data: {
        totalJobs: jobCount,
        totalDrivers: driverCount,
        totalTrucks: truckCount,
        totalLogs: logCount,
      },
    });
  } catch (err) {
    logger.error("Failed to get system stats: %o", err);
    return res.status(500).json({ status: "error", message: "Server error fetching stats" });
  }
};

// Phase 11: how many trailing days of job-volume history to return.
// 14 days is enough to see a trend on a phone screen without the response
// growing unbounded — this is a dashboard glance, not a reporting export.
const JOB_VOLUME_TREND_DAYS = 14;

// GET /api/admin/dashboard-stats?date=YYYY-MM-DD
// Date-filtered aggregate stats for the admin dashboard (HomePage.jsx) —
// replaces fetching the entire Jobs/Drivers/Trucks/WorkLogs collections
// client-side just to compute today's/this week's counts, which silently
// returns wrong numbers once those lists are paginated.
// "Today" and "this week" are defined by the caller's local calendar date
// (passed as `date`), not the server's timezone — Job/WorkLog dates are
// stored as UTC-midnight-normalized values keyed off that same
// YYYY-MM-DD string (see utils/dateRange.normalizeDateOnly), so passing
// the admin's own local "today" here reproduces the same calendar day
// they'd see client-side. Falls back to the server's current UTC date if
// `date` is omitted or invalid.
exports.getDashboardStats = async (req, res) => {
  try {
    const today = normalizeDateOnly(req.query.date) || normalizeDateOnly(new Date().toISOString().slice(0, 10));
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const { weekStart, weekEnd } = getMondayStartWeekRange(today);

    const trendStart = new Date(today);
    trendStart.setUTCDate(trendStart.getUTCDate() - (JOB_VOLUME_TREND_DAYS - 1));

    const [
      jobStatusToday,
      totalDrivers,
      driverIdsWithLogToday,
      trucksOutOfService,
      weeklyLogAgg,
      truckStatusAgg,
      jobsByStatusAgg,
      jobVolumeAgg,
      podStatusAgg,
      invoiceReadyJobs,
    ] = await Promise.all([
      Job.aggregate([
        { $match: { jobDate: { $gte: today, $lt: tomorrow }, recordStatus: { $ne: "archived" } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      // role: "driver" — Driver and admin accounts share one collection, and
      // an unscoped count here would silently fold admins into "Total
      // Drivers" (and therefore into missingWorkLogs' totalDrivers -
      // driverIdsWithLogToday.length subtraction below, since admins never
      // submit work logs). driverIdsWithLogToday itself doesn't need this
      // same filter: DailyWorkLog is only ever written by createWorkLog,
      // which is gated to role "driver", so it can't contain an admin's ID.
      Driver.countDocuments({ role: "driver", recordStatus: { $ne: "archived" } }),
      DailyWorkLog.distinct("driverId", { date: { $gte: today, $lt: tomorrow } }),
      Truck.countDocuments({ recordStatus: { $ne: "archived" }, status: { $in: ["out-of-service", "maintenance"] } }),
      DailyWorkLog.aggregate([
        { $match: { date: { $gte: weekStart, $lt: weekEnd } } },
        { $group: { _id: null, count: { $sum: 1 }, hours: { $sum: "$hours" }, kilometers: { $sum: "$kilometers" } } },
      ]),
      // Fleet-wide status breakdown (available/on-route/out-of-service) —
      // real Truck.status values, not an estimate.
      Truck.aggregate([
        { $match: { recordStatus: { $ne: "archived" } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      // All non-archived jobs by status, regardless of date — a broader
      // "current operational load" picture than todaysJobs/pendingJobs
      // above, which are both scoped to today only.
      Job.aggregate([
        { $match: { recordStatus: { $ne: "archived" } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Job.aggregate([
        { $match: { jobDate: { $gte: trendStart, $lt: tomorrow }, recordStatus: { $ne: "archived" } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$jobDate" } }, count: { $sum: 1 } } },
      ]),
      JobPod.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      // Reuses the exact same business rule the real "ready to invoice" list
      // uses (Job.findReadyForInvoicing, unit-tested in Phase 7A) rather
      // than re-deriving local/interstate/POD/diary eligibility here a
      // second time — this count must never disagree with that list.
      Job.findReadyForInvoicing(),
    ]);

    const jobCounts = jobStatusToday.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {});
    const todaysJobs = Object.values(jobCounts).reduce((sum, count) => sum + count, 0);
    const weekly = weeklyLogAgg[0] || { count: 0, hours: 0, kilometers: 0 };

    const truckStatusBreakdown = { available: 0, "on-route": 0, "out-of-service": 0 };
    truckStatusAgg.forEach(({ _id, count }) => {
      if (_id in truckStatusBreakdown) truckStatusBreakdown[_id] = count;
    });

    const jobsByStatus = { pending: 0, "in-progress": 0, completed: 0 };
    jobsByStatusAgg.forEach(({ _id, count }) => {
      if (_id in jobsByStatus) jobsByStatus[_id] = count;
    });

    const jobVolumeByDate = jobVolumeAgg.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {});
    const jobVolumeTrend = Array.from({ length: JOB_VOLUME_TREND_DAYS }, (_, i) => {
      const d = new Date(trendStart);
      d.setUTCDate(d.getUTCDate() + i);
      const dateKey = d.toISOString().slice(0, 10);
      return { date: dateKey, count: jobVolumeByDate[dateKey] || 0 };
    });

    const podCounts = podStatusAgg.reduce((acc, { _id, count }) => {
      acc[_id] = count;
      return acc;
    }, {});
    const decidedPods = (podCounts.approved || 0) + (podCounts.rejected || 0);
    // null (not 0) when nothing has been decided yet — a real "no data",
    // not a fabricated "0% approval rate".
    const podApprovalRate = decidedPods > 0 ? Math.round(((podCounts.approved || 0) / decidedPods) * 1000) / 10 : null;

    return res.status(200).json({
      status: "success",
      data: {
        date: today.toISOString().slice(0, 10),
        todaysJobs,
        completedToday: jobCounts.completed || 0,
        pendingJobs: jobCounts.pending || 0,
        totalDrivers,
        missingWorkLogs: Math.max(totalDrivers - driverIdsWithLogToday.length, 0),
        trucksOutOfService,
        weeklyLogs: weekly.count || 0,
        weeklyHours: weekly.hours || 0,
        weeklyKilometres: weekly.kilometers || 0,
        invoiceReadyJobs: invoiceReadyJobs.length,
        pendingPodApprovals: podCounts.pending || 0,
        podApprovalRate,
        truckStatusBreakdown,
        jobsByStatus,
        jobVolumeTrend,
      },
    });
  } catch (err) {
    logger.error("Failed to get dashboard stats: %o", err);
    return res.status(500).json({ status: "error", message: "Server error fetching dashboard stats" });
  }
};

// GET /api/admin/download-all-pods?date=YYYY-MM-DD
// Defaults to the server's current UTC date when omitted. Scoped to
// approved PODs only (a batch download is for invoice prep, not an
// unreviewed/rejected-PODs archive) for the one calendar day given, on
// uploadDate — the same field every other filter/sort on this page already
// keys off (see applyPodStatusAndDateFilters, POD_SORT_FIELDS).
exports.downloadAllPods = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const dateFilter = buildDateRangeFilter("uploadDate", { from: date, to: date });

    const query = { fileUrl: { $exists: true, $ne: null }, status: "approved" };
    if (dateFilter) Object.assign(query, dateFilter);

    const pods = await JobPod.find(query)
      .select("fileUrl driverId uploadDate createdAt")
      .populate("driverId", "name")
      .lean();

    if (pods.length === 0) {
      return res.status(404).json({ status: "fail", message: "No POD files found" });
    }

    const usedNames = new Set();
    const files = pods.map((pod) => {
      const driverName = (pod.driverId?.name || "driver").trim().replace(/[^a-z0-9]+/gi, "_");
      const dateStr = new Date(pod.uploadDate || pod.createdAt || 0).toISOString().slice(0, 10);
      const baseName = `POD-${driverName}-${dateStr}`;

      let name = `${baseName}.pdf`;
      let suffix = 1;
      while (usedNames.has(name)) {
        name = `${baseName}-${suffix++}.pdf`;
      }
      usedNames.add(name);

      return { url: pod.fileUrl, name };
    });

    logger.info(`Zipping ${files.length} POD files`);
    await generateZip(files, "all_pods.zip", res);
  } catch (err) {
    logger.error("Failed to download all PODs: %o", err);
    if (!res.headersSent) {
      res.status(500).json({ status: "error", message: "Server error generating PODs ZIP" });
    }
  }
};

// GET /api/admin/download-work-diaries?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&driverId=
// Unlike downloadAllPods (single day, "today unless picked"), the real use
// case here is an NHVR records request — "this driver's diary pages from
// date X to date Y" — so both bounds are required rather than defaulted,
// and driverId is optional (omit it for every driver in range). Scoped on
// workDate (the day the diary is actually FOR), not uploadDate (when the
// driver got around to uploading it) — a diary uploaded Wednesday for a
// Monday trip must still show up in a "records from Monday" request.
// Falls back to uploadDate only for legacy records with no workDate at all
// (workDate was added after uploadDate already existed). Work diaries have
// no approval status to scope by (see the Work Diary business-logic
// simplification) — every diary in range is included.
exports.downloadWorkDiaries = async (req, res) => {
  try {
    const { dateFrom, dateTo, driverId } = req.query;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({ status: "fail", message: "dateFrom and dateTo are both required" });
    }

    const workDateRange = buildDateRangeFilter("workDate", { from: dateFrom, to: dateTo });
    const uploadDateRange = buildDateRangeFilter("uploadDate", { from: dateFrom, to: dateTo });
    if (!workDateRange || !uploadDateRange) {
      return res.status(400).json({ status: "fail", message: "Invalid dateFrom/dateTo" });
    }

    const query = {
      fileUrl: { $exists: true, $ne: null },
      $or: [
        workDateRange,
        { workDate: null, ...uploadDateRange },
      ],
    };
    if (driverId && mongoose.Types.ObjectId.isValid(driverId)) {
      query.driverId = driverId;
    }

    const diaries = await WorkDiary.find(query)
      .select("fileUrl driverId workDate uploadDate createdAt")
      .populate("driverId", "name")
      .lean();

    if (diaries.length === 0) {
      return res.status(404).json({ status: "fail", message: "No work diary files found for that range" });
    }

    const usedNames = new Set();
    const files = diaries.map((diary) => {
      const driverName = (diary.driverId?.name || "driver").trim().replace(/[^a-z0-9]+/gi, "_");
      // Label the file with the day it's actually for, not the (possibly
      // later) upload day — same reasoning as the query above.
      const dateStr = new Date(diary.workDate || diary.uploadDate || diary.createdAt || 0).toISOString().slice(0, 10);
      const baseName = `WorkDiary-${driverName}-${dateStr}`;

      let name = `${baseName}.pdf`;
      let suffix = 1;
      while (usedNames.has(name)) {
        name = `${baseName}-${suffix++}.pdf`;
      }
      usedNames.add(name);

      return { url: diary.fileUrl, name };
    });

    logger.info(`Zipping ${files.length} work diary files`);
    await generateZip(files, `work_diaries_${dateFrom}_to_${dateTo}.zip`, res);
  } catch (err) {
    logger.error("Failed to download work diaries: %o", err);
    if (!res.headersSent) {
      res.status(500).json({ status: "error", message: "Server error generating work diaries ZIP" });
    }
  }
};

exports.createDriver = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      active,
      recordStatus,
      hourlyRate,
      kmRate,
    } = req.body;

    const normalizedEmail = email.trim().toLowerCase();
    const existingDriver = await Driver.findOne({ email: normalizedEmail });
    if (existingDriver) {
      if (existingDriver.recordStatus !== "archived") {
        return res.status(409).json({
          status: "fail",
          message: "A driver with this email already exists",
        });
      }

      existingDriver.name = name;
      existingDriver.email = normalizedEmail;
      existingDriver.password = password;
      existingDriver.phone = phone;
      existingDriver.active = true;
      existingDriver.recordStatus = "active";
      existingDriver.hourlyRate = hourlyRate;
      existingDriver.kmRate = kmRate;
      existingDriver.role = "driver";
      await existingDriver.save();

      const restoredDriver = existingDriver.toObject();
      delete restoredDriver.password;

      return res.status(201).json({
        status: "success",
        message: "Driver created successfully",
        data: restoredDriver,
      });
    }

    const newDriver = new Driver({
      name,
      email: normalizedEmail,
      password,
      phone,
      active,
      recordStatus,
      hourlyRate,
      kmRate,
      role: "driver", // force role to driver
    });

    await newDriver.save();

    return res.status(201).json({ status: "success", message: "Driver created successfully" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        status: "fail",
        message: "A driver with this email already exists",
      });
    }

    if (err.name === "ValidationError") {
      const validationErrors = Object.values(err.errors).map(error => ({
        field: error.path,
        message: error.message,
      }));

      return res.status(422).json({
        success: false,
        status: "fail",
        message: validationErrors.map(error => error.message).join(", "),
        errors: validationErrors,
      });
    }

    logger.error("Failed to create driver: %o", err);
    return res.status(500).json({ status: "error", message: "Server error creating driver" });
  }
};

exports.updateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const {
      name,
      email,
      password,
      phone,
      hourlyRate,
      kmRate,
    } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ status: "fail", message: "Driver not found" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingDriver = await Driver.findOne({
      email: normalizedEmail,
      _id: { $ne: driverId },
    }).lean();

    if (existingDriver) {
      return res.status(409).json({ status: "fail", message: "Email already in use" });
    }

    driver.name = name;
    driver.email = normalizedEmail;
    if (password && password.trim()) {
      driver.password = password.trim();
    }
    if (phone !== undefined) driver.phone = phone;
    if (hourlyRate !== undefined) driver.hourlyRate = hourlyRate;
    if (kmRate !== undefined) driver.kmRate = kmRate;

    await driver.save();

    const updatedDriver = driver.toObject();
    delete updatedDriver.password;

    return res.status(200).json({
      status: "success",
      message: "Driver updated successfully",
      data: updatedDriver,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ status: "fail", message: "Email already in use" });
    }

    if (err.name === "ValidationError") {
      const validationErrors = Object.values(err.errors).map(error => ({
        field: error.path,
        message: error.message,
      }));

      return res.status(422).json({
        success: false,
        status: "fail",
        message: validationErrors.map(error => error.message).join(", "),
        errors: validationErrors,
      });
    }

    logger.error("Failed to update driver %s: %o", req.params.driverId, err);
    return res.status(500).json({ status: "error", message: "Server error updating driver" });
  }
};
