import React, { useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Container,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import { resetPassword } from "../../api";

const CardShell = ({ children }) => (
  <Box
    sx={{
      minHeight: "100vh",
      overflowX: "hidden",
      display: "flex",
      alignItems: "center",
      py: { xs: 3, sm: 5 },
      background:
        "radial-gradient(circle at 20% 10%, rgba(20,184,166,0.20), transparent 30%), radial-gradient(circle at 85% 20%, rgba(15,118,110,0.12), transparent 28%), linear-gradient(135deg, #071827 0%, #0F172A 54%, #F8FAFC 54%, #F8FAFC 100%)",
    }}
  >
    <Container maxWidth="sm">
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 480,
          mx: "auto",
          p: { xs: 2.5, sm: 4 },
          borderRadius: { xs: "28px", sm: "34px" },
          bgcolor: "rgba(255,255,255,0.96)",
          border: "1px solid rgba(15, 23, 42, 0.08)",
          boxShadow: "0 28px 80px rgba(7, 24, 39, 0.14)",
          backdropFilter: "blur(18px)",
        }}
      >
        {children}
      </Paper>
    </Container>
  </Box>
);

const CardHeader = ({ title, subtitle }) => (
  <Stack spacing={1.2} alignItems="center" sx={{ textAlign: "center", mb: 3 }}>
    <Box
      sx={{
        width: 54,
        height: 54,
        borderRadius: "20px",
        display: "grid",
        placeItems: "center",
        color: "#0F766E",
        bgcolor: "#CCFBF1",
      }}
    >
      <LockResetOutlinedIcon sx={{ fontSize: 28 }} />
    </Box>
    <Typography
      variant="h4"
      sx={{ fontWeight: 950, letterSpacing: "-0.045em", color: "#0F172A", fontSize: { xs: "1.85rem", sm: "2.15rem" } }}
    >
      {title}
    </Typography>
    {subtitle && (
      <Typography sx={{ color: "#64748B", lineHeight: 1.55 }}>{subtitle}</Typography>
    )}
  </Stack>
);

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 56,
    borderRadius: "18px",
    bgcolor: "#F8FAFC",
  },
};

const buttonSx = {
  mt: 1,
  minHeight: 56,
  borderRadius: "18px",
  textTransform: "none",
  fontWeight: 950,
  bgcolor: "#0F766E",
  boxShadow: "0 18px 36px rgba(15, 118, 110, 0.22)",
  "&:hover": {
    bgcolor: "#115E59",
    transform: "translateY(-1px)",
    boxShadow: "0 22px 42px rgba(15, 118, 110, 0.26)",
  },
  "&.Mui-disabled": {
    bgcolor: "#94A3B8",
    color: "#F8FAFC",
  },
};

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tokenRejected, setTokenRejected] = useState(false);

  if (!token) {
    return (
      <CardShell>
        <CardHeader title="Invalid reset link" />
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: "16px", fontSize: "0.9rem" }}>
          This password reset link is missing its token. Please request a new one.
        </Alert>
        <Button
          component={RouterLink}
          to="/forgot-password"
          variant="contained"
          fullWidth
          sx={buttonSx}
        >
          Request a new reset link
        </Button>
      </CardShell>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate("/login", {
        state: { message: "Your password has been reset. Please sign in with your new password." },
      });
    } catch (err) {
      setLoading(false);
      const status = err.response?.status;
      if (status === 400) {
        setTokenRejected(true);
        setError("This password reset link is invalid, expired, or has already been used.");
      } else if (status === 422) {
        setError(err.response?.data?.message || "Please check the password requirements and try again.");
      } else {
        setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }
  };

  if (tokenRejected) {
    return (
      <CardShell>
        <CardHeader title="Reset link no longer valid" />
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: "16px", fontSize: "0.9rem" }}>
          {error}
        </Alert>
        <Button component={RouterLink} to="/forgot-password" variant="contained" fullWidth sx={buttonSx}>
          Request a new reset link
        </Button>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <CardHeader title="Choose a new password" subtitle="Enter and confirm your new password below." />

      {error && (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: "16px", fontSize: "0.9rem" }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <TextField
            label="New password"
            type="password"
            variant="outlined"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            autoComplete="new-password"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon sx={{ color: "#64748B" }} />
                </InputAdornment>
              ),
            }}
            sx={fieldSx}
          />

          <TextField
            label="Confirm new password"
            type="password"
            variant="outlined"
            fullWidth
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            autoComplete="new-password"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon sx={{ color: "#64748B" }} />
                </InputAdornment>
              ),
            }}
            sx={fieldSx}
          />

          <Button type="submit" variant="contained" fullWidth disabled={loading} sx={buttonSx}>
            {loading ? "Resetting..." : "Reset password"}
          </Button>

          <Typography sx={{ textAlign: "center", color: "#64748B", fontSize: "0.9rem" }}>
            <Link component={RouterLink} to="/login" sx={{ color: "#0F766E", fontWeight: 800 }}>
              Back to login
            </Link>
          </Typography>
        </Stack>
      </form>
    </CardShell>
  );
};

export default ResetPasswordPage;
