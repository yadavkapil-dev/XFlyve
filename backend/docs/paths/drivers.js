const h = require("../helpers");
const { FAKE_DRIVER_ID } = h.FAKE_IDS;

module.exports = {
  "/api/admin/drivers": {
    get: {
      tags: ["Drivers"],
      summary: "List drivers — paginated, searchable, filterable",
      security: h.bearer,
      parameters: [
        h.pageParam, h.limitParam, h.sortParam(["name", "createdAt", "email"], "name"),
        { name: "search", in: "query", schema: { type: "string" }, description: "Matches against name." },
        { name: "recordStatus", in: "query", schema: { type: "string", enum: ["active", "inactive", "archived"] }, description: "Defaults to excluding archived records if omitted." },
      ],
      responses: {
        200: {
          description: "OK. Passwords never included.",
          content: { "application/json": { example: { status: "success", data: [{ _id: FAKE_DRIVER_ID, name: "Jane Driver", email: "jane.driver@example.com", role: "driver" }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } },
        },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        500: h.serverErrorStatus,
      },
    },
    post: {
      tags: ["Drivers"],
      summary: "Create a driver",
      description:
        'Admin only. Notable behavior: if the email matches a previously-ARCHIVED driver, that exact record is reactivated and overwritten (same _id, response includes the full driver in `data`) rather than a 409 — a brand-new email returns 201 with **no `data` field at all**. A non-archived duplicate email is rejected with 409.',
      security: h.bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "password"],
              properties: {
                name: { type: "string", example: "Jane Driver" },
                email: { type: "string", example: "jane.driver@example.com" },
                password: { type: "string", minLength: 6, example: "S3cur3Pass!" },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Created (brand-new email — no `data` field) or reactivated (previously-archived email — includes `data`).",
          content: {
            "application/json": {
              examples: {
                brandNew: { summary: "Brand-new email", value: { status: "success", message: "Driver created successfully" } },
                reactivated: { summary: "Reactivated archived driver", value: { status: "success", message: "Driver created successfully", data: { _id: FAKE_DRIVER_ID, name: "Jane Driver", recordStatus: "active" } } },
              },
            },
          },
        },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        409: h.conflictStatus("A driver with this email already exists"),
        422: h.validationErrorSuccess("Password must be at least 6 characters"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/admin/drivers/{driverId}": {
    put: {
      tags: ["Drivers"],
      summary: "Update a driver",
      description: "Admin only. `name` and `email` are required on every update (not partial for those two fields); all other fields are optional. `password` only changes if a non-empty value is sent.",
      security: h.bearer,
      parameters: [{ name: "driverId", in: "path", required: true, schema: { type: "string" }, example: FAKE_DRIVER_ID }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email"],
              properties: {
                name: { type: "string" }, email: { type: "string" }, password: { type: "string", minLength: 6 },
                phone: { type: "string" },
                hourlyRate: { type: "number" }, kmRate: { type: "number" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Updated.", content: { "application/json": { example: { status: "success", message: "Driver updated successfully", data: { _id: FAKE_DRIVER_ID, name: "Jane Driver" } } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        404: h.notFoundStatus("Driver"),
        409: h.conflictStatus("Email already in use"),
        422: h.validationErrorSuccess("Valid email is required"),
        500: h.serverErrorStatus,
      },
    },
    delete: {
      tags: ["Drivers"],
      summary: "Archive a driver",
      description:
        "Admin only. This is a soft-delete: sets recordStatus to \"archived\" and active to false, never actually deletes the document. Two guards: an admin cannot archive their own account (400), and a driver cannot be archived while they have a pending or in-progress job (409) — a driver whose only job is completed archives fine.",
      security: h.bearer,
      parameters: [{ name: "driverId", in: "path", required: true, schema: { type: "string" }, example: FAKE_DRIVER_ID }],
      responses: {
        200: { description: "Archived.", content: { "application/json": { example: { status: "success", message: "Driver archived", data: { _id: FAKE_DRIVER_ID, recordStatus: "archived", active: false } } } } },
        400: { description: "Invalid driver ID, or attempting to archive your own admin account.", content: { "application/json": { example: { status: "fail", message: "You cannot delete your own admin account" } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        404: h.notFoundStatus("Driver"),
        409: h.conflictStatus("Cannot archive driver while they have active jobs"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/admin/export-drivers": {
    get: {
      tags: ["Drivers"],
      summary: "Export all drivers to an Excel file",
      security: h.bearer,
      responses: {
        200: { description: "An .xlsx file (name, email, phone, role columns).", content: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { schema: { type: "string", format: "binary" } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/admin/stats": {
    get: {
      tags: ["Drivers"],
      summary: "Fleet-wide totals (jobs, drivers, trucks, work logs)",
      security: h.bearer,
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { status: "success", data: { totalJobs: 128, totalDrivers: 14, totalTrucks: 9, totalLogs: 340 } } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/admin/dashboard-stats": {
    get: {
      tags: ["Drivers"],
      summary: "Date-scoped aggregate stats for the admin dashboard",
      description:
        '"Today" and "this week" are defined by the `date` query param\'s local calendar date, not the server\'s timezone — pass the admin\'s own local "today". Falls back to the server\'s current UTC date if omitted/invalid. Week is Monday-start. ' +
        "`todaysJobs`/`completedToday`/`pendingJobs` are scoped to that one day; `jobsByStatus` (Phase 11) is deliberately NOT date-scoped — it's every non-archived job regardless of date, a different (broader) picture. " +
        "`podApprovalRate` is `null` (not `0`) when no PODs have been decided yet — a real \"no data\" signal, not a fabricated rate. `invoiceReadyJobs` reuses the exact same eligibility rule as `GET /api/jobs/admin/ready-for-invoicing`, so the two numbers can never disagree.",
      security: h.bearer,
      parameters: [{ name: "date", in: "query", schema: { type: "string", format: "date" }, example: "2026-08-01" }],
      responses: {
        200: {
          description: "OK.",
          content: {
            "application/json": {
              example: {
                status: "success",
                data: {
                  date: "2026-08-01",
                  todaysJobs: 6,
                  completedToday: 2,
                  pendingJobs: 3,
                  totalDrivers: 14,
                  missingWorkLogs: 4,
                  trucksOutOfService: 1,
                  weeklyLogs: 22,
                  weeklyHours: 176,
                  weeklyKilometres: 2450,
                  invoiceReadyJobs: 3,
                  pendingPodApprovals: 2,
                  podApprovalRate: 92.5,
                  truckStatusBreakdown: { available: 10, "on-route": 3, "out-of-service": 1 },
                  jobsByStatus: { pending: 12, "in-progress": 4, completed: 88 },
                  jobVolumeTrend: [{ date: "2026-07-19", count: 3 }, { date: "2026-07-20", count: 5 }],
                },
              },
            },
          },
        },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/admin/download-all-pods": {
    get: {
      tags: ["Drivers"],
      summary: "Download one day's approved POD files as a ZIP (admin only)",
      description: "Scoped to status=approved and a single calendar day on uploadDate. `date` defaults to the server's current UTC date when omitted.",
      security: h.bearer,
      parameters: [{ name: "date", in: "query", schema: { type: "string", format: "date" }, example: "2026-08-01" }],
      responses: {
        200: { description: "A .zip archive of that day's approved POD files (deduplicated filenames per driver/date).", content: { "application/zip": { schema: { type: "string", format: "binary" } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        404: h.notFoundStatus("No POD files"),
        500: h.serverErrorStatus,
      },
    },
  },
};
