import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationContext";
import {
  uploadWorkDiary,
  listWorkDiariesByDriver,
  deleteWorkDiary,
  updateWorkDiaryNotes,
} from "../../api";

// Real-time event types that mean "this page's data is now stale" — an
// admin approving/rejecting a diary while this page is open.
// diary_submitted isn't included: that notifies admins, not the driver.
const RELEVANT_DIARY_EVENTS = ["diary_approved", "diary_rejected"];

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

const formatDate = (value, fallback = "Not recorded") => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return fallback;
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
// approach reused identically on the POD history page.
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

const WorkDiary = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id: routeJobId } = useParams();
  const driverId = user?._id || user?.id;
  const { lastEvent } = useNotifications();

  const [workDiaries, setWorkDiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [editId, setEditId] = useState(null);
  const [editNotes, setEditNotes] = useState("");
  const hasDiaryForRoute = Boolean(routeJobId) && workDiaries.some(
    (diary) => normalizeId(diary.jobId) === normalizeId(routeJobId)
  );

  const fetchWorkDiaries = useCallback(async () => {
    if (!driverId) return;
    setLoading(true);
    setError("");
    try {
      const res = await listWorkDiariesByDriver(driverId, { limit: 100 });
      setWorkDiaries(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load work diaries");
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    fetchWorkDiaries();
  }, [fetchWorkDiaries]);

  // Admin approves/rejects a diary while this page happens to be open —
  // re-run the exact same fetch this page already uses on mount, so the
  // status/lock state here never needs a manual refresh to catch up.
  useEffect(() => {
    if (!lastEvent) return;
    if (RELEVANT_DIARY_EVENTS.includes(lastEvent.type)) {
      fetchWorkDiaries();
    }
  }, [lastEvent, fetchWorkDiaries]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!routeJobId) {
      return setError("To upload work diary pages, open an interstate job from View All Jobs.");
    }
    if (!file) return setError("Please select a PDF file to upload.");
    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("workDiaryFile", file);
    formData.append("driverId", driverId);
    formData.append("notes", notes);
    if (routeJobId) formData.append("jobId", routeJobId);

    try {
      await uploadWorkDiary(formData);
      setFile(null);
      setNotes("");
      await fetchWorkDiaries();
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this work diary upload?")) return;
    try {
      await deleteWorkDiary(id);
      setWorkDiaries((prev) => prev.filter((diary) => diary._id !== id));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete work diary");
    }
  };

  const saveEdit = async (id) => {
    try {
      const updated = await updateWorkDiaryNotes(id, { notes: editNotes });
      setWorkDiaries((prev) =>
        prev.map((diary) => (
          diary._id === id
            ? {
                ...diary,
                notes: updated.notes,
                status: updated.status,
                rejectionReason: updated.rejectionReason,
              }
            : diary
        ))
      );
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
          <Chip label="Compliance document" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>
            {routeJobId ? "Upload Work Diary Pages" : "Work Diary History"}
          </Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>
            {routeJobId
              ? "Upload diary or compliance pages for the selected interstate job."
              : "Review and manage your recent diary and compliance records."}
          </Typography>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {routeJobId && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
            This work diary will be linked to the selected interstate job.
          </Alert>
        )}
        {!routeJobId && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
            To upload work diary pages, open an interstate job from View All Jobs.
          </Alert>
        )}

        {routeJobId && (
          <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, mb: 3, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
            <form onSubmit={handleUpload}>
              <Stack spacing={2}>
                <Box sx={{ p: 2, borderRadius: 4, border: "1px dashed", borderColor: alpha(palette.teal, 0.32), bgcolor: alpha(palette.teal, 0.055) }}>
                  <Stack spacing={1}>
                    <Box sx={{ width: 48, height: 48, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.1) }}>
                      <DescriptionOutlinedIcon />
                    </Box>
                    <Typography fontWeight={950} sx={{ color: palette.ink }}>Select diary/compliance PDF</Typography>
                    <Typography variant="body2" sx={{ color: palette.muted }}>
                      {hasDiaryForRoute
                        ? "Add another diary or compliance document for this job."
                        : "Choose the work diary or compliance document from your phone."}
                    </Typography>
                    <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
                    {file && <Chip icon={<PictureAsPdfIcon />} label={file.name} sx={{ alignSelf: "flex-start" }} />}
                  </Stack>
                </Box>
                <TextField label="Notes (optional)" fullWidth multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add diary notes if needed" />
                <Button variant="contained" size="large" type="submit" disabled={uploading} startIcon={<UploadFileIcon />} sx={{ minHeight: 56, borderRadius: 3, bgcolor: palette.ink, fontWeight: 950 }}>
                  {uploading ? "Uploading..." : hasDiaryForRoute ? "Upload Additional Diary Pages" : "Upload Work Diary Pages"}
                </Button>
              </Stack>
            </form>
          </Paper>
        )}

        <Typography variant="h5" fontWeight={950} sx={{ mb: 1.75, color: palette.ink, letterSpacing: "-0.045em" }}>Recent diary uploads</Typography>
        {loading ? (
          <Paper elevation={0} sx={{ p: 5, textAlign: "center", borderRadius: 5, border: "1px solid", borderColor: palette.line }}><CircularProgress /></Paper>
        ) : workDiaries.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
            <Typography fontWeight={900}>No diary uploads yet</Typography>
            <Typography sx={{ mt: 0.5, color: palette.muted }}>Uploaded work diary documents will appear here.</Typography>
          </Paper>
        ) : (
          <Stack spacing={3}>
            {groupByDate(workDiaries, (diary) => diary.uploadDate || diary.createdAt).map((group) => (
              <Box key={group.key}>
                <Typography variant="overline" sx={{ color: palette.muted, fontWeight: 900, letterSpacing: "0.08em" }}>
                  {group.label}
                </Typography>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  {group.items.map((diary) => {
                    const job = diary.jobId && typeof diary.jobId === "object" ? diary.jobId : null;
                    const deliveryLocation = job?.deliveryLocation || job?.dropoffLocation;
                    const truck = diary.truckId && typeof diary.truckId === "object"
                      ? diary.truckId
                      : job?.assignedTruck && typeof job.assignedTruck === "object"
                        ? job.assignedTruck
                        : null;
                    const truckLabel = truck?.truckNumber || truck?.name || "Not available";
                    const statusMeta = getStatusMeta(diary.status);
                    const isApproved = diary.status === "approved";

                    return (
                      <Paper key={diary._id} elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={1.5} alignItems="flex-start">
                            <Box sx={{ width: 46, height: 46, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.09), flexShrink: 0 }}>
                              <DescriptionOutlinedIcon />
                            </Box>
                            <Box flex={1} minWidth={0}>
                              <Typography fontWeight={950} sx={{ color: palette.ink }}>
                                {job ? formatDate(job.jobDate, "Unknown job date") : "Unlinked Work Diary"}
                              </Typography>
                              {job ? (
                                <>
                                  <Typography variant="body2" fontWeight={850} sx={{ mt: 0.5, color: palette.ink }}>
                                    {job.pickupLocation || "Unknown pickup"} → {deliveryLocation || "Unknown delivery"}
                                  </Typography>
                                  <Typography variant="body2" sx={{ mt: 0.5, color: palette.muted, lineHeight: 1.5 }}>
                                    {job.description || "No job description available."}
                                  </Typography>
                                </>
                              ) : (
                                <Typography variant="body2" sx={{ mt: 0.5, color: palette.muted }}>
                                  Uploaded before job-linking was introduced
                                </Typography>
                              )}
                            </Box>
                            <Chip
                              size="small"
                              label={isApproved ? "Approved by admin — locked" : statusMeta.label}
                              sx={{ color: statusMeta.color, bgcolor: alpha(statusMeta.color, 0.1), fontWeight: 900 }}
                            />
                          </Stack>

                          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1 }}>
                            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(palette.teal, 0.045), border: "1px solid", borderColor: palette.line }}>
                              <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>Truck</Typography>
                              <Typography variant="body2" fontWeight={850} sx={{ color: palette.ink }}>{truckLabel}</Typography>
                            </Box>
                            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(palette.teal, 0.045), border: "1px solid", borderColor: palette.line }}>
                              <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>Work Date</Typography>
                              <Typography variant="body2" fontWeight={850} sx={{ color: palette.ink }}>{formatDate(diary.workDate)}</Typography>
                            </Box>
                            <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(palette.teal, 0.045), border: "1px solid", borderColor: palette.line }}>
                              <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>Uploaded</Typography>
                              <Typography variant="body2" fontWeight={850} sx={{ color: palette.ink }}>{formatDateTime(diary.uploadDate || diary.createdAt)}</Typography>
                            </Box>
                          </Box>

                          {editId === diary._id ? (
                            <TextField multiline rows={2} fullWidth label="Notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                          ) : (
                            <Box>
                              <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>Notes</Typography>
                              <Typography variant="body2" sx={{ mt: 0.25, color: palette.ink }}>{diary.notes || "No notes added."}</Typography>
                            </Box>
                          )}

                          {!isApproved && job && (
                            <Button
                              fullWidth
                              variant="outlined"
                              startIcon={<UploadFileIcon />}
                              onClick={() => navigate(`/driver/work-diary/${job._id}`)}
                              sx={{ minHeight: 46, borderRadius: 3, fontWeight: 900 }}
                            >
                              Edit / Replace Diary
                            </Button>
                          )}

                          {!isApproved && (
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              {editId === diary._id ? (
                                <>
                                  <IconButton aria-label="save work diary notes" onClick={() => saveEdit(diary._id)}><SaveIcon /></IconButton>
                                  <IconButton aria-label="cancel editing work diary notes" color="error" onClick={() => setEditId(null)}><CancelIcon /></IconButton>
                                </>
                              ) : (
                                <>
                                  <IconButton aria-label="edit work diary notes" onClick={() => { setEditId(diary._id); setEditNotes(diary.notes || ""); }}><EditIcon /></IconButton>
                                  <IconButton aria-label="delete work diary" color="error" onClick={() => handleDelete(diary._id)}><DeleteIcon /></IconButton>
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

export default WorkDiary;
