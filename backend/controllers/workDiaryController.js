const WorkDiary = require("../models/workDiary");
const Job = require("../models/job");
const mongoose = require("mongoose");
const { Readable } = require("stream");
const logger = require("../utils/logger");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { buildDateRangeFilter } = require("../utils/dateRange");
const { notifyUser, notifyAdmins } = require("../services/notificationService");

const DIARY_HISTORY_DAYS = 30;
const DIARY_SORT_FIELDS = ["uploadDate", "createdAt", "workDate"];
const DIARY_DEFAULT_SORT = { createdAt: -1 };

// status + uploadDate-range filters — safe on every diary list endpoint.
const applyDiaryStatusAndDateFilters = (query, reqQuery) => {
  if (reqQuery.status) query.status = reqQuery.status;
  const dateFilter = buildDateRangeFilter("uploadDate", { from: reqQuery.dateFrom, to: reqQuery.dateTo });
  if (dateFilter) Object.assign(query, dateFilter);
  return query;
};

// driverId filter — only for the admin-wide pending queue, not the
// single-driver-scoped listWorkDiariesByDriver (same reasoning as PODs:
// that route's driverId comes from the URL path, not the query string).
const applyDiaryDriverFilter = (query, reqQuery) => {
  if (reqQuery.driverId && mongoose.Types.ObjectId.isValid(reqQuery.driverId)) {
    query.driverId = reqQuery.driverId;
  }
  return query;
};

const toDateTime = (value, fallback = 0) => {
  const time = value ? new Date(value).getTime() : fallback;
  return Number.isNaN(time) ? fallback : time;
};

const normalizeDateOnly = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
};

/**
 * Upload a new Work Diary PDF to Cloudinary
 */
exports.uploadWorkDiary = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }

    const { notes, jobId, truckId, workDate } = req.body;
    const driverId = req.user.id;

    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ success: false, message: "Valid authenticated driver is required" });
    }

    let linkedJob = null;
    let resolvedTruckId = truckId || null;

    if (jobId) {
      if (!mongoose.Types.ObjectId.isValid(jobId)) {
        return res.status(400).json({ success: false, message: "Invalid jobId" });
      }

      linkedJob = await Job.findById(jobId);
      if (!linkedJob) {
        return res.status(404).json({ success: false, message: "Job not found" });
      }

      if (linkedJob.assignedTo.toString() !== driverId.toString()) {
        return res.status(403).json({ success: false, message: "Cannot upload work diary for another driver's job" });
      }

      if (linkedJob.jobType !== "interstate") {
        return res.status(400).json({
          success: false,
          message: "Work diary pages can only be linked to interstate jobs",
        });
      }

      resolvedTruckId = resolvedTruckId || linkedJob.assignedTruck;
    }

    if (resolvedTruckId && !mongoose.Types.ObjectId.isValid(resolvedTruckId)) {
      return res.status(400).json({ success: false, message: "Invalid truckId" });
    }

    const normalizedWorkDate = workDate
      ? normalizeDateOnly(workDate)
      : linkedJob?.jobDate
        ? normalizeDateOnly(linkedJob.jobDate)
        : null;
    if (workDate && !normalizedWorkDate) {
      return res.status(400).json({ success: false, message: "Invalid workDate" });
    }

    const streamUpload = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "raw", folder: "work_diaries" },
          (error, result) => (result ? resolve(result) : reject(error))
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
    };

    const result = await streamUpload(req.file.buffer);

    const newDiary = new WorkDiary({
      driverId,
      jobId: linkedJob?._id || null,
      truckId: resolvedTruckId || null,
      workDate: normalizedWorkDate,
      notes,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      uploadDate: new Date(),
    });

    await newDiary.save();

    if (linkedJob) {
      await Job.updateOne(
        { _id: linkedJob._id },
        { $addToSet: { diaryIds: newDiary._id } }
      );
    }

    await notifyAdmins({
      type: "diary_submitted",
      title: "Work diary submitted",
      message: "A driver submitted a new work diary for review.",
      resourceType: "workdiary",
      resourceId: newDiary._id,
    });

    return res.status(201).json({ success: true, message: "Work diary uploaded", data: newDiary });
  } catch (err) {
    logger.error("Upload work diary error: %o", err);
    return res.status(500).json({ success: false, message: "Server error during upload" });
  }
};

/**
 * Get work diary by ID
 */
