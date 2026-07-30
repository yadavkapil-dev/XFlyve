// Create Run form: the api module (network boundary) is mocked; everything
// else — required-field validation (start time required, description no
// longer required), and the fact that Customer Name is gone entirely — runs
// for real against the real component.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateJob from "./CreateJob";
import { getAllTrucks, getAllTruckAssignments, getAllDrivers, createJob } from "../../api";

vi.mock("../../api", () => ({
  getAllTrucks: vi.fn(),
  getAllTruckAssignments: vi.fn(),
  getAllDrivers: vi.fn(),
  createJob: vi.fn(),
}));

const tomorrowDateInput = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// MUI appends a " *" asterisk to a required field's accessible label text,
// so an exact "Run Title" match never hits — anchor on the prefix instead.
const requiredLabel = (text) => new RegExp(`^${text}`);

const selectMuiOption = async (labelText, optionName) => {
  const combobox = screen.getByLabelText(requiredLabel(labelText));
  await userEvent.click(combobox);
  const option = await screen.findByRole("option", { name: optionName });
  await userEvent.click(option);
};

const fillEveryRequiredFieldExcept = async (skip = []) => {
  if (!skip.includes("title")) await userEvent.type(screen.getByLabelText(requiredLabel("Run Title")), "Sydney run");
  if (!skip.includes("pickupLocation")) await userEvent.type(screen.getByLabelText(requiredLabel("Pickup Location")), "Depot");
  if (!skip.includes("deliveryLocation")) await userEvent.type(screen.getByLabelText(requiredLabel("Delivery Location")), "Customer site");
  if (!skip.includes("assignedTo")) await selectMuiOption("Assigned Driver", "Jane");
  if (!skip.includes("truckId")) await selectMuiOption("Select Truck", "TRK-1");
  if (!skip.includes("jobDate")) fireEvent.change(screen.getByLabelText(requiredLabel("Run Date")), { target: { value: tomorrowDateInput() } });
  if (!skip.includes("startTime")) fireEvent.change(screen.getByLabelText(requiredLabel("Start Time")), { target: { value: "08:00" } });
  if (!skip.includes("jobType")) await selectMuiOption("Run Type", "Local");
};

describe("CreateJob — required fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllTrucks.mockResolvedValue({ data: { data: [{ _id: "truck1", truckNumber: "TRK-1", status: "available" }] } });
    getAllTruckAssignments.mockResolvedValue({ data: { data: [] } });
    getAllDrivers.mockResolvedValue({ data: { data: [{ _id: "driver1", name: "Jane" }] } });
  });

  test("PASS: there is no Customer Name field anywhere in the form", async () => {
    render(<CreateJob />);
    await screen.findByLabelText(requiredLabel("Run Title"));

    expect(screen.queryByLabelText(/Customer Name/)).not.toBeInTheDocument();
    expect(screen.queryByText("Customer")).not.toBeInTheDocument();
  });

  test("PASS: submitting without a start time is blocked and never calls createJob", async () => {
    render(<CreateJob />);
    await screen.findByLabelText(requiredLabel("Run Title"));

    await fillEveryRequiredFieldExcept(["startTime"]);
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));

    expect(await screen.findByText("Please complete every required section before creating the run.")).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
  });

  test("PASS: submitting with a start time but no description succeeds — description is optional", async () => {
    createJob.mockResolvedValue({ data: { status: "success", data: { _id: "job1" } } });
    render(<CreateJob />);
    await screen.findByLabelText(requiredLabel("Run Title"));

    await fillEveryRequiredFieldExcept([]);
    // Run Description is intentionally left blank.
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    const payload = createJob.mock.calls[0][0];
    expect(payload.startTime).toBe("08:00");
    expect(payload.description).toBe("");
    expect(await screen.findByText("Run created successfully.")).toBeInTheDocument();
  });

  test("PASS: the review panel shows the selected start time, not a Customer row", async () => {
    render(<CreateJob />);
    await screen.findByLabelText(requiredLabel("Run Title"));

    fireEvent.change(screen.getByLabelText(requiredLabel("Start Time")), { target: { value: "14:45" } });

    expect(await screen.findByText("14:45")).toBeInTheDocument();
    expect(screen.getAllByText("Start Time").length).toBeGreaterThan(0);
  });
});
