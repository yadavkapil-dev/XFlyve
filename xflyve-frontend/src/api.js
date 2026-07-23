import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// Create Axios instance with backend base URL
const api = axios.create({
  baseURL: API_URL,
});

// Socket.IO connects to the bare server origin, not the "/api" REST prefix.
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

// Attach JWT token to all requests if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 (expired/invalid token, or account deactivated/archived), clear auth
// state and redirect to login. Skip auth endpoints to avoid redirect loops.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isAuthEndpoint = error.config?.url?.includes("/auth/");

    if (status === 401 && !isAuthEndpoint) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// ===== AUTH ROUTES =====
export const login = (credentials) => api.post("/auth/login", credentials);
export const signup = (userData) => api.post("/auth/signup", userData);
export const getProfile = () => api.get("/auth/profile"); // Requires authMiddleware in backend

// ===== ADMIN ROUTES =====
// params: { page, limit, sort, search, driverType, recordStatus }
export const getAllDrivers = (params) => api.get("/admin/drivers", { params });
export const createDriver = (driverData) => api.post("/admin/drivers", driverData);
export const updateDriver = (driverId, driverData) => api.put(`/admin/drivers/${driverId}`, driverData);
export const deleteDriver = (driverId) => api.delete(`/admin/drivers/${driverId}`);

export const exportDriversExcel = () =>
  api.get("/admin/export-drivers", { responseType: "blob" });

export const getSystemStats = () => api.get("/admin/stats");

// Date-filtered aggregate stats for the admin dashboard (today's/this
// week's numbers). date: "YYYY-MM-DD" in the caller's local timezone —
// defaults to the server's UTC date if omitted.
export const getDashboardStats = (date) => api.get("/admin/dashboard-stats", { params: { date } });

export const downloadAllPods = () =>
  api.get("/admin/download-all-pods", { responseType: "blob" });

// Trucks
// params: { page, limit, sort, search, status, recordStatus }
export const getAllTrucks = (params) => api.get("/admin/trucks", { params });
export const createTruck = (truckData) => api.post("/admin/trucks", truckData);
export const updateTruck = (truckId, truckData) => api.put(`/admin/trucks/${truckId}`, truckData);
export const deleteTruck = (truckId) => api.delete(`/admin/trucks/${truckId}`);

// Jobs
// params: { page, limit, sort, search, status, jobType, assignedTo, assignedTruck, dateFrom, dateTo }
export const getAllJobs = (params) => api.get("/jobs", { params }); // Admin: get all jobs
export const getJobsByDriver = (driverId) => api.get(`/jobs/assigned/${driverId}`); // Driver/Admin: get jobs assigned to driver
// Removed invalid route: export const getMyJobs = () => api.get("/jobs/driver");
export const createJob = (jobData) => api.post("/jobs/create", jobData); // Admin: create job
export const updateJob = (jobId, jobData) => api.put(`/jobs/${jobId}`, jobData); // Admin: update job
export const deleteJob = (jobId) => api.delete(`/jobs/${jobId}`); // Admin: delete job
export const markJobComplete = (jobId) => api.put(`/jobs/complete/${jobId}`); // Driver: mark complete
export const getJobsReadyForInvoicing = () => api.get("/jobs/admin/ready-for-invoicing");

// Truck Assignments
export const assignTruck = (assignmentData) =>
  api.post("/admin/truck-assignments", assignmentData);

export const getAllTruckAssignments = () =>
  api.get("/admin/truck-assignments");

export const getDriverTruckAssignment = (driverId, date) =>
  api.get(`/admin/truck-assignments/${driverId}/${date}`);

export const updateTruckAssignment = (assignmentId, updatedData) =>
  api.put(`/admin/truck-assignments/${assignmentId}`, updatedData);

export const deleteTruckAssignment = (assignmentId) =>
  api.delete(`/admin/truck-assignments/${assignmentId}`);

// ===== WORK LOGS (Driver) =====
export const createWorkLog = (workLogData) => api.post("/worklogs", workLogData);
export const updateWorkLog = (logId, updatedData) => api.put(`/worklogs/${logId}`, updatedData);
export const deleteWorkLog = (logId) => api.delete(`/worklogs/${logId}`);

// New: Get work logs for a driver (driver API)
export const getWorkLogsByDriver = (driverId) => api.get(`/worklogs/${driverId}`);
// Get work logs for currently logged-in driver (no param needed)
export const getWorkLogsByCurrentDriver = () => api.get("/worklogs/me");

// ===== WORK LOGS (Admin) =====
// params: { page, limit, sort, status, dateFrom, dateTo }
export const getAllWorkLogsAdmin = (params) => api.get("/worklogs/admin", { params });
export const getWorkLogsByDriverAdmin = (driverId, params) =>
  api.get(`/worklogs/admin/${driverId}`, { params });
