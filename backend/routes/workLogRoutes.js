const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const { requireDriver, requireAdmin } = require("../middlewares/roleMiddleware");
const workLogController = require("../controllers/workLogController");
const { validateWorkLog, rejectWorkLogValidator } = require("../validators/workLogValidator");
const validateMongoId = require("../validators/validateMongoId");
const validateRequest = require("../middlewares/validateRequest");

router.use(authMiddleware);

// ----------- NEW Admin routes to get all logs or filter by driverId -----------
router.get(
  "/admin",
  requireAdmin,
  workLogController.getAllLogsForAdmin
);

router.get(
  "/admin/pending",
  requireAdmin,
  workLogController.getPendingLogsForAdmin
);

router.get(
  "/admin/weekly-stats",
  requireAdmin,
  workLogController.getWeeklyStatsForAdmin
);

router.put(
  "/admin/:logId/approve",
  requireAdmin,
  validateMongoId("logId"),
  workLogController.approveWorkLog
);

router.put(
  "/admin/:logId/reject",
  requireAdmin,
  rejectWorkLogValidator,
  validateRequest,
  workLogController.rejectWorkLog
);

router.get(
  "/admin/:driverId",
  requireAdmin,
  validateMongoId("driverId"),
  workLogController.getAllLogsForAdmin
);

// Create work log (Driver only)
router.post(
  "/",
  requireDriver,
  validateWorkLog,
  validateRequest,
  workLogController.createWorkLog
);

// Get logs by current driver (Driver only) - NEW endpoint
router.get(
  "/me",
  requireDriver,
  workLogController.getMyLogs
);

// Get logs by driver ID (Driver only) - keep if still needed
router.get(
  "/:driverId",
  requireDriver,
  validateMongoId("driverId"),
  workLogController.getLogsByDriver
);

// Update work log by logId (Driver only)
router.put(
  "/:logId",
  requireDriver,
  validateMongoId("logId"),
  validateWorkLog,
  validateRequest,
  workLogController.updateWorkLog
);

// Delete work log by logId (Driver only)
router.delete(
  "/:logId",
  requireDriver,
  validateMongoId("logId"),
  workLogController.deleteWorkLog
);

module.exports = router;
