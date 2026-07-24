const h = require("../helpers");
const { FAKE_DRIVER_ID, FAKE_TRUCK_ID, FAKE_JOB_ID } = h.FAKE_IDS;

const jobRequestBody = (required) => ({
  type: "object",
  required,
  properties: {
    title: { type: "string", example: "Sydney to Melbourne freight run" },
    description: { type: "string", example: "Pallet freight, 12 tonnes" },
    pickupLocation: { type: "string", example: "Sydney Depot" },
    deliveryLocation: { type: "string", example: "Melbourne Warehouse" },
    customerName: { type: "string", example: "Acme Logistics" },
    customerReference: { type: "string", example: "PO-10293" },
    jobRate: { type: "number", example: 850 },
    invoiceStatus: { type: "string", enum: ["pending", "ready", "invoiced", "paid"] },
    recordStatus: { type: "string", enum: ["active", "inactive", "archived"] },
    assignedTo: { type: "string", example: FAKE_DRIVER_ID },
    assignedTruck: { type: "string", example: FAKE_TRUCK_ID },
    jobDate: { type: "string", format: "date", example: "2026-08-01" },
    jobType: { type: "string", enum: ["interstate", "local"] },
    status: { type: "string", enum: ["pending", "in-progress", "completed"], description: "Only meaningful on update; driver updates are restricted to the legal next status (pending->in-progress->completed)." },
  },
});