// params: { page, limit, sort, driverId, dateFrom, dateTo }
export const getPendingWorkLogsAdmin = (params) => api.get("/worklogs/admin/pending", { params });
export const approveWorkLogAdmin = (logId) => api.put(`/worklogs/admin/${logId}/approve`);
export const rejectWorkLogAdmin = (logId, payload) => api.put(`/worklogs/admin/${logId}/reject`, payload);

// Server-side weekly aggregate (logs/hours/km/deliveries), independent of the
// admin list's current pagination. params: { date, driverId }
export const getWeeklyWorkLogStatsAdmin = (params) => api.get("/worklogs/admin/weekly-stats", { params });

// ===== WORK DIARY =====
export const uploadWorkDiary = async (formData) => {
  const res = await api.post("/workDiaries/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data; // always return the saved work diary object
};

export const getWorkDiary = async (workDiaryId) => {
  const res = await api.get(`/workDiaries/${workDiaryId}`, { responseType: "blob" });
  return res.data; // blob, keep as-is
};

// params: { page, limit, sort, status, dateFrom, dateTo, includeOlder }
// Returns { data, pagination } — callers that only need the array can
// destructure `.data` at the call site.
export const listWorkDiariesByDriver = async (driverId, params) => {
  const res = await api.get(`/workDiaries/driver/${driverId}`, { params });
  return { data: res.data.data || [], pagination: res.data.pagination };
};

export const deleteWorkDiary = async (workDiaryId) => {
  const res = await api.delete(`/workDiaries/${workDiaryId}`);
  return res.data.data; // optional: return deleted object
};

// ===== UPDATE NOTES =====
export const updateWorkDiaryNotes = async (workDiaryId, payload) => {
  // payload = { notes: "new notes text" }
  const res = await api.put(`/workDiaries/${workDiaryId}`, payload);
  return res.data.data; // return the updated work diary object
};

// params: { page, limit, sort, driverId, dateFrom, dateTo }
export const listPendingWorkDiaries = async (params) => {
  const res = await api.get("/workdiaries/admin/pending", { params });
  return { data: res.data.data || [], pagination: res.data.pagination };
};

export const approveWorkDiary = async (workDiaryId) => {
  const res = await api.put(`/workdiaries/${workDiaryId}/approve`);
  return res.data.data;
};

export const rejectWorkDiary = async (workDiaryId, payload) => {
  const res = await api.put(`/workdiaries/${workDiaryId}/reject`, payload);
  return res.data.data;
};

// ===== POD =====
// Upload a POD (driver)
export const uploadPod = async (formData) => {
  const { data } = await api.post("/jobpods/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data; // return saved POD object
};

// List PODs by driver — params: { page, limit, sort, status, dateFrom,
// dateTo, includeOlder }. Returns { data, pagination }.
export const listPodsByDriver = async (driverId, params) => {
  const { data } = await api.get(`/jobpods/driver/${driverId}`, { params });
  return { data: data.data || [], pagination: data.pagination };
};

// Get POD by ID (for download) — returns Blob
export const getPod = async (podId) => {
  const { data } = await api.get(`/jobpods/${podId}`, { responseType: "blob" });
  return data;
};

// Update POD notes
export const updatePodNotes = async (podId, payload) => {
  // payload = { notes: "new notes text" }
  const { data } = await api.put(`/jobpods/${podId}`, payload);
  return data.data; // return updated POD object
};

// Delete POD
export const deletePod = async (podId) => {
  const { data } = await api.delete(`/jobpods/${podId}`);
  return data.data;
};

// params: { page, limit, sort, driverId, dateFrom, dateTo }
export const listPendingPods = async (params) => {
  const { data } = await api.get("/jobpods/admin/pending", { params });
  return { data: data.data || [], pagination: data.pagination };
};

export const approvePod = async (podId) => {
  const { data } = await api.put(`/jobpods/${podId}/approve`);
  return data.data;
};

export const rejectPod = async (podId, payload) => {
  const { data } = await api.put(`/jobpods/${podId}/reject`, payload);
  return data.data;
};

// ===== NOTIFICATIONS =====
// params: { page, limit, sort, unreadOnly }
export const getNotifications = (params) => api.get("/notifications", { params });
export const getUnreadNotificationCount = () => api.get("/notifications/unread-count");
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.put("/notifications/read-all");

// ===== ACTIVITY (read-only) =====
// Chronological activity history for one job — powers the Activity Timeline
// on the job edit view. No create/update/delete calls exist for this
// resource anywhere in the app; the collection is write-once server-side.
export const getJobActivity = (jobId) => api.get(`/activities/job/${jobId}`);

// ===== PUBLIC ROUTE FOR PRESENTATION (NO TOKEN REQUIRED) =====
export const getPublicDrivers = () => api.get("/admin/show-all-drivers");

export default api;
