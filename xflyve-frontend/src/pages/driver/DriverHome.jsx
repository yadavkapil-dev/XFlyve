import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  getJobsByDriver,
  listPodsByDriver,
  updateJob,
} from "../../api";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import WorkIcon from "@mui/icons-material/Work";

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
  rose: "#c2410c",
};

const toArray = (result) => {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data?.data)) return result.data.data;
  if (Array.isArray(result?.data)) return result.data;
  return [];
};

const toLocalDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA");
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

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const getStatusMeta = (status) => {
  if (status === "completed") {
    return { label: "Completed", color: palette.emerald, bg: alpha(palette.emerald, 0.1) };
  }

  if (status === "in-progress") {
    return { label: "In progress", color: palette.blue, bg: alpha(palette.blue, 0.1) };
  }

  return { label: "Pending", color: palette.amber, bg: alpha(palette.amber, 0.1) };
};

const DashboardSection = ({ title, subtitle, children }) => (
  <Box>
    <Stack spacing={0.75} sx={{ mb: 1.75 }}>
      <Typography
        variant="h5"
        fontWeight={900}
        sx={{
          color: palette.ink,
          fontSize: { xs: "1.18rem", sm: "1.4rem" },
          letterSpacing: "-0.045em",
          lineHeight: 1.12,
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography
          variant="body2"
          sx={{ color: palette.muted, lineHeight: 1.55, fontSize: "0.88rem" }}
        >
          {subtitle}
        </Typography>
      )}
    </Stack>
    {children}
  </Box>
);

const DetailPill = ({ icon, label, value }) => (
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
        <Typography
          variant="body2"
          fontWeight={850}
          noWrap
          sx={{ color: palette.ink, letterSpacing: "-0.015em" }}
        >
          {value || "—"}
        </Typography>
      </Box>
    </Stack>
  </Paper>
);

const ChecklistItem = ({ label, complete, helper }) => (
  <Paper
    elevation={0}
    sx={{
      p: 1.75,
      borderRadius: 3.25,
      border: "1px solid",
      borderColor: complete ? alpha(palette.emerald, 0.18) : palette.line,
      bgcolor: complete ? alpha(palette.emerald, 0.055) : alpha("#fff", 0.78),
    }}
  >
    <Stack direction="row" spacing={1.25} alignItems="flex-start">
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 2.5,
          display: "grid",
          placeItems: "center",
          color: complete ? palette.emerald : palette.muted,
          bgcolor: complete ? alpha(palette.emerald, 0.1) : alpha(palette.muted, 0.08),
          flexShrink: 0,
        }}
      >
        {complete ? <CheckCircleOutlineIcon /> : <RadioButtonUncheckedIcon />}
      </Box>
      <Box minWidth={0}>
        <Typography
          variant="body2"
          fontWeight={850}
          sx={{ color: palette.ink, letterSpacing: "-0.015em" }}
        >
          {label}
        </Typography>
        {helper && (
          <Typography variant="caption" sx={{ color: palette.muted, lineHeight: 1.35 }}>
            {helper}
          </Typography>
        )}
      </Box>
    </Stack>
  </Paper>
);

const QuickActionCard = ({ label, description, icon, onClick, featured = false }) => (
  <Card
    elevation={0}
    sx={{
      height: "100%",
      minHeight: 108,
      borderRadius: 4,
      border: "1px solid",
      borderColor: featured ? alpha(palette.teal, 0.42) : palette.line,
      bgcolor: featured ? palette.ink : alpha("#fff", 0.9),
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
      transition: "border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease",
      "&:hover": {
        transform: "translateY(-2px)",
        borderColor: featured ? alpha(palette.teal, 0.7) : alpha(palette.blue, 0.22),
        boxShadow: featured
          ? `0 20px 45px ${alpha(palette.ink, 0.16)}`
          : `0 18px 40px ${alpha(palette.blue, 0.075)}`,
      },
    }}
  >
    <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
      <CardContent sx={{ p: 2.25 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 50,
              height: 50,
              borderRadius: 3.25,
              display: "grid",
              placeItems: "center",
              color: featured ? alpha("#fff", 0.92) : palette.blue,
              bgcolor: featured ? alpha("#fff", 0.13) : alpha(palette.blue, 0.075),
              border: "1px solid",
              borderColor: featured ? alpha("#fff", 0.18) : alpha(palette.blue, 0.1),
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          <Box minWidth={0}>
            <Typography
              variant="subtitle1"
              fontWeight={900}
              sx={{
                color: featured ? "white" : palette.ink,
                letterSpacing: "-0.025em",
                lineHeight: 1.15,
              }}
            >
              {label}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mt: 0.25,
                color: featured ? alpha("#fff", 0.68) : palette.muted,
                lineHeight: 1.42,
                fontSize: "0.86rem",
              }}
            >
              {description}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </CardActionArea>
  </Card>
);

const DriverHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const driverId = user?._id || user?.id;

  const [jobs, setJobs] = useState([]);
  const [pods, setPods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshPods = useCallback(async () => {
    if (!driverId) return;

    try {
      const driverPods = await listPodsByDriver(driverId);
      setPods(toArray(driverPods));
    } catch {
      setError("POD status could not be refreshed. Showing the last available result.");
    }
  }, [driverId]);

  useEffect(() => {
    if (!driverId) {
      setLoading(false);
      return;
    }

    const fetchDriverDashboard = async () => {
      setLoading(true);
      setError("");

      const results = await Promise.allSettled([
        getJobsByDriver(driverId),
        listPodsByDriver(driverId),
      ]);

      setJobs(results[0].status === "fulfilled" ? toArray(results[0].value) : []);
      setPods(results[1].status === "fulfilled" ? toArray(results[1].value) : []);

      if (results.some((result) => result.status === "rejected")) {
        setError("Some driver records could not be loaded. Showing what is available.");
      }

      setLoading(false);
    };

    fetchDriverDashboard();
  }, [driverId]);

  useEffect(() => {
    if (!driverId) return undefined;

    const handlePageReturn = () => {
      refreshPods();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshPods();
    };

    window.addEventListener("focus", handlePageReturn);
    window.addEventListener("pageshow", handlePageReturn);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handlePageReturn);
      window.removeEventListener("pageshow", handlePageReturn);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [driverId, refreshPods]);

  const todayKey = toLocalDateKey();

  const dashboard = useMemo(() => {
    const sortedJobs = [...jobs].sort((a, b) => new Date(a.jobDate) - new Date(b.jobDate));
    const todaysJobs = sortedJobs.filter((job) => toLocalDateKey(job.jobDate) === todayKey);
    const activeTodayJob =
      todaysJobs.find((job) => job.status === "in-progress") ||
      todaysJobs.find((job) => job.status === "pending") ||
      todaysJobs[0] ||
      null;

    const activeTodayJobId = activeTodayJob?._id || activeTodayJob?.id;
    const hasPodForCurrentJob = pods.some((pod) => referencesJob(pod, activeTodayJobId));

    return {
      todaysJobs,
      activeTodayJob,
      hasPodForCurrentJob,
      hasAnyJobs: jobs.length > 0,
    };
  }, [jobs, pods, todayKey]);

  const currentJob = dashboard.activeTodayJob;
  const statusMeta = getStatusMeta(currentJob?.status);
  const isCompletedWithPod =
    currentJob?.status === "completed" && dashboard.hasPodForCurrentJob;
  const isInterstateJob = currentJob?.jobType === "interstate";

  const handlePrimaryAction = async () => {
    if (!currentJob) {
      navigate("/driver/jobs");
      return;
    }

    if (currentJob.status === "completed") {
      if (dashboard.hasPodForCurrentJob) return;
      navigate(`/driver/pods/upload/${currentJob._id}`);
      return;
    }

    const nextStatus = currentJob.status === "in-progress" ? "completed" : "in-progress";

    setActionLoading(true);
    setError("");

    try {
      const response = await updateJob(currentJob._id, { status: nextStatus });
      const updatedJob = response.data.data;
      setJobs((prevJobs) =>
        prevJobs.map((job) =>
          job._id === currentJob._id ? { ...job, ...updatedJob } : job
        )
      );
    } catch (err) {
      setError(err.response?.data?.message || "Could not update job status.");
    } finally {
      setActionLoading(false);
    }
  };

  const primaryActionLabel = currentJob
    ? currentJob.status === "completed"
      ? dashboard.hasPodForCurrentJob
        ? "Completed"
        : "Upload POD"
      : currentJob.status === "in-progress"
        ? "Complete Job"
        : "Start Job"
    : "View All Jobs";

  const primaryActionIcon = currentJob?.status === "completed" ? (
    dashboard.hasPodForCurrentJob ? <CheckCircleOutlineIcon /> : <UploadFileIcon />
  ) : currentJob?.status === "in-progress" ? (
    <CheckCircleOutlineIcon />
  ) : (
    <PlayArrowRoundedIcon />
  );
  const quickActions = [
    {
      label: "View All Jobs",
      description: "See assigned runs",
      icon: <WorkIcon />,
      path: "/driver/jobs",
      featured: true,
    },
    {
      label: "Logs",
      description: "Today’s Work history",
      icon: <FactCheckIcon />,
      path: "/driver/logs",
    },
    {
      label: "POD",
      description: "Delivery proof history",
      icon: <UploadFileIcon />,
      path: "/driver/pods/upload",
    },
    {
      label: "Diary",
      description: "Work diary history",
      icon: <DescriptionOutlinedIcon />,
      path: "/driver/work-diary",
    },
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        pt: { xs: 10, sm: 11 },
        pb: { xs: 3.5, sm: 5 },
        overflowX: "hidden",
        color: palette.ink,
        background: `radial-gradient(circle at 0% 0%, ${alpha(
          palette.teal,
          0.13
        )}, transparent 32%), radial-gradient(circle at 100% 8%, ${alpha(
          palette.blue,
          0.1
        )}, transparent 30%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)`,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, sm: 3.5, md: 4.5 },
            mb: { xs: 3.25, md: 4 },
            borderRadius: { xs: 4.5, md: 6 },
            color: "white",
            background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 54%, ${palette.heroEnd} 100%)`,
            overflow: "hidden",
            position: "relative",
            border: "1px solid",
            borderColor: alpha("#fff", 0.12),
            boxShadow: `0 30px 90px ${alpha(palette.heroStart, 0.18)}`,
          }}
        >
          <Box
            sx={{
              position: "absolute",
              width: { xs: 180, sm: 260 },
              height: { xs: 180, sm: 260 },
              borderRadius: "50%",
              right: { xs: -100, sm: -80 },
              top: { xs: -110, sm: -120 },
              background: `radial-gradient(circle, ${alpha("#fff", 0.2)}, ${alpha(
                "#fff",
                0.02
              )} 62%, transparent 70%)`,
            }}
          />
          <Stack spacing={2.25} sx={{ position: "relative" }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label="Driver workspace"
                size="small"
                sx={{
                  color: "white",
                  bgcolor: alpha("#fff", 0.12),
                  border: "1px solid",
                  borderColor: alpha("#fff", 0.16),
                  fontWeight: 850,
                  height: 30,
                }}
              />
            </Stack>

            <Box>
              <Typography
                variant="h4"
                component="h1"
                fontWeight={950}
                sx={{
                  fontSize: { xs: "1.9rem", sm: "2.55rem", md: "3rem" },
                  lineHeight: 1.04,
                  letterSpacing: "-0.07em",
                  textWrap: "balance",
                }}
              >
                {getGreeting()}, {user?.name || "Driver"}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  mt: 1.5,
                  maxWidth: 620,
                  color: alpha("#fff", 0.74),
                  fontSize: { xs: "0.98rem", sm: "1.05rem" },
                  lineHeight: 1.62,
                }}
              >
                Your work for today is below.
              </Typography>
            </Box>

          </Stack>
        </Paper>

        {error && (
          <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 3 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Paper
            elevation={0}
            sx={{
              p: { xs: 4, sm: 5 },
              borderRadius: 5,
              textAlign: "center",
              border: "1px solid",
              borderColor: palette.line,
              bgcolor: palette.panel,
            }}
          >
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Loading your driver workspace...
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={{ xs: 3.5, md: 4.5 }}>
            <DashboardSection
              title="Today’s Job"
              subtitle="Your next run and the action that matters most right now."
            >
              {currentJob ? (
                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2.25, sm: 2.75 },
                    borderRadius: { xs: 4, sm: 5 },
                    border: "1px solid",
                    borderColor: palette.line,
                    bgcolor: palette.panel,
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
                  }}
                >
                  <Stack spacing={2.25}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      spacing={1.25}
                    >
                      <Box minWidth={0}>
                        <Typography
                          variant="h5"
                          fontWeight={950}
                          sx={{
                            color: palette.ink,
                            letterSpacing: "-0.05em",
                            lineHeight: 1.1,
                          }}
                        >
                          {currentJob.title || "Assigned job"}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ mt: 0.75, color: palette.muted, lineHeight: 1.55 }}
                        >
                          {currentJob.description || "Complete this run and submit records when done."}
                        </Typography>
                      </Box>
                      <Chip
                        label={statusMeta.label}
                        sx={{
                          alignSelf: { xs: "flex-start", sm: "center" },
                          color: statusMeta.color,
                          bgcolor: statusMeta.bg,
                          border: "1px solid",
                          borderColor: alpha(statusMeta.color, 0.18),
                          fontWeight: 900,
                          textTransform: "capitalize",
                        }}
                      />
                    </Stack>

                    <Divider sx={{ borderColor: palette.line }} />

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                        gap: 1.5,
                      }}
                    >
                      <DetailPill
                        icon={<LocationOnOutlinedIcon />}
                        label="Pickup"
                        value={currentJob.pickupLocation}
                      />
                      <DetailPill
                        icon={<RouteOutlinedIcon />}
                        label="Delivery"
                        value={currentJob.deliveryLocation}
                      />
                      <DetailPill
                        icon={<LocalShippingIcon />}
                        label="Truck"
                        value={currentJob.assignedTruck?.truckNumber}
                      />
                      <DetailPill
                        icon={<AssignmentTurnedInIcon />}
                        label="Date"
                        value={formatDate(currentJob.jobDate)}
                      />
                    </Box>

                    <Button
                      variant="contained"
                      size="large"
                      startIcon={primaryActionIcon}
                      onClick={handlePrimaryAction}
                      disabled={actionLoading || isCompletedWithPod}
                      fullWidth
                      sx={{
                        minHeight: 56,
                        borderRadius: 3.25,
                        bgcolor: palette.ink,
                        fontWeight: 950,
                        letterSpacing: "-0.02em",
                        "&:hover": { bgcolor: "#111827" },
                      }}
                    >
                      {actionLoading ? "Updating..." : primaryActionLabel}
                    </Button>
                    {isCompletedWithPod && (
                      <Button
                        variant="outlined"
                        size="large"
                        startIcon={<UploadFileIcon />}
                        onClick={() => navigate(`/driver/pods/upload/${currentJob._id}`)}
                        fullWidth
                        sx={{ minHeight: 52, borderRadius: 3.25, fontWeight: 900 }}
                      >
                        Edit / Replace POD
                      </Button>
                    )}
                    {isInterstateJob && (
                      <Button
                        variant="outlined"
                        size="large"
                        startIcon={<DescriptionOutlinedIcon />}
                        onClick={() => navigate(`/driver/work-diary/${currentJob._id}`)}
                        fullWidth
                        sx={{ minHeight: 52, borderRadius: 3.25, fontWeight: 900 }}
                      >
                        Work Diary Pages
                      </Button>
                    )}
                  </Stack>
                </Paper>
              ) : (
                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2.5, sm: 3 },
                    borderRadius: { xs: 4, sm: 5 },
                    border: "1px solid",
                    borderColor: alpha(palette.teal, 0.16),
                    bgcolor: alpha(palette.teal, 0.055),
                  }}
                >
                  <Stack spacing={1.75}>
                    <Box
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: 3.5,
                        display: "grid",
                        placeItems: "center",
                        color: palette.teal,
                        bgcolor: alpha(palette.teal, 0.1),
                      }}
                    >
                      <LocalShippingIcon />
                    </Box>
                    <Box>
                      <Typography
                        variant="h6"
                        fontWeight={950}
                        sx={{ color: palette.ink, letterSpacing: "-0.04em" }}
                      >
                        {dashboard.hasAnyJobs ? "No job scheduled for today" : "No jobs assigned yet"}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.75, color: palette.muted }}>
                        {dashboard.hasAnyJobs
                          ? "You still have assigned jobs available. Open all jobs to review upcoming work."
                          : "You’re clear for now. Check back later or contact your dispatcher if you expected a job."}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      size="large"
                      onClick={() => navigate("/driver/jobs")}
                      sx={{ minHeight: 52, borderRadius: 3, fontWeight: 900 }}
                    >
                      View All Jobs
                    </Button>
                  </Stack>
                </Paper>
              )}
            </DashboardSection>

            <DashboardSection
              title="Today’s Checklist"
              subtitle="Track today’s assignment, completion, and delivery proof."
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                  gap: 1.5,
                }}
              >
                <ChecklistItem
                  label="Job Assigned"
                  complete={Boolean(currentJob)}
                  helper={currentJob ? "Today’s job is ready." : "No job for today."}
                />
                <ChecklistItem
                  label="Job Completed"
                  complete={currentJob?.status === "completed"}
                  helper={currentJob?.status === "completed" ? "Marked complete." : "Complete when delivered."}
                />
                <ChecklistItem
                  label="POD Uploaded"
                  complete={dashboard.hasPodForCurrentJob}
                  helper={
                    dashboard.hasPodForCurrentJob
                      ? "Delivery proof is linked to this job."
                      : "Upload delivery proof for this job."
                  }
                />
              </Box>
            </DashboardSection>

            <DashboardSection
              title="Quick Actions"
              subtitle="Open your assigned jobs and continue from the relevant job card."
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                  gap: 1.5,
                }}
              >
                {quickActions.map((action) => (
                  <Box key={action.label} sx={{ minWidth: 0 }}>
                    <QuickActionCard
                      label={action.label}
                      description={action.description}
                      icon={action.icon}
                      featured={action.featured}
                      onClick={() => navigate(action.path)}
                    />
                  </Box>
                ))}
              </Box>
            </DashboardSection>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default DriverHome;
