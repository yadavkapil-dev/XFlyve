import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { BarChart, LineChart, PieChart } from "@mui/x-charts";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getDashboardStats } from "../api";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import GroupsIcon from "@mui/icons-material/Groups";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import PeopleIcon from "@mui/icons-material/People";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import WorkIcon from "@mui/icons-material/Work";

const palette = {
  ink: "#0b1220",
  slate: "#253449",
  muted: "#697586",
  soft: "#f7f3ea",
  line: "rgba(15, 23, 42, 0.075)",
  panel: "rgba(255, 255, 255, 0.88)",
  heroStart: "#050b18",
  heroMid: "#0b2f3a",
  heroEnd: "#0c5f5b",
  blue: "#2563eb",
  teal: "#0e7c76",
  emerald: "#07866f",
  amber: "#b76e00",
  rose: "#b42318",
  violet: "#5b38c8",
};

const toLocalDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA");
};

const emptyDashboard = {
  todaysJobs: 0,
  completedToday: 0,
  pendingJobs: 0,
  totalDrivers: 0,
  missingWorkLogs: 0,
  trucksOutOfService: 0,
  weeklyLogs: 0,
  weeklyHours: 0,
  weeklyKilometres: 0,
  invoiceReadyJobs: 0,
  pendingPodApprovals: 0,
  podApprovalRate: null,
  truckStatusBreakdown: { available: 0, "on-route": 0, "out-of-service": 0 },
  jobsByStatus: { pending: 0, "in-progress": 0, completed: 0 },
  jobVolumeTrend: [],
};

