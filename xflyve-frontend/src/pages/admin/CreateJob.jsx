import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import dayjs from "dayjs";
import {
  getAllTrucks,
  getAllTruckAssignments,
  getAllDrivers,
  createJob,
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
  amber: "#b76e00",
};

const emptyForm = {
  title: "",
  description: "",
  truckId: "",
  assignedTo: "",
  jobDate: "",
  startTime: "",
  pickupLocation: "",
  deliveryLocation: "",
  jobType: "",
};

const safeArray = (res, keys = []) => {
  for (const key of keys) {
    if (Array.isArray(res?.data?.[key])) return res.data[key];
  }
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data)) return res.data;
  return [];
};

const isSelectableTruck = (truck) =>
  !["out-of-service", "maintenance", "on-route", "on route"].includes(truck.status);

const getAssignmentDriverId = (assignment) => {
  if (!assignment?.driverId) return "";
  return assignment.driverId._id || assignment.driverId;
};

const SectionCard = ({ icon, title, subtitle, children }) => (
  <Paper
    elevation={0}
    sx={{
      p: { xs: 2, sm: 2.5 },
      borderRadius: 5,
      border: "1px solid",
      borderColor: palette.line,
      bgcolor: palette.panel,
    }}
  >
    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 3,
          display: "grid",
          placeItems: "center",
          color: palette.teal,
          bgcolor: alpha(palette.teal, 0.1),
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.025em" }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ color: palette.muted, lineHeight: 1.55 }}>
          {subtitle}
        </Typography>
      </Box>
    </Stack>
    {children}
  </Paper>
);

