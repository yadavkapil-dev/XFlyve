const h = require("../helpers");
const { FAKE_TRUCK_ID, FAKE_DRIVER_ID } = h.FAKE_IDS;

module.exports = {
  "/api/admin/trucks": {
    get: {
      tags: ["Trucks"],
      summary: "List trucks — paginated, searchable, filterable",
      description: 'Any authenticated user (admin or driver), not admin-only, unlike most other list endpoints in this API. Response includes a fleet-wide `outOfServiceCount` alongside `data`/`pagination` — that count is independent of the current filters (it always reflects the whole fleet).',
      security: h.bearer,
      parameters: [
        h.pageParam, h.limitParam, h.sortParam(["truckNumber", "createdAt", "capacity"], "truckNumber"),
        { name: "search", in: "query", schema: { type: "string" }, description: "Matches truckNumber." },
        { name: "status", in: "query", schema: { type: "string", enum: ["available", "on-route", "out-of-service"] } },
        { name: "recordStatus", in: "query", schema: { type: "string", enum: ["active", "inactive", "archived"] }, description: "Defaults to excluding archived if omitted." },
      ],
      responses: {
        200: {
          description: "OK.",
          content: { "application/json": { example: { success: true, message: "All trucks fetched", data: [{ _id: FAKE_TRUCK_ID, truckNumber: "TRK-104", status: "available" }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, outOfServiceCount: 1 } } },
        },
        401: h.unauthorized,
        500: h.serverErrorSuccess,
      },
    },
    post: {
      tags: ["Trucks"],
      summary: "Add a truck (admin only)",
      description: 'If `truckNumber` matches a previously-archived truck, that record is reactivated (same behavior pattern as driver creation) rather than rejected. `status` on create only accepts "out-of-service" as an explicit override — anything else defaults to "available".',
      security: h.bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object", required: ["truckNumber", "capacity"],
              properties: { truckNumber: { type: "string", example: "TRK-104" }, capacity: { type: "number", example: 12 }, status: { type: "string", enum: ["out-of-service"] }, recordStatus: { type: "string", enum: ["active", "inactive", "archived"] }, assignedDriver: { type: "string", example: FAKE_DRIVER_ID }, lastMaintenanceDate: { type: "string", format: "date" } },
            },
          },
        },
      },
      responses: {
        201: { description: "Created (or reactivated).", content: { "application/json": { example: { success: true, message: "Truck added", data: { _id: FAKE_TRUCK_ID, truckNumber: "TRK-104" } } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        409: h.conflictSuccess("A truck with this truck number already exists"),
        422: h.validationErrorSuccess("Capacity must be a number"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/admin/trucks/{truckId}": {
    put: {
      tags: ["Trucks"],
      summary: "Update a truck (admin only)",
      description: 'All fields optional/partial. Setting status to "out-of-service" is blocked (409) while the truck has an in-progress job.',
      security: h.bearer,
      parameters: [{ name: "truckId", in: "path", required: true, schema: { type: "string" }, example: FAKE_TRUCK_ID }],
      requestBody: {
        content: {
          "application/json": {
            schema: { type: "object", properties: { truckNumber: { type: "string" }, capacity: { type: "number" }, status: { type: "string", enum: ["available", "out-of-service"] }, recordStatus: { type: "string", enum: ["active", "inactive", "archived"] }, assignedDriver: { type: "string" }, lastMaintenanceDate: { type: "string", format: "date" } } },
          },
        },
      },
      responses: {
        200: { description: "Updated.", content: { "application/json": { example: { success: true, message: "Truck updated", data: { _id: FAKE_TRUCK_ID, status: "out-of-service" } } } } },
        400: h.badRequestSuccess("Invalid truck ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        404: h.notFoundSuccess("Truck"),
        409: h.conflictSuccess("Cannot mark truck out of service while it has an in-progress job"),
        422: h.validationErrorSuccess("Invalid status"),
        500: h.serverErrorSuccess,
      },
    },
    delete: {
      tags: ["Trucks"],
      summary: "Archive a truck (admin only)",
      description:
        "Soft-delete. Blocked (409) if the truck is referenced by any active (pending/in-progress) job, or by a truck-assignment record dated today or later. (Previously this checked for *any* truck-assignment record ever, including ones from the past — flagged during the Phase 10 audit and fixed to be date-scoped, matching how assignTruck itself treats assignments as one-day bookings, not permanent bindings.)",
      security: h.bearer,
      parameters: [{ name: "truckId", in: "path", required: true, schema: { type: "string" }, example: FAKE_TRUCK_ID }],
      responses: {
        200: { description: "Archived.", content: { "application/json": { example: { success: true, message: "Truck archived", data: { _id: FAKE_TRUCK_ID, recordStatus: "archived" } } } } },
        400: h.badRequestSuccess("Invalid truck ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        404: h.notFoundSuccess("Truck"),
        409: h.conflictSuccess("Cannot archive truck because it is referenced by active jobs or assignments"),
        500: h.serverErrorSuccess,
      },
    },
  },
};
