const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const { requireAdmin } = require("../middlewares/roleMiddleware");
const activityController = require("../controllers/activityController");

router.use(authMiddleware);

// Read-only, deliberately: this is the ONLY route this router exposes.
// There is no PUT/PATCH/DELETE anywhere for activities — the collection is
// write-once (via activityService.logActivity, called from the controllers/
// services that own each event) and read-many via this route only.
router.get("/job/:jobId", requireAdmin, activityController.getJobActivity);

module.exports = router;
