// Ready to invoice: the api module (network boundary) is mocked; everything
// else — loading state, empty state, and the list itself — runs for real
// against the real component.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Invoicing from "./Invoicing";
import { getJobsReadyForInvoicing, updateJob } from "../../api";

vi.mock("../../api", () => ({
  getJobsReadyForInvoicing: vi.fn(),
  updateJob: vi.fn(),
}));

const job = (overrides = {}) => ({
  _id: "job1",
  title: "Sydney to Melbourne freight run",
  pickupLocation: "Sydney",
  deliveryLocation: "Melbourne",
  assignedTo: { name: "Driver One" },
  assignedTruck: { truckNumber: "TRK-1" },
  ...overrides,
});

describe("Invoicing — Ready to invoice page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("PASS: shows a loading spinner while the request is in flight", async () => {
    let resolveRequest;
    getJobsReadyForInvoicing.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    render(<Invoicing />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    resolveRequest({ data: { data: [] } });
    await screen.findByText("No jobs are invoice-ready yet.");
  });

  test("PASS: shows an empty state when no jobs are ready to invoice", async () => {
    getJobsReadyForInvoicing.mockResolvedValue({ data: { data: [] } });

    render(<Invoicing />);

    expect(await screen.findByText("No jobs are invoice-ready yet.")).toBeInTheDocument();
    expect(screen.getByText("0 ready")).toBeInTheDocument();
  });

  test("PASS: lists every job returned by getJobsReadyForInvoicing, with pickup/delivery/driver/truck", async () => {
    getJobsReadyForInvoicing.mockResolvedValue({ data: { data: [job()] } });

    render(<Invoicing />);

    expect(await screen.findByText("Sydney to Melbourne freight run")).toBeInTheDocument();
    expect(screen.getByText("Sydney → Melbourne")).toBeInTheDocument();
    expect(screen.getByText(/Driver One/)).toBeInTheDocument();
    expect(screen.getByText(/TRK-1/)).toBeInTheDocument();
    expect(screen.getByText("1 ready")).toBeInTheDocument();
  });

  test("PASS: describes the current POD-only rule, not the old approved-POD-and-diary rule", async () => {
    getJobsReadyForInvoicing.mockResolvedValue({ data: { data: [] } });

    render(<Invoicing />);
    await screen.findByText("No jobs are invoice-ready yet.");

    expect(screen.queryByText(/approved POD and diary/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/approved POD/i).length).toBeGreaterThan(0);
  });

  test("PASS: a failed request shows the server's error message", async () => {
    getJobsReadyForInvoicing.mockRejectedValue({ response: { data: { message: "Server error loading invoice-ready jobs" } } });

    render(<Invoicing />);

    expect(await screen.findByText("Server error loading invoice-ready jobs")).toBeInTheDocument();
  });

  describe("Mark as Invoiced", () => {
    test("PASS: clicking the row button opens a confirmation dialog without calling updateJob yet", async () => {
      getJobsReadyForInvoicing.mockResolvedValue({ data: { data: [job()] } });

      render(<Invoicing />);
      await screen.findByText("Sydney to Melbourne freight run");

      await userEvent.click(screen.getByRole("button", { name: "Mark as Invoiced" }));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(updateJob).not.toHaveBeenCalled();
    });

    test("PASS: canceling the dialog leaves the job in the list and never calls updateJob", async () => {
      getJobsReadyForInvoicing.mockResolvedValue({ data: { data: [job()] } });

      render(<Invoicing />);
      await screen.findByText("Sydney to Melbourne freight run");

      await userEvent.click(screen.getByRole("button", { name: "Mark as Invoiced" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(updateJob).not.toHaveBeenCalled();
      expect(screen.getByText("Sydney to Melbourne freight run")).toBeInTheDocument();
    });

    test("PASS: confirming calls PUT /jobs/:jobId with invoiceStatus 'invoiced' and removes the job from the list", async () => {
      getJobsReadyForInvoicing.mockResolvedValue({ data: { data: [job()] } });
      updateJob.mockResolvedValue({ data: { status: "success" } });

      render(<Invoicing />);
      await screen.findByText("Sydney to Melbourne freight run");

      await userEvent.click(screen.getByRole("button", { name: "Mark as Invoiced" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Mark as Invoiced" }));

      await waitFor(() => expect(updateJob).toHaveBeenCalledWith("job1", { invoiceStatus: "invoiced" }));
      await waitFor(() => expect(screen.queryByText("Sydney to Melbourne freight run")).not.toBeInTheDocument());
      expect(screen.getByText("No jobs are invoice-ready yet.")).toBeInTheDocument();
    });

    test("PASS: a failed update shows an error and keeps the job in the list", async () => {
      getJobsReadyForInvoicing.mockResolvedValue({ data: { data: [job()] } });
      updateJob.mockRejectedValue({ response: { data: { message: "Failed to mark job as invoiced" } } });

      render(<Invoicing />);
      await screen.findByText("Sydney to Melbourne freight run");

      await userEvent.click(screen.getByRole("button", { name: "Mark as Invoiced" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Mark as Invoiced" }));

      expect(await screen.findByText("Failed to mark job as invoiced")).toBeInTheDocument();
      expect(screen.getByText("Sydney to Melbourne freight run")).toBeInTheDocument();
    });
  });
});
