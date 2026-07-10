import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import { alpha } from "@mui/material/styles";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import NotesIcon from "@mui/icons-material/Notes";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SpeedIcon from "@mui/icons-material/Speed";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import {
  getAllWorkLogsAdmin,
  getWorkLogsByDriverAdmin,
  getAllDrivers,
  getPendingWorkLogsAdmin,
  approveWorkLogAdmin,
  rejectWorkLogAdmin,
  getJobsReadyForInvoicing,
} from "../../api";

const palette = {
  ink: "#0b1220",
  muted: "#697586",
  line: "rgba(15, 23, 42, 0.075)",
  panel: "rgba(255, 255, 255, 0.88)",
  heroStart: "#050b18",
  heroMid: "#0b2f3a",
  heroEnd: "#0c5f5b",
  teal: "#0e7c76",
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

const getLogJob = (log) => (Array.isArray(log.jobIds) && log.jobIds.length > 0 ? log.jobIds[0] : null);

const getLogJobType = (log) => {
  const job = getLogJob(log);
  if (job?.jobType) return job.jobType;
  if (log.interstateStartKm !== undefined || log.interstateEndKm !== undefined) return "interstate";
  return "local";
};

const StatPill = ({ icon, label, value }) => (
  <Paper elevation={0} sx={{ p: 1.4, borderRadius: 3, border: "1px solid", borderColor: palette.line, bgcolor: alpha("#fff", 0.74), minWidth: 0 }}>
    <Stack direction="row" spacing={1.1} alignItems="center">
      <Box sx={{ width: 34, height: 34, borderRadius: 2.5, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.08), flexShrink: 0 }}>
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>{label}</Typography>
        <Typography variant="body2" fontWeight={900} noWrap sx={{ color: palette.ink }}>{value ?? "—"}</Typography>
      </Box>
    </Stack>
  </Paper>
);

const WorkLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [pendingLogs, setPendingLogs] = useState([]);
  const [invoiceReadyJobs, setInvoiceReadyJobs] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [actionId, setActionId] = useState("");

  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const res = await getAllDrivers();
        if (res.data.status === "success") setDrivers(res.data.data || []);
        else setError("Failed to fetch drivers");
      } catch {
        setError("Server error fetching drivers");
      }
    };
    fetchDrivers();
  }, []);

  const fetchRecords = async (driverId) => {
    setLoading(true);
    setError("");
    try {
      const res = driverId ? await getWorkLogsByDriverAdmin(driverId) : await getAllWorkLogsAdmin();
      if (res.data.success) setLogs(res.data.data || []);
      else {
        setError(res.data.message || "Failed to fetch daily records");
        setLogs([]);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Server error fetching daily records");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviewQueues = async () => {
    setReviewLoading(true);
    try {
      const [pendingRes, invoiceRes] = await Promise.all([
        getPendingWorkLogsAdmin(),
        getJobsReadyForInvoicing(),
      ]);
      setPendingLogs(pendingRes.data.data || []);
      setInvoiceReadyJobs(invoiceRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Server error loading approval queues");
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchReviewQueues();
  }, []);

  const weeklySummary = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + 1);
    start.setHours(0, 0, 0, 0);
    const weekLogs = logs.filter((log) => new Date(log.date) >= start);
    return {
      count: weekLogs.length,
      hours: weekLogs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0),
      km: weekLogs.reduce((sum, log) => sum + (Number(log.kilometers) || 0), 0),
      deliveries: weekLogs.reduce((sum, log) => sum + (Number(log.deliveriesDone) || 0), 0),
    };
  }, [logs]);

  const handleDriverChange = (event, newValue) => {
    setSelectedDriver(newValue);
    fetchRecords(newValue ? newValue._id : null);
  };

  const statusChip = (status = "pending") => {
    const color = status === "approved" ? "#07866f" : status === "rejected" ? "#b42318" : "#b76e00";
    return <Chip label={status} sx={{ color, bgcolor: alpha(color, 0.1), fontWeight: 900, textTransform: "capitalize" }} />;
  };

  const logSummary = (log) => {
    if (getLogJobType(log) === "interstate") {
      return `KM ${log.interstateStartKm ?? "—"} → ${log.interstateEndKm ?? "—"} · ${log.deliveriesDone ?? 0} deliveries`;
    }

    return `${log.localStartTime || "—"} → ${log.localEndTime || "—"} · ${log.hours ?? 0} hrs · ${log.deliveriesDone ?? 0} deliveries`;
  };

  const renderLogStats = (log) => {
    if (getLogJobType(log) === "interstate") {
      return (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1 }}>
          <StatPill icon={<SpeedIcon />} label="Start km" value={log.interstateStartKm ?? "—"} />
          <StatPill icon={<SpeedIcon />} label="End km" value={log.interstateEndKm ?? "—"} />
          <StatPill icon={<FactCheckIcon />} label="Deliveries" value={log.deliveriesDone ?? 0} />
        </Box>
      );
    }

    return (
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(4, 1fr)" }, gap: 1 }}>
        <StatPill icon={<TimerOutlinedIcon />} label="Pickup" value={log.localStartTime || "—"} />
        <StatPill icon={<TimerOutlinedIcon />} label="Finish" value={log.localEndTime || "—"} />
        <StatPill icon={<FactCheckIcon />} label="Deliveries" value={log.deliveriesDone ?? 0} />
        <StatPill icon={<TimerOutlinedIcon />} label="Hours" value={log.hours ?? 0} />
      </Box>
    );
  };

  const refreshAfterAction = async () => {
    await Promise.all([
      fetchReviewQueues(),
      fetchRecords(selectedDriver?._id || null),
    ]);
  };

  const handleApprove = async (logId) => {
    setActionId(logId);
    setError("");
    setSuccess("");
    try {
      await approveWorkLogAdmin(logId);
      setSuccess("Daily Record approved.");
      await refreshAfterAction();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to approve Daily Record");
    } finally {
      setActionId("");
    }
  };

  const handleReject = async (logId) => {
    const rejectionReason = window.prompt("Why is this Daily Record being rejected?");
    if (!rejectionReason) return;
    setActionId(logId);
    setError("");
    setSuccess("");
    try {
      await rejectWorkLogAdmin(logId, { rejectionReason });
      setSuccess("Daily Record rejected.");
      await refreshAfterAction();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reject Daily Record");
    } finally {
      setActionId("");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1180, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Chip label="Daily Records" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>Driver Records</Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Review driver hours, kilometres and delivery counts for future payroll and invoicing preparation.</Typography>
        </Paper>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.5, mb: 2.5 }}>
          <StatPill icon={<FactCheckIcon />} label="Logs this week" value={weeklySummary.count} />
          <StatPill icon={<TimerOutlinedIcon />} label="Weekly hours" value={weeklySummary.hours.toFixed(1)} />
          <StatPill icon={<SpeedIcon />} label="Weekly km" value={weeklySummary.km.toFixed(0)} />
          <StatPill icon={<FactCheckIcon />} label="Deliveries" value={weeklySummary.deliveries} />
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, mb: 2.5 }}>
          <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                <Box>
                  <Typography variant="h5" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.045em" }}>Pending record approvals</Typography>
                  <Typography variant="body2" sx={{ color: palette.muted }}>Approve driver-submitted work before payroll prep.</Typography>
                </Box>
                <Chip label={`${pendingLogs.length} pending`} sx={{ alignSelf: { xs: "flex-start", sm: "center" }, color: palette.teal, bgcolor: alpha(palette.teal, 0.1), fontWeight: 900 }} />
              </Stack>
              {reviewLoading ? (
                <Box sx={{ py: 2, textAlign: "center" }}><CircularProgress size={28} /></Box>
              ) : pendingLogs.length === 0 ? (
                <Typography sx={{ color: palette.muted }}>No Daily Records waiting for approval.</Typography>
              ) : (
                <Stack spacing={1.5}>
                  {pendingLogs.slice(0, 4).map((log) => (
                    <Paper key={log._id} elevation={0} sx={{ p: 2, borderRadius: 4, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                      <Stack spacing={1.5}>
                        <Box>
                          <Typography fontWeight={950} sx={{ color: palette.ink }}>{log.driverId?.name || "Unknown driver"} · {formatDate(log.workDate || log.date)}</Typography>
                          <Typography variant="body2" sx={{ color: palette.muted }}>{logSummary(log)}</Typography>
                        </Box>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <Button disabled={actionId === log._id} variant="contained" startIcon={<CheckCircleOutlineIcon />} onClick={() => handleApprove(log._id)} sx={{ borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>Approve</Button>
                          <Button disabled={actionId === log._id} variant="outlined" color="error" startIcon={<CancelOutlinedIcon />} onClick={() => handleReject(log._id)} sx={{ borderRadius: 3, fontWeight: 900 }}>Reject</Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                <Box>
                  <Typography variant="h5" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.045em" }}>Ready to invoice</Typography>
                  <Typography variant="body2" sx={{ color: palette.muted }}>Completed jobs with approved POD and diary.</Typography>
                </Box>
                <Chip icon={<ReceiptLongIcon />} label={`${invoiceReadyJobs.length} ready`} sx={{ alignSelf: { xs: "flex-start", sm: "center" }, color: palette.teal, bgcolor: alpha(palette.teal, 0.1), fontWeight: 900 }} />
              </Stack>
              {reviewLoading ? (
                <Box sx={{ py: 2, textAlign: "center" }}><CircularProgress size={28} /></Box>
              ) : invoiceReadyJobs.length === 0 ? (
                <Typography sx={{ color: palette.muted }}>No jobs are invoice-ready yet.</Typography>
              ) : (
                <Stack spacing={1.5}>
                  {invoiceReadyJobs.slice(0, 4).map((job) => (
                    <Paper key={job._id} elevation={0} sx={{ p: 2, borderRadius: 4, border: "1px solid", borderColor: palette.line, bgcolor: alpha("#fff", 0.74) }}>
                      <Typography fontWeight={950} sx={{ color: palette.ink }}>{job.title || "Untitled job"}</Typography>
                      <Typography variant="body2" sx={{ color: palette.muted }}>{job.pickupLocation || "Pickup"} → {job.deliveryLocation || "Delivery"}</Typography>
                      <Typography variant="body2" sx={{ color: palette.muted }}>Driver: {job.assignedTo?.name || "—"} · Truck: {job.assignedTruck?.truckNumber || "—"}</Typography>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        </Box>

        <Paper elevation={0} sx={{ p: 2, mb: 2.5, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Autocomplete
              sx={{ flex: 1 }}
              options={drivers}
              getOptionLabel={(option) => option.name || ""}
              value={selectedDriver}
              onChange={handleDriverChange}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              renderInput={(params) => <TextField {...params} label="Filter by Driver" />}
              noOptionsText="No drivers found"
            />
            <Button variant="outlined" onClick={() => { setSelectedDriver(null); fetchRecords(); }} disabled={!selectedDriver} sx={{ minHeight: 54, borderRadius: 3, fontWeight: 900 }}>
              Clear Filter
            </Button>
          </Stack>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}

        {loading ? (
          <Paper elevation={0} sx={{ p: 5, textAlign: "center", borderRadius: 5, border: "1px solid", borderColor: palette.line }}><CircularProgress /></Paper>
        ) : logs.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
            <Typography fontWeight={950}>No daily records found</Typography>
            <Typography sx={{ color: palette.muted }}>Driver-submitted records will appear here.</Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {logs.map((log) => (
              <Paper key={log._id} elevation={0} sx={{ p: 2, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography fontWeight={950} sx={{ color: palette.ink }}>{log.driverId?.name || "Unknown driver"}</Typography>
                      <Typography variant="body2" sx={{ color: palette.muted }}>{formatDate(log.date)}</Typography>
                      {getLogJob(log)?.title && (
                        <Typography variant="body2" sx={{ color: palette.muted }}>{getLogJob(log).title} · {getLogJobType(log)}</Typography>
                      )}
                    </Box>
                    {statusChip(log.status)}
                  </Stack>
                  {renderLogStats(log)}
                  {log.notes && <Chip icon={<NotesIcon />} label={log.notes} sx={{ alignSelf: "flex-start", maxWidth: "100%" }} />}
                  {log.status === "pending" && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button variant="contained" startIcon={<CheckCircleOutlineIcon />} onClick={() => handleApprove(log._id)} disabled={actionId === log._id} sx={{ borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>Approve</Button>
                      <Button variant="outlined" color="error" startIcon={<CancelOutlinedIcon />} onClick={() => handleReject(log._id)} disabled={actionId === log._id} sx={{ borderRadius: 3, fontWeight: 900 }}>Reject</Button>
                    </Stack>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default WorkLogs;