exports.getWorkDiary = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid work diary ID" });
    }

    const workDiary = await WorkDiary.findById(id);
    if (!workDiary) return res.status(404).json({ success: false, message: "Work diary not found" });

    const userId = req.user._id || req.user.id;
    if (req.user.role !== "admin" && workDiary.driverId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const fileResponse = await fetch(workDiary.fileUrl);
    if (!fileResponse.ok || !fileResponse.body) {
      return res.status(502).json({ success: false, message: "Failed to retrieve work diary file" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="WorkDiary-${id}.pdf"`);
    Readable.fromWeb(fileResponse.body).pipe(res);
  } catch (err) {
    logger.error("Get work diary error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * List all work diaries for a driver — paginated, filterable.
 * Query params: page, limit, sort (uploadDate|createdAt|workDate), status,
 * dateFrom/dateTo (uploadDate range), includeOlder.
 */
exports.listWorkDiariesByDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ success: false, message: "Invalid driver ID" });
    }

    const userId = req.user._id || req.user.id;
    if (req.user.role !== "admin" && userId.toString() !== driverId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, DIARY_SORT_FIELDS, { uploadDate: -1 });

    const includeOlder = req.query.includeOlder === "true";
    const query = { driverId };

    if (!includeOlder) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - DIARY_HISTORY_DAYS);

      query.$or = [
        { uploadDate: { $gte: cutoff } },
        {
          $and: [
            { uploadDate: null },
            { createdAt: { $gte: cutoff } },
          ],
        },
      ];
    }

    applyDiaryStatusAndDateFilters(query, req.query);

    const [workDiaries, total] = await Promise.all([
      WorkDiary.find(query)
        .populate(
          "jobId",
          "jobDate pickupLocation deliveryLocation description status jobNumber"
        )
        .populate("truckId", "truckNumber name")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      WorkDiary.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: workDiaries,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("List work diaries by driver error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Update work diary notes (driver or admin)
 */
exports.updateWorkDiary = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid work diary ID" });
    }

    const workDiary = await WorkDiary.findById(id);
    if (!workDiary) return res.status(404).json({ success: false, message: "Work diary not found" });

    if (req.user.role !== "admin" && workDiary.driverId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (req.user.role === "driver" && workDiary.status === "approved") {
      return res.status(409).json({
        success: false,
        message: "Approved work diaries are locked and cannot be edited",
      });
    }

    workDiary.notes = notes || workDiary.notes;

    if (req.user.role === "driver" && workDiary.status === "rejected") {
      workDiary.status = "pending";
      workDiary.rejectedBy = null;
      workDiary.rejectedAt = null;
      workDiary.rejectionReason = undefined;
    }

    await workDiary.save();

    res.status(200).json({ success: true, message: "Work diary updated", data: workDiary });
  } catch (err) {
    logger.error("Update work diary error: %o", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Delete a work diary from Cloudinary
 */
exports.deleteWorkDiary = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid work diary ID" });
    }

    const workDiary = await WorkDiary.findById(id);
    if (!workDiary) return res.status(404).json({ success: false, message: "Work diary not found" });

    if (req.user.role !== "admin" && workDiary.driverId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (req.user.role === "driver" && workDiary.status === "approved") {
      return res.status(409).json({
        success: false,
        message: "Approved work diaries are locked and cannot be deleted",
      });
    }

    if (workDiary.publicId) {
      await cloudinary.uploader.destroy(workDiary.publicId, { resource_type: "raw" });
    }

    if (workDiary.jobId) {
      await Job.updateOne({ _id: workDiary.jobId }, { $pull: { diaryIds: workDiary._id } });
    }

    await WorkDiary.deleteOne({ _id: id });

    res.status(200).json({ success: true, message: "Work diary deleted" });
  } catch (err) {
    logger.error("Delete work diary error: %o", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.approveWorkDiary = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid work diary ID" });
    }

    const workDiary = await WorkDiary.findById(id);
    if (!workDiary) return res.status(404).json({ success: false, message: "Work diary not found" });

    workDiary.status = "approved";
    workDiary.approvedBy = req.user.id;
    workDiary.approvedAt = new Date();
    workDiary.rejectedBy = null;
    workDiary.rejectedAt = null;
    workDiary.rejectionReason = undefined;

    await workDiary.save();

    await notifyUser({
      recipient: workDiary.driverId,
      type: "diary_approved",
      title: "Work diary approved",
      message: "Your work diary has been approved.",
      resourceType: "workdiary",
      resourceId: workDiary._id,
    });

    return res.status(200).json({ success: true, message: "Work diary approved", data: workDiary });
  } catch (err) {
    logger.error("Approve work diary error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.rejectWorkDiary = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid work diary ID" });
    }

    const workDiary = await WorkDiary.findById(id);
    if (!workDiary) return res.status(404).json({ success: false, message: "Work diary not found" });

    workDiary.status = "rejected";
    workDiary.rejectedBy = req.user.id;
    workDiary.rejectedAt = new Date();
    workDiary.rejectionReason = rejectionReason;
    workDiary.approvedBy = null;
    workDiary.approvedAt = null;

    await workDiary.save();

    await notifyUser({
      recipient: workDiary.driverId,
      type: "diary_rejected",
      title: "Work diary rejected",
      message: rejectionReason
        ? `Your work diary was rejected: ${rejectionReason}`
        : "Your work diary was rejected.",
      resourceType: "workdiary",
      resourceId: workDiary._id,
    });

    return res.status(200).json({ success: true, message: "Work diary rejected", data: workDiary });
  } catch (err) {
    logger.error("Reject work diary error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Query params: page, limit, sort (uploadDate|createdAt|workDate), driverId,
// dateFrom/dateTo (uploadDate range).
exports.listPendingWorkDiaryApprovals = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, DIARY_SORT_FIELDS, DIARY_DEFAULT_SORT);

    const query = { status: "pending" };
    applyDiaryDriverFilter(query, req.query);
    const dateFilter = buildDateRangeFilter("uploadDate", { from: req.query.dateFrom, to: req.query.dateTo });
    if (dateFilter) Object.assign(query, dateFilter);

    const [diaries, total] = await Promise.all([
      WorkDiary.find(query)
        .populate("driverId", "name email driverType role")
        .populate("jobId", "title pickupLocation deliveryLocation jobDate status")
        .populate("truckId", "truckNumber")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      WorkDiary.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: diaries,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("List pending work diary approvals error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
