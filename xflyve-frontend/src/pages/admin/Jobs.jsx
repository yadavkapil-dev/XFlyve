import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { getAllJobs, deleteJob, getAllTrucks, getAllTruckAssignments, getAllDrivers, updateJob } from "../../api";
import PaginationControls from "../../components/PaginationControls";
import ActivityTimeline from "../../components/ActivityTimeline";

const palette = {
  ink: "#0b1220",
  muted: "#697586",
  line: "rgba(15, 23, 42, 0.075)",
  panel: "rgba(255, 255, 255, 0.88)",
  heroStart: "#050b18",
  heroMid: "#0b2f3a",
  heroEnd: "#0c5f5b",
  teal: "#0e7c76",
  blue: "#2563eb",
  amber: "#b76e00",
  emerald: "#07866f",
};

const statusMeta = (status) => {
  if (status === "completed") return { label: "Completed", color: palette.emerald };
  if (status === "in-progress") return { label: "In progress", color: palette.blue };
  return { label: "Pending", color: palette.amber };
};

const isSelectableTruck = (truck) =>
  !["out-of-service", "maintenance", "on-route", "on route"].includes(truck.status);

const getAssignmentDriverId = (assignment) => {
  if (!assignment?.driverId) return "";
  return assignment.driverId._id || assignment.driverId;
};

const DetailPill = ({ icon, label, value }) => (
  <Paper elevation={0} sx={{ p: 1.4, borderRadius: 3, border: "1px solid", borderColor: palette.line, bgcolor: alpha("#fff", 0.74), minWidth: 0 }}>
    <Stack direction="row" spacing={1.1} alignItems="center">
      <Box sx={{ width: 34, height: 34, borderRadius: 2.5, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.08), flexShrink: 0 }}>
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>{label}</Typography>
        <Typography variant="body2" fontWeight={900} noWrap sx={{ color: palette.ink }}>{value || "—"}</Typography>
      </Box>
    </Stack>
  </Paper>
);

