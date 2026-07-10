import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import BuildCircleOutlinedIcon from "@mui/icons-material/BuildCircleOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import { getAllTrucks, createTruck, updateTruck, deleteTruck } from "../../api";

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
  emerald: "#07866f",
  rose: "#b42318",
};

const statusMeta = (status) => {
  if (status === "out-of-service" || status === "maintenance") return { color: palette.rose, label: "Out of service" };
  if (status === "on-route" || status === "on route") return { color: palette.amber, label: "On route" };
  return { color: palette.emerald, label: "Available" };
};

const Trucks = () => {
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formData, setFormData] = useState({ truckNumber: "", capacity: "", outOfService: false });
  const [editTruckId, setEditTruckId] = useState(null);
  const [deleteTruckId, setDeleteTruckId] = useState(null);

  const outOfServiceTrucks = useMemo(() => trucks.filter((truck) => truck.status === "out-of-service" || truck.status === "maintenance"), [trucks]);

  const fetchTrucks = async () => {
    setLoading(true);
    try {
      const res = await getAllTrucks();
      setTrucks(res.data.data || []);
    } catch {
      setError("Failed to load trucks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrucks();
  }, []);

  const resetForm = () => {
    setEditTruckId(null);
    setFormData({ truckNumber: "", capacity: "", outOfService: false });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!formData.truckNumber || !formData.capacity) return setError("Please fill all required fields");
    try {
      const payload = {
        truckNumber: formData.truckNumber,
        capacity: formData.capacity,
      };
      if (formData.outOfService) payload.status = "out-of-service";
      if (editTruckId && !formData.outOfService) payload.status = "available";
      if (editTruckId) {
        await updateTruck(editTruckId, payload);
        setSuccess("Truck updated successfully.");
      } else {
        await createTruck(payload);
        setSuccess("Truck created successfully.");
      }
      resetForm();
      fetchTrucks();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save truck");
    }
  };

  const handleEdit = (truck) => {
    setEditTruckId(truck._id);
    setFormData({
      truckNumber: truck.truckNumber,
      capacity: truck.capacity,
      outOfService: truck.status === "out-of-service" || truck.status === "maintenance",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTruckId) return;
    setError("");
    setSuccess("");
    try {
      await deleteTruck(deleteTruckId);
      setSuccess("Truck deleted successfully.");
      setDeleteTruckId(null);
      fetchTrucks();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete truck");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1180, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Chip label="Fleet" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>Fleet Management</Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Track trucks, capacity and maintenance state before assigning work.</Typography>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}

        {outOfServiceTrucks.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
            {outOfServiceTrucks.length} truck{outOfServiceTrucks.length === 1 ? "" : "s"} currently marked out of service.
          </Alert>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "0.78fr 1.22fr" }, gap: 2.5, alignItems: "start" }}>
          <Paper component="form" onSubmit={handleSubmit} elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <Box sx={{ width: 46, height: 46, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.1) }}><LocalShippingIcon /></Box>
              <Box>
                <Typography fontWeight={950} sx={{ color: palette.ink }}>{editTruckId ? "Edit Truck" : "Add Truck"}</Typography>
                <Typography variant="body2" sx={{ color: palette.muted }}>Keep fleet details clean and dispatch-ready.</Typography>
              </Box>
            </Stack>
            <Stack spacing={1.5}>
              <TextField label="Truck Number" name="truckNumber" value={formData.truckNumber} onChange={(e) => setFormData((p) => ({ ...p, truckNumber: e.target.value.toUpperCase() }))} required fullWidth disabled={Boolean(editTruckId)} />
              <TextField label="Capacity" name="capacity" type="number" value={formData.capacity} onChange={(e) => setFormData((p) => ({ ...p, capacity: e.target.value }))} required fullWidth inputProps={{ min: 0 }} />
              <FormControlLabel
                control={<Switch checked={formData.outOfService} onChange={(e) => setFormData((p) => ({ ...p, outOfService: e.target.checked }))} />}
                label="Out of service"
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button type="submit" fullWidth variant="contained" size="large" sx={{ minHeight: 56, borderRadius: 3, bgcolor: palette.ink, fontWeight: 950 }}>
                  {editTruckId ? "Update Truck" : "Create Truck"}
                </Button>
                {editTruckId && <Button fullWidth variant="outlined" onClick={resetForm} sx={{ minHeight: 56, borderRadius: 3, fontWeight: 900 }}>Cancel</Button>}
              </Stack>
            </Stack>
          </Paper>

          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.045em" }}>Fleet</Typography>
            {loading ? (
              <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: palette.line }}>Loading trucks...</Paper>
            ) : trucks.length === 0 ? (
              <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
                <Typography fontWeight={900}>No trucks yet</Typography>
                <Typography sx={{ color: palette.muted }}>Add your first truck to start assigning work.</Typography>
              </Paper>
            ) : (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                {trucks.map((truck) => {
                  const meta = statusMeta(truck.status);
                  return (
                    <Paper key={truck._id} elevation={0} sx={{ p: 2, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                          <Box>
                            <Typography fontWeight={950} sx={{ color: palette.ink }}>{truck.truckNumber}</Typography>
                            <Typography variant="body2" sx={{ color: palette.muted }}>Capacity: {truck.capacity || "—"}</Typography>
                          </Box>
                          <Chip label={meta.label} sx={{ color: meta.color, bgcolor: alpha(meta.color, 0.1), fontWeight: 900 }} />
                        </Stack>
                        {(truck.status === "out-of-service" || truck.status === "maintenance") && (
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ color: palette.rose }}>
                            <BuildCircleOutlinedIcon fontSize="small" />
                            <Typography variant="body2" fontWeight={850}>Cannot be assigned to jobs</Typography>
                          </Stack>
                        )}
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <Button fullWidth variant="contained" startIcon={<EditIcon />} onClick={() => handleEdit(truck)} sx={{ minHeight: 48, borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>Edit</Button>
                          <Button fullWidth variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteTruckId(truck._id)} sx={{ minHeight: 48, borderRadius: 3, fontWeight: 900 }}>Delete</Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Box>
            )}
          </Stack>
        </Box>

        <Dialog open={Boolean(deleteTruckId)} onClose={() => setDeleteTruckId(null)} PaperProps={{ sx: { borderRadius: 5 } }}>
          <DialogTitle sx={{ fontWeight: 950 }}>Delete this truck?</DialogTitle>
          <DialogContent>
            <DialogContentText>If this truck is assigned to jobs or drivers, backend validation should protect those records.</DialogContentText>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setDeleteTruckId(null)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} color="error" variant="contained">Delete</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default Trucks;
