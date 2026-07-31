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

// GET /api/jobpods/admin/all?status=rejected (requireAdmin).
//
// Work logs and work diaries no longer have any approval/rejection concept
// (a submitted one is just a record), so this can't combine in either —
// PODs are the only document type left with a rejected state.
const getRejectedDocuments = async (user) => {
  const pods = await runProtected([requireAdmin], jobPodController.listAllPODs, buildReq(user, { query: { status: "rejected" } }));

  if (pods.statusCode !== 200) return pods;

  return {
    statusCode: 200,
    body: {
      status: "success",
      data: {
        rejectedPods: pods.body.data,
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
