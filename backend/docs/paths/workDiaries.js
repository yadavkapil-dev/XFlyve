const h = require("../helpers");
const { FAKE_DIARY_ID, FAKE_DRIVER_ID, FAKE_JOB_ID, FAKE_TRUCK_ID } = h.FAKE_IDS;

module.exports = {
  "/api/workdiaries/admin/pending": {
    get: {
      tags: ["Work Diaries"],
      summary: "List pending work diary approvals (admin only)",
      security: h.bearer,
      parameters: [h.pageParam, h.limitParam, h.sortParam(["uploadDate", "createdAt", "workDate"], "createdAt"), { name: "driverId", in: "query", schema: { type: "string" } }, h.dateFromParam("uploadDate"), h.dateToParam("uploadDate")],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_DIARY_ID, status: "pending" }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/workdiaries/{id}/approve": {
    put: {
      tags: ["Work Diaries"],
      summary: "Approve a work diary (admin only)",
      security: h.bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: FAKE_DIARY_ID }],
      responses: {
        200: { description: "Approved.", content: { "application/json": { example: { success: true, message: "Work diary approved", data: { _id: FAKE_DIARY_ID, status: "approved" } } } } },
        400: h.badRequestSuccess("Invalid work diary ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        404: h.notFoundSuccess("Work diary"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/workdiaries/{id}/reject": {
    put: {
      tags: ["Work Diaries"],
      summary: "Reject a work diary with a reason (admin only)",
      security: h.bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: FAKE_DIARY_ID }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["rejectionReason"], properties: { rejectionReason: { type: "string", example: "Missing signature page" } } } } } },
      responses: {
        200: { description: "Rejected.", content: { "application/json": { example: { success: true, message: "Work diary rejected", data: { _id: FAKE_DIARY_ID, status: "rejected" } } } } },
        400: h.badRequestSuccess("Invalid work diary ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        404: h.notFoundSuccess("Work diary"),
        422: h.validationErrorSuccess("Rejection reason is required"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/workdiaries/upload": {
    post: {
      tags: ["Work Diaries"],
      summary: "Upload a work diary PDF (driver only)",
      description:
        "multipart/form-data, same PDF magic-byte check and 5MB limit as POD uploads. If `jobId` is given, the job must (a) be assigned to the uploading driver and (b) be an **interstate** job — local jobs are rejected (400). " +
        "`truckId`/`workDate` are optional and default from the linked job when omitted.",
      security: h.bearer,
      requestBody: {
        required: true,
        content: { "multipart/form-data": { schema: { type: "object", required: ["workDiaryFile"], properties: { workDiaryFile: { type: "string", format: "binary" }, jobId: { type: "string", example: FAKE_JOB_ID }, truckId: { type: "string", example: FAKE_TRUCK_ID }, workDate: { type: "string", format: "date" }, notes: { type: "string" } } } } },
      },
      responses: {
        201: { description: "Uploaded.", content: { "application/json": { example: { success: true, message: "Work diary uploaded", data: { _id: FAKE_DIARY_ID, status: "pending" } } } } },
        400: { description: "No file, invalid jobId/truckId/workDate, the file isn't a real PDF, or the linked job isn't interstate.", content: { "application/json": { example: { success: false, message: "Work diary pages can only be linked to interstate jobs" } } } },
        401: h.unauthorized,
        403: { description: "Not a driver, or jobId belongs to another driver.", content: { "application/json": { example: { success: false, message: "Cannot upload work diary for another driver's job" } } } },
        404: h.notFoundSuccess("Job"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/workdiaries/{id}": {
    get: {
      tags: ["Work Diaries"],
      summary: "Download/view a work diary's PDF file",
      description: "Streams the PDF from Cloudinary. Admin or the uploading driver only.",
      security: h.bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: FAKE_DIARY_ID }],
      responses: {
        200: { description: "The PDF file.", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
        400: h.badRequestSuccess("Invalid work diary ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        404: h.notFoundSuccess("Work diary"),
        502: { description: "Failed to retrieve the file from storage.", content: { "application/json": { example: { success: false, message: "Failed to retrieve work diary file" } } } },
        500: h.serverErrorSuccess,
      },
    },
    put: {
      tags: ["Work Diaries"],
      summary: "Update a work diary's notes",
      description: "Admin or the uploading driver. Locked once approved (409) for drivers. Editing a rejected diary as the driver resubmits it (back to pending).",
      security: h.bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: FAKE_DIARY_ID }],
      requestBody: { content: { "application/json": { schema: { type: "object", properties: { notes: { type: "string" } } } } } },
      responses: {
        200: { description: "Updated.", content: { "application/json": { example: { success: true, message: "Work diary updated", data: { _id: FAKE_DIARY_ID, status: "pending" } } } } },
        400: h.badRequestSuccess("Invalid work diary ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Unauthorized"),
        404: h.notFoundSuccess("Work diary"),
        409: h.conflictSuccess("Approved work diaries are locked and cannot be edited"),
        500: h.serverErrorSuccess,
      },
    },
    delete: {
      tags: ["Work Diaries"],
      summary: "Delete a work diary",
      description: "Admin or the uploading driver. Blocked (409) once approved. Removes the file from Cloudinary too.",
      security: h.bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: FAKE_DIARY_ID }],
      responses: {
        200: { description: "Deleted.", content: { "application/json": { example: { success: true, message: "Work diary deleted" } } } },
        400: h.badRequestSuccess("Invalid work diary ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Unauthorized"),
        404: h.notFoundSuccess("Work diary"),
        409: h.conflictSuccess("Approved work diaries are locked and cannot be deleted"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/workdiaries/driver/{driverId}": {
    get: {
      tags: ["Work Diaries"],
      summary: "List a driver's work diaries — paginated, filterable",
      description: "Admin or the driver themselves (self only). Defaults to the last 30 days unless includeOlder=true.",
      security: h.bearer,
      parameters: [
        { name: "driverId", in: "path", required: true, schema: { type: "string" }, example: FAKE_DRIVER_ID },
        h.pageParam, h.limitParam, h.sortParam(["uploadDate", "createdAt", "workDate"], "uploadDate"),
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected"] } },
        h.dateFromParam("uploadDate"), h.dateToParam("uploadDate"),
        { name: "includeOlder", in: "query", schema: { type: "string", enum: ["true", "false"] } },
      ],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_DIARY_ID, status: "approved" }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        400: h.badRequestSuccess("Invalid driver ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        500: h.serverErrorSuccess,
      },
    },
  },
};
