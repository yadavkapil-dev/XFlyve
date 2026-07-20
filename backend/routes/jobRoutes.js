const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const { requireAdmin, requireDriver } = require("../middlewares/roleMiddleware");
const jobController = require("../controllers/jobController");
const { createJobValidator, updateJobValidator } = require("../validators/jobValidator");
const validateRequest = require("../middlewares/validateRequest");
const validateMongoId = require("../validators/validateMongoId");

// Require authentication for all job routes
router.use(authMiddleware);

// Admin-only: Get all jobs
router.get("/", requireAdmin, jobController.getAllJobs);

// Admin-only: Jobs with completed work and approved documents
router.get("/admin/ready-for-invoicing", requireAdmin, jobController.getJobsReadyForInvoicing);

// Admin-only: Create new job
router.post("/create", requireAdmin, createJobValidator, validateRequest, jobController.createJob);

// Update a job by ID — allow admin or driver
router.put(
  "/:jobId",
  (req, res, next) => {
    if (req.user.role === "admin" || req.user.role === "driver") {
      return next();
    }
    return res.status(403).json({ status: "fail", message: "Forbidden" });
  },
  validateMongoId("jobId"),
  updateJobValidator,
  validateRequest,
  jobController.updateJob
);

// Admin-only: Delete a job by ID
router.delete(
  "/:jobId",
  requireAdmin,
  validateMongoId("jobId"),
  jobController.deleteJob
);

// Driver route: get assigned jobs by driverId (validate param and restrict access)
router.get(
  "/assigned/:driverId",
  requireDriver,
  validateMongoId("driverId"),
  (req, res, next) => {
    if (req.user.role !== "admin" && req.user.id !== req.params.driverId) {
      return res.status(403).json({ status: "fail", message: "Forbidden" });
    }
    next();
  },
  jobController.getAssignedJobs
);

// Driver-only: Get jobs assigned to logged-in driver
router.get("/driver", requireDriver, jobController.getMyJobs);

// Get a single job by ID — allow admin or the assigned driver (ownership
// enforced in the controller), same gate as PUT /:jobId above. Must stay
// after the literal /driver route above so "/jobs/driver" doesn't get
// swallowed by this :jobId wildcard.
router.get(
  "/:jobId",
  (req, res, next) => {
    if (req.user.role === "admin" || req.user.role === "driver") {
      return next();
    }
    return res.status(403).json({ status: "fail", message: "Forbidden" });
  },
  validateMongoId("jobId"),
  jobController.getJobById
);

// Driver route: mark job complete
router.put("/complete/:jobId", requireDriver, validateMongoId("jobId"), jobController.markJobComplete);

module.exports = router;
