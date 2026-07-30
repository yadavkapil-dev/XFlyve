// Job status actions: the api module (network boundary) and useAuth are
// mocked; everything else — status derivation, button labelling, in-flight
// disabling, error display — runs for real against the real component.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DriverJobs from "./Jobs";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { getJobsByDriver, listPodsByDriver, listWorkDiariesByDriver, updateJob } from "../../api";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../contexts/NotificationContext", () => ({
  useNotifications: vi.fn(),
}));

vi.mock("../../api", () => ({
  getJobsByDriver: vi.fn(),
  listPodsByDriver: vi.fn(),
  listWorkDiariesByDriver: vi.fn(),
  updateJob: vi.fn(),
}));

const tomorrowIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

const baseJob = (overrides = {}) => ({
  _id: "job1",
  title: "Deliver freight",
  description: "desc",
  pickupLocation: "Depot",
  deliveryLocation: "Customer",
  assignedTruck: { truckNumber: "TRK-1" },
  jobType: "local",
  jobDate: tomorrowIso(),
  status: "pending",
  ...overrides,
});

// A function, not a cached element — see the identical comment in
// UploadPod.test.jsx: reusing the same JSX element reference across a
// render() and a later rerender() lets React bail out of re-rendering the
// subtree, silently skipping the re-invocation of useNotifications().
const jobsTree = () => (
  <MemoryRouter>
    <DriverJobs />
  </MemoryRouter>
);

const renderJobs = () => render(jobsTree());

