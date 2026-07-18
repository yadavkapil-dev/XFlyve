import React from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SpaceDashboardRoundedIcon from "@mui/icons-material/SpaceDashboardRounded";
import WorkRoundedIcon from "@mui/icons-material/WorkRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const palette = {
  ink: "#0b1220",
  muted: "#697586",
  line: "rgba(255, 255, 255, 0.12)",
  heroStart: "#050b18",
  heroMid: "#0b2f3a",
  heroEnd: "#0c5f5b",
  teal: "#0e7c76",
};

const getHomePath = (user) => {
  if (user?.role === "admin") return "/home";
  if (user?.role === "driver") return "/driver-home";
  return "/";
};

const getNavigationItems = (role) => {
  if (role === "admin") {
    return [
      { label: "Dashboard", path: "/home", icon: <SpaceDashboardRoundedIcon fontSize="small" /> },
      { label: "Jobs", path: "/jobs", icon: <WorkRoundedIcon fontSize="small" /> },
      { label: "Logs", path: "/logs", icon: <FactCheckRoundedIcon fontSize="small" /> },
      { label: "PODs", path: "/pods", icon: <UploadFileRoundedIcon fontSize="small" /> },
      { label: "Work Diary", path: "/work-diary", icon: <MenuBookRoundedIcon fontSize="small" /> },
      { label: "Drivers", path: "/drivers", icon: <PeopleAltRoundedIcon fontSize="small" /> },
      { label: "Trucks", path: "/trucks", icon: <LocalShippingRoundedIcon fontSize="small" /> },
    ];
  }

  if (role === "driver") {
    return [
      { label: "Today", path: "/driver-home", icon: <SpaceDashboardRoundedIcon fontSize="small" /> },
      { label: "Jobs", path: "/driver/jobs", icon: <WorkRoundedIcon fontSize="small" /> },
      { label: "Logs", path: "/driver/logs", icon: <FactCheckRoundedIcon fontSize="small" /> },
      { label: "POD", path: "/driver/pods/upload", icon: <UploadFileRoundedIcon fontSize="small" /> },
      { label: "Diary", path: "/driver/work-diary", icon: <MenuBookRoundedIcon fontSize="small" /> },
    ];
  }

  return [];
};

