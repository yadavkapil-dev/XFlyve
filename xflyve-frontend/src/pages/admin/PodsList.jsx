import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
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
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
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

// Pending is a temporary state that clears out regularly — realistically
// never enough records at once to need search or pagination. 100 is the
// server's hard per-request cap (see utils/pagination.js MAX_LIMIT); if
// pending ever genuinely exceeded that, this would only show the first
// 100, but that's not a realistic queue depth for this workflow.
const PENDING_FETCH_LIMIT = 100;

const todayDateInput = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Visible hint that a record opens an inline preview — the hover state
// alone (background/cursor) isn't discoverable until a mouse happens to
// pass over it, especially on touch devices with no hover at all.
const PreviewHint = () => (
  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.75, color: palette.teal }}>
    <VisibilityOutlinedIcon sx={{ fontSize: 15 }} />
    <Typography variant="caption" sx={{ fontWeight: 800 }}>Click to preview</Typography>
  </Stack>
);

const AdminPODs = () => {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [pods, setPods] = useState([]);
  const [podsPagination, setPodsPagination] = useState(null);
  const [podsPage, setPodsPage] = useState(1);
  const [podsLimit, setPodsLimit] = useState(20);
  const [podsFilterDateFrom, setPodsFilterDateFrom] = useState("");
  const [podsFilterDateTo, setPodsFilterDateTo] = useState("");

  const [pendingPods, setPendingPods] = useState([]);

  const [loading, setLoading] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadDate, setDownloadDate] = useState(todayDateInput());

  const [previewPod, setPreviewPod] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Full pending list every time — no filters, no pagination (see
  // PENDING_FETCH_LIMIT above for why a fixed high limit is enough here).
  const fetchPendingPods = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await listPendingPods({ limit: PENDING_FETCH_LIMIT });
      setPendingPods(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Server error loading pending POD approvals");
    } finally {
      setPendingLoading(false);
    }
  }, []);

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
  }, [selectedDriver, podsFilterDateFrom, podsFilterDateTo]);

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
  }, [selectedDriver, podsPage, podsLimit, podsFilterDateFrom, podsFilterDateTo]);

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
    setPodsFilterDateFrom("");
    setPodsFilterDateTo("");
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
      const res = await downloadAllPods(downloadDate);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(res.data);
      link.download = `all_pods_${downloadDate}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.response?.status === 404 ? "No approved POD files found for that date" : "Failed to download PODs");
    } finally {
      setDownloadingAll(false);
    }
  };

  // Shows the actual file inline (image or PDF) instead of triggering a
  // download — reuses the same blob-fetching endpoint handleDownload uses,
  // just points it at an <img>/<iframe> instead of an <a download>.
  const openPreview = async (pod) => {
    setPreviewPod(pod);
    setPreviewError("");
    setPreviewLoading(true);
    setPreviewUrl("");
    try {
      const blob = await getPod(pod._id);
      setPreviewType(blob.type || "application/pdf");
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setPreviewError("Failed to load POD preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewPod(null);
    setPreviewUrl("");
    setPreviewType("");
    setPreviewError("");
  };

  const previewTriggerProps = (pod) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": "Preview POD file",
    onClick: () => openPreview(pod),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPreview(pod);
      }
    },
    sx: {
      cursor: "pointer",
      borderRadius: 3,
      p: 1,
      m: -1,
      transition: "background-color 120ms ease",
      "&:hover": { bgcolor: alpha(palette.teal, 0.07) },
      "&:focus-visible": { outline: `2px solid ${alpha(palette.teal, 0.5)}`, outlineOffset: 2 },
    },
  });

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Chip label="Delivery Records" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
              <Typography variant="h4" component="h1" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>POD Records</Typography>
              <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Review proof-of-delivery uploads by driver for customer follow-up and invoice preparation.</Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ alignItems: { xs: "stretch", sm: "center" } }}>
              <TextField
                type="date"
                label="Date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={downloadDate}
                onChange={(e) => setDownloadDate(e.target.value)}
                sx={{ bgcolor: alpha("#fff", 0.95), borderRadius: 2, minWidth: { sm: 168 }, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
              <Button
                variant="contained"
                size="large"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadAll}
                disabled={downloadingAll}
                sx={{ minHeight: 54, borderRadius: 3, bgcolor: "white", color: palette.ink, fontWeight: 950, px: 2.5, whiteSpace: "nowrap", "&:hover": { bgcolor: alpha("#fff", 0.9) } }}
              >
                {downloadingAll ? "Preparing ZIP..." : "Download PODs for Date"}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}

        <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2.5, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
              <Box>
                <Typography variant="h5" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.045em" }}>Pending POD approvals</Typography>
                <Typography variant="body2" sx={{ color: palette.muted }}>Approve delivery proof before invoice preparation. Click a record to preview the file.</Typography>
              </Box>
              <Chip label={`${pendingPods.length} pending`} sx={{ alignSelf: { xs: "flex-start", sm: "center" }, color: palette.teal, bgcolor: alpha(palette.teal, 0.1), fontWeight: 900 }} />
            </Stack>
            {pendingLoading ? (
              <Box sx={{ py: 2, textAlign: "center" }}><CircularProgress size={28} /></Box>
            ) : pendingPods.length === 0 ? (
              <Typography sx={{ color: palette.muted }}>No PODs waiting for approval.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {pendingPods.map((pod) => (
                  <Paper key={pod._id} elevation={0} sx={{ p: 2, borderRadius: 4, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                      <Box {...previewTriggerProps(pod)}>
                        <Typography fontWeight={950} sx={{ color: palette.ink }}>{driverName(pod.driverId)} · {new Date(pod.uploadDate || Date.now()).toLocaleDateString()}</Typography>
                        <Typography variant="body2" sx={{ color: palette.muted }}>{pod.jobId?.title ? `Job: ${pod.jobId.title}` : "No job linked yet"} · {pod.notes || "No notes"}</Typography>
                        <PreviewHint />
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
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ p: 2, mb: 2.5, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1.4fr 1fr 1fr auto" }, gap: 1.5, alignItems: "center" }}>
            <FormControl fullWidth size="small" sx={{ gridColumn: selectedDriver ? "auto" : "1 / -1" }}>
              <InputLabel id="driver-select-label">Select Driver</InputLabel>
              <Select labelId="driver-select-label" value={selectedDriver} label="Select Driver" onChange={(e) => setSelectedDriver(e.target.value)}>
                <MenuItem value=""><em>Choose a driver</em></MenuItem>
                {drivers.map((driver) => <MenuItem key={driver._id} value={driver._id}>{driver.name}</MenuItem>)}
              </Select>
            </FormControl>
            {selectedDriver && (
              <>
                <TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={podsFilterDateFrom} onChange={(e) => setPodsFilterDateFrom(e.target.value)} />
                <TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={podsFilterDateTo} onChange={(e) => setPodsFilterDateTo(e.target.value)} />
                <Button size="small" variant="outlined" onClick={clearPodsFilters} sx={{ borderRadius: 3, fontWeight: 850 }}>Clear</Button>
              </>
            )}
          </Box>
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
                  <Stack direction="row" spacing={1.5} alignItems="flex-start" {...previewTriggerProps(pod)}>
                    <Box sx={{ width: 46, height: 46, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.09), flexShrink: 0 }}><PictureAsPdfIcon /></Box>
                    <Box>
                      <Typography fontWeight={950} sx={{ color: palette.ink }}>{new Date(pod.uploadDate || Date.now()).toLocaleDateString()}</Typography>
                      <Typography variant="body2" sx={{ color: palette.muted }}>Driver: {driverName(pod.driverId)}</Typography>
                      <Box sx={{ mt: 1 }}>{statusChip(pod.status)}</Box>
                      <Typography variant="body2" sx={{ color: palette.muted, mt: 0.5 }}>{pod.notes || "No notes added."}</Typography>
                      <PreviewHint />
                    </Box>
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ minWidth: { sm: 220 } }}>
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

        <Dialog open={Boolean(previewPod)} onClose={closePreview} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 950 }}>
            POD Preview
            <IconButton aria-label="close preview" onClick={closePreview}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {previewLoading ? (
              <Box sx={{ py: 5, textAlign: "center" }}><CircularProgress /></Box>
            ) : previewError ? (
              <Alert severity="error">{previewError}</Alert>
            ) : previewType.startsWith("image/") ? (
              <Box component="img" src={previewUrl} alt="POD preview" sx={{ width: "100%", height: "auto", display: "block" }} />
            ) : (
              <Box component="iframe" src={previewUrl} title="POD preview" sx={{ width: "100%", height: "70vh", border: "none" }} />
            )}
          </DialogContent>
        </Dialog>
      </Box>
    </Box>
  );
};

export default AdminPODs;
