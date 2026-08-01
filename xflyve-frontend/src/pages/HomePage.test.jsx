// HomePage had zero test coverage before tonight's two fixes:
//   1. The Fleet Status bar chart rendered all three bars in the same teal,
//      making fleet health unreadable at a glance — now colored to match
//      the exact status-chip colors used on the Trucks page.
//   2. "Create Job" was restored to the hero (it was there originally,
//      then got moved into Quick Actions at some point) — it should exist
//      exactly once, in the hero, and be gone from Quick Actions.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import HomePage from "./HomePage";
import { useAuth } from "../contexts/AuthContext";
import { getDashboardStats } from "../api";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../api", () => ({
  getDashboardStats: vi.fn(),
}));

const dashboardStats = {
  todaysJobs: 1,
  completedToday: 1,
  pendingJobs: 1,
  totalDrivers: 2,
  missingWorkLogs: 0,
  trucksOutOfService: 1,
  weeklyLogs: 1,
  weeklyHours: 1,
  weeklyKilometres: 1,
  invoiceReadyJobs: 1,
  pendingPodApprovals: 0,
  podApprovalRate: 100,
  truckStatusBreakdown: { available: 2, "on-route": 1, "out-of-service": 1 },
  jobsByStatus: { pending: 1, "in-progress": 1, completed: 1 },
  jobVolumeTrend: [{ date: "2026-01-01", count: 1 }],
};

const renderHomePage = () =>
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="/jobs/create" element={<div>Create Run page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("HomePage — Fleet Status chart colors (regression)", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { name: "Admin User" } });
    getDashboardStats.mockResolvedValue({ data: { data: dashboardStats } });
  });

  test("PASS: the three fleet-status bars are colored distinctly, matching the Trucks page status chips (Available=emerald, On Route=amber, Out of Service=rose)", async () => {
    renderHomePage();
    await screen.findByText("Fleet Status");

    const bars = document.querySelectorAll(".MuiBarChart-element");
    expect(bars).toHaveLength(3);

    const fills = Array.from(bars).map((bar) => bar.getAttribute("fill"));
    expect(fills).toEqual(["#07866f", "#b76e00", "#b42318"]);
    // Regression guard: this is exactly the bug — all three bars sharing
    // one flat teal color instead of being visually distinguishable.
    expect(new Set(fills).size).toBe(3);
  });
});

describe("HomePage — hero 'Create Job' button (restored from Quick Actions)", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { name: "Admin User" } });
    getDashboardStats.mockResolvedValue({ data: { data: dashboardStats } });
  });

  test("PASS: 'Create Job' appears exactly once (in the hero), not duplicated in Quick Actions", async () => {
    renderHomePage();
    await screen.findByText("Fleet Status");

    expect(screen.getAllByText("Create Job")).toHaveLength(1);
  });

  test("PASS (regression): Quick Actions no longer contains a Create Job card", async () => {
    renderHomePage();
    const quickActionsHeading = await screen.findByText("Quick Actions");

    const quickActionsSection = quickActionsHeading.closest("div").parentElement;
    expect(quickActionsSection.textContent).not.toContain("Assign work fast");
    expect(screen.getByText("Manage Jobs")).toBeInTheDocument();
  });

  test("PASS: clicking the hero Create Job button navigates to /jobs/create", async () => {
    renderHomePage();
    await screen.findByText("Fleet Status");

    await userEvent.click(screen.getByText("Create Job"));

    expect(await screen.findByText("Create Run page")).toBeInTheDocument();
  });
});
