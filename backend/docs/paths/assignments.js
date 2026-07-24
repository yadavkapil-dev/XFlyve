const h = require("../helpers");
const { FAKE_TRUCK_ID, FAKE_DRIVER_ID, FAKE_ASSIGNMENT_ID } = h.FAKE_IDS;

const assignmentBody = {
  type: "object",
  required: ["truckId", "driverId", "date"],
  properties: {
    truckId: { type: "string", example: FAKE_TRUCK_ID },
    driverId: { type: "string", example: FAKE_DRIVER_ID },
    date: { type: "string", format: "date", example: "2026-08-01" },
  },
};

module.exports = {
  "/api/admin/truck-assignments/test": {
    get: {
      tags: ["Assignments"],
      summary: "[Internal] Router smoke check — not a real feature",
      description: "Requires only a valid Bearer token (any role) — no meaningful params, no data. Flagged during the Phase 10 audit as a debug leftover confirming the router is mounted; not intended for real API consumption.",
      security: h.bearer,
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, message: "TruckAssign test route works" } } } },
        401: h.unauthorized,
      },
    },
  },
  "/api/admin/truck-assignments": {
    post: {
      tags: ["Assignments"],
      summary: "Assign a truck to a driver for a date (admin only)",
      description:
        "Prevents double-booking: the same driver or the same truck cannot have two assignments on the same date (409). Also blocked if the truck is unavailable (out-of-service/archived). " +
        "A genuine race between two concurrent requests that both pass the pre-check is still caught by the schema's unique indexes and surfaces as the same 409, not a 500.",
      security: h.bearer,
      requestBody: { required: true, content: { "application/json": { schema: assignmentBody } } },
      responses: {
        201: { description: "Assigned.", content: { "application/json": { example: { success: true, message: "Truck assigned successfully", data: { _id: FAKE_ASSIGNMENT_ID, truckId: FAKE_TRUCK_ID, driverId: FAKE_DRIVER_ID, date: "2026-08-01" } } } } },
        400: h.badRequestSuccess("Invalid input data"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        409: {
          description: "Driver or truck already booked that date, truck unavailable, or a caught race condition.",
          content: { "application/json": { example: { success: false, message: "This driver already has a truck assignment on the selected date" } } },
        },
        500: h.serverErrorSuccess,
      },
    },
    get: {
      tags: ["Assignments"],
      summary: "List all truck assignments (admin only)",
      description: "Not paginated — returns every assignment, fully populated (truck and driver documents, not just IDs).",
      security: h.bearer,
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, message: "All assignments fetched successfully", data: [{ _id: FAKE_ASSIGNMENT_ID, truckId: { _id: FAKE_TRUCK_ID, truckNumber: "TRK-104" }, driverId: { _id: FAKE_DRIVER_ID, name: "Jane Driver" }, date: "2026-08-01" }] } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/admin/truck-assignments/{driverId}/{date}": {
    get: {
      tags: ["Assignments"],
      summary: "Get a driver's truck assignment for a specific date",
      description: "Admin, or the driver themselves (self only).",
      security: h.bearer,
      parameters: [
        { name: "driverId", in: "path", required: true, schema: { type: "string" }, example: FAKE_DRIVER_ID },
        { name: "date", in: "path", required: true, schema: { type: "string", format: "date" }, example: "2026-08-01" },
      ],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, message: "Assignment found", data: { _id: FAKE_ASSIGNMENT_ID, truckId: { _id: FAKE_TRUCK_ID, truckNumber: "TRK-104" }, date: "2026-08-01" } } } } },
        400: h.badRequestSuccess("Invalid driverId or date"),
        401: h.unauthorized,
        403: { description: "Not an admin and not this driver.", content: { "application/json": { example: { status: "fail", message: "Forbidden" } } } },
        404: h.notFoundSuccess("No assignment found for the given driver and date"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/admin/truck-assignments/{assignmentId}": {
    put: {
      tags: ["Assignments"],
      summary: "Update a truck assignment (admin only)",
      description: "Full replace of truckId/driverId/date — same conflict/availability checks as creating one, excluding this assignment's own record from the conflict check.",
      security: h.bearer,
      parameters: [{ name: "assignmentId", in: "path", required: true, schema: { type: "string" }, example: FAKE_ASSIGNMENT_ID }],
      requestBody: { required: true, content: { "application/json": { schema: assignmentBody } } },
      responses: {
        200: { description: "Updated.", content: { "application/json": { example: { success: true, message: "Assignment updated successfully", data: { _id: FAKE_ASSIGNMENT_ID } } } } },
        400: h.badRequestSuccess("Invalid input data"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        404: h.notFoundSuccess("Assignment"),
        409: h.conflictSuccess("This truck is already assigned to another driver on the selected date"),
        500: h.serverErrorSuccess,
      },
    },
    delete: {
      tags: ["Assignments"],
      summary: "Delete a truck assignment (admin only)",
      description: "Hard delete (not a soft archive, unlike most other resources in this API).",
      security: h.bearer,
      parameters: [{ name: "assignmentId", in: "path", required: true, schema: { type: "string" }, example: FAKE_ASSIGNMENT_ID }],
      responses: {
        200: { description: "Deleted.", content: { "application/json": { example: { success: true, message: "Assignment deleted successfully" } } } },
        400: h.badRequestSuccess("Invalid assignment ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        404: h.notFoundSuccess("Assignment"),
        500: h.serverErrorSuccess,
      },
    },
  },
};
