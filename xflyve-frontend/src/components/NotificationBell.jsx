import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import { useNotifications } from "../contexts/NotificationContext";

const palette = {
  ink: "#0b1220",
  muted: "#697586",
  teal: "#0e7c76",
  amber: "#b76e00",
};

const formatRelativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
};

// Consolidates "job started" / "job completed" / "POD uploaded" etc. into
// one heading per job instead of scattered standalone entries — admin's
// actual workflow is "which jobs are done, whose POD needs approving", not
// a flat event stream. `notifications` is already newest-first (REST fetch
// + live-prepended socket events), so a job's heading naturally lands at
// the position of its most recent notification, and every other
// notification for that same job (wherever it appears later in the list)
// is absorbed into that same group rather than rendered again on its own.
// Notifications with no relatedJobId (not every type is job-linked, e.g. an
// unlinked POD) render individually, untouched, at their own position.
const groupNotificationsByJob = (notifications) => {
  const groupIndexByJobId = new Map();
  const items = [];

  notifications.forEach((notification) => {
    const relatedJob = notification.relatedJobId;
    const jobId = relatedJob && typeof relatedJob === "object" ? relatedJob._id : relatedJob;

    if (!jobId) {
      items.push({ type: "single", notification });
      return;
    }

    if (groupIndexByJobId.has(jobId)) {
      items[groupIndexByJobId.get(jobId)].notifications.push(notification);
      return;
    }

    groupIndexByJobId.set(jobId, items.length);
    items.push({
      type: "group",
      jobId,
      jobTitle: (relatedJob && typeof relatedJob === "object" && relatedJob.title) || "Job",
      notifications: [notification],
    });
  });

  return items;
};

// Shared row renderer — used both for standalone notifications and for
// each notification listed beneath a job group's heading.
const NotificationRow = ({ notification, onClick }) => (
  <MenuItem
    onClick={onClick}
    sx={{
      whiteSpace: "normal",
      alignItems: "flex-start",
      py: 1.25,
      px: 2,
      gap: 1,
      bgcolor: notification.read ? "transparent" : alpha(palette.teal, 0.055),
      "&:hover": { bgcolor: alpha(palette.teal, 0.09) },
    }}
  >
    <Box
      sx={{
        mt: 0.6,
        width: 8,
        height: 8,
        borderRadius: "50%",
        flexShrink: 0,
        bgcolor: notification.read ? "transparent" : palette.amber,
      }}
    />
    <Box minWidth={0} sx={{ flex: 1 }}>
      <Typography variant="body2" fontWeight={notification.read ? 700 : 900} sx={{ color: palette.ink }}>
        {notification.title}
      </Typography>
      <Typography variant="body2" sx={{ color: palette.muted, lineHeight: 1.4 }}>
        {notification.message}
      </Typography>
      <Typography variant="caption" sx={{ color: palette.muted }}>
        {formatRelativeTime(notification.createdAt)}
      </Typography>
    </Box>
  </MenuItem>
);

// Bell icon + unread badge + dropdown list, mounted in the shared Navbar so
// both admin and driver sessions get it. Real-time updates come from
// NotificationContext's socket subscription — this component only reads
// context state and calls its mark-read helpers.
const NotificationBell = () => {
  const { notifications, unreadCount, markOneRead, markAllRead } = useNotifications();
  const [anchorEl, setAnchorEl] = useState(null);
  const isOpen = Boolean(anchorEl);
  const groupedItems = useMemo(() => groupNotificationsByJob(notifications), [notifications]);

  const handleOpen = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markOneRead(notification._id);
    }
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        sx={{
          width: 44,
          height: 44,
          borderRadius: 3,
          bgcolor: alpha("#fff", 0.1),
          border: "1px solid",
          borderColor: alpha("#fff", 0.14),
          "&:hover": { bgcolor: alpha("#fff", 0.16) },
        }}
      >
        <Badge
          badgeContent={unreadCount}
          max={99}
          color="error"
          overlap="circular"
        >
          <NotificationsRoundedIcon sx={{ color: "white" }} fontSize="small" />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={isOpen}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{
          elevation: 0,
          sx: {
            mt: 1.25,
            width: { xs: 320, sm: 380 },
            maxHeight: 440,
            borderRadius: 4,
            border: "1px solid",
            borderColor: "rgba(15, 23, 42, 0.08)",
            boxShadow: "0 22px 70px rgba(15, 23, 42, 0.16)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          },
        }}
        // MenuList wraps everything passed as Menu's children (header row
        // included), so it's turned into a plain flex column here — the
        // header/divider below are flexShrink:0, and the notifications
        // block below them is the one flex:1 scrolling region. Previously
        // the Paper had `overflow: hidden` with a fixed maxHeight and no
        // scroll container underneath, so content past 440px was just
        // clipped — never actually scrollable.
        MenuListProps={{ sx: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, py: 0 } }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
          <Typography variant="subtitle2" fontWeight={950} sx={{ color: palette.ink }}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              onClick={markAllRead}
              sx={{ fontWeight: 800, textTransform: "none", color: palette.teal }}
            >
              Mark all read
            </Button>
          )}
        </Stack>
        <Divider sx={{ flexShrink: 0 }} />

        <Box sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
          {notifications.length === 0 ? (
            <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
              <Typography variant="body2" sx={{ color: palette.muted }}>
                No notifications yet.
              </Typography>
            </Box>
          ) : (
            groupedItems.map((item) =>
              item.type === "group" ? (
                <Box key={item.jobId}>
                  <Typography
                    variant="caption"
                    sx={{ display: "block", px: 2, pt: 1.25, pb: 0.5, fontWeight: 900, color: palette.teal, textTransform: "uppercase", letterSpacing: "0.04em" }}
                  >
                    {item.jobTitle}
                  </Typography>
                  {item.notifications.map((notification) => (
                    <NotificationRow
                      key={notification._id}
                      notification={notification}
                      onClick={() => handleNotificationClick(notification)}
                    />
                  ))}
                </Box>
              ) : (
                <NotificationRow
                  key={item.notification._id}
                  notification={item.notification}
                  onClick={() => handleNotificationClick(item.notification)}
                />
              )
            )
          )}
        </Box>
      </Menu>
    </>
  );
};

export default NotificationBell;
