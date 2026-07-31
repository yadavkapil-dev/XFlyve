const mongoose = require("mongoose");
const Notification = require("../models/notification");
const logger = require("../utils/logger");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");

const NOTIFICATION_SORT_FIELDS = ["createdAt"];
const NOTIFICATION_DEFAULT_SORT = { createdAt: -1 };

/**
 * @desc Get the current user's notifications — paginated, newest first.
 * @route GET /api/notifications
 * @access Authenticated (any role)
 * Query params: page, limit, sort, unreadOnly ("true" to filter to unread).
 * recipient is always the authenticated user — never taken from the query
 * string, so a user can't read another user's notifications this way.
 */
exports.getNotifications = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const sort = parseSort(req.query.sort, NOTIFICATION_SORT_FIELDS, NOTIFICATION_DEFAULT_SORT);

    const query = { recipient: req.user.id };
    if (req.query.unreadOnly === "true") {
      query.read = false;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(query).sort(sort).skip(skip).limit(limit).populate("relatedJobId", "title").lean(),
      Notification.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: notifications,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (err) {
    logger.error("Get notifications error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Get the current user's unread notification count (for the bell badge).
 * @route GET /api/notifications/unread-count
 * @access Authenticated (any role)
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user.id, read: false });
    return res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    logger.error("Get unread notification count error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Mark a single notification as read.
 * @route PUT /api/notifications/:id/read
 * @access Authenticated — only the notification's own recipient
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid notification ID" });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    if (notification.recipient.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (!notification.read) {
      notification.read = true;
      await notification.save();
    }

    return res.status(200).json({ success: true, data: notification });
  } catch (err) {
    logger.error("Mark notification read error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc Mark all of the current user's unread notifications as read.
 * @route PUT /api/notifications/read-all
 * @access Authenticated (any role)
 */
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { $set: { read: true } }
    );
    return res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    logger.error("Mark all notifications read error: %o", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