const Jobs = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [editError, setEditError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterDriver, setFilterDriver] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState(null);

  const navigate = useNavigate();

  // Any filter change should reset back to page 1 — staying on, say, page 3
  // of a now much-shorter filtered result set would just show an empty page.
  useEffect(() => {
    setPage(1);
  }, [filterDriver, filterDate]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit, sort: "jobDate" };
      if (filterDriver) params.assignedTo = filterDriver;
      if (filterDate) {
        params.dateFrom = filterDate;
        params.dateTo = filterDate;
      }

      const res = await getAllJobs(params);
      setJobs(res.data.data || []);
      setPagination(res.data.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterDriver, filterDate]);

  const fetchTrucksDrivers = async () => {
    try {
      const [trucksRes, assignmentsRes, driversRes] = await Promise.all([
        getAllTrucks(),
        getAllTruckAssignments(),
        getAllDrivers({ limit: 100 }),
      ]);
      setTrucks(trucksRes.data.data || []);
      setAssignments(assignmentsRes.data.data || []);
      setDrivers(driversRes.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    fetchTrucksDrivers();
  }, []);

  const clearFilters = () => {
    setFilterDriver("");
    setFilterDate("");
  };

  const selectableTrucks = useMemo(() => trucks.filter(isSelectableTruck), [trucks]);
  const selectedEditTruck = trucks.find((truck) => truck._id === editJob?.truckId);

  const openEdit = (job) => {
    setEditJob({
      _id: job._id,
      title: job.title,
      description: job.description,
      pickupLocation: job.pickupLocation,
      deliveryLocation: job.deliveryLocation,
      truckId: job.assignedTruck?._id || "",
      assignedTo: job.assignedTo?._id || "",
      jobType: job.jobType,
      jobDate: job.jobDate ? dayjs(job.jobDate).format("YYYY-MM-DD") : "",
      // Legacy jobs created before this field existed have no startTime —
      // render as blank rather than crashing; the admin must fill it in
      // before the update can be saved (see the required-fields check below).
      startTime: job.startTime || "",
    });
    setEditError("");
    setEditOpen(true);
  };

  const handleEditChange = (e) => setEditJob((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleTruckChange = (e) => {
    const truckId = e.target.value;
    const assignment = assignments.find((a) => a.truckId?._id === truckId);
    const assignmentDriverId = getAssignmentDriverId(assignment);

    if (editJob?.assignedTo && assignmentDriverId && editJob.assignedTo !== assignmentDriverId) {
      setEditError("Selected truck is assigned to a different driver. Choose that assigned driver or select another truck.");
    } else {
      setEditError("");
    }

    setEditJob((prev) => ({
      ...prev,
      truckId,
      assignedTo: prev.assignedTo || assignmentDriverId,
      jobDate: assignment?.date ? assignment.date.split("T")[0] : prev.jobDate,
    }));
  };

  const hasEditAssignmentDriverConflict = () => {
    const assignment = assignments.find((a) => a.truckId?._id === editJob?.truckId);
    const assignmentDriverId = getAssignmentDriverId(assignment);
    return Boolean(assignmentDriverId && editJob?.assignedTo && editJob.assignedTo !== assignmentDriverId);
  };

  const handleEditSubmit = async () => {
    if (!editJob?.title || !editJob.truckId || !editJob.assignedTo || !editJob.jobDate || !editJob.startTime || !editJob.pickupLocation || !editJob.deliveryLocation || !editJob.jobType) {
      setEditError("Please fill all required fields");
      return;
    }

    if (hasEditAssignmentDriverConflict()) {
      setEditError("Selected truck is assigned to a different driver. Choose that assigned driver or select another truck.");
      return;
    }

    setEditSubmitting(true);
    setEditError("");
    try {
      await updateJob(editJob._id, {
        title: editJob.title,
        description: editJob.description,
        pickupLocation: editJob.pickupLocation,
        deliveryLocation: editJob.deliveryLocation,
        assignedTruck: editJob.truckId,
        assignedTo: editJob.assignedTo,
        jobType: editJob.jobType,
        jobDate: editJob.jobDate,
        startTime: editJob.startTime,
      });
      setEditOpen(false);
      fetchJobs();
    } catch (err) {
      setEditError(err.response?.data?.message || "Failed to update job");
    } finally {
      setEditSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteJob(deleteTarget._id);
      setDeleteTarget(null);
      fetchJobs();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete job");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1240, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Chip label="Job Management" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
              <Typography variant="h4" component="h1" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>Operations Board</Typography>
              <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Manage active runs, drivers, trucks and delivery status from one mobile-friendly view.</Typography>
            </Box>
            <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={() => navigate("/jobs/create")} sx={{ minHeight: 54, borderRadius: 3, bgcolor: "white", color: palette.ink, fontWeight: 950, px: 2.5, "&:hover": { bgcolor: alpha("#fff", 0.9) } }}>
              Create Run
            </Button>
          </Stack>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}

        <Paper elevation={0} sx={{ p: 2, mb: 2.5, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1.4fr 1fr auto" }, gap: 1.5, alignItems: "center" }}>
            <TextField select fullWidth label="Driver" value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)}>
              <MenuItem value="">All Drivers</MenuItem>
              {drivers.map((d) => <MenuItem key={d._id} value={d._id}>{d.name}</MenuItem>)}
            </TextField>
            <TextField fullWidth type="date" label="Run Date" InputLabelProps={{ shrink: true }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
            <Button variant="outlined" onClick={clearFilters} sx={{ minHeight: 54, borderRadius: 3, fontWeight: 850 }}>
              Clear
            </Button>
          </Box>
        </Paper>

        {loading ? (
          <Paper elevation={0} sx={{ p: 5, textAlign: "center", borderRadius: 5, border: "1px solid", borderColor: palette.line }}><CircularProgress /></Paper>
        ) : jobs.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
            <Typography fontWeight={950}>No runs found</Typography>
            <Typography sx={{ color: palette.muted }}>Create a run or adjust your filters.</Typography>
          </Paper>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" }, gap: 2 }}>
            {jobs.map((job) => {
              const meta = statusMeta(job.status);
              return (
                <Paper key={job._id} elevation={0} sx={{ p: 2, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                  <Stack spacing={1.7}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                      <Box minWidth={0}>
                        <Typography fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.035em" }}>{job.title}</Typography>
                        <Typography variant="body2" sx={{ color: palette.muted, mt: 0.4 }}>{job.description || "No description added."}</Typography>
                      </Box>
                      <Chip label={meta.label} sx={{ color: meta.color, bgcolor: alpha(meta.color, 0.1), fontWeight: 900, flexShrink: 0 }} />
                    </Stack>
                    <Typography fontWeight={900} sx={{ color: palette.ink }}>
                      {job.pickupLocation || "Pickup"} → {job.deliveryLocation || "Delivery"}
                    </Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(4, 1fr)" }, gap: 1 }}>
                      <DetailPill icon={<PersonOutlineIcon />} label="Driver" value={job.assignedTo?.name || "N/A"} />
                      <DetailPill icon={<LocalShippingIcon />} label="Truck" value={job.assignedTruck?.truckNumber || "N/A"} />
                      <DetailPill icon={<RouteOutlinedIcon />} label="Date" value={job.jobDate ? dayjs(job.jobDate).format("DD MMM YYYY") : "—"} />
                      <DetailPill icon={<ScheduleOutlinedIcon />} label="Start Time" value={job.startTime} />
                    </Box>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button fullWidth variant="contained" startIcon={<EditIcon />} onClick={() => openEdit(job)} sx={{ minHeight: 48, borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>Edit</Button>
                      <Button fullWidth variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteTarget(job)} sx={{ minHeight: 48, borderRadius: 3, fontWeight: 900 }}>Delete</Button>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Box>
        )}

        <PaginationControls
          pagination={pagination}
          onPageChange={setPage}
          onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
          palette={palette}
        />

        <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 5 } }}>
          <DialogTitle sx={{ fontWeight: 950 }}>Edit Run</DialogTitle>
          <DialogContent>
            {editError && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{editError}</Alert>}
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <TextField fullWidth label="Run Title" name="title" value={editJob?.title || ""} onChange={handleEditChange} required />
              <TextField fullWidth label="Description" name="description" value={editJob?.description || ""} onChange={handleEditChange} multiline rows={3} />
              <TextField fullWidth label="Pickup" name="pickupLocation" value={editJob?.pickupLocation || ""} onChange={handleEditChange} required />
              <TextField fullWidth label="Delivery" name="deliveryLocation" value={editJob?.deliveryLocation || ""} onChange={handleEditChange} required />
              <TextField select fullWidth label="Truck" name="truckId" value={editJob?.truckId || ""} onChange={handleTruckChange} required>
                {selectedEditTruck && !isSelectableTruck(selectedEditTruck) && (
                  <MenuItem value={selectedEditTruck._id} disabled>{selectedEditTruck.truckNumber} · unavailable</MenuItem>
                )}
                {selectableTrucks.map((truck) => <MenuItem key={truck._id} value={truck._id}>{truck.truckNumber}</MenuItem>)}
              </TextField>
              <TextField select fullWidth label="Driver" name="assignedTo" value={editJob?.assignedTo || ""} onChange={handleEditChange} required>
                {drivers.map((driver) => <MenuItem key={driver._id} value={driver._id}>{driver.name}</MenuItem>)}
              </TextField>
              <TextField select fullWidth label="Run Type" name="jobType" value={editJob?.jobType || ""} onChange={handleEditChange} required>
                <MenuItem value="local">Local</MenuItem>
                <MenuItem value="interstate">Interstate</MenuItem>
              </TextField>
              <TextField fullWidth label="Run Date" type="date" name="jobDate" value={editJob?.jobDate || ""} onChange={handleEditChange} InputLabelProps={{ shrink: true }} required />
              <TextField fullWidth label="Start Time" type="time" name="startTime" value={editJob?.startTime || ""} onChange={handleEditChange} InputLabelProps={{ shrink: true }} required />
            </Stack>

            {editJob?._id && (
              <>
                <Divider sx={{ my: 2.5 }} />
                <Typography variant="subtitle2" fontWeight={950} sx={{ color: palette.ink, mb: 1.5 }}>
                  Activity Timeline
                </Typography>
                <ActivityTimeline jobId={editJob._id} />
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEditOpen(false)} sx={{ borderRadius: 3 }}>Cancel</Button>
            <Button onClick={handleEditSubmit} variant="contained" disabled={editSubmitting} sx={{ borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>
              {editSubmitting ? <CircularProgress size={22} /> : "Update Run"}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} PaperProps={{ sx: { borderRadius: 5 } }}>
          <DialogTitle sx={{ fontWeight: 950 }}>Delete this run?</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: palette.muted }}>This removes “{deleteTarget?.title}” from operations. This action cannot be undone.</Typography>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setDeleteTarget(null)} sx={{ borderRadius: 3 }}>Cancel</Button>
            <Button onClick={confirmDelete} color="error" variant="contained" sx={{ borderRadius: 3, fontWeight: 900 }}>Delete</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default Jobs;
