// Hand-authored OpenAPI 3.0 document — the single source of truth for
// /api-docs. Written directly from the real routes/controllers/validators/
// models (Phase 10 audit), not from memory of what the spec originally
// intended each endpoint to do. Where actual behavior surprised the
// audit, the surprise is documented (see notes inline), not smoothed over.
//
// Two response envelope shapes exist in this codebase, genuinely, not as a
// documentation error: Auth/Jobs/Admin-drivers use
// { status: "success"|"fail"|"error", message, data }; Trucks/Truck
// Assignments/PODs/Work Diaries/Work Logs/Notifications/Activity use
// { success: true|false, message, data }. Each endpoint documents whichever
// one it actually returns.
//
// AI routes are deliberately not documented here — Phase 14 doesn't exist
// yet.
const { FAKE_IDS } = require("./helpers");
const { FAKE_DRIVER_ID, FAKE_TRUCK_ID, FAKE_JOB_ID, FAKE_POD_ID, FAKE_DIARY_ID, FAKE_LOG_ID, FAKE_ASSIGNMENT_ID, FAKE_NOTIFICATION_ID, FAKE_ACTIVITY_ID } = FAKE_IDS;

const healthPaths = require("./paths/health");
const authPaths = require("./paths/auth");
const driverPaths = require("./paths/drivers");
const jobPaths = require("./paths/jobs");
const truckPaths = require("./paths/trucks");
const assignmentPaths = require("./paths/assignments");
const podPaths = require("./paths/pods");
const workDiaryPaths = require("./paths/workDiaries");
const workLogPaths = require("./paths/workLogs");
const notificationPaths = require("./paths/notifications");
const activityPaths = require("./paths/activity");

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "XFlyve API",
    version: "1.0.0",
    description:
      "Logistics operations API: jobs, drivers, trucks, daily truck assignments, proof-of-delivery (POD), interstate work diaries, daily work logs, notifications, and append-only activity history.\n\n" +
      "All endpoints except `/`, `/test`, `/healthz`, `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/forgot-password`, and `POST /api/auth/reset-password` require a Bearer JWT (`Authorization: Bearer <token>`), obtained from the login response.\n\n" +
      "Two response envelope shapes exist across this API (see individual endpoints): `{ status, message, data }` (Auth/Jobs/Admin-drivers) and `{ success, message, data }` (everything else). This isn't a documentation inconsistency — it's what the code actually returns.\n\n" +
      "A handful of routes are internal/legacy and flagged as such rather than presented as first-class API surface: `GET /test` and `GET /api/admin/truck-assignments/test` (debug smoke checks with no real function).",
  },
  servers: [
    { url: "http://localhost:3001", description: "Local development" },
    { url: "https://xflyve.onrender.com", description: "Production (Render)" },
  ],
  tags: [
    { name: "Health", description: "Liveness/readiness checks" },
    { name: "Authentication", description: "Signup, login, password reset, profile" },
    { name: "Drivers", description: "Admin-managed driver accounts" },
    { name: "Jobs", description: "Delivery jobs — creation, lifecycle, assignment" },
    { name: "Trucks", description: "Fleet vehicles" },
    { name: "Assignments", description: "Daily truck-to-driver assignments" },
    { name: "PODs", description: "Proof-of-delivery document uploads/approval" },
    { name: "Work Diaries", description: "Interstate compliance work diary uploads/approval" },
    { name: "Work Logs", description: "Daily driver work logs (hours/km/deliveries)" },
    { name: "Notifications", description: "Per-user in-app notifications" },
    { name: "Activity", description: "Read-only, append-only audit history per job" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      StatusEnvelope: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["success", "fail", "error"] },
          message: { type: "string" },
          data: {},
        },
      },
      SuccessEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          message: { type: "string" },
          data: {},
        },
      },
      PaginationMeta: {
        type: "object",
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 20 },
          total: { type: "integer", example: 42 },
          totalPages: { type: "integer", example: 3 },
        },
      },
      Driver: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_DRIVER_ID },
          name: { type: "string", example: "Jane Driver" },
          email: { type: "string", example: "jane.driver@example.com" },
          role: { type: "string", enum: ["driver", "admin"], example: "driver" },
          phone: { type: "string", example: "0400 000 000" },
          active: { type: "boolean", example: true },
          recordStatus: { type: "string", enum: ["active", "inactive", "archived"], example: "active" },
          hourlyRate: { type: "number", example: 35 },
          kmRate: { type: "number", example: 0.9 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Truck: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_TRUCK_ID },
          truckNumber: { type: "string", example: "TRK-104" },
          status: { type: "string", enum: ["available", "on-route", "out-of-service"], example: "available" },
          recordStatus: { type: "string", enum: ["active", "inactive", "archived"], example: "active" },
          assignedDriver: { type: "string", nullable: true, example: FAKE_DRIVER_ID },
          assignedJob: { type: "string", nullable: true, example: null },
          lastMaintenanceDate: { type: "string", format: "date", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Job: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_JOB_ID },
          title: { type: "string", example: "Sydney to Melbourne freight run" },
          description: { type: "string", example: "Pallet freight, 12 tonnes" },
          pickupLocation: { type: "string", example: "Sydney Depot" },
          deliveryLocation: { type: "string", example: "Melbourne Warehouse" },
          customerReference: { type: "string", nullable: true, example: "PO-10293" },
          jobRate: { type: "number", nullable: true, example: 850 },
          invoiceStatus: { type: "string", enum: ["pending", "ready", "invoiced", "paid"], example: "pending" },
          recordStatus: { type: "string", enum: ["active", "inactive", "archived"], example: "active" },
          assignedTo: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Driver" }], example: FAKE_DRIVER_ID },
          assignedTruck: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Truck" }], example: FAKE_TRUCK_ID },
          jobDate: { type: "string", format: "date", example: "2026-08-01" },
          startTime: { type: "string", nullable: true, example: "08:00" },
          jobType: { type: "string", enum: ["interstate", "local"], example: "local" },
          status: { type: "string", enum: ["pending", "in-progress", "completed"], example: "pending" },
          startedAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
          podIds: { type: "array", items: { type: "string" } },
          diaryIds: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      TruckAssignment: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_ASSIGNMENT_ID },
          truckId: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Truck" }] },
          driverId: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Driver" }] },
          date: { type: "string", format: "date", example: "2026-08-01" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      JobPod: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_POD_ID },
          driverId: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Driver" }] },
          jobId: { type: "string", nullable: true, example: FAKE_JOB_ID },
          fileUrl: { type: "string", example: "https://res.cloudinary.com/example/raw/upload/v1/pods/example.pdf" },
          publicId: { type: "string", example: "pods/example" },
          uploadDate: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["pending", "approved", "rejected"], example: "pending" },
          approvedBy: { type: "string", nullable: true },
          approvedAt: { type: "string", format: "date-time", nullable: true },
          rejectedBy: { type: "string", nullable: true },
          rejectedAt: { type: "string", format: "date-time", nullable: true },
          rejectionReason: { type: "string", nullable: true },
          notes: { type: "string", nullable: true, example: "Delivered to loading dock, signed by site manager" },
        },
      },
      WorkDiary: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_DIARY_ID },
          driverId: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Driver" }] },
          jobId: { type: "string", nullable: true, example: FAKE_JOB_ID },
          truckId: { type: "string", nullable: true, example: FAKE_TRUCK_ID },
          workDate: { type: "string", format: "date", nullable: true },
          fileUrl: { type: "string", example: "https://res.cloudinary.com/example/raw/upload/v1/work_diaries/example.pdf" },
          publicId: { type: "string" },
          uploadDate: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["pending", "approved", "rejected"], example: "pending" },
          rejectionReason: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      DailyWorkLog: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_LOG_ID },
          driverId: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Driver" }] },
          date: { type: "string", format: "date" },
          workDate: { type: "string", format: "date" },
          hours: { type: "number", example: 8 },
          kilometers: { type: "number", example: 240 },
          localStartTime: { type: "string", nullable: true, example: "08:00" },
          localEndTime: { type: "string", nullable: true, example: "16:30" },
          interstateStartKm: { type: "number", nullable: true, example: 10234 },
          interstateEndKm: { type: "number", nullable: true, example: 10474 },
          deliveriesDone: { type: "integer", example: 6 },
          deliveryLocations: { type: "array", items: { type: "string" }, example: ["Warehouse A", "Warehouse B"] },
          jobIds: { type: "array", items: { type: "string" }, example: [FAKE_JOB_ID] },
          status: { type: "string", enum: ["pending", "approved", "rejected"], example: "pending" },
          rejectionReason: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
        },
      },
      Notification: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_NOTIFICATION_ID },
          recipient: { type: "string", example: FAKE_DRIVER_ID },
          type: {
            type: "string",
            enum: [
              "job_assigned", "job_updated", "job_started", "job_completed",
              "pod_submitted", "pod_approved", "pod_rejected",
              "diary_submitted",
              "worklog_submitted",
            ],
            example: "job_assigned",
          },
          title: { type: "string", example: "New job assigned" },
          message: { type: "string", example: "You have been assigned a new job: Sydney to Melbourne freight run" },
          resourceType: { type: "string", enum: ["job", "jobpod", "workdiary", "worklog"], example: "job" },
          resourceId: { type: "string", example: FAKE_JOB_ID },
          relatedJobId: { type: "string", nullable: true, example: FAKE_JOB_ID },
          read: { type: "boolean", example: false },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Activity: {
        type: "object",
        properties: {
          _id: { type: "string", example: FAKE_ACTIVITY_ID },
          actorId: { oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Driver" }] },
          actorRole: { type: "string", enum: ["admin", "driver"] },
          action: {
            type: "string",
            enum: [
              "JOB_CREATED", "JOB_ASSIGNED", "JOB_UPDATED", "JOB_STARTED", "JOB_COMPLETED",
              "POD_SUBMITTED", "POD_APPROVED", "POD_REJECTED",
              "DIARY_SUBMITTED", "WORK_LOG_SUBMITTED",
            ],
            example: "JOB_CREATED",
          },
          resourceType: { type: "string", enum: ["job", "jobpod", "workdiary", "worklog"] },
          resourceId: { type: "string" },
          relatedJobId: { type: "string", nullable: true, example: FAKE_JOB_ID },
          before: { type: "object", nullable: true },
          after: { type: "object", nullable: true },
          metadata: { type: "object", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    ...healthPaths,
    ...authPaths,
    ...driverPaths,
    ...jobPaths,
    ...truckPaths,
    ...assignmentPaths,
    ...podPaths,
    ...workDiaryPaths,
    ...workLogPaths,
    ...notificationPaths,
    ...activityPaths,
  },
};

module.exports = openApiSpec;