describe("DriverJobs — job status actions", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { _id: "driver1" } });
    listPodsByDriver.mockResolvedValue({ data: [] });
    listWorkDiariesByDriver.mockResolvedValue({ data: [] });
    useNotifications.mockReturnValue({ lastEvent: null });
  });

  test("PASS: a pending job shows 'Start Job'; clicking it calls updateJob with status 'in-progress' and reflects the new status", async () => {
    const job = baseJob({ status: "pending" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });
    updateJob.mockResolvedValue({ data: { data: { ...job, status: "in-progress" } } });

    renderJobs();

    const startButton = await screen.findByRole("button", { name: "Start Job" });
    await userEvent.click(startButton);

    expect(updateJob).toHaveBeenCalledWith("job1", { status: "in-progress" });
    expect(await screen.findByText("In progress")).toBeInTheDocument();
  });

  test("PASS: an in-progress job shows 'Complete Job'; clicking it calls updateJob with status 'completed'", async () => {
    const job = baseJob({ status: "in-progress" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });
    updateJob.mockResolvedValue({ data: { data: { ...job, status: "completed" } } });

    renderJobs();

    const completeButton = await screen.findByRole("button", { name: "Complete Job" });
    await userEvent.click(completeButton);

    expect(updateJob).toHaveBeenCalledWith("job1", { status: "completed" });
    expect(await screen.findByText("Upload POD")).toBeInTheDocument();
  });

  test("PASS: the action button disables and reads 'Updating...' while the request is in flight, then re-enables", async () => {
    const job = baseJob({ status: "pending" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });
    let resolveUpdate;
    updateJob.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );

    renderJobs();

    const startButton = await screen.findByRole("button", { name: "Start Job" });
    await userEvent.click(startButton);

    const updatingButton = await screen.findByRole("button", { name: "Updating..." });
    expect(updatingButton).toBeDisabled();

    resolveUpdate({ data: { data: { ...job, status: "in-progress" } } });

    expect(await screen.findByRole("button", { name: "Complete Job" })).toBeEnabled();
  });

  test("PASS: a completed job with no linked POD shows 'Upload POD', not a status-change button", async () => {
    const job = baseJob({ status: "completed" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderJobs();

    expect(await screen.findByRole("button", { name: "Upload POD" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start Job" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete Job" })).not.toBeInTheDocument();
  });

  test("PASS: a rejected status update shows the server's error message and leaves the button in its original state", async () => {
    const job = baseJob({ status: "pending" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });
    updateJob.mockRejectedValue({ response: { data: { message: "Truck is out of service" } } });

    renderJobs();

    const startButton = await screen.findByRole("button", { name: "Start Job" });
    await userEvent.click(startButton);

    expect(await screen.findByText("Truck is out of service")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Start Job" })).toBeEnabled();
  });

  test("PASS: a local job never shows 'Submit Today's Work' — work logs are a whole-day record, submitted from the Logs page's own job-picker", async () => {
    const job = baseJob({ jobType: "local", status: "pending" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderJobs();

    expect(await screen.findByText("Deliver freight")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit Today’s Work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit Today/i })).not.toBeInTheDocument();
  });

  test("PASS: a completed job with an uploaded POD no longer shows 'Edit / Replace POD' — that action lives on the POD history page now", async () => {
    const job = baseJob({ status: "completed" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });
    listPodsByDriver.mockResolvedValue({ data: [{ _id: "pod1", jobId: "job1", status: "approved" }] });

    renderJobs();

    expect(await screen.findByText("POD Uploaded ✅")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit / Replace POD" })).not.toBeInTheDocument();
  });

  test("PASS: an interstate job still shows 'Work Diary Pages' — diary upload has no job-picker of its own to move to", async () => {
    const job = baseJob({ jobType: "interstate", status: "completed" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderJobs();

    expect(await screen.findByRole("button", { name: "Work Diary Pages" })).toBeInTheDocument();
  });

  test("PASS: an interstate job with an uploaded work diary locks the button, matching the POD button's lock", async () => {
    const job = baseJob({ jobType: "interstate", status: "completed" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });
    listWorkDiariesByDriver.mockResolvedValue({ data: [{ _id: "diary1", jobId: "job1", status: "pending" }] });

    renderJobs();

    expect(await screen.findByText("Work Diary Submitted ✅")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Work Diary Pages" })).not.toBeInTheDocument();
  });

  test("PASS: a pod_approved real-time event flips the Upload POD button to locked while the page is open — no reload needed", async () => {
    const job = baseJob({ jobType: "local", status: "completed" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });
    listPodsByDriver.mockResolvedValueOnce({ data: [] });

    const { rerender } = renderJobs();

    expect(await screen.findByRole("button", { name: "Upload POD" })).toBeInTheDocument();

    // Driver's POD, uploaded from another tab/device, just got approved —
    // this page never called uploadPod itself, so the only way it learns
    // about the new POD is via the real-time event triggering a refetch.
    listPodsByDriver.mockResolvedValueOnce({
      data: [{ _id: "pod1", jobId: "job1", status: "approved" }],
    });
    useNotifications.mockReturnValue({ lastEvent: { type: "pod_approved", resourceType: "jobpod", resourceId: "pod1" } });
    rerender(jobsTree());

    expect(await screen.findByText("POD Uploaded ✅")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload POD" })).not.toBeInTheDocument();
  });

  test("PASS: a diary_approved real-time event flips the Work Diary Pages button to locked while the page is open", async () => {
    const job = baseJob({ jobType: "interstate", status: "completed" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });
    listWorkDiariesByDriver.mockResolvedValueOnce({ data: [] });

    const { rerender } = renderJobs();

    expect(await screen.findByRole("button", { name: "Work Diary Pages" })).toBeInTheDocument();

    listWorkDiariesByDriver.mockResolvedValueOnce({
      data: [{ _id: "diary1", jobId: "job1", status: "approved" }],
    });
    useNotifications.mockReturnValue({ lastEvent: { type: "diary_approved", resourceType: "workdiary", resourceId: "diary1" } });
    rerender(jobsTree());

    expect(await screen.findByText("Work Diary Submitted ✅")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Work Diary Pages" })).not.toBeInTheDocument();
  });

  test("PASS: the job detail card shows its start time", async () => {
    const job = baseJob({ startTime: "08:00" });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderJobs();

    expect(await screen.findByText("Deliver freight")).toBeInTheDocument();
    expect(screen.getByText("08:00")).toBeInTheDocument();
  });

  test("PASS: a legacy job with no start time shows a placeholder instead of crashing", async () => {
    const job = baseJob({ startTime: undefined });
    getJobsByDriver.mockResolvedValue({ data: { data: [job] } });

    renderJobs();

    expect(await screen.findByText("Deliver freight")).toBeInTheDocument();
    expect(screen.getByText("Start Time")).toBeInTheDocument();
  });
});
