import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { getAllDrivers, listPodsByDriver, deletePod, getPod, listPendingPods, approvePod, rejectPod, downloadAllPods } from "../../api";
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

const AdminPODs = () => {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [pods, setPods] = useState([]);
  const [podsPagination, setPodsPagination] = useState(null);
  const [podsPage, setPodsPage] = useState(1);
  const [podsLimit, setPodsLimit] = useState(20);
  const [podsFilterStatus, setPodsFilterStatus] = useState("");
  const [podsFilterDateFrom, setPodsFilterDateFrom] = useState("");
  const [podsFilterDateTo, setPodsFilterDateTo] = useState("");

  const [pendingPods, setPendingPods] = useState([]);
  const [pendingPagination, setPendingPagination] = useState(null);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingLimit, setPendingLimit] = useState(20);
  const [pendingFilterDriver, setPendingFilterDriver] = useState("");
  const [pendingFilterDateFrom, setPendingFilterDateFrom] = useState("");
  const [pendingFilterDateTo, setPendingFilterDateTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);

  // Reset to page 1 whenever a pending-queue filter changes.
  useEffect(() => {
    setPendingPage(1);
  }, [pendingFilterDriver, pendingFilterDateFrom, pendingFilterDateTo]);

  const fetchPendingPods = useCallback(async () => {
    setPendingLoading(true);
    try {
      const params = { page: pendingPage, limit: pendingLimit };
      if (pendingFilterDriver) params.driverId = pendingFilterDriver;
      if (pendingFilterDateFrom) params.dateFrom = pendingFilterDateFrom;
      if (pendingFilterDateTo) params.dateTo = pendingFilterDateTo;
      const res = await listPendingPods(params);
      setPendingPods(res.data);
      setPendingPagination(res.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || "Server error loading pending POD approvals");
    } finally {
      setPendingLoading(false);
    }
  }, [pendingPage, pendingLimit, pendingFilterDriver, pendingFilterDateFrom, pendingFilterDateTo]);

  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const res = await getAllDrivers({ limit: 100 });
        if (res.data.status === "success") setDrivers(res.data.data || []);
        else setError("Failed to load drivers");
      } catch (err) {
        setError(err.response?.data?.message || "Server error loading drivers");
      }
    };
    fetchDrivers();
  }, []);

  useEffect(() => {
    fetchPendingPods();
  }, [fetchPendingPods]);

  // Reset to page 1 whenever a by-driver filter changes (or the driver itself changes).
  useEffect(() => {
    setPodsPage(1);
  }, [selectedDriver, podsFilterStatus, podsFilterDateFrom, podsFilterDateTo]);

  const fetchPods = useCallback(async () => {
    setError("");
    // Not clearing success here: handleApprove/handleReject/handleDelete
    // set a success message and then call this (directly or via
    // refreshPods) to refresh the lists — clearing it here wiped the
    // confirmation before the user ever saw it. Each action already resets
    // success at its own start, so a stale message never lingers past the
    // next action.
    if (!selectedDriver) {
      setPods([]);
      setPodsPagination(null);
      return;
    }
    setLoading(true);
    try {
      const params = { page: podsPage, limit: podsLimit };
      if (podsFilterStatus) params.status = podsFilterStatus;
      if (podsFilterDateFrom) params.dateFrom = podsFilterDateFrom;
      if (podsFilterDateTo) params.dateTo = podsFilterDateTo;
      const res = await listPodsByDriver(selectedDriver, params);
      setPods(res.data);
      setPodsPagination(res.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || "Server error fetching PODs");
    } finally {
      setLoading(false);
    }
  }, [selectedDriver, podsPage, podsLimit, podsFilterStatus, podsFilterDateFrom, podsFilterDateTo]);

  useEffect(() => {
    fetchPods();
  }, [fetchPods]);

  const driverName = (driver) => {
    if (driver?.name) return driver.name;
    return drivers.find((d) => d._id === driver)?.name || "Driver";
  };

  const statusChip = (status = "pending") => {
    const color = status === "approved" ? "#07866f" : status === "rejected" ? "#b42318" : "#b76e00";
    return <Chip label={status} sx={{ color, bgcolor: alpha(color, 0.1), fontWeight: 900, textTransform: "capitalize" }} />;
  };

  const clearPodsFilters = () => {
    setPodsFilterStatus("");
    setPodsFilterDateFrom("");
    setPodsFilterDateTo("");
  };

  const clearPendingFilters = () => {
    setPendingFilterDriver("");
    setPendingFilterDateFrom("");
    setPendingFilterDateTo("");
  };

  const refreshPods = async () => {
    await fetchPendingPods();
    await fetchPods();
  };

  const handleApprove = async (podId) => {
    setActionId(podId);
    setError("");
    setSuccess("");
    try {
      await approvePod(podId);
      setSuccess("POD approved.");
      await refreshPods();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to approve POD");
    } finally {
      setActionId("");
    }
  };

  const handleReject = async (podId) => {
    const rejectionReason = window.prompt("Why is this POD being rejected?");
    if (!rejectionReason) return;
    setActionId(podId);
    setError("");
    setSuccess("");
    try {
      await rejectPod(podId, { rejectionReason });
      setSuccess("POD rejected.");
      await refreshPods();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reject POD");
    } finally {
      setActionId("");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this POD record?")) return;
    try {
      await deletePod(id);
      setSuccess("POD deleted.");
      await fetchPods();
    } catch {
      setError("Failed to delete POD");
    }
  };

  const handleDownload = async (pod) => {
    try {
      const blob = await getPod(pod._id);
      const dateStr = new Date(pod.uploadDate || Date.now()).toISOString().slice(0, 10);
      const filename = `POD-${driverName(pod.driverId).replace(/\s+/g, "_")}-${dateStr}.pdf`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      setError("Failed to download POD");
    }
  };

  const handleDownloadAll = async () => {
    setError("");
    setSuccess("");
    setDownloadingAll(true);
    try {
      const res = await downloadAllPods();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(res.data);
      link.download = "all_pods.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.response?.status === 404 ? "No POD files found to download" : "Failed to download all PODs");
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Chip label="Delivery Records" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
              <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>POD Records</Typography>
              <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Review proof-of-delivery uploads by driver for customer follow-up and invoice preparation.</Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadAll}
              disabled={downloadingAll}
              sx={{ minHeight: 54, borderRadius: 3, bgcolor: "white", color: palette.ink, fontWeight: 950, px: 2.5, alignSelf: { xs: "stretch", sm: "flex-start" }, "&:hover": { bgcolor: alpha("#fff", 0.9) } }}
            >
              {downloadingAll ? "Preparing ZIP..." : "Download All"}
            </Button>
          </Stack>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}

        <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2.5, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
              <Box>
                <Typography variant="h5" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.045em" }}>Pending POD approvals</Typography>
                <Typography variant="body2" sx={{ color: palette.muted }}>Approve delivery proof before invoice preparation.</Typography>
              </Box>
              <Chip label={`${pendingPagination?.total ?? pendingPods.length} pending`} sx={{ alignSelf: { xs: "flex-start", sm: "center" }, color: palette.teal, bgcolor: alpha(palette.teal, 0.1), fontWeight: 900 }} />
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr auto" }, gap: 1.5, alignItems: "center" }}>
              <TextField select fullWidth size="small" label="Filter by driver" value={pendingFilterDriver} onChange={(e) => setPendingFilterDriver(e.target.value)}>
                <MenuItem value="">All Drivers</MenuItem>
                {drivers.map((d) => <MenuItem key={d._id} value={d._id}>{d.name}</MenuItem>)}
              </TextField>
              <TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={pendingFilterDateFrom} onChange={(e) => setPendingFilterDateFrom(e.target.value)} />
              <TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={pendingFilterDateTo} onChange={(e) => setPendingFilterDateTo(e.target.value)} />
              <Button size="small" variant="outlined" onClick={clearPendingFilters} sx={{ borderRadius: 3, fontWeight: 850 }}>Clear</Button>
            </Box>
            {pendingLoading ? (
              <Box sx={{ py: 2, textAlign: "center" }}><CircularProgress size={28} /></Box>
            ) : pendingPods.length === 0 ? (
              <Typography sx={{ color: palette.muted }}>No PODs waiting for approval.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {pendingPods.map((pod) => (
                  <Paper key={pod._id} elevation={0} sx={{ p: 2, borderRadius: 4, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                      <Box>
                        <Typography fontWeight={950} sx={{ color: palette.ink }}>{driverName(pod.driverId)} · {new Date(pod.uploadDate || Date.now()).toLocaleDateString()}</Typography>
                        <Typography variant="body2" sx={{ color: palette.muted }}>{pod.jobId?.title ? `Job: ${pod.jobId.title}` : "No job linked yet"} · {pod.notes || "No notes"}</Typography>
                      </Box>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button disabled={actionId === pod._id} variant="contained" startIcon={<CheckCircleOutlineIcon />} onClick={() => handleApprove(pod._id)} sx={{ borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>Approve</Button>
                        <Button disabled={actionId === pod._id} variant="outlined" color="error" startIcon={<CancelOutlinedIcon />} onClick={() => handleReject(pod._id)} sx={{ borderRadius: 3, fontWeight: 900 }}>Reject</Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
            <PaginationControls
              pagination={pendingPagination}
              onPageChange={setPendingPage}
              onLimitChange={(newLimit) => { setPendingLimit(newLimit); setPendingPage(1); }}
              palette={palette}
            />
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ p: 2, mb: 2.5, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
          <Stack spacing={1.5}>
            <FormControl fullWidth>
              <InputLabel id="driver-select-label">Select Driver</InputLabel>
              <Select labelId="driver-select-label" value={selectedDriver} label="Select Driver" onChange={(e) => setSelectedDriver(e.target.value)}>
                <MenuItem value=""><em>Choose a driver</em></MenuItem>
                {drivers.map((driver) => <MenuItem key={driver._id} value={driver._id}>{driver.name} ({driver.email})</MenuItem>)}
              </Select>
            </FormControl>
            {selectedDriver && (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr auto" }, gap: 1.5, alignItems: "center" }}>
                <TextField select fullWidth size="small" label="Status" value={podsFilterStatus} onChange={(e) => setPodsFilterStatus(e.target.value)}>
                  <MenuItem value="">All Statuses</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="approved">Approved</MenuItem>
                  <MenuItem value="rejected">Rejected</MenuItem>
                </TextField>
                <TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={podsFilterDateFrom} onChange={(e) => setPodsFilterDateFrom(e.target.value)} />
                <TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={podsFilterDateTo} onChange={(e) => setPodsFilterDateTo(e.target.value)} />
                <Button size="small" variant="outlined" onClick={clearPodsFilters} sx={{ borderRadius: 3, fontWeight: 850 }}>Clear</Button>
              </Box>
            )}
          </Stack>
        </Paper>

        {loading ? (
          <Paper elevation={0} sx={{ p: 5, textAlign: "center", borderRadius: 5, border: "1px solid", borderColor: palette.line }}><CircularProgress /></Paper>
        ) : !selectedDriver ? (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
            <Typography fontWeight={950}>Select a driver</Typography>
            <Typography sx={{ color: palette.muted }}>PODs are currently stored by driver, not by job.</Typography>
          </Paper>
        ) : pods.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
            <Typography fontWeight={950}>No PODs found</Typography>
            <Typography sx={{ color: palette.muted }}>This driver has not uploaded delivery proof yet.</Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {pods.map((pod) => (
              <Paper key={pod._id} elevation={0} sx={{ p: 2, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Box sx={{ width: 46, height: 46, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.09), flexShrink: 0 }}><PictureAsPdfIcon /></Box>
                    <Box>
                      <Typography fontWeight={950} sx={{ color: palette.ink }}>{new Date(pod.uploadDate || Date.now()).toLocaleDateString()}</Typography>
                      <Typography variant="body2" sx={{ color: palette.muted }}>Driver: {driverName(pod.driverId)}</Typography>
                      <Box sx={{ mt: 1 }}>{statusChip(pod.status)}</Box>
                      <Typography variant="body2" sx={{ color: palette.muted, mt: 0.5 }}>{pod.notes || "No notes added."}</Typography>
                    </Box>
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ minWidth: { sm: 220 } }}>
                    {pod.status === "pending" && <Button fullWidth variant="contained" startIcon={<CheckCircleOutlineIcon />} onClick={() => handleApprove(pod._id)} disabled={actionId === pod._id} sx={{ borderRadius: 3, bgcolor: palette.teal, fontWeight: 900 }}>Approve</Button>}
                    {pod.status === "pending" && <Button fullWidth variant="outlined" color="warning" startIcon={<CancelOutlinedIcon />} onClick={() => handleReject(pod._id)} disabled={actionId === pod._id} sx={{ borderRadius: 3, fontWeight: 900 }}>Reject</Button>}
                    <Button fullWidth variant="contained" startIcon={<DownloadIcon />} onClick={() => handleDownload(pod)} sx={{ borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>Download</Button>
                    <Button fullWidth variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => handleDelete(pod._id)} sx={{ borderRadius: 3, fontWeight: 900 }}>Delete</Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

        {selectedDriver && (
          <PaginationControls
            pagination={podsPagination}
            onPageChange={setPodsPage}
            onLimitChange={(newLimit) => { setPodsLimit(newLimit); setPodsPage(1); }}
            palette={palette}
          />
        )}
      </Box>
    </Box>
  );
};

export default AdminPODs;