module.exports = {
  "/api/jobs": {
    get: {
      tags: ["Jobs"],
      summary: "List jobs — paginated, searchable, filterable (admin only)",
      security: h.bearer,
      parameters: [
        h.pageParam, h.limitParam, h.sortParam(["jobDate", "createdAt", "status", "title"], "jobDate"),
        { name: "search", in: "query", schema: { type: "string" }, description: "Matches customerName, pickupLocation, or deliveryLocation." },
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "in-progress", "completed"] } },
        { name: "jobType", in: "query", schema: { type: "string", enum: ["interstate", "local"] } },
        { name: "assignedTo", in: "query", schema: { type: "string" } },
        { name: "assignedTruck", in: "query", schema: { type: "string" } },
        h.dateFromParam("jobDate"), h.dateToParam("jobDate"),
      ],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { status: "success", data: [{ _id: FAKE_JOB_ID, title: "Sydney to Melbourne freight run", status: "pending" }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/jobs/admin/ready-for-invoicing": {
    get: {
      tags: ["Jobs"],
      summary: "List completed jobs ready to invoice (admin only)",
      description: "A local job is ready once it has an approved POD. An interstate job additionally needs an approved work diary. Never returns archived, in-progress/pending, or already-invoiced/paid jobs.",
      security: h.bearer,
      responses: {
        200: { description: "OK, not paginated.", content: { "application/json": { example: { status: "success", results: 1, data: [{ _id: FAKE_JOB_ID, title: "Sydney to Melbourne freight run", status: "completed", invoiceStatus: "pending" }] } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/jobs/create": {
    post: {
      tags: ["Jobs"],
      summary: "Create a job (admin only)",
      description: "Fails with 409/400 if the assigned truck already has a non-archived job on the same date, or the truck is unavailable (out-of-service/archived), or the job date is in the past.",
      security: h.bearer,
      requestBody: { required: true, content: { "application/json": { schema: jobRequestBody(["title", "description", "pickupLocation", "deliveryLocation", "assignedTo", "assignedTruck", "jobDate", "jobType"]) } } },
      responses: {
        201: { description: "Created.", content: { "application/json": { example: { status: "success", data: { _id: FAKE_JOB_ID, status: "pending" } } } } },
        400: { description: "Missing/invalid field, past job date, or truck already booked that date.", content: { "application/json": { example: { status: "fail", message: "This truck is already assigned to another job on the selected date" } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        404: h.notFoundStatus("Driver"),
        409: h.conflictStatus("Truck is not available for assignment"),
        422: h.validationErrorSuccess("Valid driver ID is required"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/jobs/{jobId}": {
    get: {
      tags: ["Jobs"],
      summary: "Get a job by ID",
      description: "Admin can fetch any job. A driver can only fetch their own assigned job (403 otherwise).",
      security: h.bearer,
      parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" }, example: FAKE_JOB_ID }],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { status: "success", data: { _id: FAKE_JOB_ID, title: "Sydney to Melbourne freight run" } } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied"),
        404: h.notFoundStatus("Job"),
        500: h.serverErrorStatus,
      },
    },
    put: {
      tags: ["Jobs"],
      summary: "Update a job",
      description:
        "Admin or the assigned driver. Behaves very differently by role: a **driver** may only move status forward one legal step (pending->in-progress, in-progress->completed) and nothing else on the body is applied — sending any other status returns 409. An **admin** can edit any field; changing `assignedTruck` while the job is in-progress atomically releases the old truck and claims the new one. Reassigning to a different driver sends that driver a \"new job\" notification instead of an \"updated\" one.",
      security: h.bearer,
      parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" }, example: FAKE_JOB_ID }],
      requestBody: { required: true, content: { "application/json": { schema: jobRequestBody([]) } } },
      responses: {
        200: { description: "Updated.", content: { "application/json": { example: { status: "success", data: { _id: FAKE_JOB_ID, status: "in-progress" } } } } },
        400: h.badRequestStatus("Invalid job date"),
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Unauthorized"),
        404: h.notFoundStatus("Job"),
        409: { description: "Illegal driver status transition, or truck unavailable/already booked.", content: { "application/json": { example: { status: "fail", message: "Job must move from pending to in-progress" } } } },
        422: h.validationErrorSuccess("Invalid status"),
        500: h.serverErrorStatus,
      },
    },
    delete: {
      tags: ["Jobs"],
      summary: "Archive a job (admin only)",
      description: "Soft-delete (sets recordStatus to \"archived\"). Blocked while the job is in-progress.",
      security: h.bearer,
      parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" }, example: FAKE_JOB_ID }],
      responses: {
        200: { description: "Archived.", content: { "application/json": { example: { status: "success", message: "Job archived", data: { _id: FAKE_JOB_ID, recordStatus: "archived" } } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        404: h.notFoundStatus("Job"),
        409: h.conflictStatus("Cannot delete a job that is currently in progress"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/jobs/assigned/{driverId}": {
    get: {
      tags: ["Jobs"],
      summary: "Get jobs assigned to a specific driver",
      description: 'Driver-only route (note: an admin calling this gets a plain 403 "Access denied: Drivers only" from the role gate — this endpoint has no admin path, unlike most others; use `GET /api/jobs?assignedTo=` instead). A driver may only pass their own ID.',
      security: h.bearer,
      parameters: [{ name: "driverId", in: "path", required: true, schema: { type: "string" }, example: FAKE_DRIVER_ID }],
      responses: {
        200: { description: "OK, not paginated.", content: { "application/json": { example: { status: "success", results: 1, data: [{ _id: FAKE_JOB_ID, title: "Sydney to Melbourne freight run" }] } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Drivers only"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/jobs/driver": {
    get: {
      tags: ["Jobs"],
      summary: "Get the authenticated driver's own assigned jobs",
      security: h.bearer,
      responses: {
        200: { description: "OK, not paginated.", content: { "application/json": { example: { status: "success", results: 1, data: [{ _id: FAKE_JOB_ID, title: "Sydney to Melbourne freight run" }] } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Drivers only"),
        500: h.serverErrorStatus,
      },
    },
  },
  "/api/jobs/complete/{jobId}": {
    put: {
      tags: ["Jobs"],
      summary: "Mark a job complete (the assigned driver only)",
      description: "Equivalent to PUT /api/jobs/{jobId} with {status: \"completed\"} from the driver's own account, kept as a dedicated action route. Only legal from in-progress.",
      security: h.bearer,
      parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" }, example: FAKE_JOB_ID }],
      responses: {
        200: { description: "Completed.", content: { "application/json": { example: { status: "success", message: "Job marked as completed", data: { _id: FAKE_JOB_ID, status: "completed" } } } } },
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Unauthorized"),
        404: h.notFoundStatus("Job"),
        409: { description: "Job isn't in-progress.", content: { "application/json": { example: { status: "fail", message: "Only an in-progress job can be completed" } } } },
        500: h.serverErrorStatus,
      },
    },
  },
};
