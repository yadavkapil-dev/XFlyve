const Notification = require("../models/notification");
const Driver = require("../models/driver");
const logger = require("../utils/logger");
const { emitToUser } = require("../sockets/socketServer");

const NOTIFICATION_EVENT = "notification:new";

const createAndEmit = async ({ recipient, type, title, message, resourceType, resourceId, relatedJobId }) => {
  try {
    const notification = await Notification.create({
      recipient,
      type,
      title,
      message,
      resourceType,
      resourceId,
      relatedJobId: relatedJobId || null,
    });

    // Populated before emitting (not just on the REST fetch) so the live
    // socket push and the initial REST-loaded list carry the exact same
    // relatedJobId shape (null, or { _id, title }) — the frontend groups by
    // this field and needs the job title for its heading either way.
    if (relatedJobId && notification.populate) {
      await notification.populate("relatedJobId", "title");
    }

    emitToUser(recipient, NOTIFICATION_EVENT, notification.toObject ? notification.toObject() : notification);

    return notification;
  } catch (err) {
    // A notification failure must never break the business operation that
    // triggered it (e.g. a POD approval must still succeed even if writing
    // the notification fails for some reason).
    logger.error("Failed to create/emit notification: %o", err);
    return null;
  }
};

// Notify a single recipient (typically the driver a job/POD/diary/log belongs to).
const notifyUser = (params) => createAndEmit(params);

// Notify every active admin — there's no per-driver "assigned admin"
// concept in this app, so admin-facing events broadcast to all admins.
const notifyAdmins = async ({ type, title, message, resourceType, resourceId, relatedJobId }) => {
  try {
    const admins = await Driver.find({ role: "admin", recordStatus: { $ne: "archived" } })
      .select("_id")
      .lean();

    await Promise.all(
      admins.map((admin) =>
        createAndEmit({ recipient: admin._id, type, title, message, resourceType, resourceId, relatedJobId })
      )
    );
  } catch (err) {
    logger.error("Failed to notify admins: %o", err);
  }
};

module.exports = { notifyUser, notifyAdmins, NOTIFICATION_EVENT };
