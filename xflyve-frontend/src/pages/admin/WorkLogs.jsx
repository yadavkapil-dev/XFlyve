import React, { useCallback, useEffect, useState } from "react";
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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import NotesIcon from "@mui/icons-material/Notes";
import SpeedIcon from "@mui/icons-material/Speed";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import {
  getAllWorkLogsAdmin,
  getWorkLogsByDriverAdmin,
  getAllDrivers,
  getWeeklyWorkLogStatsAdmin,
  deleteWorkLog,
} from "../../api";
import PaginationControls from "../../components/PaginationControls";

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
  const [logsPagination, setLogsPagination] = useState(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLimit, setLogsLimit] = useState(20);
  const [logsFilterDateFrom, setLogsFilterDateFrom] = useState("");
  const [logsFilterDateTo, setLogsFilterDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);

  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const res = await getAllDrivers({ limit: 100 });
        if (res.data.status === "success") setDrivers(res.data.data || []);
        else setError("Failed to fetch drivers");
      } catch {
        setError("Server error fetching drivers");
      }
    };
    fetchDrivers();
  }, []);

  // Reset to page 1 whenever a filter changes (driver, date range).
  useEffect(() => {
    setLogsPage(1);
  }, [selectedDriver, logsFilterDateFrom, logsFilterDateTo]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const driverId = selectedDriver?._id || null;
      const params = { page: logsPage, limit: logsLimit };
      if (logsFilterDateFrom) params.dateFrom = logsFilterDateFrom;
      if (logsFilterDateTo) params.dateTo = logsFilterDateTo;

      const res = driverId ? await getWorkLogsByDriverAdmin(driverId, params) : await getAllWorkLogsAdmin(params);
      if (res.data.success) {
        setLogs(res.data.data || []);
        setLogsPagination(res.data.pagination || null);
      } else {
        setError(res.data.message || "Failed to fetch daily records");
        setLogs([]);
        setLogsPagination(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Server error fetching daily records");
      setLogs([]);
      setLogsPagination(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDriver, logsPage, logsLimit, logsFilterDateFrom, logsFilterDateTo]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const clearLogsFilters = () => {
    setSelectedDriver(null);
    setLogsFilterDateFrom("");
    setLogsFilterDateTo("");
  };

  // Server-side aggregate over the whole week's logs (scoped to the selected
  // driver, if any) — not the currently-loaded page of `logs`, which is
  // capped at `logsLimit` and would silently undercount once a driver has
  // more logs this week than fit on one page.
  const [weeklySummary, setWeeklySummary] = useState({ count: 0, hours: 0, km: 0, deliveries: 0 });

  const fetchWeeklySummary = useCallback(async () => {
    try {
      const params = {};
      if (selectedDriver?._id) params.driverId = selectedDriver._id;
      const res = await getWeeklyWorkLogStatsAdmin(params);
      const data = res.data.data || {};
      setWeeklySummary({
        count: data.weeklyLogs || 0,
        hours: data.weeklyHours || 0,
        km: data.weeklyKilometres || 0,
        deliveries: data.weeklyDeliveries || 0,
      });
    } catch {
      setError((prev) => prev || "Weekly summary could not be loaded.");
    }
  }, [selectedDriver]);

  useEffect(() => {
    fetchWeeklySummary();
  }, [fetchWeeklySummary]);

  const handleDriverChange = (event, newValue) => {
    setSelectedDriver(newValue);
  };

  const handleDelete = async (logId) => {
    if (!window.confirm("Delete this daily record?")) return;
    setError("");
    try {
      await deleteWorkLog(logId);
      setSuccess("Daily record deleted.");
      await fetchRecords();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete daily record");
    }
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

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1180, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Chip label="Daily Records" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>Driver Records</Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Review driver hours, kilometres and delivery counts for payroll and invoicing preparation.</Typography>
        </Paper>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.5, mb: 2.5 }}>
          <StatPill icon={<FactCheckIcon />} label="Logs this week" value={weeklySummary.count} />
          <StatPill icon={<TimerOutlinedIcon />} label="Weekly hours" value={weeklySummary.hours.toFixed(1)} />
          <StatPill icon={<SpeedIcon />} label="Weekly km" value={weeklySummary.km.toFixed(0)} />
          <StatPill icon={<FactCheckIcon />} label="Deliveries" value={weeklySummary.deliveries} />
        </Box>

        <Paper elevation={0} sx={{ p: 2, mb: 2.5, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1.4fr 1fr 1fr auto" }, gap: 1.5, alignItems: "center" }}>
            <Autocomplete
              size="small"
              options={drivers}
              getOptionLabel={(option) => option.name || ""}
              value={selectedDriver}
              onChange={handleDriverChange}
              isOptionEqualToValue={(option, value) => option._id === value._id}
              renderInput={(params) => <TextField {...params} label="Filter by Driver" />}
              noOptionsText="No drivers found"
            />
            <TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={logsFilterDateFrom} onChange={(e) => setLogsFilterDateFrom(e.target.value)} />
            <TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={logsFilterDateTo} onChange={(e) => setLogsFilterDateTo(e.target.value)} />
            <Button size="small" variant="outlined" onClick={clearLogsFilters} sx={{ borderRadius: 3, fontWeight: 850 }}>Clear</Button>
          </Box>
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
                  <Box>
                    <Typography fontWeight={950} sx={{ color: palette.ink }}>{log.driverId?.name || "Unknown driver"}</Typography>
                    <Typography variant="body2" sx={{ color: palette.muted }}>{formatDate(log.date)}</Typography>
                    {getLogJob(log)?.title && (
                      <Typography variant="body2" sx={{ color: palette.muted }}>{getLogJob(log).title} · {getLogJobType(log)}</Typography>
                    )}
                  </Box>
                  {renderLogStats(log)}
                  {log.notes && <Chip icon={<NotesIcon />} label={log.notes} sx={{ alignSelf: "flex-start", maxWidth: "100%" }} />}
                  <Stack direction="row" justifyContent="flex-end">
                    <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(log._id)} sx={{ borderRadius: 3, fontWeight: 900 }}>
                      Delete
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

        <PaginationControls
          pagination={logsPagination}
          onPageChange={setLogsPage}
          onLimitChange={(newLimit) => { setLogsLimit(newLimit); setLogsPage(1); }}
          palette={palette}
        />
      </Box>
    </Box>
  );
};

export default WorkLogs;
