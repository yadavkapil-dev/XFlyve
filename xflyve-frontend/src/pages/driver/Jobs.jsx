import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { getJobsByDriver, listPodsByDriver, listWorkDiariesByDriver, updateJob } from "../../api";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationContext";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import UploadFileIcon from "@mui/icons-material/UploadFile";

const palette = {
  ink: "#0b1220",
  slate: "#253449",
  muted: "#697586",
  line: "rgba(15, 23, 42, 0.075)",
  panel: "rgba(255, 255, 255, 0.88)",
  heroStart: "#050b18",
  heroMid: "#0b2f3a",
  heroEnd: "#0c5f5b",
  blue: "#2563eb",
  teal: "#0e7c76",
  emerald: "#07866f",
  amber: "#b76e00",
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getStatusMeta = (status) => {
  if (status === "completed") return { label: "Completed", color: palette.emerald };
  if (status === "in-progress") return { label: "In progress", color: palette.blue };
  return { label: "Pending", color: palette.amber };
};

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
};

const referencesJob = (record, jobId) => {
  const linkedJobId = normalizeId(record?.jobId);
  const currentJobId = normalizeId(jobId);
  return Boolean(linkedJobId && currentJobId && linkedJobId === currentJobId);
};

// Shared by PODs and work diaries — same shape (driverId/jobId-linked
// upload records), same "most recent wins" rule for picking the one to
// show/lock against.
const getLatestForJob = (records, jobId) => {
  return [...records]
    .filter((record) => referencesJob(record, jobId))
    .sort(
      (a, b) =>
        new Date(b.uploadDate || b.createdAt || 0) -
        new Date(a.uploadDate || a.createdAt || 0)
    )[0] || null;
};

// Real-time event types that mean "this page's POD state is now stale" —
// an admin approving/rejecting a POD while this page is open. Work diaries
// have no approval workflow (nothing ever emits diary_approved/rejected),
// so there's nothing diary-related to listen for here. pod_submitted isn't
// included: that notifies admins, not the driver.
const RELEVANT_EVENTS = ["pod_approved", "pod_rejected"];

const DetailItem = ({ icon, label, value }) => (
  <Paper
    elevation={0}
    sx={{
      p: 1.5,
      borderRadius: 3,
      border: "1px solid",
      borderColor: palette.line,
      bgcolor: alpha("#fff", 0.72),
      minWidth: 0,
    }}
  >
    <Stack direction="row" spacing={1.25} alignItems="center">
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 2.5,
          display: "grid",
          placeItems: "center",
          color: palette.teal,
          bgcolor: alpha(palette.teal, 0.08),
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 750 }}>
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={850} noWrap sx={{ color: palette.ink }}>
          {value || "—"}
        </Typography>
      </Box>
    </Stack>
  </Paper>
);

