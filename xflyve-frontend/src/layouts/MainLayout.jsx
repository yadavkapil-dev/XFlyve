import React from "react";
import { Outlet } from "react-router-dom";
import { Box, Link } from "@mui/material";
import Navbar from "../components/Navbar";
import AiAssistant from "../components/AiAssistant";

const MainLayout = () => {
  return (
    <>
      {/* Every authenticated page tabs through the full Navbar (7-9 items)
          before reaching page content — this lets keyboard users jump
          straight there. Hidden until focused, the standard skip-link
          pattern. Kept first in the DOM (before AiAssistant) so it stays
          the very first Tab stop. */}
      <Link
        href="#main-content"
        sx={{
          position: "absolute",
          left: -9999,
          zIndex: 2000,
          p: 1.5,
          bgcolor: "#0F172A",
          color: "#fff",
          borderRadius: 1,
          "&:focus": { left: 8, top: 8 },
        }}
      >
        Skip to main content
      </Link>
      {/* Bottom-left, distinct from the public DemoAssistant's bottom-right
          floating button (App.jsx) — the two answer different things (one
          canned/marketing, one grounded in the caller's real data) and both
          can be visible at once for a logged-in user. */}
      <AiAssistant />
      <Navbar />
      {/* tabIndex=-1: focusable as the skip link's jump target without
          joining the normal Tab sequence itself. */}
      <Box component="main" id="main-content" tabIndex={-1} sx={{ minWidth: 0, overflowX: "hidden" }}>
        <Outlet />
      </Box>
    </>
  );
};

export default MainLayout;
