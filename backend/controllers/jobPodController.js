const JobPod = require("../models/jobPod");
const Job = require("../models/job");
const mongoose = require("mongoose");
const { Readable } = require("stream");
const logger = require("../utils/logger");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { buildDateRangeFilter } = require("../utils/dateRange");
const { notifyUser, notifyAdmins } = require("../services/notificationService");

const POD_HISTORY_DAYS = 30;
const POD_SORT_FIELDS = ["uploadDate", "createdAt"];
const POD_DEFAULT_SORT = { createdAt: -1 };

// status + uploadDate-range filters — safe to apply on every POD list
// endpoint, including the single-driver-scoped one.
const applyPodStatusAndDateFilters = (query, reqQuery) => {
  if (reqQuery.status) query.status = reqQuery.status;
  const dateFilter = buildDateRangeFilter("uploadDate", { from: reqQuery.dateFrom, to: reqQuery.dateTo });
  if (dateFilter) Object.assign(query, dateFilter);
  return query;
};

// driverId filter — only for the admin-wide endpoints (listAllPODs,
// listPendingPODApprovals). Deliberately NOT applied on
// listPODsByDriver, whose driverId comes from the URL path, not the
// query string — accepting a query-string override there would let a
// driver widen their own scoped request to another driver's PODs.
const applyPodDriverFilter = (query, reqQuery) => {
  if (reqQuery.driverId && mongoose.Types.ObjectId.isValid(reqQuery.driverId)) {
    query.driverId = reqQuery.driverId;
  }
  return query;
};

const toDateTime = (value, fallback = 0) => {
  const time = value ? new Date(value).getTime() : fallback;
  return Number.isNaN(time) ? fallback : time;
};

const formatPODForDriverHistory = (pod) => {
  if (!pod.jobId) return pod;

  return {
    ...pod,
    jobId: {
      ...pod.jobId,
      // Job currently stores this value as deliveryLocation. Keep that field and
      // expose the requested dropoffLocation name for driver POD history clients.
      dropoffLocation: pod.jobId.dropoffLocation || pod.jobId.deliveryLocation,
    },
  };
};

/**
 * Upload a new POD PDF
 * Only Drivers can upload
 */
exports.uploadPOD = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "PDF file is required" });
    }

    const { notes, jobId } = req.body;
    const driverId = req.user.id;

    if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
      return res.status(400).json({ success: false, message: "Valid authenticated driver is required" });
    }

    let linkedJob = null;
    if (jobId) {
      if (!mongoose.Types.ObjectId.isValid(jobId)) {
        return res.status(400).json({ success: false, message: "Invalid jobId" });
      }

      linkedJob = await Job.findById(jobId);
      if (!linkedJob) {
        return res.status(404).json({ success: false, message: "Job not found" });
      }

      if (linkedJob.assignedTo.toString() !== driverId.toString()) {
        return res.status(403).json({ success: false, message: "Cannot upload POD for another driver's job" });
      }
    }

    const streamUpload = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: "raw", folder: "pods" },
          (error, result) => (result ? resolve(result) : reject(error))
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
    };

    const result = await streamUpload(req.file.buffer);

    const newPOD = new JobPod({
      driverId,
      jobId: linkedJob?._id || null,
      notes,
      fileUrl: result.secure_url,
      publicId: result.public_id,
    });

    await newPOD.save();

    if (linkedJob) {
      await Job.updateOne(
        { _id: linkedJob._id },
        { $addToSet: { podIds: newPOD._id } }
      );
    }

    await notifyAdmins({
      type: "pod_submitted",
      title: "POD submitted",
      message: "A driver submitted a new POD for review.",
      resourceType: "jobpod",
      resourceId: newPOD._id,
    });

    return res.status(201).json({ success: true, message: "POD uploaded", data: newPOD });
  } catch (err) {
    logger.error("Upload POD error: %o", err);
    return res.status(500).json({ success: false, message: "Server error during upload" });
  }
};

/**
 * Get POD PDF by ID
 * Driver who uploaded or Admin can view
 */
