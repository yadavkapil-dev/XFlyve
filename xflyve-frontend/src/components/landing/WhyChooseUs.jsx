import React from "react";
import { Box, Typography, Container, Stack } from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

const WhyChooseUs = () => {
  const points = [
    "Reduce owner admin time without adding another weekly wage.",
    "Catch missing PODs, work logs and compliance records earlier.",
    "Give drivers a simple mobile workflow instead of back-and-forth calls.",
    "See which jobs are ready to invoice, and pull together each driver's hours and deliveries for weekly pay — with more confidence.",
    "Keep operations visible from phone, tablet or desktop.",
  ];

  return (
    <section id="whychoose-section">
      <Box sx={{ py: { xs: 7, md: 11 }, backgroundColor: "#F6F8FB" }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "0.9fr 1.1fr" },
              gap: { xs: 4, md: 6 },
              alignItems: "center",
            }}
          >
            <Box
              sx={{
                p: { xs: 2.5, md: 4 },
                borderRadius: "34px",
                background:
                  "linear-gradient(135deg, #071827 0%, #0F172A 58%, #0F766E 140%)",
                color: "#FFFFFF",
                boxShadow: "0 28px 70px rgba(7, 24, 39, 0.16)",
              }}
            >
              <Typography
                sx={{
                  color: "#5EEAD4",
                  fontWeight: 950,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontSize: "0.78rem",
                }}
              >
                Owner value
              </Typography>
              <Typography
                variant="h2"
                sx={{
                  mt: 1.5,
                  fontWeight: 950,
                  letterSpacing: "-0.055em",
                  lineHeight: 1.05,
                  fontSize: { xs: "2rem", md: "3rem" },
                }}
              >
                Built to save the office from becoming a bottleneck.
              </Typography>
              <Typography sx={{ mt: 2, color: "#CBD5E1", lineHeight: 1.75 }}>
                Small transport companies do not need more spreadsheets,
                WhatsApp chasing or paper piles. They need a calm operating
                system that helps each record arrive where it belongs.
              </Typography>
            </Box>

            <Stack spacing={1.5}>
              {points.map((point) => (
                <Box
                  key={point}
                  sx={{
                    display: "flex",
                    gap: 1.5,
                    alignItems: "flex-start",
                    p: { xs: 2, md: 2.25 },
                    borderRadius: "22px",
                    bgcolor: "#FFFFFF",
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                    boxShadow: "0 14px 35px rgba(15, 23, 42, 0.035)",
                  }}
                >
                  <CheckCircleRoundedIcon
                    sx={{ color: "#0F766E", mt: 0.15, flexShrink: 0 }}
                  />
                  <Typography
                    sx={{
                      color: "#334155",
                      fontWeight: 750,
                      lineHeight: 1.55,
                    }}
                  >
                    {point}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Container>
      </Box>
    </section>
  );
};

export default WhyChooseUs;
