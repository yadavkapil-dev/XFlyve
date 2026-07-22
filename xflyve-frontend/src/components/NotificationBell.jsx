import React, { useState } from "react";
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

// Bell icon + unread badge + dropdown list, mounted in the shared Navbar so
// both admin and driver sessions get it. Real-time updates come from
// NotificationContext's socket subscription — this component only reads
// context state and calls its mark-read helpers.
const NotificationBell = () => {
  const { notifications, unreadCount, markOneRead, markAllRead } = useNotifications();
  const [anchorEl, setAnchorEl] = useState(null);
  const isOpen = Boolean(anchorEl);

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
          },
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5 }}>
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
        <Divider />

        {notifications.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: palette.muted }}>
              No notifications yet.
            </Typography>
          </Box>
        ) : (
          notifications.map((notification) => (
            <MenuItem
              key={notification._id}
              onClick={() => handleNotificationClick(notification)}
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
          ))
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;
