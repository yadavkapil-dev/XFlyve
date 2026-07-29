import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
  CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Delete, Edit, Save, Cancel } from "@mui/icons-material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { uploadPod, listPodsByDriver, deletePod, updatePodNotes } from "../../api";

const palette = {
  ink: "#0b1220",
  muted: "#697586",
  line: "rgba(15, 23, 42, 0.075)",
  panel: "rgba(255, 255, 255, 0.88)",
  heroStart: "#050b18",
  heroMid: "#0b2f3a",
  heroEnd: "#0c5f5b",
  teal: "#0e7c76",
  emerald: "#07866f",
  amber: "#b76e00",
  rose: "#b42318",
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown job date";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
};

const getStatusMeta = (status = "pending") => {
  if (status === "approved") return { label: "Approved", color: palette.emerald };
  if (status === "rejected") return { label: "Rejected", color: palette.rose };
  return { label: "Pending approval", color: palette.amber };
};

const toLocalDateKey = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-CA");
};

// Groups records by local calendar date (using the same "uploaded"
// timestamp already shown on each card), most recent date first — same
// approach reused identically on the Work Diary history page.
const groupByDate = (records, getDate) => {
  const groups = new Map();

  records.forEach((record) => {
    const key = toLocalDateKey(getDate(record)) || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return a < b ? 1 : -1;
    })
    .map(([key, items]) => ({
      key,
      label: key === "unknown" ? "Unknown date" : formatDate(getDate(items[0])),
      items: [...items].sort((a, b) => new Date(getDate(b)) - new Date(getDate(a))),
    }));
};

