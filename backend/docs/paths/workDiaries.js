const h = require("../helpers");
const { FAKE_DIARY_ID, FAKE_DRIVER_ID, FAKE_JOB_ID, FAKE_TRUCK_ID } = h.FAKE_IDS;

module.exports = {
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
        201: { description: "Uploaded.", content: { "application/json": { example: { success: true, message: "Work diary uploaded", data: { _id: FAKE_DIARY_ID } } } } },
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
      description: "Admin or the uploading driver. Always editable — work diaries have no approval workflow.",
      security: h.bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: FAKE_DIARY_ID }],
      requestBody: { content: { "application/json": { schema: { type: "object", properties: { notes: { type: "string" } } } } } },
      responses: {
        200: { description: "Updated.", content: { "application/json": { example: { success: true, message: "Work diary updated", data: { _id: FAKE_DIARY_ID } } } } },
        400: h.badRequestSuccess("Invalid work diary ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Unauthorized"),
        404: h.notFoundSuccess("Work diary"),
        500: h.serverErrorSuccess,
      },
    },
    delete: {
      tags: ["Work Diaries"],
      summary: "Delete a work diary",
      description: "Admin or the uploading driver. Always deletable — work diaries have no approval workflow. Removes the file from Cloudinary too.",
      security: h.bearer,
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: FAKE_DIARY_ID }],
      responses: {
        200: { description: "Deleted.", content: { "application/json": { example: { success: true, message: "Work diary deleted" } } } },
        400: h.badRequestSuccess("Invalid work diary ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Unauthorized"),
        404: h.notFoundSuccess("Work diary"),
        500: h.serverErrorSuccess,
      },
    },
  },
  "/api/admin/download-work-diaries": {
    get: {
      tags: ["Work Diaries"],
      summary: "Download a date-range batch of work diary files as a ZIP (admin only)",
      description: "For NHVR compliance requests — \"this driver's diary pages from date X to date Y\". Unlike the single-day POD bulk download, dateFrom and dateTo are both required (no default). driverId is optional — every driver's diaries in range are included when omitted. Scoped on uploadDate. Work diaries have no approval status, so every uploaded file in range is included.",
      security: h.bearer,
      parameters: [
        { name: "dateFrom", in: "query", required: true, schema: { type: "string", format: "date" }, example: "2026-07-01" },
        { name: "dateTo", in: "query", required: true, schema: { type: "string", format: "date" }, example: "2026-07-31" },
        { name: "driverId", in: "query", schema: { type: "string" }, example: FAKE_DRIVER_ID },
      ],
      responses: {
        200: { description: "A .zip archive of matching work diary files (deduplicated filenames per driver/date).", content: { "application/zip": { schema: { type: "string", format: "binary" } } } },
        400: h.badRequestStatus("dateFrom and dateTo are both required"),
        401: h.unauthorized,
        403: h.forbiddenStatusEnvelope("Access denied: Admins only"),
        404: h.notFoundStatus("Work diary files for that range"),
        500: h.serverErrorStatus,
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
        h.dateFromParam("uploadDate"), h.dateToParam("uploadDate"),
        { name: "includeOlder", in: "query", schema: { type: "string", enum: ["true", "false"] } },
      ],
      responses: {
        200: { description: "OK.", content: { "application/json": { example: { success: true, data: [{ _id: FAKE_DIARY_ID }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } } } },
        400: h.badRequestSuccess("Invalid driver ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied"),
        500: h.serverErrorSuccess,
      },
    },
  },
};
