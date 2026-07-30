// Admin Operations Board (Jobs list): the api module (network boundary) is
// mocked; everything else — the simplified Driver+Date filter bar, the edit
// dialog's start-time requirement, and the fact that Customer Name/Search/
// Status/Run Type are all gone — runs for real against the real component.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Jobs from "./Jobs";
import {
  getAllJobs,
  getAllTrucks,
  getAllTruckAssignments,
  getAllDrivers,
  updateJob,
  getJobActivity,
} from "../../api";

vi.mock("../../api", () => ({
  getAllJobs: vi.fn(),
  deleteJob: vi.fn(),
  getAllTrucks: vi.fn(),
  getAllTruckAssignments: vi.fn(),
  getAllDrivers: vi.fn(),
  updateJob: vi.fn(),
  getJobActivity: vi.fn(),
}));

const job = (overrides = {}) => ({
  _id: "job1",
  title: "Sydney to Melbourne freight run",
  description: "Pallet freight",
  pickupLocation: "Sydney Depot",
  deliveryLocation: "Melbourne Warehouse",
  assignedTo: { _id: "driver1", name: "Jane Driver" },
  assignedTruck: { _id: "truck1", truckNumber: "TRK-1" },
  jobDate: "2026-08-01T00:00:00.000Z",
  jobType: "local",
  status: "pending",
  ...overrides,
});

const requiredLabel = (text) => new RegExp(`^${text}`);

const renderJobsPage = () => render(<MemoryRouter><Jobs /></MemoryRouter>);

describe("admin Jobs — simplified Driver + Date filter bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllJobs.mockResolvedValue({ data: { data: [job()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    getAllTrucks.mockResolvedValue({ data: { data: [{ _id: "truck1", truckNumber: "TRK-1", status: "available" }] } });
    getAllTruckAssignments.mockResolvedValue({ data: { data: [] } });
    getAllDrivers.mockResolvedValue({ data: { data: [{ _id: "driver1", name: "Jane Driver" }] } });
    getJobActivity.mockResolvedValue({ data: { data: [] } });
  });

  test("PASS: the filter bar has exactly Driver and Date fields — no Search, Status or Run Type", async () => {
    renderJobsPage();

    expect(await screen.findByText("Sydney to Melbourne freight run")).toBeInTheDocument();
    expect(screen.getByLabelText("Driver")).toBeInTheDocument();
    expect(screen.getByLabelText("Run Date")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Run Type")).not.toBeInTheDocument();
    expect(screen.queryByText("All Statuses")).not.toBeInTheDocument();
    expect(screen.queryByText("All Types")).not.toBeInTheDocument();
  });

  test("PASS: selecting a driver calls getAllJobs with assignedTo, never status/jobType/search", async () => {
    renderJobsPage();
    await screen.findByText("Sydney to Melbourne freight run");

    const driverSelect = screen.getByLabelText("Driver");
    await userEvent.click(driverSelect);
    const option = await screen.findByRole("option", { name: "Jane Driver" });
    await userEvent.click(option);

    await waitFor(() => {
      const lastCall = getAllJobs.mock.calls[getAllJobs.mock.calls.length - 1][0];
      expect(lastCall.assignedTo).toBe("driver1");
      expect(lastCall.status).toBeUndefined();
      expect(lastCall.jobType).toBeUndefined();
      expect(lastCall.search).toBeUndefined();
    });
  });

  test("PASS: setting Run Date filters via dateFrom/dateTo on the same day", async () => {
    renderJobsPage();
    await screen.findByText("Sydney to Melbourne freight run");

    fireEvent.change(screen.getByLabelText("Run Date"), { target: { value: "2026-08-01" } });

    await waitFor(() => {
      const lastCall = getAllJobs.mock.calls[getAllJobs.mock.calls.length - 1][0];
      expect(lastCall.dateFrom).toBe("2026-08-01");
      expect(lastCall.dateTo).toBe("2026-08-01");
    });
  });

  test("PASS: no Customer Name field or value appears anywhere on the page", async () => {
    renderJobsPage();
    await screen.findByText("Sydney to Melbourne freight run");

    expect(screen.queryByLabelText(/Customer Name/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Customer/)).not.toBeInTheDocument();
  });

  test("PASS: the job card shows the job's start time", async () => {
    getAllJobs.mockResolvedValue({ data: { data: [job({ startTime: "08:00" })], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    renderJobsPage();

    await screen.findByText("Sydney to Melbourne freight run");
    expect(screen.getByText("08:00")).toBeInTheDocument();
  });
});

describe("admin Jobs — edit dialog start-time requirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllTrucks.mockResolvedValue({ data: { data: [{ _id: "truck1", truckNumber: "TRK-1", status: "available" }] } });
    getAllTruckAssignments.mockResolvedValue({ data: { data: [] } });
    getAllDrivers.mockResolvedValue({ data: { data: [{ _id: "driver1", name: "Jane Driver" }] } });
    getJobActivity.mockResolvedValue({ data: { data: [] } });
  });

  test("PASS: a legacy job with no start time opens the edit dialog with a blank Start Time field, not a crash", async () => {
    getAllJobs.mockResolvedValue({ data: { data: [job({ startTime: undefined })], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    renderJobsPage();

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));

    const startTimeInput = await screen.findByLabelText(requiredLabel("Start Time"));
    expect(startTimeInput).toHaveValue("");
  });

  test("PASS: saving an edit with no start time is blocked and never calls updateJob", async () => {
    getAllJobs.mockResolvedValue({ data: { data: [job({ startTime: undefined })], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    renderJobsPage();

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByLabelText(requiredLabel("Start Time"));

    await userEvent.click(screen.getByRole("button", { name: "Update Run" }));

    expect(await screen.findByText("Please fill all required fields")).toBeInTheDocument();
    expect(updateJob).not.toHaveBeenCalled();
  });

  test("PASS: filling in Start Time and saving calls updateJob with it", async () => {
    getAllJobs.mockResolvedValue({ data: { data: [job({ startTime: undefined })], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    updateJob.mockResolvedValue({ data: { data: job({ startTime: "09:00" }) } });
    renderJobsPage();

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const startTimeInput = await screen.findByLabelText(requiredLabel("Start Time"));
    fireEvent.change(startTimeInput, { target: { value: "09:00" } });

    await userEvent.click(screen.getByRole("button", { name: "Update Run" }));

    await waitFor(() => expect(updateJob).toHaveBeenCalledTimes(1));
    const [, payload] = updateJob.mock.calls[0];
    expect(payload.startTime).toBe("09:00");
  });

  test("PASS: the edit dialog has no Customer Name field, and Description is no longer required", async () => {
    getAllJobs.mockResolvedValue({ data: { data: [job({ description: undefined, startTime: "08:00" })], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    updateJob.mockResolvedValue({ data: { data: job() } });
    renderJobsPage();

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByLabelText(requiredLabel("Start Time"));

    expect(screen.queryByLabelText(/Customer Name/)).not.toBeInTheDocument();

    // Description left blank; every other required field already has a
    // value from the job being edited, so this exercises specifically
    // whether description blocks the save.
    await userEvent.click(screen.getByRole("button", { name: "Update Run" }));

    await waitFor(() => expect(updateJob).toHaveBeenCalledTimes(1));
  });
});
