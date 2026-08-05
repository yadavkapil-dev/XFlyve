const h = require("../helpers");
const { FAKE_LOG_ID, FAKE_DRIVER_ID, FAKE_JOB_ID } = h.FAKE_IDS;

const workLogBody = {
  type: "object",
  properties: {
    date: { type: "string", format: "date" },
    workDate: { type: "string", format: "date", example: "2026-08-01" },
    jobId: { type: "string", example: FAKE_JOB_ID },
    jobIds: { type: "array", items: { type: "string" } },
    hours: { type: "number", description: "Required for local jobs.", example: 8 },
    localStartTime: { type: "string", description: "Required for local jobs.", example: "08:00" },
    localEndTime: { type: "string", description: "Required for local jobs.", example: "16:30" },
    interstateStartKm: { type: "number", description: "Required for interstate jobs.", example: 10234 },
    interstateEndKm: { type: "number", description: "Required for interstate jobs; must be >= interstateStartKm.", example: 10474 },
    deliveriesDone: { type: "integer", example: 6 },
    deliveryLocations: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
  },
};

module.exports = {
  "/api/worklogs/admin": {
    get: {
      tags: ["Work Logs"],
      summary: "List all work logs — paginated, filterable (admin only)",
      description: "Work logs have no approval/rejection concept — a submitted log is just a record on file, so there is no status filter.",
      security: h.bearer,
      parameters: [h.pageParam, h.limitParam, h.sortParam(["workDate", "date", "createdAt"], "workDate"), h.dateFromParam("workDate"), h.dateToParam("workDate")],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_LOG_ID }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/worklogs/admin/weekly-stats": {
    get: {
      tags: ["Work Logs"],
      summary: "Server-side aggregate of this week's logs (admin only)",
      description: "Monday-start week containing `date` (or today if omitted). Optionally scoped to one driver. Computed over the full week regardless of any list pagination, so it can't silently undercount.",
      security: h.bearer,
      parameters: [{ name: "date", in: "query", schema: { type: "string", format: "date" } }, { name: "driverId", in: "query", schema: { type: "string" } }],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: { weeklyLogs: 22, weeklyHours: 176, weeklyKilometres: 2450, weeklyDeliveries: 88 } } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/worklogs/admin/{driverId}": {
    get: {
      tags: ["Work Logs"],
      summary: "List one driver's work logs (admin only)",
      description: "Same handler as GET /api/worklogs/admin, scoped to this driverId — same query params apply.",
      security: h.bearer,
      parameters: [{ name: "driverId", in: "path", required: true, schema: { type: "string" }, example: FAKE_DRIVER_ID }, h.pageParam, h.limitParam],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_LOG_ID }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        400: h.badRequestSuccess("Invalid driverId"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/worklogs": {
    post: {
      tags: ["Work Logs"],
      summary: "Create a daily work log (driver only)",
      description:
        "The linked job (via jobId or jobIds[0]) must be currently assigned to the authenticated driver. Field requirements branch on that job's jobType: **local** jobs need hours + localStartTime + localEndTime; **interstate** jobs need interstateStartKm + interstateEndKm (end must be >= start) — kilometers is derived as the difference.",
      security: h.bearer,
      requestBody: { required: true, content: { "application/json": { schema: workLogBody } } },
      responses: {
        201: { description: "Created. Notifies admins — informational only, there is no approval step.", content: { "application/json": { example: { success: true, message: "Work log created", data: { _id: FAKE_LOG_ID } } } } },
        400: { description: "Missing driverId/date, or the job-type-specific field requirements above weren't met.", content: { "application/json": { example: { success: false, message: "A valid assigned job is required" } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Drivers only"),
        422: h.validationErrorSuccess("Hours must be a non-negative number"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/worklogs/me": {
    get: {
      tags: ["Work Logs"],
      summary: "Get the authenticated driver's own work logs",
      security: h.bearer,
      responses: {
        200: { description: "OK, not paginated.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_LOG_ID }] } } } },
        400: h.badRequestSuccess("Invalid driverId"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Drivers only"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/worklogs/{driverId}": {
    get: {
      tags: ["Work Logs"],
      summary: "Get a specific driver's work logs",
      description: 'Driver-only route, self only (no admin path here, unlike most others — use `GET /api/worklogs/admin/{driverId}` as an admin).',
      security: h.bearer,
      parameters: [{ name: "driverId", in: "path", required: true, schema: { type: "string" }, example: FAKE_DRIVER_ID }],
      responses: {
        200: { description: "OK, not paginated.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_LOG_ID }] } } } },
        400: h.badRequestSuccess("Invalid driverId"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/worklogs/{logId}": {
    put: {
      tags: ["Work Logs"],
      summary: "Update a work log (driver only, own record)",
      description: "Work logs have no approval/rejection concept, so there is nothing to lock — a driver's own record can always be edited.",
      security: h.bearer,
      parameters: [{ name: "logId", in: "path", required: true, schema: { type: "string" }, example: FAKE_LOG_ID }],
      requestBody: { content: { "application/json": { schema: workLogBody } } },
      responses: {
        200: { description: "Updated.", content: { "application/json": { example: { success: true, message: "Work log updated", data: { _id: FAKE_LOG_ID } } } } },
        400: { description: "Invalid logId, or job-type field requirements not met.", content: { "application/json": { example: { success: false, message: "Invalid logId" } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        404: h.notFoundSuccess("Work log"),
        422: h.validationErrorSuccess("Hours must be a non-negative number"),
        500: h.serverErrorSuccess,
      },
    },
    delete: {
      tags: ["Work Logs"],
      summary: "Delete a work log (driver only, own record)",
      description: "Work logs have no approval/rejection concept, so there is nothing to lock — a driver's own record can always be deleted.",
      security: h.bearer,
      parameters: [{ name: "logId", in: "path", required: true, schema: { type: "string" }, example: FAKE_LOG_ID }],
      responses: {
        200: { description: "Deleted.", content: { "application/json": { example: { success: true, message: "Work log deleted" } } } },
        400: h.badRequestSuccess("Invalid logId"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        404: h.notFoundSuccess("Work log"),
        500: h.serverErrorSuccess,
      },
    },
  },
};