exports.getPOD = async (req, res) => {
  try {
    const { podId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(podId)) {
      return res.status(400).json({ success: false, message: "Invalid POD ID" });
    }

    const pod = await JobPod.findById(podId);
    if (!pod) return res.status(404).json({ success: false, message: "POD not found" });

    const userId = req.user._id || req.user.id;
    if (req.user.role !== "admin" && pod.driverId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const fileResponse = await fetch(pod.fileUrl);
    if (!fileResponse.ok || !fileResponse.body) {
      return res.status(502).json({ success: false, message: "Failed to retrieve POD file" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="POD-${podId}.pdf"`);
    Readable.fromWeb(fileResponse.body).pipe(res);
  } catch (err) {
    logger.error("Get POD error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * List PODs by driver — paginated, filterable.
 * Query params: page, limit, sort (uploadDate|createdAt), status,
 * dateFrom/dateTo (uploadDate range), includeOlder.
 */
exports.listPODsByDriver = async (req, res) => {
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
    const sort = parseSort(req.query.sort, POD_SORT_FIELDS, { uploadDate: -1 });

    const includeOlder = req.query.includeOlder === "true";
    const query = { driverId };

    if (!includeOlder) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - POD_HISTORY_DAYS);

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

    applyPodStatusAndDateFilters(query, req.query);

    const [pods, total] = await Promise.all([
      JobPod.find(query)
        .populate(
          "jobId",
          "jobDate pickupLocation deliveryLocation dropoffLocation description status jobNumber"
        )
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      JobPod.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: pods.map(formatPODForDriverHistory),
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("List PODs by driver error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Update POD notes
 */
exports.updatePOD = async (req, res) => {
  try {
    const { podId } = req.params;
    const { notes } = req.body;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(podId)) {
      return res.status(400).json({ success: false, message: "Invalid POD ID" });
    }

    const pod = await JobPod.findById(podId);
    if (!pod) return res.status(404).json({ success: false, message: "POD not found" });

    if (req.user.role !== "admin" && pod.driverId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (req.user.role === "driver" && pod.status === "approved") {
      return res.status(409).json({
        success: false,
        message: "Approved PODs are locked and cannot be edited",
      });
    }

    pod.notes = notes || pod.notes;

    if (req.user.role === "driver" && pod.status === "rejected") {
      pod.status = "pending";
      pod.rejectedBy = null;
      pod.rejectedAt = null;
      pod.rejectionReason = undefined;
    }

    await pod.save();

    return res.status(200).json({ success: true, message: "POD updated", data: pod });
  } catch (err) {
    logger.error("Update POD error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Delete POD
 */
exports.deletePOD = async (req, res) => {
  try {
    const { podId } = req.params;
    const userId = req.user._id || req.user.id;

    if (!mongoose.Types.ObjectId.isValid(podId)) {
      return res.status(400).json({ success: false, message: "Invalid POD ID" });
    }

    const pod = await JobPod.findById(podId);
    if (!pod) return res.status(404).json({ success: false, message: "POD not found" });

    if (req.user.role !== "admin" && pod.driverId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (req.user.role === "driver" && pod.status === "approved") {
      return res.status(409).json({
        success: false,
        message: "Approved PODs are locked and cannot be deleted",
      });
    }

    if (pod.publicId) {
      await cloudinary.uploader.destroy(pod.publicId, { resource_type: "raw" });
    }

    if (pod.jobId) {
      await Job.updateOne({ _id: pod.jobId }, { $pull: { podIds: pod._id } });
    }

    await JobPod.deleteOne({ _id: podId });

    return res.status(200).json({ success: true, message: "POD deleted" });
  } catch (err) {
    logger.error("Delete POD error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.approvePOD = async (req, res) => {
  try {
    const { podId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(podId)) {
      return res.status(400).json({ success: false, message: "Invalid POD ID" });
    }

    const pod = await JobPod.findById(podId);
    if (!pod) return res.status(404).json({ success: false, message: "POD not found" });

    pod.status = "approved";
    pod.approvedBy = req.user.id;
    pod.approvedAt = new Date();
    pod.rejectedBy = null;
    pod.rejectedAt = null;
    pod.rejectionReason = undefined;

    await pod.save();

    await notifyUser({
      recipient: pod.driverId,
      type: "pod_approved",
      title: "POD approved",
      message: "Your proof of delivery has been approved.",
      resourceType: "jobpod",
      resourceId: pod._id,
    });

    return res.status(200).json({ success: true, message: "POD approved", data: pod });
  } catch (err) {
    logger.error("Approve POD error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.rejectPOD = async (req, res) => {
  try {
    const { podId } = req.params;
    const { rejectionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(podId)) {
      return res.status(400).json({ success: false, message: "Invalid POD ID" });
    }

    const pod = await JobPod.findById(podId);
    if (!pod) return res.status(404).json({ success: false, message: "POD not found" });

    pod.status = "rejected";
    pod.rejectedBy = req.user.id;
    pod.rejectedAt = new Date();
    pod.rejectionReason = rejectionReason;
    pod.approvedBy = null;
    pod.approvedAt = null;

    await pod.save();

    await notifyUser({
      recipient: pod.driverId,
      type: "pod_rejected",
      title: "POD rejected",
      message: rejectionReason
        ? `Your proof of delivery was rejected: ${rejectionReason}`
        : "Your proof of delivery was rejected.",
      resourceType: "jobpod",
      resourceId: pod._id,
    });

    return res.status(200).json({ success: true, message: "POD rejected", data: pod });
  } catch (err) {
    logger.error("Reject POD error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Query params: page, limit, sort (uploadDate|createdAt), driverId,
// dateFrom/dateTo (uploadDate range).
exports.listPendingPODApprovals = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, POD_SORT_FIELDS, POD_DEFAULT_SORT);

    const query = { status: "pending" };
    applyPodDriverFilter(query, req.query);
    const dateFilter = buildDateRangeFilter("uploadDate", { from: req.query.dateFrom, to: req.query.dateTo });
    if (dateFilter) Object.assign(query, dateFilter);

    const [pods, total] = await Promise.all([
      JobPod.find(query)
        .populate("driverId", "name email driverType role")
        .populate("jobId", "title pickupLocation deliveryLocation jobDate status")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      JobPod.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: pods,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("List pending POD approvals error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Admin: list all PODs — paginated, filterable.
 * Query params: page, limit, sort (uploadDate|createdAt), status, driverId,
 * dateFrom/dateTo (uploadDate range).
 */
exports.listAllPODs = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, POD_SORT_FIELDS, POD_DEFAULT_SORT);

    const query = {};
    applyPodStatusAndDateFilters(query, req.query);
    applyPodDriverFilter(query, req.query);

    const [pods, total] = await Promise.all([
      JobPod.find(query)
        .populate("driverId", "name email driverType role")
        .populate("jobId", "title pickupLocation deliveryLocation jobDate status")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      JobPod.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: pods,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("Admin listAllPODs error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
