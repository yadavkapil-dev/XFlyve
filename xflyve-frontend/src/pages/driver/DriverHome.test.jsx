// Today's Jobs summary: the api module (network boundary) and useAuth are
// mocked; everything else — the "show every same-day job, not just one"
// fix, the empty states, and the tap-to-open-Jobs-page navigation — runs
// for real against the real component.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DriverHome from "./DriverHome";
import { useAuth } from "../../contexts/AuthContext";
import { getJobsByDriver } from "../../api";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../api", () => ({
  getJobsByDriver: vi.fn(),
}));

const todayIso = () => new Date().toISOString();

const baseJob = (overrides = {}) => ({
  _id: "job1",
  title: "Deliver freight",
  jobType: "local",
  jobDate: todayIso(),
  status: "pending",
  ...overrides,
});

const renderDriverHome = () =>
  render(
    <MemoryRouter initialEntries={["/driver-home"]}>
      <Routes>
        <Route path="/driver-home" element={<DriverHome />} />
        <Route path="/driver/jobs" element={<div>Jobs page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("DriverHome — Today's Jobs summary", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { _id: "driver1", name: "Test Driver" } });
  });

  test("PASS: a driver with two same-day jobs (one interstate, one local) sees both listed, not just one", async () => {
    const interstateJob = baseJob({ _id: "job-interstate", title: "Interstate run", jobType: "interstate" });
    const localJob = baseJob({ _id: "job-local", title: "Local run", jobType: "local" });
    getJobsByDriver.mockResolvedValue({ data: { data: [interstateJob, localJob] } });

    renderDriverHome();

    expect(await screen.findByText("Interstate run")).toBeInTheDocument();
    expect(await screen.findByText("Local run")).toBeInTheDocument();
    expect(screen.getAllByText("Interstate")).toHaveLength(1);
    expect(screen.getAllByText("Local")).toHaveLength(1);
  });

  test("PASS: a driver with one job today sees the same summary card, with its title/type/status", async () => {
    const job = baseJob({ title: "Single run", jobType: "interstate", status: "in-progress" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderDriverHome();

    expect(await screen.findByText("Single run")).toBeInTheDocument();
    expect(screen.getByText("Interstate")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  test("PASS: no action buttons render on the dashboard — Start/Complete/Upload POD live only on the Jobs page", async () => {
    const job = baseJob({ status: "pending" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderDriverHome();

    expect(await screen.findByText("Deliver freight")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Job" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete Job" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload POD" })).not.toBeInTheDocument();
  });

  test("PASS: tapping a job summary navigates to the Jobs page", async () => {
    const job = baseJob({ title: "Deliver freight" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderDriverHome();

    const jobCard = await screen.findByText("Deliver freight");
    await userEvent.click(jobCard);

    expect(await screen.findByText("Jobs page")).toBeInTheDocument();
  });

  test("PASS: the card shows the job's scheduled jobDate, not its createdAt timestamp", async () => {
    const today = new Date();
    const createdTenDaysAgo = new Date();
    createdTenDaysAgo.setDate(createdTenDaysAgo.getDate() - 10);

    const job = baseJob({
      jobDate: today.toISOString(),
      createdAt: createdTenDaysAgo.toISOString(),
    });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderDriverHome();

    const expectedDateText = today.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const creationDateText = createdTenDaysAgo.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

    expect(await screen.findByText(expectedDateText)).toBeInTheDocument();
    expect(screen.queryByText(creationDateText)).not.toBeInTheDocument();
  });

  test("PASS: a driver with jobs, but none today, gets the 'no job scheduled for today' empty state", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureJob = baseJob({ jobDate: tomorrow.toISOString() });
    getJobsByDriver.mockResolvedValue({ data: { data: [futureJob] } });

    renderDriverHome();

    expect(await screen.findByText("No job scheduled for today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View All Jobs" })).toBeInTheDocument();
  });

  test("PASS: a driver with no jobs at all gets the 'no jobs assigned yet' empty state", async () => {
    getJobsByDriver.mockResolvedValue({ data: { data: [] } });

    renderDriverHome();

    expect(await screen.findByText("No jobs assigned yet")).toBeInTheDocument();
  });
});
