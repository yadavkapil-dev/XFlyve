import React, { useEffect, useState } from "react";
import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { getJobsReadyForInvoicing } from "../../api";

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

const Invoicing = () => {
  const [invoiceReadyJobs, setInvoiceReadyJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchInvoiceReadyJobs = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getJobsReadyForInvoicing();
        setInvoiceReadyJobs(res.data.data || []);
      } catch (err) {
        setError(err.response?.data?.message || "Server error loading invoice-ready jobs");
      } finally {
        setLoading(false);
      }
    };
    fetchInvoiceReadyJobs();
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", pt: { xs: 3, sm: 4 }, pb: 6, overflowX: "hidden", background: `radial-gradient(circle at 0% 0%, ${alpha(palette.teal, 0.13)}, transparent 32%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)` }}>
      <Box sx={{ width: "100%", maxWidth: 900, mx: "auto", px: { xs: 2, sm: 3, md: 4 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, mb: 3, borderRadius: 5, color: "white", background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)` }}>
          <Chip label="Invoicing" size="small" sx={{ mb: 1.5, color: "white", bgcolor: alpha("#fff", 0.12), fontWeight: 850 }} />
          <Typography variant="h4" fontWeight={950} sx={{ letterSpacing: "-0.065em", lineHeight: 1.05 }}>Ready to invoice</Typography>
          <Typography sx={{ mt: 1, color: alpha("#fff", 0.74), lineHeight: 1.6 }}>Completed jobs with an approved POD — work diaries and logs no longer gate invoicing.</Typography>
        </Paper>

        <Paper elevation={0} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 5, border: "1px solid", borderColor: palette.line, bgcolor: palette.panel }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
              <Box>
                <Typography variant="h5" fontWeight={950} sx={{ color: palette.ink, letterSpacing: "-0.045em" }}>Ready to invoice</Typography>
                <Typography variant="body2" sx={{ color: palette.muted }}>Completed jobs with an approved POD.</Typography>
              </Box>
              <Chip icon={<ReceiptLongIcon />} label={`${invoiceReadyJobs.length} ready`} sx={{ alignSelf: { xs: "flex-start", sm: "center" }, color: palette.teal, bgcolor: alpha(palette.teal, 0.1), fontWeight: 900 }} />
            </Stack>

            {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}

            {loading ? (
              <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={28} /></Box>
            ) : invoiceReadyJobs.length === 0 ? (
              <Typography sx={{ color: palette.muted }}>No jobs are invoice-ready yet.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {invoiceReadyJobs.map((job) => (
                  <Paper key={job._id} elevation={0} sx={{ p: 2, borderRadius: 4, border: "1px solid", borderColor: palette.line, bgcolor: alpha("#fff", 0.74) }}>
                    <Typography fontWeight={950} sx={{ color: palette.ink }}>{job.title || "Untitled job"}</Typography>
                    <Typography variant="body2" sx={{ color: palette.muted }}>{job.pickupLocation || "Pickup"} → {job.deliveryLocation || "Delivery"}</Typography>
                    <Typography variant="body2" sx={{ color: palette.muted }}>Driver: {job.assignedTo?.name || "—"} · Truck: {job.assignedTruck?.truckNumber || "—"}</Typography>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
};

export default Invoicing;
