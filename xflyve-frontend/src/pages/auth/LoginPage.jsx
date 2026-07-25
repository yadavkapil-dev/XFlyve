import React, { useState, useEffect } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import { login } from "../../api";
import { useAuth } from "../../contexts/AuthContext";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loginUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set by ResetPasswordPage's redirect after a successful password reset.
  const [infoMessage, setInfoMessage] = useState(location.state?.message || "");

  useEffect(() => {
    if (user) {
      if (user.role === "admin") navigate("/home");
      else if (user.role === "driver") navigate("/driver-home");
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await login({ email, password });
      const { token, data } = res.data;
      loginUser(data, token);

      if (data.role === "admin") navigate("/home");
      else if (data.role === "driver") navigate("/driver-home");
      else navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      component="main"
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
      <Container maxWidth="lg">
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "0.95fr 1.05fr" },
          gap: { xs: 3, md: 6 },
          alignItems: "center",
        }}
      >
        <Box sx={{ color: "#FFFFFF", display: { xs: "none", md: "block" } }}>
          <Box
            sx={{
              width: 58,
              height: 58,
              borderRadius: "22px",
              display: "grid",
              placeItems: "center",
              color: "#CCFBF1",
              background: "linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)",
              boxShadow: "0 20px 45px rgba(20,184,166,0.22)",
              mb: 3,
            }}
          >
            <LocalShippingOutlinedIcon sx={{ fontSize: 30 }} />
          </Box>
          <Chip
            label="XFlyve Operations"
            sx={{
              mb: 2,
              color: "#CCFBF1",
              bgcolor: "rgba(20, 184, 166, 0.12)",
              border: "1px solid rgba(153, 246, 228, 0.22)",
              fontWeight: 900,
            }}
          />
          <Typography
            variant="h1"
            sx={{
              maxWidth: 560,
              fontWeight: 950,
              letterSpacing: "-0.07em",
              lineHeight: 0.98,
              fontSize: { md: "4.1rem", lg: "4.8rem" },
            }}
          >
            Your fleet’s daily control room.
          </Typography>
          <Typography
            sx={{
              mt: 2.5,
              maxWidth: 520,
              color: "#CBD5E1",
              lineHeight: 1.75,
              fontSize: "1.08rem",
            }}
          >
            Manage jobs, drivers, records and documents from a calm,
            mobile-first operations platform.
          </Typography>
        </Box>

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
              <LocalShippingOutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Typography
              variant="h4"
              component="h1"
              sx={{
                fontWeight: 950,
                letterSpacing: "-0.045em",
                color: "#0F172A",
                fontSize: { xs: "1.85rem", sm: "2.15rem" },
              }}
            >
              Sign in to XFlyve Operations
            </Typography>
            <Typography sx={{ color: "#64748B", lineHeight: 1.55 }}>
              Manage jobs, drivers, records and documents.
            </Typography>
          </Stack>

          {infoMessage && (
            <Alert
              severity="success"
              sx={{ mb: 2.5, borderRadius: "16px", fontSize: "0.9rem" }}
              onClose={() => setInfoMessage("")}
            >
              {infoMessage}
            </Alert>
          )}

          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 2.5,
                borderRadius: "16px",
                fontSize: "0.9rem",
                border: "1px solid rgba(220, 38, 38, 0.16)",
              }}
            >
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                variant="outlined"
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="username"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailOutlinedIcon sx={{ color: "#64748B" }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    minHeight: 56,
                    borderRadius: "18px",
                    bgcolor: "#F8FAFC",
                  },
                }}
              />

              <TextField
                label="Password"
                variant="outlined"
                type="password"
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="current-password"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon sx={{ color: "#64748B" }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    minHeight: 56,
                    borderRadius: "18px",
                    bgcolor: "#F8FAFC",
                  },
                }}
              />

              <Box sx={{ textAlign: "right" }}>
                <Link
                  component={RouterLink}
                  to="/forgot-password"
                  sx={{ color: "#0F766E", fontWeight: 800, fontSize: "0.88rem" }}
                >
                  Forgot password?
                </Link>
              </Box>

              <Button
                type="submit"
                variant="contained"
                fullWidth
                sx={{
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
                }}
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </Stack>
          </form>

          <Box
            sx={{
              mt: 3,
              p: 1.75,
              borderRadius: "18px",
              bgcolor: "#F1F5F9",
              border: "1px solid rgba(15, 23, 42, 0.06)",
            }}
          >
            <Typography
              sx={{
                color: "#475569",
                fontSize: "0.86rem",
                lineHeight: 1.55,
                textAlign: "center",
              }}
            >
              Admins go to the operations dashboard. Drivers go straight to
              today’s mobile workflow.
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
    </Box>
  );
};

export default LoginPage;
