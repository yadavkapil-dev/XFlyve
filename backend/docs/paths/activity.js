const h = require("../helpers");
const { FAKE_JOB_ID, FAKE_ACTIVITY_ID } = h.FAKE_IDS;

module.exports = {
  "/api/activities/job/{jobId}": {
    get: {
      tags: ["Activity"],
      summary: "Get a job's full activity timeline, chronological",
      description:
        "Admin only — even the job's own assigned driver cannot access this (403). This is the *only* route this resource exposes: there is no create/update/delete endpoint anywhere. " +
        "Activity records are write-once, appended exclusively by the controllers/services that own each event (job creation/assignment/status changes, POD/diary/work-log submit/approve/reject) — never editable or deletable through the API.",
      security: h.bearer,
      parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" }, example: FAKE_JOB_ID }],
      responses: {
        200: {
          description: "OK, not paginated (returns the job's entire history).",
          content: { "application/json": { example: { success: true, data: [{ _id: FAKE_ACTIVITY_ID, action: "JOB_CREATED", actorRole: "admin", relatedJobId: FAKE_JOB_ID, createdAt: "2026-07-30T09:00:00.000Z" }] } } },
        },
        400: h.badRequestSuccess("Invalid job ID"),
        401: h.unauthorized,
        403: h.forbiddenSuccessEnvelope("Access denied: Admins only"),
        500: h.serverErrorSuccess,
      },
    },
  },
};
