// Admin Work Diary page: the api module (network boundary) is mocked;
// everything else — the driver-history list (with pagination, since diary
// records accumulate over months unlike a temporary pending queue), the
// inline preview (image vs PDF), and the new date-range bulk-download
// control — runs for real against the real component. Mirrors
// PodsList.test.jsx's structure, adapted for: no pending-approval section
// (removed entirely), and a date-range (not single-day) download.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkDiary from "./WorkDiary";
import {
  getAllDrivers,
  listWorkDiariesByDriver,
  getWorkDiary,
  downloadWorkDiaries,
} from "../../api";

vi.mock("../../api", () => ({
  getAllDrivers: vi.fn(),
  listWorkDiariesByDriver: vi.fn(),
  deleteWorkDiary: vi.fn(),
  getWorkDiary: vi.fn(),
  downloadWorkDiaries: vi.fn(),
}));

const historyDiary = (overrides = {}) => ({
  _id: "diary1",
  driverId: { _id: "driver1", name: "Jane Driver" },
  uploadDate: "2026-07-10T00:00:00.000Z",
  notes: "",
  ...overrides,
});

const todayDateInput = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

describe("admin WorkDiary — no pending-approval section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    // WorkDiary fetches drivers in two calls (active, then archived) so the
    // "Select Driver" dropdown can include departed drivers too — the
    // second call resolves empty here so tests see exactly one "Jane
    // Driver" entry, not a duplicate.
    getAllDrivers
      .mockResolvedValueOnce({ data: { status: "success", data: [{ _id: "driver1", name: "Jane Driver", email: "jane@example.com" }] } })
      .mockResolvedValue({ data: { status: "success", data: [] } });
    listWorkDiariesByDriver.mockResolvedValue({ data: [], pagination: null });
  });

  test("PASS: there is no pending-approval section or Approve/Reject actions anywhere on the page", async () => {
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});

describe("admin WorkDiary — driver history section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    getAllDrivers
      .mockResolvedValueOnce({
        data: { status: "success", data: [{ _id: "driver1", name: "Jane Driver", email: "jane@example.com" }] },
      })
      .mockResolvedValue({ data: { status: "success", data: [] } });
  });

  test("PASS: the driver dropdown shows the driver's name only, not name + email", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [], pagination: null });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    await userEvent.click(screen.getByLabelText("Select Driver"));
    const option = await screen.findByRole("option", { name: "Jane Driver" });
    expect(option).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /jane@example\.com/ })).not.toBeInTheDocument();
  });

  test("PASS: selecting a driver shows Date From/To but no Status filter", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [historyDiary()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    // Before a driver is picked, only the hero's date-range download fields
    // exist (1 "From"/"To" pair) — no Status field either way.
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("All Statuses")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Select Driver"));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Driver" }));

    // The history filter bar's own From/To now join the hero's, for 2 of each.
    await waitFor(() => expect(screen.getAllByLabelText("From")).toHaveLength(2));
    expect(screen.getAllByLabelText("To")).toHaveLength(2);
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("All Statuses")).not.toBeInTheDocument();
  });

  test("PASS: history records only show Download and Delete — no Approve/Reject", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [historyDiary()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    await userEvent.click(screen.getByLabelText("Select Driver"));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Driver" }));

    expect(await screen.findByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  test("PASS: pagination controls render for the driver-history list (unlike the removed pending queue, this list grows over months)", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [historyDiary()], pagination: { page: 1, limit: 20, total: 45, totalPages: 3 } });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    await userEvent.click(screen.getByLabelText("Select Driver"));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Driver" }));

    expect(await screen.findByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prev" })).toBeInTheDocument();
  });
});

