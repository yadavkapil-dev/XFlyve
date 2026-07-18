import axios from "axios";

// Create Axios instance with backend base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001/api",
});

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
export const getAllDrivers = () => api.get("/admin/drivers");
export const createDriver = (driverData) => api.post("/admin/drivers", driverData);
export const updateDriver = (driverId, driverData) => api.put(`/admin/drivers/${driverId}`, driverData);
export const deleteDriver = (driverId) => api.delete(`/admin/drivers/${driverId}`);

export const exportDriversExcel = () =>
  api.get("/admin/export-drivers", { responseType: "blob" });

export const getSystemStats = () => api.get("/admin/stats");

export const downloadAllPods = () =>
  api.get("/admin/download-all-pods", { responseType: "blob" });

// Trucks
export const getAllTrucks = () => api.get("/admin/trucks");
export const createTruck = (truckData) => api.post("/admin/trucks", truckData);
export const updateTruck = (truckId, truckData) => api.put(`/admin/trucks/${truckId}`, truckData);
export const deleteTruck = (truckId) => api.delete(`/admin/trucks/${truckId}`);

// Jobs
export const getAllJobs = () => api.get("/jobs"); // Admin: get all jobs
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
export const getAllWorkLogsAdmin = () => api.get("/worklogs/admin");
export const getWorkLogsByDriverAdmin = (driverId) =>
  api.get(`/worklogs/admin/${driverId}`);
export const getPendingWorkLogsAdmin = () => api.get("/worklogs/admin/pending");
export const approveWorkLogAdmin = (logId) => api.put(`/worklogs/admin/${logId}/approve`);
export const rejectWorkLogAdmin = (logId, payload) => api.put(`/worklogs/admin/${logId}/reject`, payload);

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

export const listWorkDiariesByDriver = async (driverId) => {
  const res = await api.get(`/workDiaries/driver/${driverId}`);
  return res.data.data || []; // always return array
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

export const listPendingWorkDiaries = async () => {
  const res = await api.get("/workdiaries/admin/pending");
  return res.data.data || [];
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

// List PODs by driver
export const listPodsByDriver = async (driverId) => {
  const { data } = await api.get(`/jobpods/driver/${driverId}`);
  return data.data || [];
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

export const listPendingPods = async () => {
  const { data } = await api.get("/jobpods/admin/pending");
  return data.data || [];
};

export const approvePod = async (podId) => {
  const { data } = await api.put(`/jobpods/${podId}/approve`);
  return data.data;
};

export const rejectPod = async (podId, payload) => {
  const { data } = await api.put(`/jobpods/${podId}/reject`, payload);
  return data.data;
};

// ===== PUBLIC ROUTE FOR PRESENTATION (NO TOKEN REQUIRED) =====
export const getPublicDrivers = () => api.get("/admin/show-all-drivers");

export default api;
