import React, { useCallback, useEffect, useState } from "react";
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
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import { getAllDrivers, createDriver, updateDriver, deleteDriver } from "../../api";

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

// Fixed high limit instead of pagination — matches the same small-team
// simplification already applied to Logs/Jobs/PODs (e.g. PodsList's
// pending-queue fetch).
const DRIVERS_FETCH_LIMIT = 100;

const emptyProfileFields = {
  phone: "",
  hourlyRate: "",
  kmRate: "",
};

const emptyDriver = { name: "", email: "", password: "", ...emptyProfileFields };
const emptyEditDriver = { id: "", name: "", email: "", password: "", ...emptyProfileFields };

// Builds the optional profile fields for create/update payloads — only
// includes a field if the admin actually set it, and converts rate fields
// to numbers (they're plain text inputs in state).
const buildProfilePayload = (fields) => {
  const payload = {};
  if (fields.phone.trim()) payload.phone = fields.phone.trim();
  if (fields.hourlyRate !== "") payload.hourlyRate = Number(fields.hourlyRate);
  if (fields.kmRate !== "") payload.kmRate = Number(fields.kmRate);
  return payload;
};

const getBackendErrorMessage = (err, fallback) => {
  const data = err.response?.data;
  if (data?.message) return data.message;
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.map((item) => item.message).filter(Boolean).join(", ");
  }
  return err.message || fallback;
};

// Shared by the create form and edit dialog — same optional profile fields
// in both places.
const DriverProfileFields = ({ fields, onFieldChange }) => (
  <>
    <TextField label="Phone" value={fields.phone} onChange={(e) => onFieldChange("phone", e.target.value)} fullWidth />
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" }, gap: 1.5 }}>
      <TextField label="Hourly Rate" type="number" value={fields.hourlyRate} onChange={(e) => onFieldChange("hourlyRate", e.target.value)} inputProps={{ min: 0, step: "0.01" }} fullWidth />
      <TextField label="KM Rate" type="number" value={fields.kmRate} onChange={(e) => onFieldChange("kmRate", e.target.value)} inputProps={{ min: 0, step: "0.01" }} fullWidth />
    </Box>
  </>
);

const Drivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(emptyDriver);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteDriverId, setDeleteDriverId] = useState(null);
  const [editDriver, setEditDriver] = useState(emptyEditDriver);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getAllDrivers({ limit: DRIVERS_FETCH_LIMIT, sort: "name" });
      setDrivers(res.data.data || []);
    } catch (err) {
      console.error("Fetch drivers error:", err.response || err);
      setError("Failed to load drivers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        ...buildProfilePayload(formData),
      };
      await createDriver(payload);
      setSuccess("Driver created successfully.");
      setFormData(emptyDriver);
      fetchDrivers();
    } catch (err) {
      setError(getBackendErrorMessage(err, "Failed to create driver"));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDriverId) return;
    setError("");
    setSuccess("");
    try {
      const res = await deleteDriver(deleteDriverId);
      // The backend archives the driver (soft-delete, same pattern as
      // Trucks) rather than permanently removing it — historical
      // jobs/PODs/work diaries still reference this driverId, so a hard
      // delete would orphan those records. Surface its own message rather
      // than a hardcoded "deleted", since "deleted" implies the record is
      // gone, not just hidden from the active roster.
      setSuccess(res.data?.message || "Driver archived.");
      setDeleteDriverId(null);
      fetchDrivers();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to delete driver");
    }
  };

  const openEdit = (driver) => {
    setEditDriver({
      id: driver._id,
      name: driver.name || "",
      email: driver.email || "",
      password: "",
      phone: driver.phone || "",
      hourlyRate: driver.hourlyRate ?? "",
      kmRate: driver.kmRate ?? "",
    });
    setEditOpen(true);
    setError("");
    setSuccess("");
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditDriver(emptyEditDriver);
  };

  const handleEditSubmit = async () => {
    setError("");
    setSuccess("");
    setEditSubmitting(true);
    try {
      const payload = {
        name: editDriver.name,
        email: editDriver.email,
        ...buildProfilePayload(editDriver),
      };
      if (editDriver.password.trim()) {
        payload.password = editDriver.password;
      }

      await updateDriver(editDriver.id, payload);
      setSuccess("Driver updated successfully.");
      closeEdit();
      fetchDrivers();
    } catch (err) {
      setError(getBackendErrorMessage(err, "Failed to update driver"));
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 1180, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Chip label="Team" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>Driver Management</Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Create driver accounts and keep your operating team ready for daily work.</Typography>
        </Paper>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "0.8fr 1.2fr" }, gap: 2.5, alignItems: "start" }}>
          <Paper component="form" onSubmit={handleSubmit} elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <Box sx={{ width: 46, height: 46, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.1) }}><PersonAddAltIcon /></Box>
              <Box>
                <Typography fontWeight={950} sx={{ color: palette.ink }}>Create Driver</Typography>
                <Typography variant="body2" sx={{ color: palette.muted }}>Add a real driver login.</Typography>
              </Box>
            </Stack>
            <Stack spacing={1.5}>
              <TextField label="Name" name="name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} required fullWidth />
              <TextField label="Email" name="email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} required fullWidth />
              <TextField label="Temporary Password" name="password" type="password" value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} required fullWidth />
              <DriverProfileFields fields={formData} onFieldChange={(key, value) => setFormData((p) => ({ ...p, [key]: value }))} />
              <Button type="submit" variant="contained" size="large" fullWidth sx={{ minHeight: 56, borderRadius: 3, bgcolor: palette.ink, fontWeight: 950 }}>
                Create Driver
              </Button>
            </Stack>
          </Paper>

          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.045em" }}>Drivers</Typography>

            {loading ? (
              <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: palette.line }}>Loading drivers...</Paper>
            ) : drivers.length === 0 ? (
              <Paper elevation={0} sx={{ p: 3, borderRadius: 5, border: "1px solid", borderColor: alpha(palette.teal, 0.16), bgcolor: alpha(palette.teal, 0.055) }}>
                <Typography fontWeight={900}>No drivers yet</Typography>
                <Typography sx={{ color: palette.muted }}>Create your first driver account.</Typography>
              </Paper>
            ) : (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                {drivers.map((driver) => (
                  <Paper key={driver._id || driver.email} elevation={0} sx={{ p: 2, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ width: 46, height: 46, borderRadius: 3, display: "grid", placeItems: "center", color: palette.teal, bgcolor: alpha(palette.teal, 0.09), flexShrink: 0 }}><PersonOutlineIcon /></Box>
                        <Box minWidth={0}>
                          <Typography fontWeight={950} noWrap sx={{ color: palette.ink }}>{driver.name}</Typography>
                          <Typography variant="body2" noWrap sx={{ color: palette.muted }}>{driver.email}</Typography>
                        </Box>
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip label={driver.role || "driver"} sx={{ fontWeight: 850 }} />
                      </Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button fullWidth variant="contained" startIcon={<EditIcon />} onClick={() => openEdit(driver)} disabled={!driver._id} sx={{ minHeight: 48, borderRadius: 3, bgcolor: palette.ink, fontWeight: 900 }}>
                          Edit
                        </Button>
                        <Button fullWidth variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteDriverId(driver._id)} disabled={!driver._id} sx={{ minHeight: 48, borderRadius: 3, fontWeight: 900 }}>
                          Delete
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Box>
            )}
          </Stack>
        </Box>

        <Dialog open={Boolean(deleteDriverId)} onClose={() => setDeleteDriverId(null)} PaperProps={{ sx: { borderRadius: 5 } }}>
          <DialogTitle sx={{ fontWeight: 950 }}>Archive this driver?</DialogTitle>
          <DialogContent>
            <DialogContentText>This archives the driver account and removes them from the active roster — it is not a permanent delete. Historical jobs/PODs/work diaries still reference this driver.</DialogContentText>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setDeleteDriverId(null)}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} color="error" variant="contained">Archive</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={editOpen} onClose={closeEdit} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 5 } }}>
          <DialogTitle sx={{ fontWeight: 950 }}>Edit Driver</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 1 }}>
              <TextField label="Name" value={editDriver.name} onChange={(e) => setEditDriver((p) => ({ ...p, name: e.target.value }))} required fullWidth />
              <TextField label="Email" type="email" value={editDriver.email} onChange={(e) => setEditDriver((p) => ({ ...p, email: e.target.value }))} required fullWidth />
              <TextField
                label="New password (leave blank to keep current password)"
                type="password"
                value={editDriver.password}
                onChange={(e) => setEditDriver((p) => ({ ...p, password: e.target.value }))}
                fullWidth
              />
              <DriverProfileFields fields={editDriver} onFieldChange={(key, value) => setEditDriver((p) => ({ ...p, [key]: value }))} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeEdit}>Cancel</Button>
            <Button onClick={handleEditSubmit} variant="contained" disabled={editSubmitting} sx={{ bgcolor: palette.ink, fontWeight: 900 }}>
              {editSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
};

export default Drivers;
