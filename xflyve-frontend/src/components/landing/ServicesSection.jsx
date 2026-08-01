import React from "react";
import { Box, Typography, Container, Stack } from "@mui/material";
import AltRouteRoundedIcon from "@mui/icons-material/AltRouteRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import FolderCopyRoundedIcon from "@mui/icons-material/FolderCopyRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import RequestQuoteRoundedIcon from "@mui/icons-material/RequestQuoteRounded";
import SupportAgentRoundedIcon from "@mui/icons-material/SupportAgentRounded";

const features = [
  {
    icon: <AltRouteRoundedIcon />,
    title: "Jobs & dispatch",
    body: "Create jobs, assign drivers and trucks, then track job status from pending to completed.",
  },
  {
    icon: <BadgeRoundedIcon />,
    title: "Driver mobile workflow",
    body: "Drivers see today’s work, start and complete jobs, and move records through a simple phone-first flow.",
  },
  {
    icon: <CloudUploadRoundedIcon />,
    title: "POD records",
    body: "Drivers upload proof-of-delivery after each job, and admins approve or reject it — the one document type with a review step.",
  },
  {
    icon: <EditNoteRoundedIcon />,
    title: "Daily records",
    body: "Capture hours, kilometres, deliveries and notes for cleaner weekly driver record keeping.",
  },
  {
    icon: <FolderCopyRoundedIcon />,
    title: "Compliance records",
    body: "NHVR work diary uploads for interstate jobs, searchable by driver and date — even for drivers who've since left.",
  },
  {
    icon: <PaymentsRoundedIcon />,
    title: "Pay-ready records",
    body: "Surfaces each driver's hours, kilometres and deliveries from submitted work logs so you can work out weekly pay yourself — the app doesn't calculate or process payroll.",
  },
  {
    icon: <RequestQuoteRoundedIcon />,
    title: "Invoice readiness",
    body: "See which completed jobs have an approved POD and are ready for invoice preparation.",
  },
  {
    icon: <SupportAgentRoundedIcon />,
    title: "AI Assistant",
    body: "Ask what's due today or which trucks are free. Answers come from your real data only, with the same access rules as the rest of the app.",
  },
];

const ServicesSection = () => {
  return (
    <section id="services-section">
      <Box sx={{ py: { xs: 7, md: 11 }, backgroundColor: "#FFFFFF" }}>
        <Container maxWidth="lg">
          <Box sx={{ maxWidth: 760, mx: "auto", textAlign: "center", mb: { xs: 4, md: 6 } }}>
            <Typography
              sx={{
                color: "#0F766E",
                fontWeight: 950,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontSize: "0.78rem",
              }}
            >
              Operations toolkit
            </Typography>
            <Typography
              variant="h2"
              sx={{
                mt: 1.5,
                fontWeight: 950,
                letterSpacing: "-0.055em",
                lineHeight: 1.05,
                fontSize: { xs: "2rem", md: "3.2rem" },
                color: "#0F172A",
              }}
            >
              Everything a small fleet needs to stay organised.
            </Typography>
            <Typography sx={{ mt: 2, color: "#64748B", lineHeight: 1.75 }}>
              From driver workflow to document review, XFlyve brings the daily
              operational pieces into one clean product experience.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(3, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            {features.map((feature, index) => (
              <Stack
                key={feature.title}
                spacing={1.5}
                sx={{
                  minHeight: { xs: 188, md: 210 },
                  p: { xs: 2.25, md: 3 },
                  borderRadius: "28px",
                  bgcolor: index === 0 ? "#071827" : "#F8FAFC",
                  color: index === 0 ? "#FFFFFF" : "#0F172A",
                  border:
                    index === 0
                      ? "1px solid rgba(153, 246, 228, 0.22)"
                      : "1px solid rgba(15, 23, 42, 0.08)",
                  boxShadow:
                    index === 0
                      ? "0 24px 60px rgba(7, 24, 39, 0.18)"
                      : "0 16px 40px rgba(15, 23, 42, 0.035)",
                  transition: "transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
                  "&:hover": {
                    transform: "translateY(-3px)",
                    borderColor:
                      index === 0
                        ? "rgba(153, 246, 228, 0.4)"
                        : "rgba(15, 118, 110, 0.22)",
                    boxShadow:
                      index === 0
                        ? "0 28px 70px rgba(7, 24, 39, 0.24)"
                        : "0 22px 55px rgba(15, 23, 42, 0.07)",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "18px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: index === 0 ? "rgba(20, 184, 166, 0.16)" : "#ECFEFF",
                    color: index === 0 ? "#5EEAD4" : "#0F766E",
                    "& svg": { fontSize: 25 },
                  }}
                >
                  {feature.icon}
                </Box>
                <Typography sx={{ fontWeight: 950, fontSize: "1.08rem" }}>
                  {feature.title}
                </Typography>
                <Typography
                  sx={{
                    color: index === 0 ? "#CBD5E1" : "#64748B",
                    lineHeight: 1.65,
                    fontSize: "0.94rem",
                  }}
                >
                  {feature.body}
                </Typography>
              </Stack>
            ))}
          </Box>
        </Container>
      </Box>
    </section>
  );
};

export default ServicesSection;
