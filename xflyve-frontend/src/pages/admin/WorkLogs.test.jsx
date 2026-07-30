// Admin Driver Records list: the api module (network boundary) is mocked;
// everything else — the consolidated Driver+Date filter bar, and the fact
// that approval actions no longer exist here — runs for real against the
// real component. Work log approval was removed entirely (a submitted log
// is just a record now), so this page only ever lists records; it never
// shows Approve/Reject or a Status filter.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkLogs from "./WorkLogs";
import {
  getAllWorkLogsAdmin,
  getWorkLogsByDriverAdmin,
  getAllDrivers,
  getWeeklyWorkLogStatsAdmin,
  deleteWorkLog,
} from "../../api";

vi.mock("../../api", () => ({
  getAllWorkLogsAdmin: vi.fn(),
  getWorkLogsByDriverAdmin: vi.fn(),
  getAllDrivers: vi.fn(),
  getWeeklyWorkLogStatsAdmin: vi.fn(),
  deleteWorkLog: vi.fn(),
}));

const log = (overrides = {}) => ({
  _id: "log1",
  driverId: { name: "Jane Driver" },
  date: "2026-07-15T00:00:00.000Z",
  jobIds: [],
  hours: 8,
  deliveriesDone: 3,
  localStartTime: "08:00",
  localEndTime: "16:00",
  ...overrides,
});

describe("WorkLogs (admin) — consolidated Driver + Date filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllDrivers.mockResolvedValue({ data: { status: "success", data: [{ _id: "d1", name: "Jane Driver" }] } });
    getAllWorkLogsAdmin.mockResolvedValue({ data: { success: true, data: [log()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    getWorkLogsByDriverAdmin.mockResolvedValue({ data: { success: true, data: [log()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    getWeeklyWorkLogStatsAdmin.mockResolvedValue({ data: { data: { weeklyLogs: 1, weeklyHours: 8, weeklyKilometres: 0, weeklyDeliveries: 3 } } });
  });

  test("PASS: the filter bar has exactly Driver, From and To fields — no Status filter", async () => {
    render(<WorkLogs />);

    await screen.findByText("Jane Driver");

    expect(screen.getByLabelText("Filter by Driver")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("All Statuses")).not.toBeInTheDocument();
  });

  test("PASS: no Approve/Reject actions are ever shown — work log approval was removed entirely", async () => {
    render(<WorkLogs />);

    await screen.findByText("Jane Driver");

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByText("Pending record approvals")).not.toBeInTheDocument();
  });

  test("PASS: selecting a driver calls getWorkLogsByDriverAdmin with that driver's id, never a status param", async () => {
    render(<WorkLogs />);
    await screen.findByText("Jane Driver");

    const driverInput = screen.getByLabelText("Filter by Driver");
    await userEvent.click(driverInput);
    await userEvent.type(driverInput, "Jane");
    const option = await screen.findByRole("option", { name: "Jane Driver" });
    await userEvent.click(option);

    await waitFor(() => expect(getWorkLogsByDriverAdmin).toHaveBeenCalled());
    const [driverId, params] = getWorkLogsByDriverAdmin.mock.calls[0];
    expect(driverId).toBe("d1");
    expect(params.status).toBeUndefined();
  });

  test("PASS: setting a date range calls getAllWorkLogsAdmin with dateFrom/dateTo, never a status param", async () => {
    render(<WorkLogs />);
    await screen.findByText("Jane Driver");

    await userEvent.type(screen.getByLabelText("From"), "2026-07-01");
    await userEvent.type(screen.getByLabelText("To"), "2026-07-31");

    await waitFor(() => {
      const lastCall = getAllWorkLogsAdmin.mock.calls[getAllWorkLogsAdmin.mock.calls.length - 1][0];
      expect(lastCall.dateFrom).toBe("2026-07-01");
      expect(lastCall.dateTo).toBe("2026-07-31");
      expect(lastCall.status).toBeUndefined();
    });
  });

  test("PASS: Clear resets the driver and date filters back to the unfiltered list", async () => {
    render(<WorkLogs />);
    await screen.findByText("Jane Driver");

    const driverInput = screen.getByLabelText("Filter by Driver");
    await userEvent.click(driverInput);
    await userEvent.type(driverInput, "Jane");
    const option = await screen.findByRole("option", { name: "Jane Driver" });
    await userEvent.click(option);
    await waitFor(() => expect(getWorkLogsByDriverAdmin).toHaveBeenCalled());

    // MUI's Autocomplete renders its own icon-only "Clear" button once a
    // value is selected, so there are two "Clear"-named buttons at this
    // point — pick the visible-text one (the filter bar's own Clear button).
    const clearButtons = screen.getAllByRole("button", { name: "Clear" });
    await userEvent.click(clearButtons.find((btn) => btn.textContent === "Clear"));

    await waitFor(() => {
      const calls = getAllWorkLogsAdmin.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[calls.length - 1][0].dateFrom).toBeUndefined();
      expect(calls[calls.length - 1][0].dateTo).toBeUndefined();
    });
    expect(screen.getByLabelText("Filter by Driver")).toHaveValue("");
  });

  test("PASS: clicking Delete asks for confirmation; declining never calls deleteWorkLog", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<WorkLogs />);
    await screen.findByText("Jane Driver");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledWith("Delete this daily record?");
    expect(deleteWorkLog).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  test("PASS: confirming the Delete prompt calls deleteWorkLog with the record's id and refreshes the list", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteWorkLog.mockResolvedValue({ data: { success: true } });
    render(<WorkLogs />);
    await screen.findByText("Jane Driver");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteWorkLog).toHaveBeenCalledWith("log1"));
    expect(await screen.findByText("Daily record deleted.")).toBeInTheDocument();
    // Once for the initial load, once for the post-delete refresh.
    expect(getAllWorkLogsAdmin).toHaveBeenCalledTimes(2);

    confirmSpy.mockRestore();
  });

  test("PASS: a failed delete shows the server's error message instead of a silent failure", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteWorkLog.mockRejectedValue({ response: { data: { message: "Failed to delete daily record" } } });
    render(<WorkLogs />);
    await screen.findByText("Jane Driver");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Failed to delete daily record")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
