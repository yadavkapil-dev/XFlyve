// The AI Service's only access to real data — every function here is a
// thin wrapper around an existing controller (same auth, same query logic,
// same response shape as the real REST endpoint). None of these accept
// arguments from the caller other than the authenticated user object: the
// LLM's tool-call arguments are never read by anything in this file, so
// there is no code path for a prompt-injected "driverId" or similar to
// reach a query. Ownership/role enforcement here is not a re-implementation
// of the rule — runProtected() invokes the exact same middleware functions
// (requireAdmin/requireDriver) and controller functions the real Express
// routes use.
const jobController = require("../../../controllers/jobController");
const truckController = require("../../../controllers/truckController");
const jobPodController = require("../../../controllers/jobPodController");
const workLogController = require("../../../controllers/workLogController");
const adminController = require("../../../controllers/adminController");
const { requireAdmin, requireDriver } = require("../../../middlewares/roleMiddleware");
const { normalizeDateOnly } = require("../../../utils/dateRange");
const { runProtected, buildReq } = require("./invokeController");

// GET /api/jobs/driver (requireDriver) — assignedTo: req.user.id is the
// controller's own query, never a parameter this file supplies. The
// "today" filter is applied here on the returned list (not a new query
// rule — same normalizeDateOnly() comparison used elsewhere in the app for
// calendar-date matching), since that endpoint has no date filtering of
// its own to delegate to.
const getMyJobsToday = async (user) => {
  const result = await runProtected([requireDriver], jobController.getMyJobs, buildReq(user));
  if (result.statusCode !== 200) return result;

  const todayKey = normalizeDateOnly(new Date().toISOString().slice(0, 10))?.getTime();
  const jobs = (result.body.data || []).filter((job) => {
    const jobDateKey = job.jobDate ? normalizeDateOnly(job.jobDate)?.getTime() : null;
    return jobDateKey === todayKey;
  });

  return { statusCode: 200, body: { status: "success", results: jobs.length, data: jobs } };
};

// GET /api/admin/trucks?status=available (authMiddleware only, no role
// restriction — matches the real route in routes/truckRoutes.js exactly).
const getAvailableTrucks = (user) =>
  runProtected([], truckController.getAllTrucks, buildReq(user, { query: { status: "available" } }));

// GET /api/jobpods/admin/pending (requireAdmin).
const getPendingPods = (user) =>
  runProtected([requireAdmin], jobPodController.listPendingPODApprovals, buildReq(user));

// Combines two existing admin, status-filterable list endpoints:
// GET /api/jobpods/admin/all?status=rejected and
// GET /api/worklogs/admin?status=rejected (both requireAdmin).
//
// Deliberately does NOT include rejected work diaries: there is no existing
// backend endpoint that returns them (workDiaryController only exposes
// listPendingWorkDiaryApprovals, hardcoded to status:"pending" — no
// "list all"/status-filterable route exists for work diaries the way it
// does for PODs and work logs). Flagged to the user rather than adding a
// new backend endpoint to fill the gap, per the "reuse existing backend
// logic only" instruction for this phase.
const getRejectedDocuments = async (user) => {
  const [pods, workLogs] = await Promise.all([
    runProtected([requireAdmin], jobPodController.listAllPODs, buildReq(user, { query: { status: "rejected" } })),
    runProtected([requireAdmin], workLogController.getAllLogsForAdmin, buildReq(user, { query: { status: "rejected" } })),
  ]);

  if (pods.statusCode !== 200) return pods;
  if (workLogs.statusCode !== 200) return workLogs;

  return {
    statusCode: 200,
    body: {
      status: "success",
      data: {
        rejectedPods: pods.body.data,
        rejectedWorkLogs: workLogs.body.data,
      },
    },
  };
};

// GET /api/jobs/admin/ready-for-invoicing (requireAdmin).
const getInvoiceReadyJobs = (user) =>
  runProtected([requireAdmin], jobController.getJobsReadyForInvoicing, buildReq(user));

// GET /api/admin/dashboard-stats (requireAdmin).
const getDailyOperationsSummary = (user) =>
  runProtected([requireAdmin], adminController.getDashboardStats, buildReq(user));

module.exports = {
  getMyJobsToday,
  getAvailableTrucks,
  getPendingPods,
  getRejectedDocuments,
  getInvoiceReadyJobs,
  getDailyOperationsSummary,
};
