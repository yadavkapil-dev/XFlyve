const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const notificationController = require("../controllers/notificationController");
const validateMongoId = require("../validators/validateMongoId");

router.use(authMiddleware);

router.get("/", notificationController.getNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.put("/read-all", notificationController.markAllAsRead);
router.put("/:id/read", validateMongoId("id"), notificationController.markAsRead);

module.exports = router;
