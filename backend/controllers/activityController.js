const mongoose = require("mongoose");
const Activity = require("../models/activity");
const logger = require("../utils/logger");

/**
 * @desc Get the full activity history for one job, chronological — powers
 * the read-only Activity Timeline on the job detail/admin view. This is the
 * only route this collection exposes: no create/update/delete route exists
 * anywhere (activities are written exclusively via activityService.logActivity
 * from the controllers/services that already own each event).
 * @route GET /api/activities/job/:jobId
 * @access Admin only
 */
exports.getJobActivity = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: "Invalid job ID" });
    }

    const activities = await Activity.find({ relatedJobId: jobId })
      .sort({ createdAt: 1 })
      .populate("actorId", "name email role")
      .lean();

    return res.status(200).json({ success: true, data: activities });
  } catch (err) {
    logger.error("Get job activity error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
