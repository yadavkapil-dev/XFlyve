import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/Edit";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  getAllDrivers,
  getAllTrucks,
  assignTruck,
  getAllTruckAssignments,
  updateTruckAssignment,
  deleteTruckAssignment,
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

const dateKey = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA");
};

const isSelectableTruck = (truck) =>
  !["out-of-service", "maintenance", "on-route", "on route"].includes(truck.status);

const AssignAndManageTrucks = () => {
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedTruck, setSelectedTruck] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchAssignments = async () => {
    const assignmentsRes = await getAllTruckAssignments();
    setAssignments(assignmentsRes.data.data || []);
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [driversRes, trucksRes, assignmentsRes] = await Promise.all([
          getAllDrivers(),
          getAllTrucks(),
          getAllTruckAssignments(),
        ]);
        setDrivers(driversRes.data.data || []);
        setTrucks(trucksRes.data.data || []);
        setAssignments(assignmentsRes.data.data || []);
      } catch {
        setError("Failed to load assignment data");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const selectedDriverConflict = assignments.find((a) => selectedDriver && date && a.driverId?._id === selectedDriver && dateKey(a.date) === date);
  const selectedTruckConflict = assignments.find((a) => selectedTruck && date && a.truckId?._id === selectedTruck && dateKey(a.date) === date);
  const todaysAssignments = useMemo(() => assignments.filter((a) => dateKey(a.date) === new Date().toLocaleDateString("en-CA")), [assignments]);
  const selectableTrucks = useMemo(() => trucks.filter(isSelectableTruck), [trucks]);
  const selectedEditTruck = trucks.find((truck) => truck._id === editData?.truckId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!selectedDriver || !selectedTruck || !date) return setError("Please select driver, truck, and date.");
    setSubmitting(true);
    try {
      const res = await assignTruck({ driverId: selectedDriver, truckId: selectedTruck, date });
      if (res.data.success) {
        setSuccess("Truck assigned successfully.");
        setSelectedDriver("");
        setSelectedTruck("");
        setDate("");
        await fetchAssignments();
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to assign truck.");
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (assignment) => {
    setEditData({
      id: assignment._id,
      driverId: assignment.driverId?._id || "",
      truckId: assignment.truckId?._id || "",
      date: dateKey(assignment.date),
    });
    setEditOpen(true);
    setError("");
    setSuccess("");
  };

  const handleEditSubmit = async () => {
    const { id, driverId, truckId, date: editDate } = editData;
    if (!driverId || !truckId || !editDate) return setError("All fields are required.");
    try {
      await updateTruckAssignment(id, { driverId, truckId, date: editDate });
      await fetchAssignments();
      setEditOpen(false);
      setEditData(null);
      setSuccess("Assignment updated successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Update failed.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTruckAssignment(deleteTarget._id);
      setAssignments((prev) => prev.filter((a) => a._id !== deleteTarget._id));
      setDeleteTarget(null);
      setSuccess("Assignment deleted successfully.");
    } catch {
      setError("Delete failed.");
    }
  };

  if (loading) {
    return <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center" }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1180, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Chip label="Dispatch" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>Assign Trucks</Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Match drivers and trucks for the day before creating or reviewing runs.</Typography>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}
        {(selectedDriverConflict || selectedTruckConflict) && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
            Possible conflict: {selectedDriverConflict ? "this driver already has an assignment" : "this truck already has an assignment"} for the selected date.
          </Alert>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "0.85fr 1.15fr" }, gap: 2.5, alignItems: "start" }}>
          <Paper component="form" onSubmit={handleSubmit} elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
            <Stack spacing={1.5}>
              <Typography fontWeight={950} sx={{ color: palette.ink }}>New Assignment</Typography>
              <TextField select fullWidth label="Select Driver" value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} required>
                {drivers.map((driver) => <MenuItem key={driver._id} value={driver._id}>{driver.name}</MenuItem>)}
              </TextField>
              <TextField select fullWidth label="Select Truck" value={selectedTruck} onChange={(e) => setSelectedTruck(e.target.value)} required>
                {selectableTrucks.map((truck) => <MenuItem key={truck._id} value={truck._id}>{truck.truckNumber}</MenuItem>)}
              </TextField>
              <TextField fullWidth label="Assignment Date" type="date" InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} required />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={submitting} sx={{ minHeight: 56, borderRadius: 3, bgcolor: palette.ink, fontWeight: 950 }}>
                {submitting ? "Assigning..." : "Assign Truck"}
              </Button>
            </Stack>
          </Paper>

          <Stack spacing={2}>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
              <Typography fontWeight={950} sx={{ color: palette.ink }}>Today’s Assignments</Typography>
              <Typography variant="body2" sx={{ color: palette.muted }}>{todaysAssignments.length} assignment{todaysAssignments.length === 1 ? "" : "s"} scheduled today.</Typography>
            </Paper>

            <Typography variant="h5" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.045em" }}>Assignment History</Typography>
            {assignments.length === 0 ? (
              <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: palette.line }}>No assignments found.</Paper>
            ) : (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                {assignments.map((assignment) => (
                  <Paper key={assignment._id} elevation={0} sx={{ p: 2, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} alignItems="center"><PersonOutlineIcon sx={{ color: palette.teal }} /><Typography fontWeight={950}>{assignment.driverId?.name || "Unknown driver"}</Typography></Stack>
                      <Stack direction="row" spacing={1} alignItems="center"><LocalShippingIcon sx={{ color: palette.teal }} /><Typography>{assignment.truckId?.truckNumber || "Unknown truck"}</Typography></Stack>
                      <Stack direction="row" spacing={1} alignItems="center"><EventAvailableIcon sx={{ color: palette.teal }} /><Typography>{assignment.date ? new Date(assignment.date).toLocaleDateString() : "No date"}</Typography></Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button fullWidth variant="contained" startIcon={<EditIcon />} onClick={() => openEditDialog(assignment)} sx={{ borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>Edit</Button>
                        <Button fullWidth variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteTarget(assignment)} sx={{ borderRadius: 3, fontWeight: 900 }}>Delete</Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Box>
            )}
          </Stack>
        </Box>

        <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 5 } }}>
          <DialogTitle sx={{ fontWeight: 950 }}>Edit Assignment</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} mt={1}>
              <TextField select label="Driver" name="driverId" value={editData?.driverId || ""} onChange={(e) => setEditData((prev) => ({ ...prev, driverId: e.target.value }))} fullWidth>
                {drivers.map((d) => <MenuItem key={d._id} value={d._id}>{d.name}</MenuItem>)}
              </TextField>
              <TextField select label="Truck" name="truckId" value={editData?.truckId || ""} onChange={(e) => setEditData((prev) => ({ ...prev, truckId: e.target.value }))} fullWidth>
                {selectedEditTruck && !isSelectableTruck(selectedEditTruck) && (
                  <MenuItem value={selectedEditTruck._id} disabled>{selectedEditTruck.truckNumber} · unavailable</MenuItem>
                )}
                {selectableTrucks.map((t) => <MenuItem key={t._id} value={t._id}>{t.truckNumber}</MenuItem>)}
              </TextField>
              <TextField label="Date" type="date" name="date" value={editData?.date || ""} onChange={(e) => setEditData((prev) => ({ ...prev, date: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSubmit} variant="contained" sx={{ bgcolor: palette.ink }}>Save</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} PaperProps={{ sx: { borderRadius: 5 } }}>
          <DialogTitle sx={{ fontWeight: 950 }}>Delete assignment?</DialogTitle>
          <DialogContent><Typography sx={{ color: palette.muted }}>This removes the truck assignment record.</Typography></DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} color="error" variant="contained">Delete</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default AssignAndManageTrucks;