const DashboardSection = ({ title, subtitle, children }) => (
  <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minWidth: 0 }}>
    <Stack spacing={0.75} sx={{ mb: { xs: 1.75, sm: 2.25 } }}>
      <Typography
        variant="h5"
        fontWeight={900}
        color={palette.ink}
        sx={{
          letterSpacing: "-0.045em",
          fontSize: { xs: "1.18rem", sm: "1.38rem", md: "1.5rem" },
          lineHeight: 1.12,
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography
          variant="body2"
          sx={{
            color: palette.muted,
            maxWidth: 680,
            lineHeight: 1.55,
            fontSize: { xs: "0.84rem", sm: "0.9rem" },
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Stack>
    <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
  </Box>
);

const MetricCard = ({ label, value, helper, icon, accent = "#2563eb" }) => (
  <Paper
    elevation={0}
    sx={{
      height: "100%",
      minHeight: { xs: 138, sm: 156, md: 164 },
      p: { xs: 2, sm: 2.5, md: 2.75 },
      borderRadius: { xs: 3.5, sm: 4.5 },
      border: "1px solid",
      borderColor: palette.line,
      bgcolor: palette.panel,
      backdropFilter: "blur(18px)",
      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
      transition: "border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease",
      "&:hover": {
        borderColor: alpha(accent, 0.28),
        transform: "translateY(-2px)",
        boxShadow: `0 18px 44px ${alpha(accent, 0.08)}`,
      },
    }}
  >
    <Stack spacing={{ xs: 1.5, sm: 2 }} sx={{ height: "100%" }}>
      <Box
        sx={{
          width: { xs: 42, sm: 48 },
          height: { xs: 42, sm: 48 },
          borderRadius: { xs: 2.75, sm: 3.25 },
          display: "grid",
          placeItems: "center",
          color: accent,
          background: `linear-gradient(135deg, ${alpha(accent, 0.15)}, ${alpha(
            accent,
            0.055
          )})`,
          border: "1px solid",
          borderColor: alpha(accent, 0.14),
          flexShrink: 0,
          "& svg": { fontSize: { xs: 22, sm: 25 } },
        }}
      >
        {icon}
      </Box>
      <Box minWidth={0} sx={{ mt: "auto" }}>
        <Typography
          variant="h4"
          fontWeight={900}
          lineHeight={0.95}
          color={palette.ink}
          sx={{ letterSpacing: "-0.06em", fontSize: { xs: "1.85rem", sm: "2.25rem" } }}
        >
          {value}
        </Typography>
        <Typography
          variant="subtitle2"
          fontWeight={800}
          sx={{ mt: 1, color: palette.slate, letterSpacing: "-0.015em", lineHeight: 1.25 }}
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

const AttentionCard = ({
  title,
  description,
  value,
  icon,
  actionLabel,
  onClick,
  tone = "warning",
}) => {
  const toneColor = tone === "error" ? "#dc2626" : tone === "success" ? palette.emerald : palette.amber;

  return (
    <Paper
      elevation={0}
      sx={{
        minHeight: { xs: 126, md: 132 },
        p: { xs: 2, sm: 2.25 },
        borderRadius: { xs: 3.5, sm: 4.5 },
        border: "1px solid",
        borderColor: alpha(toneColor, 0.18),
        bgcolor: alpha("#fff", 0.86),
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
        transition: "border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease",
        "&:hover": {
          borderColor: alpha(toneColor, 0.32),
          transform: "translateY(-2px)",
          boxShadow: `0 18px 42px ${alpha(toneColor, 0.08)}`,
        },
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ height: "100%" }}>
        <Box
          sx={{
            width: { xs: 44, sm: 48 },
            height: { xs: 44, sm: 48 },
            borderRadius: { xs: 3, sm: 3.25 },
            display: "grid",
            placeItems: "center",
            color: toneColor,
            background: `linear-gradient(135deg, ${alpha(toneColor, 0.16)}, ${alpha(
              toneColor,
              0.055
            )})`,
            border: "1px solid",
            borderColor: alpha(toneColor, 0.16),
            flexShrink: 0,
            "& svg": { fontSize: { xs: 22, sm: 24 } },
          }}
        >
          {icon}
        </Box>
        <Box flex={1} minWidth={0}>
          <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
            <Typography
              variant="subtitle1"
              fontWeight={880}
              sx={{ color: palette.ink, letterSpacing: "-0.025em", lineHeight: 1.2 }}
            >
              {title}
            </Typography>
            <Typography
              variant="h6"
              fontWeight={950}
              color={toneColor}
              sx={{ letterSpacing: "-0.04em", lineHeight: 1.1 }}
            >
              {value}
            </Typography>
          </Stack>
          <Typography
            variant="body2"
            sx={{ mb: 1.25, color: palette.muted, lineHeight: 1.5, fontSize: "0.86rem" }}
          >
            {description}
          </Typography>
          {actionLabel && (
            <Button
              size="medium"
              variant="text"
              onClick={onClick}
              sx={{
                minHeight: 40,
                px: 0,
                color: toneColor,
                fontWeight: 850,
                letterSpacing: "-0.01em",
                "&:hover": {
                  bgcolor: "transparent",
                  color: toneColor,
                  textDecoration: "underline",
                  textUnderlineOffset: 4,
                },
              }}
            >
              {actionLabel}
            </Button>
          )}
        </Box>
      </Stack>
    </Paper>
  );
};

const QuickActionCard = ({ label, description, icon, onClick, featured = false }) => (
  <Card
    elevation={0}
    sx={{
      height: "100%",
      minHeight: { xs: 108, sm: 116 },
      borderRadius: { xs: 3.75, sm: 4.5 },
      border: "1px solid",
      borderColor: featured ? alpha(palette.teal, 0.4) : palette.line,
      bgcolor: featured ? palette.ink : alpha("#fff", 0.9),
      color: featured ? "primary.contrastText" : "text.primary",
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
    <CardActionArea
      onClick={onClick}
      sx={{
        height: "100%",
        p: 0,
        "& .MuiCardActionArea-focusHighlight": {
          bgcolor: featured ? alpha("#fff", 0.08) : alpha(palette.blue, 0.08),
        },
      }}
    >
      <CardContent sx={{ p: { xs: 2.25, sm: 2.5 }, width: "100%" }}>
        <Stack direction="row" spacing={1.75} alignItems="center">
          <Box
            sx={{
              width: { xs: 50, sm: 54 },
              height: { xs: 50, sm: 54 },
              borderRadius: 3.5,
              display: "grid",
              placeItems: "center",
              bgcolor: featured ? alpha("#fff", 0.13) : alpha(palette.blue, 0.075),
              color: featured ? alpha("#fff", 0.92) : palette.blue,
              border: "1px solid",
              borderColor: featured ? alpha("#fff", 0.18) : alpha(palette.blue, 0.1),
              flexShrink: 0,
              "& svg": { fontSize: { xs: 25, sm: 27 } },
            }}
          >
            {icon}
          </Box>
          <Box minWidth={0}>
            <Typography
              variant="subtitle1"
              fontWeight={880}
              sx={{ letterSpacing: "-0.025em", color: featured ? "white" : palette.ink, lineHeight: 1.15 }}
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

const SummaryRow = ({ label, value, helper }) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    spacing={2}
    sx={{
      py: { xs: 1.65, sm: 1.85 },
      borderBottom: "1px solid",
      borderColor: palette.line,
      "&:last-of-type": { borderBottom: 0 },
    }}
  >
    <Box>
      <Typography
        variant="body2"
        fontWeight={820}
        sx={{ color: palette.ink, letterSpacing: "-0.012em" }}
      >
        {label}
      </Typography>
      {helper && (
        <Typography variant="caption" sx={{ color: palette.muted, lineHeight: 1.4 }}>
          {helper}
        </Typography>
      )}
    </Box>
    <Typography
      variant="h6"
      fontWeight={950}
      sx={{ color: palette.ink, letterSpacing: "-0.045em", lineHeight: 1 }}
    >
      {value}
    </Typography>
  </Stack>
);

const ChartCard = ({ title, helper, children }) => (
  <Paper
    elevation={0}
    sx={{
      p: { xs: 2, sm: 2.5 },
      borderRadius: { xs: 4, sm: 5 },
      border: "1px solid",
      borderColor: palette.line,
      bgcolor: palette.panel,
      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
      height: "100%",
    }}
  >
    <Typography variant="subtitle1" fontWeight={880} sx={{ color: palette.ink, letterSpacing: "-0.025em" }}>
      {title}
    </Typography>
    {helper && (
      <Typography variant="caption" sx={{ color: palette.muted, display: "block", mb: 1 }}>
        {helper}
      </Typography>
    )}
    <Box sx={{ mt: 1 }}>{children}</Box>
  </Paper>
);

const HomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setError("");

      try {
        const res = await getDashboardStats(toLocalDateKey());
        setDashboard(res.data.data || emptyDashboard);
      } catch (err) {
        setError(err.response?.data?.message || "Dashboard data could not be loaded.");
        setDashboard(emptyDashboard);
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  const quickActions = [
    {
      label: "Manage Jobs",
      description: "Track today's work",
      path: "/jobs",
      icon: <WorkIcon />,
    },
    {
      label: "Work Logs",
      description: "Review driver records",
      path: "/logs",
      icon: <FactCheckIcon />,
    },
    {
      label: "POD Records",
      description: "Check delivery proof",
      path: "/pods",
      icon: <UploadFileIcon />,
    },
    {
      label: "Work Diary",
      description: "Review compliance uploads",
      path: "/work-diary",
      icon: <DescriptionOutlinedIcon />,
    },
    {
      label: "Manage Drivers",
      description: "Add or remove drivers",
      path: "/drivers",
      icon: <PeopleIcon />,
    },
    {
      label: "Manage Trucks",
      description: "Fleet availability",
      path: "/trucks",
      icon: <LocalShippingIcon />,
    },
  ];

  return (
    <Box
      sx={{
        minHeight: "100vh",
        pt: { xs: 10, sm: 11, md: 12 },
        pb: { xs: 3.5, sm: 5, md: 6 },
        px: 0,
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
      <Box
        sx={{
          width: "100%",
          maxWidth: 1240,
          mx: "auto",
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, sm: 3.5, md: 4.5, lg: 5 },
            mb: { xs: 3.5, md: 4.5 },
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
              width: { xs: 180, sm: 260, md: 320 },
              height: { xs: 180, sm: 260, md: 320 },
              borderRadius: "50%",
              right: { xs: -96, sm: -88, md: -90 },
              top: { xs: -110, sm: -120, md: -130 },
              background: `radial-gradient(circle, ${alpha("#fff", 0.2)}, ${alpha(
                "#fff",
                0.02
              )} 62%, transparent 70%)`,
            }}
          />
          <Box
            sx={{
              position: "absolute",
              width: { xs: 130, md: 190 },
              height: { xs: 130, md: 190 },
              borderRadius: "50%",
              left: { xs: -90, sm: "52%" },
              bottom: -95,
              bgcolor: alpha("#2dd4bf", 0.18),
              filter: "blur(4px)",
            }}
          />
          <Box
            sx={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.65fr) minmax(300px, 0.75fr)" },
              gap: { xs: 2.5, md: 4 },
              alignItems: "stretch",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Chip
                label="Operations dashboard"
                size="small"
                sx={{
                  mb: { xs: 1.75, md: 2.25 },
                  color: "white",
                  bgcolor: alpha("#fff", 0.12),
                  border: "1px solid",
                  borderColor: alpha("#fff", 0.16),
                  fontWeight: 800,
                  letterSpacing: "0.02em",
                  height: 30,
                }}
              />
              <Typography
                variant="h4"
                component="h1"
                fontWeight={950}
                sx={{
                  fontSize: { xs: "1.95rem", sm: "2.65rem", md: "3.25rem", lg: "3.55rem" },
                  lineHeight: { xs: 1.05, sm: 1 },
                  letterSpacing: "-0.07em",
                  maxWidth: 780,
                  textWrap: "balance",
                }}
              >
                Welcome back, {user?.name || "Admin"}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  mt: 1.75,
                  maxWidth: 620,
                  color: alpha("#fff", 0.76),
                  fontSize: { xs: "0.98rem", sm: "1.08rem" },
                  lineHeight: 1.62,
                }}
              >
                Run today’s transport operations from one mobile-friendly command center.
              </Typography>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.25}
                sx={{ mt: { xs: 2.25, md: 3 } }}
              >
                {["Jobs", "Drivers", "POD records"].map((item) => (
                  <Box
                    key={item}
                    sx={{
                      px: 1.5,
                      py: 0.85,
                      borderRadius: 999,
                      color: alpha("#fff", 0.78),
                      bgcolor: alpha("#fff", 0.08),
                      border: "1px solid",
                      borderColor: alpha("#fff", 0.1),
                      fontSize: "0.78rem",
                      fontWeight: 800,
                      letterSpacing: "0.01em",
                      width: { xs: "fit-content", sm: "auto" },
                    }}
                  >
                    {item}
                  </Box>
                ))}
              </Stack>
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Paper
                elevation={0}
                sx={{
                  height: "100%",
                  minHeight: { xs: 0, md: 210 },
                  p: { xs: 1.25, sm: 1.5 },
                  borderRadius: { xs: 3.5, md: 4.5 },
                  color: "white",
                  bgcolor: alpha("#fff", 0.1),
                  border: "1px solid",
                  borderColor: alpha("#fff", 0.14),
                  backdropFilter: "blur(20px)",
                }}
              >
                <Stack spacing={1} sx={{ height: "100%" }}>
                  {[
                    ["Today", "Live operations view"],
                    ["Records", "Logs, PODs and fleet"],
                    ["Owner mode", "Built for quick decisions"],
                  ].map(([title, copy]) => (
                    <Box
                      key={title}
                      sx={{
                        p: { xs: 1.35, md: 1.5 },
                        borderRadius: 3,
                        bgcolor: alpha("#fff", 0.075),
                        border: "1px solid",
                        borderColor: alpha("#fff", 0.08),
                      }}
                    >
                      <Typography variant="caption" sx={{ color: alpha("#fff", 0.58) }}>
                        {copy}
                      </Typography>
                      <Typography
                        variant="subtitle2"
                        fontWeight={900}
                        sx={{ letterSpacing: "-0.025em", mt: 0.15 }}
                      >
                        {title}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            </Box>

            <Box sx={{ gridColumn: "1 / -1" }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<AddCircleOutlineIcon />}
                onClick={() => navigate("/jobs/create")}
                sx={{
                  minHeight: { xs: 56, sm: 58 },
                  width: { xs: "100%", sm: "auto" },
                  borderRadius: 3.5,
                  bgcolor: "white",
                  color: palette.ink,
                  fontWeight: 950,
                  px: { xs: 3, sm: 3.5 },
                  letterSpacing: "-0.02em",
                  boxShadow: `0 16px 36px ${alpha("#000", 0.14)}`,
                  "&:hover": {
                    bgcolor: alpha("#fff", 0.92),
                    boxShadow: `0 18px 42px ${alpha("#000", 0.18)}`,
                  },
                }}
              >
                Create Job
              </Button>
            </Box>
          </Box>
        </Paper>

        {error && (
          <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
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
              Loading dashboard...
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={{ xs: 3.75, md: 4.75 }}>
            <DashboardSection
              title="Today’s Overview"
              subtitle="A quick snapshot of jobs, completion, and driver coverage."
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(4, minmax(0, 1fr))",
                  },
                  gap: { xs: 1.5, sm: 2, lg: 2.5 },
                  alignItems: "stretch",
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <MetricCard
                    label="Today’s Jobs"
                    value={dashboard.todaysJobs}
                    helper="Scheduled for today"
                    icon={<AssignmentTurnedInIcon />}
                    accent={palette.blue}
                  />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <MetricCard
                    label="Completed Today"
                    value={dashboard.completedToday}
                    helper="Marked completed"
                    icon={<FactCheckIcon />}
                    accent={palette.emerald}
                  />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <MetricCard
                    label="Pending Jobs"
                    value={dashboard.pendingJobs}
                    helper="Still waiting"
                    icon={<PendingActionsIcon />}
                    accent={palette.amber}
                  />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <MetricCard
                    label="Total Drivers"
                    value={dashboard.totalDrivers}
                    helper="Registered users"
                    icon={<GroupsIcon />}
                    accent={palette.violet}
                  />
                </Box>
              </Box>
            </DashboardSection>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                gap: { xs: 3.25, lg: 4 },
                alignItems: "stretch",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <DashboardSection
                  title="Needs Attention"
                  subtitle="Issues the owner should be able to spot from a phone."
                >
                  <Stack spacing={1.5} sx={{ height: "100%" }}>
                    <AttentionCard
                      title="Pending POD Approvals"
                      value={dashboard.pendingPodApprovals}
                      description="Uploaded proof-of-delivery awaiting your review."
                      icon={<Inventory2OutlinedIcon />}
                      actionLabel="Review PODs"
                      onClick={() => navigate("/pods")}
                      tone={dashboard.pendingPodApprovals > 0 ? "warning" : "success"}
                    />
                    <AttentionCard
                      title="Missing Work Logs"
                      value={dashboard.missingWorkLogs}
                      description="Drivers without a work log submitted for today."
                      icon={<ErrorOutlineIcon />}
                      actionLabel="Review work logs"
                      onClick={() => navigate("/logs")}
                      tone={dashboard.missingWorkLogs > 0 ? "warning" : "success"}
                    />
                    <AttentionCard
                      title="Trucks Out of Service"
                      value={dashboard.trucksOutOfService}
                      description="Fleet records currently unable to operate."
                      icon={<LocalShippingIcon />}
                      actionLabel="Manage trucks"
                      onClick={() => navigate("/trucks")}
                      tone={dashboard.trucksOutOfService > 0 ? "warning" : "success"}
                    />
                  </Stack>
                </DashboardSection>
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <DashboardSection
                  title="Weekly Summary"
                  subtitle="Calculated from existing work logs where available."
                >
                  <Paper
                    elevation={0}
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      borderRadius: { xs: 4, sm: 5 },
                      border: "1px solid",
                      borderColor: palette.line,
                      bgcolor: palette.panel,
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.03)",
                      height: "100%",
                    }}
                  >
                    <SummaryRow
                      label="Logs Submitted This Week"
                      value={dashboard.weeklyLogs}
                      helper="Monday to today"
                    />
                    <SummaryRow
                      label="Weekly Hours"
                      value={`${dashboard.weeklyHours.toFixed(1)}h`}
                      helper="From submitted work logs"
                    />
                    <SummaryRow
                      label="Weekly Kilometres"
                      value={`${dashboard.weeklyKilometres.toFixed(1)} km`}
                      helper="From submitted work logs"
                    />
                    <SummaryRow
                      label="Ready to Invoice"
                      value={dashboard.invoiceReadyJobs}
                      helper="Completed jobs with an approved POD"
                    />
                    <SummaryRow
                      label="POD Approval Rate"
                      value={dashboard.podApprovalRate === null ? "—" : `${dashboard.podApprovalRate}%`}
                      helper={dashboard.podApprovalRate === null ? "No PODs decided yet" : "Approved vs. rejected, all time"}
                    />
                  </Paper>
                </DashboardSection>
              </Box>
            </Box>

            <DashboardSection
              title="Operational Trends"
              subtitle="Real counts straight from the database — no estimates."
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" },
                  gap: { xs: 2, sm: 2.5 },
                  alignItems: "stretch",
                }}
              >
                <ChartCard title="Job Volume Trend" helper="Jobs scheduled per day, last 14 days">
                  <LineChart
                    dataset={dashboard.jobVolumeTrend}
                    xAxis={[
                      {
                        dataKey: "date",
                        scaleType: "band",
                        valueFormatter: (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
                      },
                    ]}
                    series={[{ dataKey: "count", label: "Jobs", color: palette.blue }]}
                    height={260}
                  />
                </ChartCard>

                <ChartCard title="Jobs by Status" helper="All active jobs, any date">
                  <PieChart
                    series={[
                      {
                        data: [
                          { id: 0, value: dashboard.jobsByStatus.pending, label: "Pending", color: palette.amber },
                          { id: 1, value: dashboard.jobsByStatus["in-progress"], label: "In Progress", color: palette.blue },
                          { id: 2, value: dashboard.jobsByStatus.completed, label: "Completed", color: palette.emerald },
                        ],
                        innerRadius: 40,
                      },
                    ]}
                    height={260}
                  />
                </ChartCard>

                <ChartCard title="Fleet Status" helper="Current truck status breakdown">
                  <BarChart
                    dataset={[
                      { status: "Available", count: dashboard.truckStatusBreakdown.available },
                      { status: "On Route", count: dashboard.truckStatusBreakdown["on-route"] },
                      { status: "Out of Service", count: dashboard.truckStatusBreakdown["out-of-service"] },
                    ]}
                    xAxis={[{ dataKey: "status", scaleType: "band" }]}
                    series={[
                      {
                        dataKey: "count",
                        label: "Trucks",
                        // Same semantic colors as the status chips on the Trucks page:
                        // Available (emerald), On Route (amber), Out of Service (rose).
                        colorGetter: ({ dataIndex }) =>
                          [palette.emerald, palette.amber, palette.rose][dataIndex],
                      },
                    ]}
                    height={260}
                  />
                </ChartCard>
              </Box>
            </DashboardSection>

            <DashboardSection
              title="Quick Actions"
              subtitle="Large touch-friendly shortcuts for daily admin tasks."
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    lg: "repeat(3, minmax(0, 1fr))",
                  },
                  gap: { xs: 1.5, sm: 2, lg: 2.5 },
                  alignItems: "stretch",
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

            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.25, sm: 2.75 },
                borderRadius: { xs: 4, sm: 5 },
                border: "1px solid",
                borderColor: alpha(palette.teal, 0.16),
                bgcolor: alpha(palette.teal, 0.055),
              }}
            >
              <Stack direction="row" spacing={1.75} alignItems="flex-start">
                <Box
                  sx={{
                    width: 50,
                    height: 50,
                    borderRadius: 3.5,
                    display: "grid",
                    placeItems: "center",
                    color: palette.teal,
                    background: `linear-gradient(135deg, ${alpha(palette.teal, 0.14)}, ${alpha(
                      palette.teal,
                      0.055
                    )})`,
                    border: "1px solid",
                    borderColor: alpha(palette.teal, 0.13),
                    flexShrink: 0,
                  }}
                >
                  <TrendingUpIcon />
                </Box>
                <Box>
                  <Typography
                    variant="subtitle1"
                    fontWeight={880}
                    sx={{ color: palette.ink, letterSpacing: "-0.02em" }}
                  >
                    Next product step
                  </Typography>
                  <Typography variant="body2" sx={{ color: palette.muted, lineHeight: 1.6 }}>
                    Pay and invoice cards are intentionally placeholders until the backend has
                    job-linked PODs, pay rates, and invoice status fields.
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default HomePage;
