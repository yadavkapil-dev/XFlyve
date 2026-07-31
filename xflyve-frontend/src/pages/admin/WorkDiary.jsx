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
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  getAllDrivers,
  listWorkDiariesByDriver,
  deleteWorkDiary,
  getWorkDiary,
  downloadWorkDiaries,
} from "../../api";
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

const todayDateInput = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Visible hint that a record opens an inline preview — the hover state
// alone (background/cursor) isn't discoverable until a mouse happens to
// pass over it, especially on touch devices with no hover at all.
const PreviewHint = () => (
  <Stack
    direction="row"
    spacing={0.5}
    alignItems="center"
    sx={{ mt: 0.75, color: palette.teal }}
  >
    <VisibilityOutlinedIcon sx={{ fontSize: 15 }} />
    <Typography variant="caption" sx={{ fontWeight: 800 }}>
      Click to preview
    </Typography>
  </Stack>
);

const WorkDiary = () => {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [diaries, setDiaries] = useState([]);
  const [diariesPagination, setDiariesPagination] = useState(null);
  const [diariesPage, setDiariesPage] = useState(1);
  const [diariesLimit, setDiariesLimit] = useState(20);
  const [diariesFilterDateFrom, setDiariesFilterDateFrom] = useState("");
  const [diariesFilterDateTo, setDiariesFilterDateTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [downloadingRange, setDownloadingRange] = useState(false);
  const [downloadDriver, setDownloadDriver] = useState("");
  const [downloadDateFrom, setDownloadDateFrom] = useState(todayDateInput());
  const [downloadDateTo, setDownloadDateTo] = useState(todayDateInput());

  const [previewDiary, setPreviewDiary] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // NHVR compliance requests can name a driver who has since left (archived
  // on the main Drivers page) — admin still needs to select them here to
  // pull up historical diary pages, so both driver dropdowns on this page
  // include archived drivers too (visually marked), unlike the active-only
  // Drivers management page.
  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const res = await getAllDrivers({ limit: 100 });
        const active = res.data.status === "success" ? res.data.data || [] : [];
        if (res.data.status !== "success") setError("Failed to load drivers");

        let archived = [];
        try {
          const archivedRes = await getAllDrivers({ limit: 100, recordStatus: "archived" });
          archived = archivedRes.data.status === "success" ? archivedRes.data.data || [] : [];
        } catch {
          // Best-effort: a failed archived-driver lookup shouldn't block the
          // primary active-driver list from working.
        }

        setDrivers([...active, ...archived]);
      } catch (err) {
        setError(err.response?.data?.message || "Server error loading drivers");
      }
    };
    fetchDrivers();
  }, []);

  // Reset to page 1 whenever a by-driver filter changes (or the driver itself changes).
  useEffect(() => {
    setDiariesPage(1);
  }, [selectedDriver, diariesFilterDateFrom, diariesFilterDateTo]);

  const fetchDiaries = useCallback(async () => {
    setError("");
    // Not clearing success here: handleDelete sets a success message and
    // then calls this to refresh the list — clearing it here wiped the
    // confirmation before the user ever saw it.
    if (!selectedDriver) {
      setDiaries([]);
      setDiariesPagination(null);
      return;
    }
    setLoading(true);
    try {
      const params = { page: diariesPage, limit: diariesLimit };
      if (diariesFilterDateFrom) params.dateFrom = diariesFilterDateFrom;
      if (diariesFilterDateTo) params.dateTo = diariesFilterDateTo;
      const res = await listWorkDiariesByDriver(selectedDriver, params);
      setDiaries(res.data);
      setDiariesPagination(res.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || "Server error fetching diaries");
    } finally {
      setLoading(false);
    }
  }, [
    selectedDriver,
    diariesPage,
    diariesLimit,
    diariesFilterDateFrom,
    diariesFilterDateTo,
  ]);

  useEffect(() => {
    fetchDiaries();
  }, [fetchDiaries]);

  const driverName = (driver) => {
    if (driver?.name) return driver.name;
    return drivers.find((d) => d._id === driver)?.name || "Driver";
  };

  const clearDiariesFilters = () => {
    setDiariesFilterDateFrom("");
    setDiariesFilterDateTo("");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this compliance document?")) return;
    try {
      await deleteWorkDiary(id);
      setSuccess("Compliance document deleted.");
      await fetchDiaries();
    } catch {
      setError("Failed to delete work diary");
    }
  };

  const handleDownload = async (workDiary) => {
    try {
      const blob = await getWorkDiary(workDiary._id);
      const dateStr = new Date(workDiary.uploadDate || Date.now())
        .toISOString()
        .slice(0, 10);
      const filename = `WorkDiary-${driverName(workDiary.driverId).replace(/\s+/g, "_")}-${dateStr}.pdf`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      setError("Failed to download work diary");
    }
  };

  // NHVR compliance requests are "this driver's diary pages from date X to
  // date Y" (or every driver's, if driverId is left unset) — a date range,
  // not a single day like the PODs bulk download.
  const handleDownloadRange = async () => {
    if (!downloadDateFrom || !downloadDateTo) {
      setError("Both From and To dates are required to download a range.");
      return;
    }
    setError("");
    setSuccess("");
    setDownloadingRange(true);
    try {
      const res = await downloadWorkDiaries(
        downloadDateFrom,
        downloadDateTo,
        downloadDriver || undefined,
      );
      const link = document.createElement("a");
      link.href = URL.createObjectURL(res.data);
      link.download = `work_diaries_${downloadDateFrom}_to_${downloadDateTo}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(
        err.response?.status === 404
          ? "No work diary files found for that range"
          : "Failed to download work diaries",
      );
    } finally {
      setDownloadingRange(false);
    }
  };

  // Shows the actual file inline (image or PDF) instead of triggering a
  // download — reuses the same blob-fetching endpoint handleDownload uses,
  // just points it at an <img>/<iframe> instead of an <a download>.
  const openPreview = async (workDiary) => {
    setPreviewDiary(workDiary);
    setPreviewError("");
    setPreviewLoading(true);
    setPreviewUrl("");
    try {
      const blob = await getWorkDiary(workDiary._id);
      setPreviewType(blob.type || "application/pdf");
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setPreviewError("Failed to load work diary preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewDiary(null);
    setPreviewUrl("");
    setPreviewType("");
    setPreviewError("");
  };

  const previewTriggerProps = (workDiary) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": "Preview work diary file",
    onClick: () => openPreview(workDiary),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPreview(workDiary);
      }
    },
    sx: {
      cursor: "pointer",
      borderRadius: 3,
      p: 1,
      m: -1,
      transition: "background-color 120ms ease",
      "&:hover": { bgcolor: alpha(palette.teal, 0.07) },
      "&:focus-visible": {
        outline: `2px solid ${alpha(palette.teal, 0.5)}`,
        outlineOffset: 2,
      },
    },
  });

  return (
    <Box
      sx={{
        minHeight: "100vh",
        pt: { xs: 3, sm: 4 },
        pb: 6,
        overflowX: "hidden",
        background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)`,
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 1040,
          mx: "auto",
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, sm: 3.5 },
            mb: 3,
            borderRadius: 5,
            color: "white",
            background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)`,
          }}
        >
          <Chip
            label="Compliance"
            size="small"
            sx={{
              mb: 1.5,
              color: "white",
              bgcolor: alpha("#fff", 0.22),
              border: "1px solid",
              borderColor: alpha("#fff", 0.4),
              fontWeight: 850,
            }}
          />
          <Typography
            variant="h4"
            component="h1"
            fontWeight={950}
            sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}
          >
            Compliance Records
          </Typography>
          <Typography
            sx={{ mt: 1, mb: 2.5, color: alpha("#fff", 0.74), lineHeight: 1.6 }}
          >
            NHVR compliance records — pulled up on demand for a records request
            or a driver correction.
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                lg: "1fr 1fr 1fr auto",
              },
              gap: 1.25,
              alignItems: "center",
            }}
          >
            <TextField
              select
              fullWidth
              size="small"
              label="Driver"
              value={downloadDriver}
              onChange={(e) => setDownloadDriver(e.target.value)}
              sx={{
                bgcolor: alpha("#fff", 0.95),
                borderRadius: 2,
                "& .MuiOutlinedInput-root": { borderRadius: 2 },
                "& input::-webkit-calendar-picker-indicator": { cursor: "pointer" },
              }}
            >
              <MenuItem value="">All Drivers</MenuItem>
              {drivers.map((d) => (
                <MenuItem key={d._id} value={d._id}>
                  {d.name}{d.recordStatus === "archived" ? " (archived)" : ""}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="From"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={downloadDateFrom}
              onChange={(e) => setDownloadDateFrom(e.target.value)}
              sx={{
                bgcolor: alpha("#fff", 0.95),
                borderRadius: 2,
                "& .MuiOutlinedInput-root": { borderRadius: 2 },
                "& input::-webkit-calendar-picker-indicator": { cursor: "pointer" },
              }}
            />
            <TextField
              type="date"
              label="To"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={downloadDateTo}
              onChange={(e) => setDownloadDateTo(e.target.value)}
              sx={{
                bgcolor: alpha("#fff", 0.95),
                borderRadius: 2,
                "& .MuiOutlinedInput-root": { borderRadius: 2 },
                "& input::-webkit-calendar-picker-indicator": { cursor: "pointer" },
              }}
            />
            <Button
              variant="contained"
              size="large"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadRange}
              disabled={downloadingRange}
              sx={{
                minHeight: 40,
                borderRadius: 3,
                bgcolor: "white",
                color: palette.ink,
                fontWeight: 950,
                px: 2.5,
                whiteSpace: "nowrap",
                "&:hover": { bgcolor: alpha("#fff", 0.9) },
              }}
            >
              {downloadingRange ? "Preparing ZIP..." : "Download Range"}
            </Button>
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>
            {success}
          </Alert>
        )}

        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            borderRadius: 5,
            border: "1px solid",
            borderColor: palette.line,
            bgcolor: palette.panel,
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                lg: "1.4fr 1fr 1fr auto",
              },
              gap: 1.5,
              alignItems: "center",
            }}
          >
            <FormControl
              fullWidth
              size="small"
              sx={{ gridColumn: selectedDriver ? "auto" : "1 / -1" }}
            >
              <InputLabel id="driver-select-label">Select Driver</InputLabel>
              <Select
                labelId="driver-select-label"
                value={selectedDriver}
                label="Select Driver"
                onChange={(e) => setSelectedDriver(e.target.value)}
              >
                <MenuItem value="">
                  <em>Choose a driver</em>
                </MenuItem>
                {drivers.map((driver) => (
                  <MenuItem key={driver._id} value={driver._id}>
                    {driver.name}{driver.recordStatus === "archived" ? " (archived)" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedDriver && (
              <>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="From"
                  InputLabelProps={{ shrink: true }}
                  value={diariesFilterDateFrom}
                  onChange={(e) => setDiariesFilterDateFrom(e.target.value)}
                  sx={{ "& input::-webkit-calendar-picker-indicator": { cursor: "pointer" } }}
                />
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label="To"
                  InputLabelProps={{ shrink: true }}
                  value={diariesFilterDateTo}
                  onChange={(e) => setDiariesFilterDateTo(e.target.value)}
                  sx={{ "& input::-webkit-calendar-picker-indicator": { cursor: "pointer" } }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={clearDiariesFilters}
                  sx={{ borderRadius: 3, fontWeight: 850 }}
                >
                  Clear
                </Button>
              </>
            )}
          </Box>
        </Paper>

        {loading ? (
          <Paper
            elevation={0}
            sx={{
              p: 5,
              textAlign: "center",
              borderRadius: 5,
              border: "1px solid",
              borderColor: palette.line,
            }}
          >
            <CircularProgress />
          </Paper>
        ) : !selectedDriver ? (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 5,
              border: "1px solid",
              borderColor: alpha(palette.teal, 0.16),
              bgcolor: alpha(palette.teal, 0.055),
            }}
          >
            <Typography fontWeight={950}>Select a driver</Typography>
            <Typography sx={{ color: palette.muted }}>
              Compliance documents are currently stored by driver.
            </Typography>
          </Paper>
        ) : diaries.length === 0 ? (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 5,
              border: "1px solid",
              borderColor: alpha(palette.teal, 0.16),
              bgcolor: alpha(palette.teal, 0.055),
            }}
          >
            <Typography fontWeight={950}>
              No compliance records found
            </Typography>
            <Typography sx={{ color: palette.muted }}>
              This driver has not uploaded work diary documents yet.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {diaries.map((workDiary) => (
              <Paper
                key={workDiary._id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 5,
                  border: "1px solid",
                  borderColor: palette.line,
                  bgcolor: palette.panel,
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="flex-start"
                    {...previewTriggerProps(workDiary)}
                  >
                    <Box
                      sx={{
                        width: 46,
                        height: 46,
                        borderRadius: 3,
                        display: "grid",
                        placeItems: "center",
                        color: palette.teal,
                        bgcolor: alpha(palette.teal, 0.09),
                        flexShrink: 0,
                      }}
                    >
                      <DescriptionOutlinedIcon />
                    </Box>
                    <Box>
                      <Typography fontWeight={950} sx={{ color: palette.ink }}>
                        {new Date(
                          workDiary.uploadDate || Date.now(),
                        ).toLocaleDateString()}
                      </Typography>
                      <Typography variant="body2" sx={{ color: palette.muted }}>
                        Driver: {driverName(workDiary.driverId)}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: palette.muted, mt: 0.5 }}
                      >
                        {workDiary.notes || "No notes added."}
                      </Typography>
                      <PreviewHint />
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleDownload(workDiary)}
                      sx={{
                        borderRadius: 3,
                        bgcolor: palette.ink,
                        fontWeight: 800,
                        width: 100,
                      }}
                    >
                      Download
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => handleDelete(workDiary._id)}
                      sx={{
                        borderRadius: 3,
                        fontWeight: 800,
                        width: 100,
                      }}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

        {selectedDriver && (
          <PaginationControls
            pagination={diariesPagination}
            onPageChange={setDiariesPage}
            onLimitChange={(newLimit) => {
              setDiariesLimit(newLimit);
              setDiariesPage(1);
            }}
            palette={palette}
          />
        )}

        <Dialog
          open={Boolean(previewDiary)}
          onClose={closePreview}
          maxWidth="md"
          fullWidth
          PaperProps={{ sx: { borderRadius: 4 } }}
        >
          <DialogTitle
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 950,
            }}
          >
            Work Diary Preview
            <IconButton aria-label="close preview" onClick={closePreview}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {previewLoading ? (
              <Box sx={{ py: 5, textAlign: "center" }}>
                <CircularProgress />
              </Box>
            ) : previewError ? (
              <Alert severity="error">{previewError}</Alert>
            ) : previewType.startsWith("image/") ? (
              <Box
                component="img"
                src={previewUrl}
                alt="Work diary preview"
                sx={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : (
              <Box
                component="iframe"
                src={previewUrl}
                title="Work diary preview"
                sx={{ width: "100%", height: "70vh", border: "none" }}
              />
            )}
          </DialogContent>
        </Dialog>
      </Box>
    </Box>
  );
};

export default WorkDiary;
