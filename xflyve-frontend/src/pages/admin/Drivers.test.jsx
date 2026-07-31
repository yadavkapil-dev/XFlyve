// Admin Drivers page: the api module (network boundary) is mocked. Covers
// the removal of driverType/deliveryRate/abn/payType (unused profile
// fields), the demo/seed-driver toggle (getPublicDrivers/show-all-drivers),
// the removal of Search/Status filtering and pagination (plain list of all
// drivers now), and the archive-not-delete wording fix — the page should
// look intentionally simplified, not just missing pieces.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Drivers from "./Drivers";
import { getAllDrivers, createDriver, updateDriver, deleteDriver } from "../../api";

vi.mock("../../api", () => ({
  getAllDrivers: vi.fn(),
  createDriver: vi.fn(),
  updateDriver: vi.fn(),
  deleteDriver: vi.fn(),
}));

// getByLabelText matches the label's raw textContent, which includes the
// (aria-hidden) required-field asterisk MUI appends — so exact "Name"
// never matches a required field's actual label text of "Name *".
const requiredLabel = (text) => new RegExp(`^${text}`);

const driver = (overrides = {}) => ({
  _id: "driver1",
  name: "Jane Driver",
  email: "jane@example.com",
  role: "driver",
  ...overrides,
});

describe("admin Drivers — driverType/deliveryRate/abn/payType removed, no filters/pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllDrivers.mockResolvedValue({ data: { data: [driver()] } });
  });

  test("PASS: fetching the driver list uses a fixed high limit, no page/search/status params", async () => {
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    expect(getAllDrivers).toHaveBeenCalledWith({ limit: 100, sort: "name" });
  });

  test("PASS: the create-driver form has no Driver Type, Pay Type, Delivery Rate, or ABN fields", async () => {
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    expect(screen.queryByLabelText("Driver Type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pay Type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delivery Rate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ABN")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Hourly Rate")).toBeInTheDocument();
    expect(screen.getByLabelText("KM Rate")).toBeInTheDocument();
  });

  test("PASS: there is no Search box, Status filter, Clear button, or pagination controls on the list", async () => {
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  test("PASS: there is no demo-tools toggle or Load Demo/Real Drivers button anywhere on the page", async () => {
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    expect(screen.queryByRole("button", { name: /demo tools/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load Demo Drivers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load Real Drivers" })).not.toBeInTheDocument();
  });

  test("PASS: creating a driver submits only name/email/password plus phone/hourlyRate/kmRate — never driverType/payType/deliveryRate/abn", async () => {
    createDriver.mockResolvedValue({});
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    await userEvent.type(screen.getByLabelText(requiredLabel("Name")), "New Driver");
    await userEvent.type(screen.getByLabelText(requiredLabel("Email")), "new@example.com");
    await userEvent.type(screen.getByLabelText(requiredLabel("Temporary Password")), "Password123!");
    await userEvent.click(screen.getByRole("button", { name: "Create Driver" }));

    await waitFor(() => expect(createDriver).toHaveBeenCalledTimes(1));
    const payload = createDriver.mock.calls[0][0];
    expect(payload).not.toHaveProperty("driverType");
    expect(payload).not.toHaveProperty("payType");
    expect(payload).not.toHaveProperty("deliveryRate");
    expect(payload).not.toHaveProperty("abn");
    expect(payload).toMatchObject({ name: "New Driver", email: "new@example.com", password: "Password123!" });
  });

  test("PASS: editing a driver's profile fields never sends driverType/payType/deliveryRate/abn", async () => {
    updateDriver.mockResolvedValue({});
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(updateDriver).toHaveBeenCalledTimes(1));
    const payload = updateDriver.mock.calls[0][1];
    expect(payload).not.toHaveProperty("driverType");
    expect(payload).not.toHaveProperty("payType");
    expect(payload).not.toHaveProperty("deliveryRate");
    expect(payload).not.toHaveProperty("abn");
  });
});

describe("admin Drivers — archive (not permanent delete) wording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllDrivers.mockResolvedValue({ data: { data: [driver()] } });
  });

  test("PASS: the confirmation dialog is labeled Delete but its body explains this archives, not permanently deletes", async () => {
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Delete this driver?")).toBeInTheDocument();
    expect(screen.getByText(/not a permanent delete/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("PASS: confirming shows the backend's own success message (e.g. 'Driver archived'), not a hardcoded 'deleted' message", async () => {
    deleteDriver.mockResolvedValue({ data: { status: "success", message: "Driver archived" } });
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteDriver).toHaveBeenCalledWith("driver1"));
    expect(await screen.findByText("Driver archived")).toBeInTheDocument();
    expect(screen.queryByText(/deleted successfully/i)).not.toBeInTheDocument();
  });

  test("PASS: if the backend response has no message, falls back to an accurate 'archived' wording rather than 'deleted'", async () => {
    deleteDriver.mockResolvedValue({ data: {} });
    render(<Drivers />);
    await screen.findByText("Jane Driver");

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteDriver).toHaveBeenCalledWith("driver1"));
    expect(await screen.findByText(/archived/i)).toBeInTheDocument();
    expect(screen.queryByText(/deleted successfully/i)).not.toBeInTheDocument();
  });
});