const CreateJob = () => {
  const [trucks, setTrucks] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [trucksRes, assignmentsRes, driversRes] = await Promise.all([
          getAllTrucks(),
          getAllTruckAssignments(),
          getAllDrivers(),
        ]);
        setTrucks(safeArray(trucksRes, ["trucks"]));
        setAssignments(safeArray(assignmentsRes, ["assignments"]));
        setDrivers(safeArray(driversRes, ["users"]));
      } catch (err) {
        console.error("Load error:", err);
        setError("Failed to load trucks, assignments, or drivers");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const selectedTruck = trucks.find((truck) => truck._id === formData.truckId);
  const selectableTrucks = trucks.filter(isSelectableTruck);
  const selectedDriver = drivers.find((driver) => driver._id === formData.assignedTo);
  const selectedAssignment = assignments.find((a) => a.truckId?._id === formData.truckId);
  const todayDate = dayjs().format("YYYY-MM-DD");

  const assignmentWarning = useMemo(() => {
    if (!selectedAssignment) return "";
    const assignedDate = selectedAssignment.date ? new Date(selectedAssignment.date).toLocaleDateString() : "its assigned date";
    return `This truck already has an assignment for ${assignedDate}. The backend only allows this page to infer availability from assignment records.`;
  }, [selectedAssignment]);

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleTruckSelect = (truckId) => {
    const assignment = assignments.find((a) => a.truckId?._id === truckId);
    const assignmentDriverId = getAssignmentDriverId(assignment);

    if (formData.assignedTo && assignmentDriverId && formData.assignedTo !== assignmentDriverId) {
      setError("Selected truck is assigned to a different driver. Choose that assigned driver or select another truck.");
    } else {
      setError("");
    }

    setFormData((prev) => ({
      ...prev,
      truckId,
      assignedTo: prev.assignedTo || assignmentDriverId,
      jobDate: assignment?.date ? assignment.date.split("T")[0] : prev.jobDate,
    }));
  };

  const hasAssignmentDriverConflict = () => {
    const assignment = assignments.find((a) => a.truckId?._id === formData.truckId);
    const assignmentDriverId = getAssignmentDriverId(assignment);
    return Boolean(assignmentDriverId && formData.assignedTo && formData.assignedTo !== assignmentDriverId);
  };

  const isValidDate = () => {
    const assignment = assignments.find((a) => a.truckId?._id === formData.truckId);
    if (!assignment) return true;
    return new Date(formData.jobDate).toDateString() === new Date(assignment.date).toDateString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const requiredFields = [
      "title",
      "truckId",
      "assignedTo",
      "jobDate",
      "startTime",
      "pickupLocation",
      "deliveryLocation",
      "jobType",
    ];

    if (requiredFields.some((field) => !formData[field])) {
      setError("Please complete every required section before creating the run.");
      return;
    }

    if (dayjs(formData.jobDate).isBefore(dayjs(todayDate), "day")) {
      setError("Job date cannot be in the past.");
      return;
    }

    if (hasAssignmentDriverConflict()) {
      setError("Selected truck is assigned to a different driver. Choose that assigned driver or select another truck.");
      return;
    }

    if (!isValidDate()) {
      setError("Run date must match the selected truck assignment date.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = { ...formData, assignedTruck: formData.truckId };
      delete payload.truckId;
      await createJob(payload);
      setSuccess("Run created successfully.");
      setFormData(emptyForm);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Job creation error:", err);
      setError(err.response?.data?.message || "Failed to create run");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1100, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Chip label="Operations" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>
            Create Run
          </Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), maxWidth: 680, lineHeight: 1.6 }}>
            Build a driver-ready job with route, schedule, truck and assignment details in one clean flow.
          </Typography>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}
        {assignmentWarning && <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>{assignmentWarning}</Alert>}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.35fr 0.85fr" }, gap: 2.5, alignItems: "start" }}>
            <Stack spacing={2.5}>
              <SectionCard icon={<AltRouteIcon />} title="Route Information" subtitle="What is moving, where it starts, and where it needs to arrive.">
                <Stack spacing={1.5}>
                  <TextField fullWidth label="Run Title" name="title" value={formData.title} onChange={handleChange} required />
                  <TextField fullWidth label="Run Description" name="description" multiline rows={3} value={formData.description} onChange={handleChange} />
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                    <TextField fullWidth label="Pickup Location" name="pickupLocation" value={formData.pickupLocation} onChange={handleChange} required />
                    <TextField fullWidth label="Delivery Location" name="deliveryLocation" value={formData.deliveryLocation} onChange={handleChange} required />
                  </Box>
                </Stack>
              </SectionCard>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2.5 }}>
                <SectionCard icon={<AssignmentIndIcon />} title="Driver Assignment" subtitle="Choose who will complete this run.">
                  <TextField select fullWidth label="Assigned Driver" name="assignedTo" value={formData.assignedTo} onChange={handleChange} required>
                    {drivers.map((driver) => (
                      <MenuItem key={driver._id} value={driver._id}>
                        {driver.name} {driver.driverType ? `· ${driver.driverType}` : ""}
                      </MenuItem>
                    ))}
                  </TextField>
                </SectionCard>

                <SectionCard icon={<LocalShippingIcon />} title="Truck Assignment" subtitle="Use the truck already assigned to the run where possible.">
                  <TextField select fullWidth label="Select Truck" name="truckId" value={formData.truckId} onChange={(e) => handleTruckSelect(e.target.value)} required>
                    {selectableTrucks.map((truck) => {
                      const isAssigned = assignments.some((a) => a.truckId?._id === truck._id);
                      return (
                        <MenuItem key={truck._id} value={truck._id}>
                          {truck.truckNumber} {isAssigned ? "· assigned" : ""}
                        </MenuItem>
                      );
                    })}
                  </TextField>
                </SectionCard>
              </Box>

              <SectionCard icon={<CalendarMonthIcon />} title="Schedule" subtitle="Set the run date, start time and type.">
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                  <TextField fullWidth type="date" label="Run Date" name="jobDate" InputLabelProps={{ shrink: true }} inputProps={{ min: todayDate }} value={formData.jobDate} onChange={handleChange} required />
                  <TextField fullWidth type="time" label="Start Time" name="startTime" InputLabelProps={{ shrink: true }} value={formData.startTime} onChange={handleChange} required />
                  <TextField select fullWidth label="Run Type" name="jobType" value={formData.jobType} onChange={handleChange} required>
                    <MenuItem value="local">Local</MenuItem>
                    <MenuItem value="interstate">Interstate</MenuItem>
                  </TextField>
                </Box>
              </SectionCard>
            </Stack>

            <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel, position: { lg: "sticky" }, top: { lg: 92 } }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.1) }}>
                  <CheckCircleOutlineIcon />
                </Box>
                <Box>
                  <Typography fontWeight={950} sx={{ color: palette.ink }}>Review</Typography>
                  <Typography variant="body2" sx={{ color: palette.muted }}>Quick check before creating.</Typography>
                </Box>
              </Stack>
              <Stack spacing={1.25}>
                {[
                  ["Route", formData.pickupLocation && formData.deliveryLocation ? `${formData.pickupLocation} → ${formData.deliveryLocation}` : "Not set"],
                  ["Driver", selectedDriver?.name || "Not assigned"],
                  ["Truck", selectedTruck?.truckNumber || "Not assigned"],
                  ["Date", formData.jobDate || "Not scheduled"],
                  ["Start Time", formData.startTime || "Not set"],
                  ["Type", formData.jobType || "Not selected"],
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>{label}</Typography>
                    <Typography fontWeight={900} sx={{ color: palette.ink, wordBreak: "break-word" }}>{value}</Typography>
                    <Divider sx={{ mt: 1.25 }} />
                  </Box>
                ))}
                <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting} sx={{ mt: 1, minHeight: 56, borderRadius: 3, bgcolor: palette.ink, fontWeight: 950 }}>
                  {submitting ? <CircularProgress size={22} sx={{ color: "white" }} /> : "Create Run"}
                </Button>
              </Stack>
            </Paper>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default CreateJob;
