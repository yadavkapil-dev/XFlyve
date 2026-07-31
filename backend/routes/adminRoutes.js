const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const { requireAdmin } = require("../middlewares/roleMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const { driverCreationValidator, driverUpdateValidator } = require("../validators/authValidator");

/* ==========================================================
   🔐 PROTECTED ADMIN ROUTES (Requires Token + Admin Role)
   ========================================================== */
router.get("/drivers", authMiddleware, requireAdmin, adminController.getAllDrivers);
router.post(
  "/drivers",
  authMiddleware,
  requireAdmin,
  driverCreationValidator,
  validateRequest,
  adminController.createDriver
);
router.put("/drivers/:driverId", authMiddleware, requireAdmin, driverUpdateValidator, validateRequest, adminController.updateDriver);
router.delete("/drivers/:driverId", authMiddleware, requireAdmin, adminController.deleteDriver);
router.get("/export-drivers", authMiddleware, requireAdmin, adminController.exportDriversExcel);
router.get("/stats", authMiddleware, requireAdmin, adminController.getSystemStats);
router.get("/dashboard-stats", authMiddleware, requireAdmin, adminController.getDashboardStats);
router.get("/download-all-pods", authMiddleware, requireAdmin, adminController.downloadAllPods);
router.get("/download-work-diaries", authMiddleware, requireAdmin, adminController.downloadWorkDiaries);

module.exports = router;