const DriverJobs = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const driverId = user?._id || user?.id;
  const { lastEvent } = useNotifications();
  const [jobs, setJobs] = useState([]);
  const [pods, setPods] = useState([]);
  const [diaries, setDiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState("");
  const [error, setError] = useState("");

  const fetchJobs = useCallback(async () => {
    if (!driverId) return;

    setLoading(true);
    setError("");
    const [jobsResult, podsResult, diariesResult] = await Promise.allSettled([
        getJobsByDriver(driverId),
        listPodsByDriver(driverId, { limit: 100 }),
        listWorkDiariesByDriver(driverId, { limit: 100 }),
    ]);

    setJobs(jobsResult.status === "fulfilled" ? jobsResult.value.data.data || [] : []);
    setPods(podsResult.status === "fulfilled" ? podsResult.value?.data || [] : []);
    setDiaries(diariesResult.status === "fulfilled" ? diariesResult.value?.data || [] : []);

    if (jobsResult.status === "rejected") {
      setError(jobsResult.reason?.response?.data?.message || "Failed to fetch jobs.");
    } else if (podsResult.status === "rejected") {
      setError("Jobs loaded, but POD status could not be checked.");
    } else if (diariesResult.status === "rejected") {
      setError("Jobs loaded, but work diary status could not be checked.");
    }

    setLoading(false);
  }, [driverId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Admin approves/rejects a POD or diary while this page happens to be
  // open — re-run the exact same fetch this page already uses on mount, so
  // the Upload POD / Work Diary Pages lock states never need a manual
  // refresh to catch up.
  useEffect(() => {
    if (!lastEvent) return;
    if (RELEVANT_EVENTS.includes(lastEvent.type)) {
      fetchJobs();
    }
  }, [lastEvent, fetchJobs]);

  const visibleJobs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return jobs
      .filter((job) => {
        const jobDate = new Date(job.jobDate);

        if (Number.isNaN(jobDate.getTime())) {
          return job.status !== "completed";
        }

        return jobDate >= thirtyDaysAgo || job.status !== "completed";
      })
      .sort((a, b) => {
        const aCompleted = a.status === "completed";
        const bCompleted = b.status === "completed";

        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

        if (!aCompleted) {
          const aJobDate = new Date(a.jobDate).getTime();
          const bJobDate = new Date(b.jobDate).getTime();
          const aTime = Number.isNaN(aJobDate) ? Number.POSITIVE_INFINITY : aJobDate;
          const bTime = Number.isNaN(bJobDate) ? Number.POSITIVE_INFINITY : bJobDate;

          return aTime - bTime;
        }

        const getCompletedSortTime = (job) => {
          const completedTime = new Date(job.completedAt).getTime();
          if (!Number.isNaN(completedTime)) return completedTime;

          const jobTime = new Date(job.jobDate).getTime();
          return Number.isNaN(jobTime) ? Number.NEGATIVE_INFINITY : jobTime;
        };

        return getCompletedSortTime(b) - getCompletedSortTime(a);
      });
  }, [jobs]);

  const handleStatusChange = async (job, newStatus) => {
    setError("");
    setProcessingId(job._id);
    try {
      const response = await updateJob(job._id, { status: newStatus });
      const updatedJob = response.data.data;
      setJobs((prevJobs) =>
        prevJobs.map((item) => (item._id === job._id ? { ...item, ...updatedJob } : item))
      );
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update status.");
    } finally {
      setProcessingId("");
    }
  };

  const renderPrimaryAction = (job, linkedPod) => {
    const hasPod = Boolean(linkedPod);

    if (job.status === "completed") {
      if (hasPod) {
        // Edit/Replace moved to the POD history page (driver/pods/upload) —
        // it lists every POD, not just this job's, so that's where an edit
        // action belongs; not duplicated here.
        return (
          <Button
            fullWidth
            size="large"
            variant="contained"
            startIcon={<CheckCircleOutlineIcon />}
            disabled
            sx={{ minHeight: 54, borderRadius: 3, fontWeight: 950 }}
          >
            POD Uploaded ✅
          </Button>
        );
      }

      return (
        <Button
          fullWidth
          size="large"
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={() => navigate(`/driver/pods/upload/${job._id}`)}
          sx={{ minHeight: 54, borderRadius: 3, bgcolor: palette.ink, fontWeight: 950 }}
        >
          Upload POD
        </Button>
      );
    }

    const nextStatus = job.status === "in-progress" ? "completed" : "in-progress";
    const label = job.status === "in-progress" ? "Complete Job" : "Start Job";
    const icon = job.status === "in-progress" ? <CheckCircleOutlineIcon /> : <PlayArrowRoundedIcon />;

    return (
      <Button
        fullWidth
        size="large"
        variant="contained"
        startIcon={icon}
        disabled={processingId === job._id}
        onClick={() => handleStatusChange(job, nextStatus)}
        sx={{ minHeight: 54, borderRadius: 3, bgcolor: palette.ink, fontWeight: 950 }}
      >
        {processingId === job._id ? "Updating..." : label}
      </Button>
    );
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        pt: { xs: 3, sm: 4 },
        pb: { xs: 4, sm: 6 },
        overflowX: "hidden",
        background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)`,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, sm: 3.5 },
            mb: 3,
            borderRadius: { xs: 4.5, sm: 5 },
            color: "white",
            background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)`,
            border: "1px solid",
            borderColor: alpha("#fff", 0.12),
          }}
        >
          <Chip
            label="Driver jobs"
            size="small"
            sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }}
          />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>
            My assigned jobs
          </Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>
            Upcoming work, active jobs, and completed history from the last 30 days.
          </Typography>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2.5, borderRadius: 3 }}>{error}</Alert>}

        {loading ? (
          <Paper elevation={0} sx={{ p: 5, textAlign: "center", borderRadius: 5, border: "1px solid", borderColor: palette.line }}>
            <CircularProgress />
            <Typography sx={{ mt: 2, color: palette.muted }}>Loading assigned jobs...</Typography>
          </Paper>
        ) : visibleJobs.length === 0 ? (
          <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
            <Typography variant="h6" fontWeight={950} sx={{ color: palette.ink }}>
              No recent or upcoming jobs
            </Typography>
            <Typography sx={{ mt: 0.75, color: palette.muted }}>
              You’re clear for now. Older completed work is hidden from this view.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {visibleJobs.map((job) => {
              const statusMeta = getStatusMeta(job.status);
              const linkedPod = getLatestForJob(pods, job._id || job.id);
              const linkedDiary = getLatestForJob(diaries, job._id || job.id);
              const isInterstateJob = job.jobType === "interstate";
              return (
                <Paper
                  key={job._id}
                  elevation={0}
                  sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}
                >
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                      <Box minWidth={0}>
                        <Typography variant="h6" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.04em" }}>
                          {job.title || "Assigned job"}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5, color: palette.muted }}>
                          {job.description || "Complete this run and submit the required records."}
                        </Typography>
                      </Box>
                      <Chip
                        label={statusMeta.label}
                        sx={{ alignSelf: "flex-start", color: statusMeta.color, bgcolor: alpha(statusMeta.color, 0.1), fontWeight: 900 }}
                      />
                    </Stack>

                    <Divider sx={{ borderColor: palette.line }} />

                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
                      <DetailItem icon={<LocationOnOutlinedIcon />} label="Pickup" value={job.pickupLocation} />
                      <DetailItem icon={<RouteOutlinedIcon />} label="Delivery" value={job.deliveryLocation} />
                      <DetailItem icon={<LocalShippingIcon />} label="Truck" value={job.assignedTruck?.truckNumber} />
                      <DetailItem icon={<AssignmentTurnedInIcon />} label="Job Type" value={job.jobType} />
                      <DetailItem icon={<AccessTimeIcon />} label="Start Time" value={job.startTime} />
                    </Box>

                    <Box>
                      <Typography variant="overline" sx={{ color: palette.muted, fontWeight: 900, letterSpacing: "0.08em" }}>
                        Operational timeline
                      </Typography>
                      <Box sx={{ mt: 1, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
                        <DetailItem icon={<AssignmentTurnedInIcon />} label="Job Date" value={formatDate(job.jobDate)} />
                        {job.startedAt && (
                          <DetailItem icon={<PlayArrowRoundedIcon />} label="Started At" value={formatDateTime(job.startedAt)} />
                        )}
                        {job.completedAt && (
                          <DetailItem icon={<CheckCircleOutlineIcon />} label="Completed At" value={formatDateTime(job.completedAt)} />
                        )}
                        {linkedPod && (
                          <DetailItem icon={<UploadFileIcon />} label="POD Uploaded At" value={formatDateTime(linkedPod.uploadDate || linkedPod.createdAt)} />
                        )}
                      </Box>
                    </Box>

                    <Stack spacing={1.25}>
                      {renderPrimaryAction(job, linkedPod)}
                      {/* Work logs are a whole-day record, not tied to one
                          job — the Logs page has its own job-picker, so
                          there's no "Submit Today's Work" entry point here
                          for local jobs. Work Diary Pages stays: uploading
                          a diary requires a job-scoped route
                          (/driver/work-diary/:id) that the Diary history
                          page has no equivalent picker for, so this is
                          still the only way to reach that upload flow. */}
                      {isInterstateJob && (
                        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 1 }}>
                          {linkedDiary ? (
                            // Same lock as the POD button above once a
                            // record exists for this job — Edit/Replace
                            // for an already-submitted diary lives on the
                            // Diary history page now, not duplicated here.
                            <Button
                              variant="contained"
                              startIcon={<CheckCircleOutlineIcon />}
                              disabled
                              sx={{ minHeight: 46, borderRadius: 3, fontWeight: 850 }}
                            >
                              Work Diary Submitted ✅
                            </Button>
                          ) : (
                            <Button variant="outlined" startIcon={<DescriptionOutlinedIcon />} onClick={() => navigate(`/driver/work-diary/${job._id}`)} sx={{ minHeight: 46, borderRadius: 3, fontWeight: 850 }}>
                              Work Diary Pages
                            </Button>
                          )}
                        </Box>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default DriverJobs;
