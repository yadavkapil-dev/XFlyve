const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const { requireAdmin } = require("../middlewares/roleMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const { driverCreationValidator, driverUpdateValidator } = require("../validators/authValidator");
const Driver = require("../models/driver");

/* ==========================================================
   🔐 PROTECTED ADMIN ROUTES (Requires Token + Admin Role)
   ========================================================== */
router.get("/drivers", authMiddleware, requireAdmin, adminController.getAllDrivers);
router.post(
  "/drivers",
  authMiddleware,
  requireAdmin,
  (req, res, next) => {
    console.log("Create driver submitted payload:", req.body);
    next();
  },
  driverCreationValidator,
  validateRequest,
  adminController.createDriver
);
router.put("/drivers/:driverId", authMiddleware, requireAdmin, driverUpdateValidator, validateRequest, adminController.updateDriver);
router.delete("/drivers/:driverId", authMiddleware, requireAdmin, adminController.deleteDriver);
router.get("/export-drivers", authMiddleware, requireAdmin, adminController.exportDriversExcel);
router.get("/stats", authMiddleware, requireAdmin, adminController.getSystemStats);
router.get("/download-all-pods", authMiddleware, requireAdmin, adminController.downloadAllPods);

/* ==========================================================
   Demo driver route kept for compatibility, but protected.
   ========================================================== */
router.get("/show-all-drivers", authMiddleware, requireAdmin, async (req, res) => {
  try {
    // Limit to 500 if you seeded 500 users, adjust if needed
    const drivers = await Driver.find({ recordStatus: { $ne: "archived" } }).select("-password").limit(500);

    return res.json({
      success: true,
      total: drivers.length,
      users: drivers,
      data: drivers,
    });
  } catch (err) {
    console.error("Error fetching drivers:", err);
    return res.status(500).json({
      success: false,
      message: "Error fetching drivers",
      error: err.toString(),
    });
  }
});

module.exports = router;
