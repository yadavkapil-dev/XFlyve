// Admin PODs page: the api module (network boundary) is mocked; everything
// else — the unfiltered/unpaginated pending queue, the inline preview
// (image vs PDF), the driver-history section's reduced actions, and the
// Download-All date picker — runs for real against the real component.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PodsList from "./PodsList";
import {
  getAllDrivers,
  listPodsByDriver,
  getPod,
  listPendingPods,
  approvePod,
  downloadAllPods,
} from "../../api";

vi.mock("../../api", () => ({
  getAllDrivers: vi.fn(),
  listPodsByDriver: vi.fn(),
  deletePod: vi.fn(),
  getPod: vi.fn(),
  listPendingPods: vi.fn(),
  approvePod: vi.fn(),
  rejectPod: vi.fn(),
  downloadAllPods: vi.fn(),
}));

const pendingPod = (overrides = {}) => ({
  _id: "pod1",
  driverId: { _id: "driver1", name: "Jane Driver", email: "jane@example.com" },
  uploadDate: "2026-07-15T00:00:00.000Z",
  status: "pending",
  notes: "",
  ...overrides,
});

const historyPod = (overrides = {}) => ({
  _id: "pod2",
  driverId: { _id: "driver1", name: "Jane Driver" },
  uploadDate: "2026-07-10T00:00:00.000Z",
  status: "approved",
  notes: "",
  ...overrides,
});

const todayDateInput = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

describe("admin PodsList — pending queue is unfiltered and unpaginated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    // PodsList fetches drivers in two calls (active, then archived) so the
    // "Select Driver" dropdown can include departed drivers too — the
    // second call resolves empty here so tests see exactly one "Jane
    // Driver" entry, not a duplicate.
    getAllDrivers
      .mockResolvedValueOnce({ data: { status: "success", data: [{ _id: "driver1", name: "Jane Driver", email: "jane@example.com" }] } })
      .mockResolvedValue({ data: { status: "success", data: [] } });
    listPendingPods.mockResolvedValue({ data: [pendingPod()], pagination: null });
    listPodsByDriver.mockResolvedValue({ data: [], pagination: null });
  });

  test("PASS: fetches the pending queue with a fixed high limit, no driver/date filters, no page", async () => {
    render(<PodsList />);
    await screen.findByText(/Jane Driver/);

    expect(listPendingPods).toHaveBeenCalledWith({ limit: 100 });
  });

  test("PASS: no filter bar (driver/date) or pagination controls appear in the pending section", async () => {
    render(<PodsList />);
    await screen.findByText(/Jane Driver/);

    expect(screen.queryByLabelText("Filter by driver")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  test("PASS: Approve and Reject are available in the pending queue", async () => {
    render(<PodsList />);
    await screen.findByText(/Jane Driver/);

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  test("PASS: approving a pending POD calls approvePod and refreshes the queue", async () => {
    approvePod.mockResolvedValue({});
    render(<PodsList />);
    await screen.findByText(/Jane Driver/);

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approvePod).toHaveBeenCalledWith("pod1"));
    expect(await screen.findByText("POD approved.")).toBeInTheDocument();
  });
});

describe("admin PodsList — inline preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    getAllDrivers
      .mockResolvedValueOnce({ data: { status: "success", data: [{ _id: "driver1", name: "Jane Driver", email: "jane@example.com" }] } })
      .mockResolvedValue({ data: { status: "success", data: [] } });
    listPodsByDriver.mockResolvedValue({ data: [], pagination: null });
  });

  test("PASS: clicking a pending POD record opens a PDF preview inline, without downloading", async () => {
    listPendingPods.mockResolvedValue({ data: [pendingPod()], pagination: null });
    getPod.mockResolvedValue({ type: "application/pdf" });
    render(<PodsList />);

    const record = await screen.findByText(/Jane Driver/);
    await userEvent.click(record);

    expect(await screen.findByText("POD Preview")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTitle("POD preview").tagName).toBe("IFRAME"));
    expect(screen.getByTitle("POD preview")).toHaveAttribute("src", "blob:mock-preview-url");
  });

  test("PASS: clicking a POD record with an image file shows an <img>, not an iframe", async () => {
    listPendingPods.mockResolvedValue({ data: [pendingPod()], pagination: null });
    getPod.mockResolvedValue({ type: "image/png" });
    render(<PodsList />);

    const record = await screen.findByText(/Jane Driver/);
    await userEvent.click(record);

    const preview = await screen.findByAltText("POD preview");
    expect(preview.tagName).toBe("IMG");
    expect(preview).toHaveAttribute("src", "blob:mock-preview-url");
  });

  test("PASS: a failed preview fetch shows an error instead of a blank dialog", async () => {
    listPendingPods.mockResolvedValue({ data: [pendingPod()], pagination: null });
    getPod.mockRejectedValue(new Error("network error"));
    render(<PodsList />);

    const record = await screen.findByText(/Jane Driver/);
    await userEvent.click(record);

    expect(await screen.findByText("Failed to load POD preview")).toBeInTheDocument();
  });

  test("PASS: closing the preview revokes the object URL", async () => {
    listPendingPods.mockResolvedValue({ data: [pendingPod()], pagination: null });
    getPod.mockResolvedValue({ type: "application/pdf" });
    render(<PodsList />);

    const record = await screen.findByText(/Jane Driver/);
    await userEvent.click(record);
    await screen.findByText("POD Preview");

    await userEvent.click(screen.getByRole("button", { name: "close preview" }));

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-preview-url");
  });
});

