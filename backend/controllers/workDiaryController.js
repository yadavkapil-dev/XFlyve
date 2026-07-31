const WorkDiary = require("../models/workDiary");
const Job = require("../models/job");
const mongoose = require("mongoose");
const { Readable } = require("stream");
const logger = require("../utils/logger");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { buildDateRangeFilter } = require("../utils/dateRange");
const { notifyAdmins } = require("../services/notificationService");
const { logActivity } = require("../services/activityService");

const DIARY_HISTORY_DAYS = 30;
const DIARY_SORT_FIELDS = ["uploadDate", "createdAt", "workDate"];

// uploadDate-range filter — safe on every diary list endpoint.
const applyDiaryDateFilter = (query, reqQuery) => {
  const dateFilter = buildDateRangeFilter("uploadDate", { from: reqQuery.dateFrom, to: reqQuery.dateTo });
  if (dateFilter) Object.assign(query, dateFilter);
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

    await logActivity({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "DIARY_SUBMITTED",
      resourceType: "workdiary",
      resourceId: newDiary._id,
      relatedJobId: linkedJob?._id || null,
      after: { jobId: newDiary.jobId },
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

    applyDiaryDateFilter(query, req.query);

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

    workDiary.notes = notes || workDiary.notes;

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