describe("admin WorkDiary — inline preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    getAllDrivers
      .mockResolvedValueOnce({ data: { status: "success", data: [{ _id: "driver1", name: "Jane Driver", email: "jane@example.com" }] } })
      .mockResolvedValue({ data: { status: "success", data: [] } });
  });

  const selectJaneDriver = async () => {
    await userEvent.click(screen.getByLabelText("Select Driver"));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Driver" }));
  };

  test("PASS: clicking a history record opens a PDF preview inline, without downloading", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [historyDiary()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    getWorkDiary.mockResolvedValue({ type: "application/pdf" });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");
    await selectJaneDriver();

    const record = await screen.findByText("Driver: Jane Driver");
    await userEvent.click(record);

    expect(await screen.findByText("Work Diary Preview")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTitle("Work diary preview").tagName).toBe("IFRAME"));
    expect(screen.getByTitle("Work diary preview")).toHaveAttribute("src", "blob:mock-preview-url");
  });

  test("PASS: clicking a record with an image file shows an <img>, not an iframe", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [historyDiary()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    getWorkDiary.mockResolvedValue({ type: "image/png" });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");
    await selectJaneDriver();

    const record = await screen.findByText("Driver: Jane Driver");
    await userEvent.click(record);

    const preview = await screen.findByAltText("Work diary preview");
    expect(preview.tagName).toBe("IMG");
    expect(preview).toHaveAttribute("src", "blob:mock-preview-url");
  });

  test("PASS: a failed preview fetch shows an error instead of a blank dialog", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [historyDiary()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    getWorkDiary.mockRejectedValue(new Error("network error"));
    render(<WorkDiary />);
    await screen.findByText("Select a driver");
    await selectJaneDriver();

    const record = await screen.findByText("Driver: Jane Driver");
    await userEvent.click(record);

    expect(await screen.findByText("Failed to load work diary preview")).toBeInTheDocument();
  });

  test("PASS: closing the preview revokes the object URL", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [historyDiary()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } });
    getWorkDiary.mockResolvedValue({ type: "application/pdf" });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");
    await selectJaneDriver();

    const record = await screen.findByText("Driver: Jane Driver");
    await userEvent.click(record);
    await screen.findByText("Work Diary Preview");

    await userEvent.click(screen.getByRole("button", { name: "close preview" }));

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-preview-url");
  });
});

describe("admin WorkDiary — date-range bulk download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-zip-url");
    globalThis.URL.revokeObjectURL = vi.fn();
    getAllDrivers
      .mockResolvedValueOnce({
        data: { status: "success", data: [{ _id: "driver1", name: "Jane Driver", email: "jane@example.com" }] },
      })
      .mockResolvedValue({ data: { status: "success", data: [] } });
    listWorkDiariesByDriver.mockResolvedValue({ data: [], pagination: null });
  });

  test("PASS: From/To default to today and Driver defaults to 'All Drivers'", async () => {
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    expect(screen.getByLabelText("From")).toHaveValue(todayDateInput());
    expect(screen.getByLabelText("To")).toHaveValue(todayDateInput());

    await userEvent.click(screen.getByLabelText("Driver"));
    const allDriversOption = await screen.findByRole("option", { name: "All Drivers" });
    expect(allDriversOption).toHaveAttribute("aria-selected", "true");
  });

  test("PASS: clicking Download Range with no driver selected passes dateFrom/dateTo and an undefined driverId", async () => {
    downloadWorkDiaries.mockResolvedValue({ data: new Blob(["zip"]) });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    const fromInput = screen.getByLabelText("From");
    await userEvent.clear(fromInput);
    await userEvent.type(fromInput, "2026-07-01");
    const toInput = screen.getByLabelText("To");
    await userEvent.clear(toInput);
    await userEvent.type(toInput, "2026-07-15");

    await userEvent.click(screen.getByRole("button", { name: "Download Range" }));

    await waitFor(() => expect(downloadWorkDiaries).toHaveBeenCalledWith("2026-07-01", "2026-07-15", undefined));
  });

  test("PASS: picking a driver for the download scopes the call to that driverId", async () => {
    downloadWorkDiaries.mockResolvedValue({ data: new Blob(["zip"]) });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    await userEvent.click(screen.getByLabelText("Driver"));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Driver" }));

    await userEvent.click(screen.getByRole("button", { name: "Download Range" }));

    await waitFor(() =>
      expect(downloadWorkDiaries).toHaveBeenCalledWith(todayDateInput(), todayDateInput(), "driver1")
    );
  });

  test("PASS: a 404 (nothing found for that range) shows a clear message", async () => {
    downloadWorkDiaries.mockRejectedValue({ response: { status: 404 } });
    render(<WorkDiary />);
    await screen.findByText("Select a driver");

    await userEvent.click(screen.getByRole("button", { name: "Download Range" }));

    expect(await screen.findByText("No work diary files found for that range")).toBeInTheDocument();
  });
});
