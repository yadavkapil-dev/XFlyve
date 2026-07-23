const Activity = require("../models/activity");
const logger = require("../utils/logger");
const { getRequestId } = require("../utils/requestContext");

/**
 * Writes one append-only activity record. Like notificationService, a
 * failure here must never break the business action it's logging — swallow
 * and log instead of throwing back to the caller.
 */
const logActivity = async ({
  actorId,
  actorRole,
  action,
  resourceType,
  resourceId,
  relatedJobId = null,
  before = null,
  after = null,
  metadata = null,
}) => {
  try {
    await Activity.create({
      actorId,
      actorRole,
      action,
      resourceType,
      resourceId,
      relatedJobId,
      before,
      after,
      metadata,
      requestId: getRequestId() || null,
    });
  } catch (err) {
    logger.error("Failed to write activity log: %o", err);
  }
};

module.exports = { logActivity };
