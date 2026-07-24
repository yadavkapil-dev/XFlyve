const h = require("../helpers");
const { FAKE_POD_ID, FAKE_DRIVER_ID, FAKE_JOB_ID } = h.FAKE_IDS;

module.exports = {
  "/api/jobpods/admin/pending": {
    get: {
      tags: ["PODs"],
      summary: "List pending POD approvals (admin only)",
      security: h.bearer,
      parameters: [h.pageParam, h.limitParam, h.sortParam(["uploadDate", "createdAt"], "createdAt"), { name: "driverId", in: "query", schema: { type: "string" } }, h.dateFromParam("uploadDate"), h.dateToParam("uploadDate")],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_POD_ID, status: "pending" }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/jobpods/{podId}/approve": {
    put: {
      tags: ["PODs"],
      summary: "Approve a POD (admin only)",
      security: h.bearer,
      parameters: [{ name: "podId", in: "path", required: true, schema: { type: "string" }, example: FAKE_POD_ID }],
      responses: {
        200: { description: "Approved. Notifies the uploading driver.", content: { "application/json": { example: { success: true, message: "POD approved", data: { _id: FAKE_POD_ID, status: "approved" } } } } },
        400: h.badRequestSuccess("Invalid POD ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        404: h.notFoundSuccess("POD"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/jobpods/{podId}/reject": {
    put: {
      tags: ["PODs"],
      summary: "Reject a POD with a reason (admin only)",
      security: h.bearer,
      parameters: [{ name: "podId", in: "path", required: true, schema: { type: "string" }, example: FAKE_POD_ID }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["rejectionReason"], properties: { rejectionReason: { type: "string", example: "Photo is blurry, please resubmit" } } } } } },
      responses: {
        200: { description: "Rejected. Notifies the uploading driver with the reason.", content: { "application/json": { example: { success: true, message: "POD rejected", data: { _id: FAKE_POD_ID, status: "rejected", rejectionReason: "Photo is blurry, please resubmit" } } } } },
        400: h.badRequestSuccess("Invalid POD ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        404: h.notFoundSuccess("POD"),
        422: h.validationErrorSuccess("Rejection reason is required"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/jobpods/upload": {
    post: {
      tags: ["PODs"],
      summary: "Upload a POD PDF (driver only)",
      description:
        "multipart/form-data. The file's actual bytes must start with the PDF magic signature `%PDF-` — a spoofed Content-Type claiming application/pdf with non-PDF bytes is rejected (400), independent of the mimetype check. Max 5MB. " +
        "`jobId` is optional but if given, the job must be assigned to the uploading driver (403 otherwise).",
      security: h.bearer,
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: { type: "object", required: ["podFile"], properties: { podFile: { type: "string", format: "binary" }, jobId: { type: "string", example: FAKE_JOB_ID }, notes: { type: "string", example: "Delivered to loading dock, signed by site manager" } } },
          },
        },
      },
      responses: {
        201: { description: "Uploaded.", content: { "application/json": { example: { success: true, message: "POD uploaded", data: { _id: FAKE_POD_ID, status: "pending" } } } } },
        400: { description: "No file, invalid jobId, or file failed the PDF signature check.", content: { "application/json": { example: { success: false, message: "Uploaded file is not a valid PDF" } } } },
        401: h.unauthorized,
        403: { description: "Not a driver, or jobId belongs to another driver.", content: { "application/json": { example: { success: false, message: "Cannot upload POD for another driver's job" } } } },
        404: h.notFoundSuccess("Job"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/jobpods/{podId}": {
    get: {
      tags: ["PODs"],
      summary: "Download/view a POD's PDF file",
      description: "Streams the actual PDF (Content-Type: application/pdf), proxied from Cloudinary. Admin or the uploading driver only.",
      security: h.bearer,
      parameters: [{ name: "podId", in: "path", required: true, schema: { type: "string" }, example: FAKE_POD_ID }],
      responses: {
        200: { description: "The PDF file.", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
        400: h.badRequestSuccess("Invalid POD ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        404: h.notFoundSuccess("POD"),
        502: { description: "Failed to retrieve the file from storage.", content: { "application/json": { example: { success: false, message: "Failed to retrieve POD file" } } } },
        500: h.serverErrorSuccess,
      },
    },
    put: {
      tags: ["PODs"],
      summary: "Update a POD's notes",
      description: "Admin or the uploading driver. A driver cannot edit an approved POD (409, locked). Editing a rejected POD as the driver implicitly resubmits it (status flips back to pending, rejection cleared).",
      security: h.bearer,
      parameters: [{ name: "podId", in: "path", required: true, schema: { type: "string" }, example: FAKE_POD_ID }],
      requestBody: { content: { "application/json": { schema: { type: "object", properties: { notes: { type: "string" } } } } } },
      responses: {
        200: { description: "Updated.", content: { "application/json": { example: { success: true, message: "POD updated", data: { _id: FAKE_POD_ID, status: "pending" } } } } },
        400: h.badRequestSuccess("Invalid POD ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Unauthorized"),
        404: h.notFoundSuccess("POD"),
        409: h.conflictSuccess("Approved PODs are locked and cannot be edited"),
        500: h.serverErrorSuccess,
      },
    },
    delete: {
      tags: ["PODs"],
      summary: "Delete a POD",
      description: "Admin or the uploading driver. Blocked (409) once approved. Removes the file from Cloudinary too.",
      security: h.bearer,
      parameters: [{ name: "podId", in: "path", required: true, schema: { type: "string" }, example: FAKE_POD_ID }],
      responses: {
        200: { description: "Deleted.", content: { "application/json": { example: { success: true, message: "POD deleted" } } } } ,
        400: h.badRequestSuccess("Invalid POD ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Unauthorized"),
        404: h.notFoundSuccess("POD"),
        409: h.conflictSuccess("Approved PODs are locked and cannot be deleted"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/jobpods/driver/{driverId}": {
    get: {
      tags: ["PODs"],
      summary: "List a driver's PODs — paginated, filterable",
      description: 'Admin or the driver themselves (self only). Defaults to the last 30 days of history unless `includeOlder=true`.',
      security: h.bearer,
      parameters: [
        { name: "driverId", in: "path", required: true, schema: { type: "string" }, example: FAKE_DRIVER_ID },
        h.pageParam, h.limitParam, h.sortParam(["uploadDate", "createdAt"], "uploadDate"),
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected"] } },
        h.dateFromParam("uploadDate"), h.dateToParam("uploadDate"),
        { name: "includeOlder", in: "query", schema: { type: "string", enum: ["true", "false"] }, description: 'Set to "true" to include PODs older than 30 days.' },
      ],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_POD_ID, status: "approved" }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        400: h.badRequestSuccess("Invalid driver ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/jobpods/admin/all": {
    get: {
      tags: ["PODs"],
      summary: "List all PODs — paginated, filterable (admin only)",
      security: h.bearer,
      parameters: [h.pageParam, h.limitParam, h.sortParam(["uploadDate", "createdAt"], "createdAt"), { name: "status", in: "query", schema: { type: "string", enum: ["pending", "approved", "rejected"] } }, { name: "driverId", in: "query", schema: { type: "string" } }, h.dateFromParam("uploadDate"), h.dateToParam("uploadDate")],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_POD_ID }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        500: h.serverErrorSuccess,
      },
    },
  },
};
