const h = require("../helpers");
const { FAKE_NOTIFICATION_ID } = h.FAKE_IDS;

module.exports = {
  "/api/notifications": {
    get: {
      tags: ["Notifications"],
      summary: "Get the authenticated user's own notifications — paginated, newest first",
      description: "recipient is always the authenticated user, never taken from the query string — there is no way to read another user's notifications through this endpoint.",
      security: h.bearer,
      parameters: [h.pageParam, h.limitParam, h.sortParam(["createdAt"], "createdAt"), { name: "unreadOnly", in: "query", schema: { type: "string", enum: ["true", "false"] } }],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_NOTIFICATION_ID, type: "job_assigned", read: false }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        401: h.unauthorized,
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/notifications/unread-count": {
    get: {
      tags: ["Notifications"],
      summary: "Get the authenticated user's unread notification count",
      description: "Powers the notification bell badge.",
      security: h.bearer,
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: { count: 3 } } } } },
        401: h.unauthorized,
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/notifications/read-all": {
    put: {
      tags: ["Notifications"],
      summary: "Mark all of the authenticated user's unread notifications as read",
      security: h.bearer,
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, message: "All notifications marked as read" } } } },
        401: h.unauthorized,
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/notifications/{id}/read": {
    put: {
      tags: ["Notifications"],
      summary: "Mark a single notification as read",
      description: "Only the notification's own recipient may mark it read (403 otherwise, even for admins).",
      security: h.bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: FAKE_NOTIFICATION_ID }],
      responses: {
        200: { description: "OK (idempotent — marking an already-read notification again just returns it unchanged).", content: { "application/json": { example: { success: true, data: { _id: FAKE_NOTIFICATION_ID, read: true } } } } },
        400: h.badRequestSuccess("Invalid notification ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        404: h.notFoundSuccess("Notification"),
        500: h.serverErrorSuccess,
      },
    },
  },
};
