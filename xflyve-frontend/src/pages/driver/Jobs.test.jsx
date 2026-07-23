// Job status actions: the api module (network boundary) and useAuth are
// mocked; everything else — status derivation, button labelling, in-flight
// disabling, error display — runs for real against the real component.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DriverJobs from "./Jobs";
import { useAuth } from "../../contexts/AuthContext";
import { getJobsByDriver, listPodsByDriver, updateJob } from "../../api";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../api", () => ({
  getJobsByDriver: vi.fn(),
  listPodsByDriver: vi.fn(),
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

const renderJobs = () =>
  render(
    <MemoryRouter>
      <DriverJobs />
    </MemoryRouter>
  );

describe("DriverJobs — job status actions", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { _id: "driver1" } });
    listPodsByDriver.mockResolvedValue({ data: [] });
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
});
