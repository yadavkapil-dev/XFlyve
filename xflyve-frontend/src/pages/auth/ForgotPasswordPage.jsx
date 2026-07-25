import React, { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
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
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import { forgotPassword } from "../../api";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await forgotPassword(email);
    } catch (err) {
      // Only a genuine network-level failure (no response reached the
      // server at all) gets its own message. Any real response — success
      // or otherwise — still falls through to the same generic
      // confirmation below, so this page never reveals whether the email
      // matched an account, matching the backend's anti-enumeration design.
      if (!err.response) {
        setLoading(false);
        setError("Couldn't reach the server. Please check your connection and try again.");
        return;
      }
    }

    setLoading(false);
    setSubmitted(true);
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
              component="h1"
              sx={{
                fontWeight: 950,
                letterSpacing: "-0.045em",
                color: "#0F172A",
                fontSize: { xs: "1.85rem", sm: "2.15rem" },
              }}
            >
              Forgot your password?
            </Typography>
            <Typography sx={{ color: "#64748B", lineHeight: 1.55 }}>
              Enter your account email and we'll send you a link to reset it.
            </Typography>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: "16px", fontSize: "0.9rem" }}>
              {error}
            </Alert>
          )}

          {submitted ? (
            <Stack spacing={2.5}>
              <Alert severity="success" sx={{ borderRadius: "16px", fontSize: "0.9rem" }}>
                If an account with that email exists, we've sent a password reset link to it.
                Check your inbox (and spam folder).
              </Alert>
              <Button
                component={RouterLink}
                to="/login"
                variant="contained"
                fullWidth
                sx={{
                  minHeight: 56,
                  borderRadius: "18px",
                  textTransform: "none",
                  fontWeight: 950,
                  bgcolor: "#0F766E",
                  boxShadow: "0 18px 36px rgba(15, 118, 110, 0.22)",
                  "&:hover": { bgcolor: "#115E59" },
                }}
              >
                Back to login
              </Button>
            </Stack>
          ) : (
            <form onSubmit={handleSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="Email"
                  type="email"
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

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
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
                >
                  {loading ? "Sending..." : "Send reset link"}
                </Button>

                <Typography sx={{ textAlign: "center", color: "#64748B", fontSize: "0.9rem" }}>
                  Remembered it?{" "}
                  <Link component={RouterLink} to="/login" sx={{ color: "#0F766E", fontWeight: 800 }}>
                    Back to login
                  </Link>
                </Typography>
              </Stack>
            </form>
          )}
        </Paper>
      </Container>
    </Box>
  );
};

export default ForgotPasswordPage;
