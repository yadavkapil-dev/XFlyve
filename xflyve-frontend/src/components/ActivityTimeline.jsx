import React, { useEffect, useState } from "react";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { getJobActivity } from "../api";

const palette = {
  ink: "#0b1220",
  muted: "#697586",
  line: "rgba(15, 23, 42, 0.075)",
  teal: "#0e7c76",
};

const ACTION_LABELS = {
  JOB_CREATED: "created this job",
  JOB_ASSIGNED: "assigned this job",
  JOB_UPDATED: "updated job details",
  JOB_STARTED: "started this job",
  JOB_COMPLETED: "completed this job",
  POD_SUBMITTED: "submitted a proof of delivery",
  POD_APPROVED: "approved a proof of delivery",
  POD_REJECTED: "rejected a proof of delivery",
  DIARY_SUBMITTED: "submitted a work diary",
  DIARY_APPROVED: "approved a work diary",
  DIARY_REJECTED: "rejected a work diary",
  WORK_LOG_SUBMITTED: "submitted a daily work log",
  WORK_LOG_APPROVED: "approved a daily work log",
  WORK_LOG_REJECTED: "rejected a daily work log",
};

const describeActivity = (activity) => {
  const actorName = activity.actorId?.name || "Someone";
  const label = ACTION_LABELS[activity.action] || activity.action.toLowerCase().replace(/_/g, " ");
  const reason = activity.metadata?.rejectionReason;
  return reason ? `${actorName} ${label}: ${reason}` : `${actorName} ${label}`;
};

const formatTimestamp = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Simple, read-only chronological activity history for one job — the only
// audit UI this phase adds (no separate audit administration page).
const ActivityTimeline = ({ jobId }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    const fetchActivity = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getJobActivity(jobId);
        if (!cancelled) setActivities(res.data.data || []);
      } catch {
        if (!cancelled) setError("Failed to load activity history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchActivity();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (loading) {
    return (
      <Box sx={{ py: 2, textAlign: "center" }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography variant="body2" sx={{ color: "#b42318" }}>
        {error}
      </Typography>
    );
  }

  if (activities.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: palette.muted }}>
        No activity recorded yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={0}>
      {activities.map((activity, index) => (
        <Stack key={activity._id || index} direction="row" spacing={1.5} sx={{ position: "relative" }}>
          <Stack alignItems="center" sx={{ width: 16, flexShrink: 0 }}>
            <Box
              sx={{
                mt: 0.6,
                width: 9,
                height: 9,
                borderRadius: "50%",
                bgcolor: palette.teal,
                flexShrink: 0,
              }}
            />
            {index < activities.length - 1 && (
              <Box sx={{ flex: 1, width: "2px", bgcolor: palette.line, my: 0.25 }} />
            )}
          </Stack>
          <Box sx={{ pb: 2, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={800} sx={{ color: palette.ink }}>
              {describeActivity(activity)}
            </Typography>
            <Typography variant="caption" sx={{ color: palette.muted }}>
              {formatTimestamp(activity.createdAt)}
            </Typography>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
};

export default ActivityTimeline;
