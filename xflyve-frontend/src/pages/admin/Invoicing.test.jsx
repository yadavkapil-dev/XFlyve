// Ready to invoice: the api module (network boundary) is mocked; everything
// else — loading state, empty state, and the list itself — runs for real
// against the real component.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Invoicing from "./Invoicing";
import { getJobsReadyForInvoicing } from "../../api";

vi.mock("../../api", () => ({
  getJobsReadyForInvoicing: vi.fn(),
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
});