describe("admin PodsList — driver history section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    listPendingPods.mockResolvedValue({ data: [], pagination: null });
    getAllDrivers
      .mockResolvedValueOnce({
        data: { status: "success", data: [{ _id: "driver1", name: "Jane Driver", email: "jane@example.com" }] },
      })
      .mockResolvedValue({ data: { status: "success", data: [] } });
  });

  test("PASS: the driver dropdown shows the driver's name only, not name + email", async () => {
    listPodsByDriver.mockResolvedValue({ data: [], pagination: null });
    render(<PodsList />);
    await screen.findByText("No PODs waiting for approval.");

    await userEvent.click(screen.getByLabelText("Select Driver"));
    const option = await screen.findByRole("option", { name: "Jane Driver" });
    expect(option).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /jane@example\.com/ })).not.toBeInTheDocument();
  });

  test("PASS: selecting a driver shows Date From/To but no Status filter", async () => {
    listPodsByDriver.mockResolvedValue({ data: [historyPod()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    render(<PodsList />);
    await screen.findByText("No PODs waiting for approval.");

    await userEvent.click(screen.getByLabelText("Select Driver"));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Driver" }));

    expect(await screen.findByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("All Statuses")).not.toBeInTheDocument();
  });

  test("PASS: history records only show Download and Delete — no Approve/Reject", async () => {
    listPodsByDriver.mockResolvedValue({ data: [historyPod()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    render(<PodsList />);
    await screen.findByText("No PODs waiting for approval.");

    await userEvent.click(screen.getByLabelText("Select Driver"));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Driver" }));

    expect(await screen.findByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  test("PASS: clicking a history record opens the same inline preview", async () => {
    listPodsByDriver.mockResolvedValue({ data: [historyPod()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    getPod.mockResolvedValue({ type: "application/pdf" });
    render(<PodsList />);
    await screen.findByText("No PODs waiting for approval.");

    await userEvent.click(screen.getByLabelText("Select Driver"));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Driver" }));

    const record = await screen.findByText("Driver: Jane Driver");
    await userEvent.click(record);

    expect(await screen.findByText("POD Preview")).toBeInTheDocument();
  });
});

describe("admin PodsList — Download All date picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-zip-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    getAllDrivers.mockResolvedValue({ data: { status: "success", data: [] } });
    listPendingPods.mockResolvedValue({ data: [], pagination: null });
    listPodsByDriver.mockResolvedValue({ data: [], pagination: null });
  });

  test("PASS: the date field defaults to today", async () => {
    render(<PodsList />);
    await screen.findByText("No PODs waiting for approval.");

    expect(screen.getByLabelText("Date")).toHaveValue(todayDateInput());
  });

  test("PASS: clicking Download passes the selected date through to downloadAllPods", async () => {
    downloadAllPods.mockResolvedValue({ data: new Blob(["zip"]) });
    render(<PodsList />);
    await screen.findByText("No PODs waiting for approval.");

    const dateInput = screen.getByLabelText("Date");
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, "2026-07-01");

    await userEvent.click(screen.getByRole("button", { name: "Download PODs" }));

    await waitFor(() => expect(downloadAllPods).toHaveBeenCalledWith("2026-07-01"));
  });

  test("PASS: a 404 (nothing approved for that date) shows a clear message", async () => {
    downloadAllPods.mockRejectedValue({ response: { status: 404 } });
    render(<PodsList />);
    await screen.findByText("No PODs waiting for approval.");

    await userEvent.click(screen.getByRole("button", { name: "Download PODs" }));

    expect(await screen.findByText("No approved POD files found for that date")).toBeInTheDocument();
  });
});