const Navbar = () => {
  const { user, logoutUser } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [anchorEl, setAnchorEl] = React.useState(null);
  const isMenuOpen = Boolean(anchorEl);
  const navItems = getNavigationItems(user?.role);

  const handleMenu = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const goTo = (path) => {
    navigate(path);
    handleClose();
  };

  const handleLogoClick = () => {
    navigate(getHomePath(user));
    handleClose();
  };

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
    handleClose();
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        zIndex: (muiTheme) => muiTheme.zIndex.appBar,
        background: `linear-gradient(135deg, ${palette.heroStart} 0%, ${palette.heroMid} 58%, ${palette.heroEnd} 100%)`,
        borderBottom: "1px solid",
        borderColor: palette.line,
        boxShadow: "0 12px 40px rgba(5, 11, 24, 0.18)",
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          minHeight: { xs: 64, sm: 68 },
          px: { xs: 2, sm: 3, md: 4 },
          gap: 2,
          justifyContent: "space-between",
        }}
      >
        <Stack
          direction="row"
          spacing={1.25}
          alignItems="center"
          onClick={handleLogoClick}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") handleLogoClick();
          }}
          sx={{ cursor: "pointer", minWidth: 0 }}
        >
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 3,
              display: "grid",
              placeItems: "center",
              color: "white",
              fontWeight: 950,
              bgcolor: alpha("#fff", 0.11),
              border: "1px solid",
              borderColor: alpha("#fff", 0.16),
              flexShrink: 0,
            }}
          >
            X
          </Box>
          <Box minWidth={0}>
            <Typography
              variant="subtitle1"
              fontWeight={950}
              noWrap
              sx={{ color: "white", letterSpacing: "-0.035em", lineHeight: 1.1 }}
            >
              XFlyve
            </Typography>
            <Typography
              variant="caption"
              noWrap
              sx={{ display: { xs: "none", sm: "block" }, color: alpha("#fff", 0.58) }}
            >
              Logistics operations
            </Typography>
          </Box>
        </Stack>

        {!isMobile && user && (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1, justifyContent: "center" }}>
            {navItems.map((item) => (
              <Button
                key={item.path}
                color="inherit"
                startIcon={item.icon}
                onClick={() => goTo(item.path)}
                sx={{
                  minHeight: 40,
                  px: 1.5,
                  borderRadius: 999,
                  color: alpha("#fff", 0.82),
                  textTransform: "none",
                  fontWeight: 800,
                  "&:hover": {
                    bgcolor: alpha("#fff", 0.1),
                    color: "white",
                  },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
        )}

        {isMobile ? (
          <Box>
            <IconButton
              color="inherit"
              onClick={handleMenu}
              aria-label="open navigation menu"
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
              <MenuIcon />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={isMenuOpen}
              onClose={handleClose}
              PaperProps={{
                elevation: 0,
                sx: {
                  mt: 1.25,
                  minWidth: 260,
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: "rgba(15, 23, 42, 0.08)",
                  boxShadow: "0 22px 70px rgba(15, 23, 42, 0.16)",
                  overflow: "hidden",
                },
              }}
            >
              {user ? (
                <Box>
                  <Box sx={{ px: 2, py: 1.75 }}>
                    <Typography variant="subtitle2" fontWeight={900} sx={{ color: palette.ink }}>
                      {user.name || "XFlyve user"}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
                      <Chip
                        size="small"
                        label={user.role || "user"}
                        sx={{
                          height: 24,
                          textTransform: "capitalize",
                          color: palette.teal,
                          bgcolor: alpha(palette.teal, 0.08),
                          fontWeight: 800,
                        }}
                      />
                      {user.driverType && (
                        <Typography variant="caption" sx={{ color: palette.muted, textTransform: "capitalize" }}>
                          {user.driverType}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                  <Divider />
                  {navItems.map((item) => (
                    <MenuItem key={item.path} onClick={() => goTo(item.path)} sx={{ minHeight: 48, gap: 1.25 }}>
                      {item.icon}
                      {item.label}
                    </MenuItem>
                  ))}
                  <Divider />
                  <MenuItem onClick={handleLogout} sx={{ minHeight: 50, gap: 1.25, color: "#b42318", fontWeight: 800 }}>
                    <LogoutRoundedIcon fontSize="small" />
                    Logout
                  </MenuItem>
                </Box>
              ) : (
                <MenuItem onClick={() => goTo("/login")} sx={{ minHeight: 48 }}>
                  Login
                </MenuItem>
              )}
            </Menu>
          </Box>
        ) : user ? (
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box sx={{ textAlign: "right", display: { xs: "none", lg: "block" } }}>
              <Typography variant="body2" fontWeight={850} sx={{ color: "white", lineHeight: 1.2 }}>
                {user.name || "XFlyve user"}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: alpha("#fff", 0.58), textTransform: "capitalize" }}
              >
                {user.role}
                {user.driverType ? ` · ${user.driverType}` : ""}
              </Typography>
            </Box>
            <Button
              color="inherit"
              startIcon={<LogoutRoundedIcon />}
              onClick={handleLogout}
              sx={{
                minHeight: 42,
                px: 1.75,
                borderRadius: 999,
                color: alpha("#fff", 0.88),
                textTransform: "none",
                fontWeight: 850,
                bgcolor: alpha("#fff", 0.08),
                border: "1px solid",
                borderColor: alpha("#fff", 0.12),
                "&:hover": {
                  bgcolor: alpha("#fff", 0.14),
                  color: "white",
                },
              }}
            >
              Logout
            </Button>
          </Stack>
        ) : (
          <Button
            color="inherit"
            onClick={() => navigate("/login")}
            sx={{
              minHeight: 42,
              px: 2,
              borderRadius: 999,
              color: "white",
              textTransform: "none",
              fontWeight: 850,
              bgcolor: alpha("#fff", 0.1),
              "&:hover": { bgcolor: alpha("#fff", 0.16) },
            }}
          >
            Login
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
