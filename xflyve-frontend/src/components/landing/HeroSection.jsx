import React from "react";
import { Box, Typography, Container, Button, Stack, Chip } from "@mui/material";
import { useNavigate } from "react-router-dom";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";

const heroStats = [
  { label: "Jobs", value: "Dispatch" },
  { label: "Records", value: "Daily" },
  { label: "Docs", value: "PODs" },
];

const workflowCards = [
  {
    icon: <RouteRoundedIcon />,
    title: "Today’s jobs",
    body: "Drivers see what to do next without calling the office.",
  },
  {
    icon: <AssignmentTurnedInRoundedIcon />,
    title: "Records captured",
    body: "Work logs, PODs and diary files land in one clean system.",
  },
  {
    icon: <ReceiptLongRoundedIcon />,
    title: "Ready for admin",
    body: "Prepare weekly pay and invoice checks faster.",
  },
];

const HeroSection = () => {
  const navigate = useNavigate();

  const handleDemoClick = () => {
    const el = document.getElementById("team&contact-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        pt: { xs: 5, md: 8 },
        pb: { xs: 7, md: 10 },
        background:
          "radial-gradient(circle at top left, rgba(20,184,166,0.24), transparent 34%), linear-gradient(135deg, #071827 0%, #0F172A 54%, #12323A 100%)",
        color: "#FFFFFF",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to bottom, black, transparent 88%)",
          pointerEvents: "none",
        },
      }}
    >
      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.05fr 0.95fr" },
            gap: { xs: 4, md: 6 },
            alignItems: "center",
          }}
        >
          <Box>
            <Chip
              label="Built for small transport operators"
              sx={{
                mb: 2.5,
                color: "#CCFBF1",
                bgcolor: "rgba(20, 184, 166, 0.12)",
                border: "1px solid rgba(153, 246, 228, 0.22)",
                fontWeight: 800,
                height: 34,
              }}
            />
            <Typography
              variant="h1"
              sx={{
                maxWidth: 760,
                fontSize: { xs: "2.55rem", sm: "3.5rem", md: "4.65rem" },
                lineHeight: { xs: 1.03, md: 0.98 },
                letterSpacing: "-0.07em",
                fontWeight: 950,
              }}
            >
              Run your transport operations from one calm dashboard.
            </Typography>
            <Typography
              variant="h5"
              sx={{
                mt: 2.5,
                maxWidth: 640,
                color: "#CBD5E1",
                fontSize: { xs: "1.02rem", sm: "1.16rem", md: "1.22rem" },
                lineHeight: 1.7,
                fontWeight: 500,
              }}
            >
              XFlyve helps owners manage jobs, drivers, PODs, daily records,
              compliance documents, and which jobs are ready to invoice —
              without adding another admin desk.
            </Typography>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ mt: 4, maxWidth: { xs: "100%", sm: 460 } }}
            >
              <Button
                fullWidth
                variant="contained"
                onClick={() => navigate("/login")}
                endIcon={<ArrowForwardRoundedIcon />}
                sx={{
                  minHeight: 54,
                  borderRadius: "18px",
                  textTransform: "none",
                  fontWeight: 900,
                  bgcolor: "#14B8A6",
                  color: "#042F2E",
                  boxShadow: "0 20px 45px rgba(20, 184, 166, 0.26)",
                  "&:hover": {
                    bgcolor: "#5EEAD4",
                    transform: "translateY(-1px)",
                  },
                }}
              >
                Login
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={handleDemoClick}
                sx={{
                  minHeight: 54,
                  borderRadius: "18px",
                  textTransform: "none",
                  fontWeight: 900,
                  color: "#E2E8F0",
                  borderColor: "rgba(226, 232, 240, 0.22)",
                  bgcolor: "rgba(255,255,255,0.04)",
                  "&:hover": {
                    borderColor: "rgba(94, 234, 212, 0.55)",
                    bgcolor: "rgba(20, 184, 166, 0.08)",
                  },
                }}
              >
                Request Demo
              </Button>
            </Stack>

            <Stack
              direction="row"
              spacing={{ xs: 1, sm: 1.5 }}
              sx={{
                mt: 4,
                flexWrap: "wrap",
                rowGap: 1,
              }}
            >
              {heroStats.map((stat) => (
                <Box
                  key={stat.label}
                  sx={{
                    px: 2,
                    py: 1.25,
                    minWidth: 98,
                    borderRadius: "18px",
                    bgcolor: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <Typography sx={{ fontWeight: 950, lineHeight: 1 }}>
                    {stat.value}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.5,
                      color: "#94A3B8",
                      fontSize: "0.76rem",
                      fontWeight: 800,
                    }}
                  >
                    {stat.label}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Box
            sx={{
              borderRadius: { xs: "28px", md: "34px" },
              p: { xs: 2, sm: 2.5 },
              bgcolor: "rgba(248, 250, 252, 0.1)",
              border: "1px solid rgba(226, 232, 240, 0.16)",
              boxShadow: "0 28px 80px rgba(0,0,0,0.28)",
            }}
          >
            <Box
              sx={{
                p: { xs: 2.25, sm: 3 },
                borderRadius: { xs: "22px", md: "28px" },
                bgcolor: "#F8FAFC",
                color: "#0F172A",
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.2}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: "16px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "#CCFBF1",
                    color: "#0F766E",
                  }}
                >
                  <CheckCircleRoundedIcon />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 950, letterSpacing: "-0.03em" }}>
                    Today’s operations
                  </Typography>
                  <Typography sx={{ color: "#64748B", fontSize: "0.86rem" }}>
                    Mobile records ready for review
                  </Typography>
                </Box>
              </Stack>

              <Stack spacing={1.4} sx={{ mt: 2.5 }}>
                {workflowCards.map((card) => (
                  <Box
                    key={card.title}
                    sx={{
                      display: "flex",
                      gap: 1.5,
                      p: 1.75,
                      borderRadius: "20px",
                      bgcolor: "#FFFFFF",
                      border: "1px solid rgba(15, 23, 42, 0.08)",
                    }}
                  >
                    <Box
                      sx={{
                        width: 38,
                        height: 38,
                        flex: "0 0 auto",
                        borderRadius: "15px",
                        display: "grid",
                        placeItems: "center",
                        bgcolor: "#ECFEFF",
                        color: "#0F766E",
                        "& svg": { fontSize: 21 },
                      }}
                    >
                      {card.icon}
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 900 }}>{card.title}</Typography>
                      <Typography
                        sx={{
                          mt: 0.35,
                          color: "#64748B",
                          fontSize: "0.86rem",
                          lineHeight: 1.45,
                        }}
                      >
                        {card.body}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default HeroSection;
