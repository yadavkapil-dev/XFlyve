// Shared fake IDs + reusable OpenAPI fragments used across backend/docs/paths/*.js.
// Kept separate from openapi.js to avoid a circular require (openapi.js
// pulls in every paths/*.js file, which each need these helpers too).

const FAKE_IDS = {
  FAKE_DRIVER_ID: "64f0000000000000000000a1",
  FAKE_ADMIN_ID: "64f0000000000000000000a2",
  FAKE_TRUCK_ID: "64f0000000000000000000b1",
  FAKE_JOB_ID: "64f0000000000000000000c1",
  FAKE_POD_ID: "64f0000000000000000000d1",
  FAKE_DIARY_ID: "64f0000000000000000000e1",
  FAKE_LOG_ID: "64f0000000000000000000f1",
  FAKE_ASSIGNMENT_ID: "64f000000000000000000011",
  FAKE_NOTIFICATION_ID: "64f000000000000000000012",
  FAKE_ACTIVITY_ID: "64f000000000000000000013",
  FAKE_JWT:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0ZjAwMDAwMDAwMDAwMDAwMDAwMDAwYTEiLCJyb2xlIjoiZHJpdmVyIn0.FAKE-SIGNATURE-PLACEHOLDER",
  FAKE_RESET_TOKEN:
    "9f2c6b1e4a7d3f0158b6c2e9a4d7f1035e8c2b6a9d4f7103e5c8b1a6d9f4e7c2",
};

const pageParam = { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 }, description: "1-indexed page number. Invalid/missing values silently fall back to 1." };
const limitParam = { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }, description: "Capped server-side at 100 regardless of what's requested." };
const sortParam = (fields, def) => ({
  name: "sort", in: "query", schema: { type: "string" },
  description: `Sort field, optionally prefixed with "-" for descending. Allowed: ${fields.join(", ")}. Anything else (typo, unindexed field) silently falls back to the default (${def}), never errors.`,
});
const dateFromParam = (field) => ({ name: "dateFrom", in: "query", schema: { type: "string", format: "date" }, description: `Inclusive lower bound (YYYY-MM-DD) on ${field}.` });
const dateToParam = (field) => ({ name: "dateTo", in: "query", schema: { type: "string", format: "date" }, description: `Inclusive upper bound (YYYY-MM-DD) on ${field} (end of that day).` });

const bearer = [{ bearerAuth: [] }];

const unauthorized = {
  description:
    'Missing/malformed Authorization header, an invalid or expired JWT, or a deactivated/archived account. Exact message varies: "Authorization token missing or invalid" | "Invalid or expired token" | "Account is inactive or no longer available".',
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" }, example: { success: false, message: "Invalid or expired token" } } },
};
const forbiddenSuccessEnvelope = (message = "Access denied") => ({
  description: "Authenticated, but not permitted to perform this action (wrong role, or not the resource's own driver).",
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" }, example: { success: false, message } } },
});
const forbiddenStatusEnvelope = (message = "Forbidden") => ({
  description: "Authenticated, but not permitted to perform this action (wrong role, or not the resource's own driver/job).",
  content: { "application/json": { schema: { $ref: "#/components/schemas/StatusEnvelope" }, example: { status: "fail", message } } },
});
const notFoundSuccess = (thing) => ({
  description: `${thing} not found.`,
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" }, example: { success: false, message: `${thing} not found` } } },
});
const notFoundStatus = (thing) => ({
  description: `${thing} not found.`,
  content: { "application/json": { schema: { $ref: "#/components/schemas/StatusEnvelope" }, example: { status: "fail", message: `${thing} not found` } } },
});
const validationErrorSuccess = (message) => ({
  description: "Request failed validation (express-validator).",
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" }, example: { success: false, message } } },
});
const conflictSuccess = (message) => ({
  description: "Conflicts with current state.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" }, example: { success: false, message } } },
});
const conflictStatus = (message) => ({
  description: "Conflicts with current state.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/StatusEnvelope" }, example: { status: "fail", message } } },
});
const badRequestSuccess = (message) => ({
  description: "Invalid request.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" }, example: { success: false, message } } },
});
const badRequestStatus = (message) => ({
  description: "Invalid request.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/StatusEnvelope" }, example: { status: "fail", message } } },
});
const serverErrorStatus = {
  description: "Unexpected server error.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/StatusEnvelope" }, example: { status: "error", message: "Server error" } } },
};
const serverErrorSuccess = {
  description: "Unexpected server error.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" }, example: { success: false, message: "Server error" } } },
};

module.exports = {
  FAKE_IDS,
  pageParam, limitParam, sortParam, dateFromParam, dateToParam, bearer,
  unauthorized, forbiddenSuccessEnvelope, forbiddenStatusEnvelope,
  notFoundSuccess, notFoundStatus, validationErrorSuccess,
  conflictSuccess, conflictStatus, badRequestSuccess, badRequestStatus,
  serverErrorStatus, serverErrorSuccess,
};
