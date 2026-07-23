const mongoose = require("mongoose");
const Job = require("../models/job");
const Driver = require("../models/driver");
const Truck = require("../models/truck");
const logger = require("../utils/logger");
const {
  JobTransitionError,
  isTruckUnavailable,
  startJob,
  completeJob,
  reassignJob,
} = require("../services/jobTransitionService");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { buildSearchOr } = require("../utils/search");
const { buildDateRangeFilter } = require("../utils/dateRange");
const { notifyUser } = require("../services/notificationService");
const { logActivity } = require("../services/activityService");

const JOB_SORT_FIELDS = ["jobDate", "createdAt", "status", "title"];
const JOB_DEFAULT_SORT = { jobDate: 1 };
const JOB_SEARCH_FIELDS = ["customerName", "pickupLocation", "deliveryLocation"];

const DRIVER_STATUS_TRANSITIONS = {
  pending: "in-progress",
  "in-progress": "completed",
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

const calendarDateKey = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isPastCalendarDate = (value) => {
  const selectedDate = calendarDateKey(value);
  const today = calendarDateKey(new Date());
  return Boolean(selectedDate && today && selectedDate < today);
};

const isSameCalendarDate = (left, right) =>
  calendarDateKey(left) === calendarDateKey(right);

const dateRangeFor = (value) => {
  const start = normalizeDateOnly(value);
  if (!start) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const findTruckJobConflict = async ({ assignedTruck, jobDate, excludeJobId }) => {
  const range = dateRangeFor(jobDate);
  if (!range) return { type: "invalid-date" };

  return Job.findOne({
    assignedTruck,
    recordStatus: { $ne: "archived" },
    ...(excludeJobId ? { _id: { $ne: excludeJobId } } : {}),
    jobDate: { $gte: range.start, $lt: range.end },
  }).lean();
};

// @desc    Create a new job
// @route   POST /api/jobs/create
// @access  Admin
exports.createJob = async (req, res) => {
  try {
    const {
      title,
      description,
      pickupLocation,
      deliveryLocation,
      customerName,
      customerReference,
      jobRate,
      invoiceStatus,
      recordStatus,
      assignedTo,
      assignedTruck,
      jobDate,
      jobType,
    } = req.body;

    // Check if assigned driver exists
    const driver = await Driver.findById(assignedTo).lean();
    if (!driver) {
      return res.status(404).json({ status: "fail", message: "Driver not found" });
    }

    if (!assignedTruck) {
      return res.status(400).json({ status: "fail", message: "Assigned truck is required" });
    }

    const truck = await Truck.findById(assignedTruck).lean();
    if (isTruckUnavailable(truck)) {
      return res.status(409).json({
        status: "fail",
        message: "Truck is not available for assignment",
      });
    }

    if (!jobDate) {
      return res.status(400).json({ status: "fail", message: "Job date is required" });
    }

    const normalizedJobDate = normalizeDateOnly(jobDate);
    if (!normalizedJobDate) {
      return res.status(400).json({ status: "fail", message: "Invalid job date" });
    }

    if (isPastCalendarDate(jobDate)) {
      return res.status(400).json({ status: "fail", message: "Job date cannot be in the past." });
    }

    // ✅ Prevent assigning the same truck twice on the same day
    const existingJob = await findTruckJobConflict({ assignedTruck, jobDate: normalizedJobDate });

    if (existingJob) {
      return res.status(400).json({
        status: "fail",
        message: "This truck is already assigned to another job on the selected date",
      });
    }

    const newJob = await Job.create({
      title: title.trim(),
      description: description?.trim(),
      pickupLocation: pickupLocation.trim(),
      deliveryLocation: deliveryLocation.trim(),
      customerName: customerName?.trim(),
      customerReference: customerReference?.trim(),
      jobRate,
      invoiceStatus,
      recordStatus,
      assignedTo,
      assignedTruck,
      jobDate: normalizedJobDate,
      jobType,
      status: "pending",
    });

    await notifyUser({
      recipient: newJob.assignedTo,
      type: "job_assigned",
      title: "New job assigned",
      message: `You have been assigned a new job: ${newJob.title}`,
      resourceType: "job",
      resourceId: newJob._id,
    });

    await logActivity({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "JOB_CREATED",
      resourceType: "job",
      resourceId: newJob._id,
      relatedJobId: newJob._id,
      after: {
        title: newJob.title,
        status: newJob.status,
        assignedTo: newJob.assignedTo,
        assignedTruck: newJob.assignedTruck,
        jobDate: newJob.jobDate,
        jobType: newJob.jobType,
      },
    });

    await logActivity({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "JOB_ASSIGNED",
      resourceType: "job",
      resourceId: newJob._id,
      relatedJobId: newJob._id,
      after: { assignedTo: newJob.assignedTo },
    });

    res.status(201).json({ status: "success", data: newJob });
  } catch (err) {
    logger.error("Create Job Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};


// @desc    Get all jobs (admin only) — paginated, searchable, filterable
// @route   GET /api/jobs
// @access  Admin
// Query params: page, limit, sort (jobDate|createdAt|status|title, prefix
// "-" for descending), search (matches customer/pickup/delivery location),
// status, jobType, assignedTo, assignedTruck, dateFrom, dateTo (jobDate range).
exports.getAllJobs = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, JOB_SORT_FIELDS, JOB_DEFAULT_SORT);

    const query = { recordStatus: { $ne: "archived" } };

    const searchOr = buildSearchOr(req.query.search, JOB_SEARCH_FIELDS);
    if (searchOr) Object.assign(query, searchOr);

    if (req.query.status) query.status = req.query.status;
    if (req.query.jobType) query.jobType = req.query.jobType;
    if (req.query.assignedTo && mongoose.Types.ObjectId.isValid(req.query.assignedTo)) {
      query.assignedTo = req.query.assignedTo;
    }
    if (req.query.assignedTruck && mongoose.Types.ObjectId.isValid(req.query.assignedTruck)) {
      query.assignedTruck = req.query.assignedTruck;
    }

    const dateFilter = buildDateRangeFilter("jobDate", { from: req.query.dateFrom, to: req.query.dateTo });
    if (dateFilter) Object.assign(query, dateFilter);

    const [jobs, total] = await Promise.all([
      Job.find(query)
        .populate("assignedTo", "name email driverType")
        .populate("assignedTruck", "truckNumber")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Job.countDocuments(query),
    ]);

    res.status(200).json({
      status: "success",
      data: jobs,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("Get Jobs Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

exports.getJobsReadyForInvoicing = async (req, res) => {
  try {
    const jobs = await Job.findReadyForInvoicing();
    const populatedJobs = await Job.populate(jobs, [
      { path: "assignedTo", select: "name email driverType" },
      { path: "assignedTruck", select: "truckNumber" },
      { path: "podIds" },
      { path: "diaryIds" },
    ]);

    res.status(200).json({
      status: "success",
      results: populatedJobs.length,
      data: populatedJobs,
    });
  } catch (err) {
    logger.error("Get Jobs Ready For Invoicing Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

// @desc    Get a job by ID
// @route   GET /api/jobs/:jobId
// @access  Admin or Assigned Driver
exports.getJobById = async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId)
      .populate("assignedTo", "name email")
      .populate("assignedTruck", "truckNumber")
      .lean();

    if (!job) {
      return res.status(404).json({ status: "fail", message: "Job not found" });
    }

    if (req.user.role === "driver" && job.assignedTo._id.toString() !== req.user.id) {
      return res.status(403).json({ status: "fail", message: "Access denied" });
    }

    res.status(200).json({ status: "success", data: job });
  } catch (err) {
    logger.error("Get Job by ID Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

// @desc    Mark job as completed
// @route   PUT /api/jobs/complete/:jobId
// @access  Assigned Driver
exports.markJobComplete = async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({ status: "fail", message: "Job not found" });
    }

    if (req.user.role !== "driver" || job.assignedTo.toString() !== req.user.id) {
      return res.status(403).json({ status: "fail", message: "Unauthorized" });
    }

    const updatedJob = await completeJob(job, { id: req.user.id, role: req.user.role });

    res.status(200).json({
      status: "success",
      message: "Job marked as completed",
      data: updatedJob,
    });
  } catch (err) {
    if (err instanceof JobTransitionError) {
      return res.status(err.statusCode).json({ status: "fail", message: err.message });
    }
    logger.error("Mark Job Complete Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

// @desc    Get jobs assigned to logged-in driver
// @route   GET /api/jobs/driver
// @access  Driver
exports.getMyJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ assignedTo: req.user.id, recordStatus: { $ne: "archived" } })
      .populate("assignedTruck", "truckNumber") // ✅ Added populate here
      .lean();

    res.status(200).json({ status: "success", results: jobs.length, data: jobs });
  } catch (err) {
    logger.error("Get Driver Jobs Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

// @desc    Get jobs assigned to a specific driver by driverId param
// @route   GET /api/jobs/assigned/:driverId
// @access  Driver (self) or Admin
exports.getAssignedJobs = async (req, res) => {
  try {
    const driverId = req.params.driverId;
    const jobs = await Job.find({ assignedTo: driverId, recordStatus: { $ne: "archived" } })
      .populate("assignedTruck", "truckNumber") // ✅ Added populate here
      .lean();

    res.status(200).json({ status: "success", results: jobs.length, data: jobs });
  } catch (err) {
    logger.error("Get Assigned Jobs Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

// ===== Update a job by ID (Admin or Driver)
exports.updateJob = async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const user = req.user;
    const {
      title,
      description,
      pickupLocation,
      deliveryLocation,
      customerName,
      customerReference,
      jobRate,
      invoiceStatus,
      recordStatus,
      assignedTo,
      assignedTruck,
      jobDate,
      jobType,
      status,
    } = req.body;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ status: "fail", message: "Job not found" });
    }

    const previousAssignedTo = job.assignedTo.toString();
    // Captured before any mutation below, for the JOB_UPDATED activity's
    // `before` snapshot on the admin-edit path.
    const beforeSnapshot = {
      title: job.title,
      description: job.description,
      pickupLocation: job.pickupLocation,
      deliveryLocation: job.deliveryLocation,
      jobRate: job.jobRate,
      invoiceStatus: job.invoiceStatus,
      assignedTo: job.assignedTo,
      assignedTruck: job.assignedTruck,
      jobDate: job.jobDate,
      jobType: job.jobType,
      status: job.status,
    };

    if (user.role === "driver") {
      // Driver can only update status of own jobs
      if (job.assignedTo.toString() !== user.id) {
        return res.status(403).json({ status: "fail", message: "Unauthorized" });
      }

      const requiredNextStatus = DRIVER_STATUS_TRANSITIONS[job.status];
      if (!status || status !== requiredNextStatus) {
        return res.status(409).json({
          status: "fail",
          message: requiredNextStatus
            ? `Job must move from ${job.status} to ${requiredNextStatus}`
            : "Completed jobs cannot be changed by drivers",
        });
      }

      const actor = { id: user.id, role: user.role };

      try {
        if (status === "in-progress") {
          await startJob(job, actor);

          const updatedJob = await Job.findById(jobId)
            .populate("assignedTruck", "truckNumber")
            .lean();

          return res.status(200).json({ status: "success", data: updatedJob });
        }

        const updatedJob = await completeJob(job, actor);
        return res.status(200).json({ status: "success", data: updatedJob });
      } catch (err) {
        if (err instanceof JobTransitionError) {
          return res.status(err.statusCode).json({ status: "fail", message: err.message });
        }
        throw err;
      }
    }

    // Admin can update all fields; validate assignedTo if provided
    if (assignedTo) {
      const driver = await Driver.findById(assignedTo).lean();
      if (!driver) {
        return res.status(404).json({ status: "fail", message: "Driver not found" });
      }
    }

    const nextAssignedTruck = assignedTruck !== undefined ? assignedTruck : job.assignedTruck;
    const nextJobDate = jobDate !== undefined ? normalizeDateOnly(jobDate) : job.jobDate;

    if (jobDate !== undefined && !nextJobDate) {
      return res.status(400).json({ status: "fail", message: "Invalid job date" });
    }

    if (
      jobDate !== undefined &&
      isPastCalendarDate(jobDate) &&
      !isSameCalendarDate(nextJobDate, job.jobDate)
    ) {
      return res.status(400).json({ status: "fail", message: "Job date cannot be in the past." });
    }

    if (assignedTruck !== undefined) {
      const truck = await Truck.findById(nextAssignedTruck).lean();
      if (isTruckUnavailable(truck)) {
        return res.status(409).json({
          status: "fail",
          message: "Truck is not available for assignment",
        });
      }
    }

    if (assignedTruck !== undefined || jobDate !== undefined) {
      const existingJob = await findTruckJobConflict({
        assignedTruck: nextAssignedTruck,
        jobDate: nextJobDate,
        excludeJobId: jobId,
      });

      if (existingJob) {
        return res.status(400).json({
          status: "fail",
          message: "This truck is already assigned to another job on the selected date",
        });
      }
    }

    // An in-progress job's truck is actively "on-route" — swapping it needs
    // the old truck released and the new one claimed together, not just the
    // job field updated, or the old truck would be stuck on-route forever.
    const isReassigningActiveTruck =
      assignedTruck !== undefined &&
      job.status === "in-progress" &&
      assignedTruck.toString() !== job.assignedTruck.toString();

    if (isReassigningActiveTruck) {
      try {
        await reassignJob(job, assignedTruck);
      } catch (err) {
        if (err instanceof JobTransitionError) {
          return res.status(err.statusCode).json({ status: "fail", message: err.message });
        }
        throw err;
      }
    }

    job.title = title !== undefined ? title : job.title;
    job.description = description !== undefined ? description : job.description;
    job.pickupLocation = pickupLocation !== undefined ? pickupLocation : job.pickupLocation;
    job.deliveryLocation = deliveryLocation !== undefined ? deliveryLocation : job.deliveryLocation;
    job.customerName = customerName !== undefined ? customerName : job.customerName;
    job.customerReference = customerReference !== undefined ? customerReference : job.customerReference;
    job.jobRate = jobRate !== undefined ? jobRate : job.jobRate;
    job.invoiceStatus = invoiceStatus !== undefined ? invoiceStatus : job.invoiceStatus;
    job.recordStatus = recordStatus !== undefined ? recordStatus : job.recordStatus;
    job.assignedTo = assignedTo !== undefined ? assignedTo : job.assignedTo;
    // If the truck was already reassigned atomically above, don't overwrite
    // it again here with a stale in-memory value.
    job.assignedTruck = isReassigningActiveTruck ? job.assignedTruck : nextAssignedTruck;
    job.jobDate = nextJobDate;
    job.jobType = jobType !== undefined ? jobType : job.jobType;
    job.status = status !== undefined ? status : job.status;

    await job.save();

    // Reassigning to a different driver reads as "new job assigned" to them;
    // any other admin edit to the same driver's job reads as an update.
    const nextAssignedTo = job.assignedTo.toString();
    if (nextAssignedTo !== previousAssignedTo) {
      await notifyUser({
        recipient: job.assignedTo,
        type: "job_assigned",
        title: "New job assigned",
        message: `You have been assigned a new job: ${job.title}`,
        resourceType: "job",
        resourceId: job._id,
      });

      await logActivity({
        actorId: user.id,
        actorRole: user.role,
        action: "JOB_ASSIGNED",
        resourceType: "job",
        resourceId: job._id,
        relatedJobId: job._id,
        before: { assignedTo: previousAssignedTo },
        after: { assignedTo: nextAssignedTo },
      });
    } else {
      await notifyUser({
        recipient: job.assignedTo,
        type: "job_updated",
        title: "Job updated",
        message: `Your job "${job.title}" has been updated.`,
        resourceType: "job",
        resourceId: job._id,
      });

      await logActivity({
        actorId: user.id,
        actorRole: user.role,
        action: "JOB_UPDATED",
        resourceType: "job",
        resourceId: job._id,
        relatedJobId: job._id,
        before: beforeSnapshot,
        after: {
          title: job.title,
          description: job.description,
          pickupLocation: job.pickupLocation,
          deliveryLocation: job.deliveryLocation,
          jobRate: job.jobRate,
          invoiceStatus: job.invoiceStatus,
          assignedTo: job.assignedTo,
          assignedTruck: job.assignedTruck,
          jobDate: job.jobDate,
          jobType: job.jobType,
          status: job.status,
        },
      });
    }

    const updatedJob = await Job.findById(jobId)
      .populate("assignedTo", "name email driverType")
      .populate("assignedTruck", "truckNumber");

    res.status(200).json({ status: "success", data: updatedJob });
  } catch (err) {
    logger.error("Update Job Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};

// ===== Delete a job by ID (Admin only)
exports.deleteJob = async (req, res) => {
  try {
    const jobId = req.params.jobId;

    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({ status: "fail", message: "Job not found" });
    }

    if (job.status === "in-progress") {
      return res.status(409).json({
        status: "fail",
        message: "Cannot delete a job that is currently in progress",
      });
    }

    job.recordStatus = "archived";
    await job.save();

    res.status(200).json({ status: "success", message: "Job archived", data: job });
  } catch (err) {
    logger.error("Delete Job Error: %o", err);
    res.status(500).json({ status: "error", message: "Server error" });
  }
};
