// Admin Trucks page: the api module (network boundary) is mocked. Covers
// the "small fleet" simplification (capacity field removed entirely, no
// Search/Status filter or pagination — plain list of all trucks) and the
// archive-not-delete wording fix (mirrors the identical Drivers.jsx fix:
// button/dialog stay labeled "Delete", but the resulting message reflects
// what the backend actually did).
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Trucks from "./Trucks";
import { getAllTrucks, createTruck, updateTruck, deleteTruck } from "../../api";

vi.mock("../../api", () => ({
  getAllTrucks: vi.fn(),
  createTruck: vi.fn(),
  updateTruck: vi.fn(),
  deleteTruck: vi.fn(),
}));

// getByLabelText matches the label's raw textContent, which includes the
// (aria-hidden) required-field asterisk MUI appends.
const requiredLabel = (text) => new RegExp(`^${text}`);

const truck = (overrides = {}) => ({
  _id: "truck1",
  truckNumber: "TRK-104",
  status: "available",
  ...overrides,
});

describe("admin Trucks — capacity removed, no filters/pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllTrucks.mockResolvedValue({ data: { data: [truck()], outOfServiceCount: 0 } });
  });

  test("PASS: fetches all trucks with a fixed high limit, no page/search/status params", async () => {
    render(<Trucks />);
    await screen.findByText("TRK-104");

    expect(getAllTrucks).toHaveBeenCalledWith({ limit: 100, sort: "truckNumber" });
  });

  test("PASS: the create-truck form has no Capacity field", async () => {
    render(<Trucks />);
    await screen.findByText("TRK-104");

    expect(screen.queryByLabelText("Capacity")).not.toBeInTheDocument();
    expect(screen.getByLabelText(requiredLabel("Truck Number"))).toBeInTheDocument();
    expect(screen.getByLabelText("Out of service")).toBeInTheDocument();
  });

  test("PASS: there is no Search box, Status filter, Clear button, or pagination controls", async () => {
    render(<Trucks />);
    await screen.findByText("TRK-104");

    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  test("PASS: the truck card shows no capacity text anywhere", async () => {
    render(<Trucks />);
    await screen.findByText("TRK-104");

    expect(screen.queryByText(/capacity/i)).not.toBeInTheDocument();
  });

  test("PASS: creating a truck submits only truckNumber (and status if out-of-service) — never capacity", async () => {
    createTruck.mockResolvedValue({});
    render(<Trucks />);
    await screen.findByText("TRK-104");

    await userEvent.type(screen.getByLabelText(requiredLabel("Truck Number")), "trk-9");
    await userEvent.click(screen.getByRole("button", { name: "Create Truck" }));

    await waitFor(() => expect(createTruck).toHaveBeenCalledTimes(1));
    const payload = createTruck.mock.calls[0][0];
    expect(payload).not.toHaveProperty("capacity");
    expect(payload).toEqual({ truckNumber: "TRK-9" });
  });

  test("PASS: creating a truck with 'Out of service' checked submits status: out-of-service", async () => {
    createTruck.mockResolvedValue({});
    render(<Trucks />);
    await screen.findByText("TRK-104");

    await userEvent.type(screen.getByLabelText(requiredLabel("Truck Number")), "trk-9");
    await userEvent.click(screen.getByLabelText("Out of service"));
    await userEvent.click(screen.getByRole("button", { name: "Create Truck" }));

    await waitFor(() => expect(createTruck).toHaveBeenCalledWith({ truckNumber: "TRK-9", status: "out-of-service" }));
  });

  test("PASS: editing a truck never sends capacity", async () => {
    updateTruck.mockResolvedValue({});
    render(<Trucks />);
    await screen.findByText("TRK-104");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Update Truck" }));

    await waitFor(() => expect(updateTruck).toHaveBeenCalledTimes(1));
    const payload = updateTruck.mock.calls[0][1];
    expect(payload).not.toHaveProperty("capacity");
  });

  test("PASS: an out-of-service truck shows the 'Cannot be assigned to jobs' warning", async () => {
    getAllTrucks.mockResolvedValue({ data: { data: [truck({ status: "out-of-service" })], outOfServiceCount: 1 } });
    render(<Trucks />);
    await screen.findByText("TRK-104");

    expect(screen.getByText("Cannot be assigned to jobs")).toBeInTheDocument();
    expect(screen.getByText("1 truck currently marked out of service.")).toBeInTheDocument();
  });
});

describe("admin Trucks — archive (not permanent delete) wording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllTrucks.mockResolvedValue({ data: { data: [truck()], outOfServiceCount: 0 } });
  });

  test("PASS: the confirmation dialog is labeled Delete but its body explains this archives, not permanently deletes", async () => {
    render(<Trucks />);
    await screen.findByText("TRK-104");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Delete this truck?")).toBeInTheDocument();
    expect(screen.getByText(/not a permanent delete/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("PASS: confirming shows the backend's own success message (e.g. 'Truck archived'), not a hardcoded 'deleted' message", async () => {
    deleteTruck.mockResolvedValue({ data: { message: "Truck archived" } });
    render(<Trucks />);
    await screen.findByText("TRK-104");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteTruck).toHaveBeenCalledWith("truck1"));
    expect(await screen.findByText("Truck archived")).toBeInTheDocument();
    expect(screen.queryByText(/deleted successfully/i)).not.toBeInTheDocument();
  });

  test("PASS: if the backend response has no message, falls back to an accurate 'archived' wording rather than 'deleted'", async () => {
    deleteTruck.mockResolvedValue({ data: {} });
    render(<Trucks />);
    await screen.findByText("TRK-104");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteTruck).toHaveBeenCalledWith("truck1"));
    expect(await screen.findByText(/archived/i)).toBeInTheDocument();
    expect(screen.queryByText(/deleted successfully/i)).not.toBeInTheDocument();
  });

  test("PASS: declining the confirmation never calls deleteTruck", async () => {
    render(<Trucks />);
    await screen.findByText("TRK-104");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(deleteTruck).not.toHaveBeenCalled();
  });
});
