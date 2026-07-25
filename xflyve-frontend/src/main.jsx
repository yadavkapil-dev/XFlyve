import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { CssBaseline, ThemeProvider } from "@mui/material";
import theme from "../theme";
import { initSentry } from "./sentry";

initSentry();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <NotificationProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// Production only — registering in dev would have the service worker
// network-first/cache Vite's dev-server assets alongside HMR, which fights
// Vite's own reload behavior. Purely a progressive enhancement (offline
// app-shell caching): if registration fails, the app works exactly the
// same without it.
//
// Checking MODE rather than the more conventional import.meta.env.PROD:
// in this project's build specifically, PROD/DEV come out inverted
// (PROD===false, DEV===true) even on a real `vite build`, while MODE
// still resolves correctly to "production" — confirmed by isolating a
// minimal reproduction outside this repo with the exact same Vite/plugin
// versions and vite.config.js, which did NOT reproduce the inversion, so
// it's specific to something in this project's installed dependency tree,
// not a Vite bug or a mistake in this config file. Flagged separately;
// not investigated further here since it's outside this phase's scope.
if ("serviceWorker" in navigator && import.meta.env.MODE !== "development") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