const DriverPOD = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: routeJobId } = useParams();
  const driverId = user?._id || user?.id;

  const [pods, setPods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [editId, setEditId] = useState(null);
  const [editNotes, setEditNotes] = useState("");
  const hasPODForRoute = Boolean(routeJobId) && pods.some(
    (pod) => normalizeId(pod.jobId) === normalizeId(routeJobId)
  );

  const fetchPods = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    setError("");
    try {
      const res = await listPodsByDriver(driverId, { limit: 100 });
      setPods(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load PODs");
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    fetchPods();
  }, [fetchPods]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!routeJobId) {
      return setError("To upload a POD, open the job from View All Jobs.");
    }
    if (!file) return setError("Please select a PDF file to upload.");
    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("podFile", file);
    formData.append("driverId", driverId);
    formData.append("notes", notes);
    if (routeJobId) formData.append("jobId", routeJobId);

    try {
      await uploadPod(formData);
      setFile(null);
      setNotes("");
      await fetchPods();
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this POD upload?")) return;
    try {
      await deletePod(id);
      setPods((prev) => prev.filter((pod) => pod._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete POD");
    }
  };

  const saveEdit = async (id) => {
    try {
      const updated = await updatePodNotes(id, { notes: editNotes });
      setPods((prev) => prev.map((pod) => (
        pod._id === id
          ? {
              ...pod,
              notes: updated.notes,
              status: updated.status,
              rejectionReason: updated.rejectionReason,
            }
          : pod
      )));
      setEditId(null);
      setEditNotes("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update notes");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: { xs: 4, sm: 6 }, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 960, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Chip label="Proof of delivery" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>
            {routeJobId ? "Upload POD" : "POD History"}
          </Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>
            {routeJobId
              ? "Upload delivery proof for owner records and invoice preparation."
              : "Review your recent proof-of-delivery records."}
          </Typography>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {routeJobId && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
            This POD will be linked to the selected job.
          </Alert>
        )}
        {!routeJobId && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
            To upload a POD, open the job from View All Jobs.
          </Alert>
        )}

        {routeJobId && (
          <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, mb: 3, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
            <form onSubmit={handleUpload}>
              <Stack spacing={2}>
                <Box sx={{ p: 2, borderRadius: 4, border: "1px dashed", borderColor: alpha(palette.teal, 0.32), bgcolor: alpha(palette.teal, 0.055) }}>
                  <Stack spacing={1}>
                    <Box sx={{ width: 48, height: 48, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.1) }}>
                      <UploadFileIcon />
                    </Box>
                    <Typography fontWeight={950} sx={{ color: palette.ink }}>Select POD PDF</Typography>
                    <Typography variant="body2" sx={{ color: palette.muted }}>
                      {hasPODForRoute
                        ? "Upload a new or replacement proof-of-delivery document for this job."
                        : "Choose the proof-of-delivery document from your phone."}
                    </Typography>
                    <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
                    {file && <Chip icon={<PictureAsPdfIcon />} label={file.name} sx={{ alignSelf: "flex-start" }} />}
                  </Stack>
                </Box>
                <TextField label="Notes (optional)" fullWidth multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add delivery notes if needed" />
                <Button variant="contained" size="large" type="submit" disabled={uploading} startIcon={<UploadFileIcon />} sx={{ minHeight: 56, borderRadius: 3, bgcolor: palette.ink, fontWeight: 950 }}>
                  {uploading ? "Uploading..." : hasPODForRoute ? "Upload New / Replacement POD" : "Upload POD"}
                </Button>
              </Stack>
            </form>
          </Paper>
        )}

        <Typography variant="h5" fontWeight={950} sx={{ mb: 1.75, color: palette.ink, letterSpacing: "-0.045em" }}>Recent POD uploads</Typography>
        {loading ? (
          <Paper elevation={0} sx={{ p: 5, textAlign: "center", borderRadius: 5, border: "1px solid", borderColor: palette.line }}><CircularProgress /></Paper>
        ) : pods.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
            <Typography fontWeight={900}>No POD uploads yet</Typography>
            <Typography sx={{ mt: 0.5, color: palette.muted }}>Uploaded proof of delivery documents will appear here.</Typography>
          </Paper>
        ) : (
          <Stack spacing={3}>
            {groupByDate(pods, (pod) => pod.uploadDate || pod.createdAt).map((group) => (
              <Box key={group.key}>
                <Typography variant="overline" sx={{ color: palette.muted, fontWeight: 900, letterSpacing: "0.08em" }}>
                  {group.label}
                </Typography>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  {group.items.map((pod) => {
                    const job = pod.jobId && typeof pod.jobId === "object" ? pod.jobId : null;
                    const deliveryLocation = job?.deliveryLocation || job?.dropoffLocation;
                    const statusMeta = getStatusMeta(pod.status);
                    const isApproved = pod.status === "approved";

                    return (
                      <Paper key={pod._id} elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={1.5} alignItems="flex-start">
                            <Box sx={{ width: 46, height: 46, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.09), flexShrink: 0 }}>
                              <Inventory2OutlinedIcon />
                            </Box>
                            <Box flex={1} minWidth={0}>
                              <Typography fontWeight={950} sx={{ color: palette.ink }}>
                                {job ? formatDate(job.jobDate) : "Unlinked POD"}
                              </Typography>
                              {job ? (
                                <>
                                  {job.jobNumber && (
                                    <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>
                                      Job {job.jobNumber}
                                    </Typography>
                                  )}
                                  <Typography variant="body2" fontWeight={850} sx={{ mt: 0.5, color: palette.ink }}>
                                    {job.pickupLocation || "Unknown pickup"} → {deliveryLocation || "Unknown delivery"}
                                  </Typography>
                                  <Typography variant="body2" sx={{ mt: 0.5, color: palette.muted, lineHeight: 1.5 }}>
                                    {job.description || "No job description."}
                                  </Typography>
                                </>
                              ) : (
                                <Typography variant="body2" sx={{ mt: 0.5, color: palette.muted }}>
                                  Uploaded before job-linking
                                </Typography>
                              )}
                            </Box>
                            <Chip
                              size="small"
                              label={isApproved ? "Approved by admin — locked" : statusMeta.label}
                              sx={{ color: statusMeta.color, bgcolor: alpha(statusMeta.color, 0.1), fontWeight: 900 }}
                            />
                          </Stack>

                          <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(palette.teal, 0.045), border: "1px solid", borderColor: palette.line }}>
                            <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>POD uploaded</Typography>
                            <Typography variant="body2" fontWeight={850} sx={{ color: palette.ink }}>
                              {formatDateTime(pod.uploadDate || pod.createdAt)}
                            </Typography>
                          </Box>

                          {editId === pod._id ? (
                            <TextField multiline rows={2} fullWidth label="Notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                          ) : (
                            <Box>
                              <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>Notes</Typography>
                              <Typography variant="body2" sx={{ mt: 0.25, color: palette.ink }}>{pod.notes || "No notes added."}</Typography>
                            </Box>
                          )}

                          {!isApproved && job && (
                            <Button
                              fullWidth
                              variant="outlined"
                              startIcon={<UploadFileIcon />}
                              onClick={() => navigate(`/driver/pods/upload/${job._id}`)}
                              sx={{ minHeight: 46, borderRadius: 3, fontWeight: 900 }}
                            >
                              Edit / Replace POD
                            </Button>
                          )}

                          {!isApproved && (
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              {editId === pod._id ? (
                                <>
                                  <IconButton aria-label="save POD notes" onClick={() => saveEdit(pod._id)}><Save /></IconButton>
                                  <IconButton aria-label="cancel editing POD notes" color="error" onClick={() => setEditId(null)}><Cancel /></IconButton>
                                </>
                              ) : (
                                <>
                                  <IconButton aria-label="edit POD notes" onClick={() => { setEditId(pod._id); setEditNotes(pod.notes || ""); }}><Edit /></IconButton>
                                  <IconButton aria-label="delete POD" color="error" onClick={() => handleDelete(pod._id)}><Delete /></IconButton>
                                </>
                              )}
                            </Stack>
                          )}
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default DriverPOD;
