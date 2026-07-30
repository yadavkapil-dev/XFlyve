// POD upload interaction: the api module (network boundary) and useAuth are
// mocked; real react-router-dom (MemoryRouter + Routes) supplies the :id
// route param instead of mocking useParams, so routing behavior is real too.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DriverPOD from "./UploadPod";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { uploadPod, listPodsByDriver, deletePod } from "../../api";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../contexts/NotificationContext", () => ({
  useNotifications: vi.fn(),
}));

vi.mock("../../api", () => ({
  uploadPod: vi.fn(),
  listPodsByDriver: vi.fn(),
  deletePod: vi.fn(),
  updatePodNotes: vi.fn(),
}));

// A function, not a cached element — reusing the exact same JSX element
// reference across a render() and a later rerender() lets React bail out
// of re-rendering that subtree entirely (it's allowed to assume identical
// output for a referentially-unchanged element), which would silently skip
// re-invoking useNotifications() and make the socket-event tests below
// pass for the wrong reason (or not at all). A fresh element each call
// avoids that.
const podRoutes = () => (
  <Routes>
    <Route path="/driver/pods/upload/:id" element={<DriverPOD />} />
    <Route path="/driver/pods/upload" element={<DriverPOD />} />
  </Routes>
);

const renderAt = (path) =>
  render(<MemoryRouter initialEntries={[path]}>{podRoutes()}</MemoryRouter>);

describe("DriverPOD — POD upload interaction", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { _id: "driver1" } });
    useNotifications.mockReturnValue({ lastEvent: null });
  });

  test("PASS: submitting without selecting a file shows a validation error and never calls uploadPod", async () => {
    listPodsByDriver.mockResolvedValue({ data: [] });
    renderAt("/driver/pods/upload/job1");

    const submitButton = await screen.findByRole("button", { name: "Upload POD" });
    await userEvent.click(submitButton);

    expect(await screen.findByText("Please select a PDF file to upload.")).toBeInTheDocument();
    expect(uploadPod).not.toHaveBeenCalled();
  });

  test("PASS: selecting a PDF and submitting uploads it linked to the route's job id, then refreshes the list", async () => {
    listPodsByDriver.mockResolvedValueOnce({ data: [] });
    uploadPod.mockResolvedValue({ _id: "pod1", status: "pending" });
    listPodsByDriver.mockResolvedValueOnce({
      data: [{ _id: "pod1", jobId: "job1", status: "pending", notes: "" }],
    });

    renderAt("/driver/pods/upload/job1");

    const file = new File(["%PDF-1.4"], "pod.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    await userEvent.click(screen.getByRole("button", { name: "Upload POD" }));

    await waitFor(() => expect(uploadPod).toHaveBeenCalledTimes(1));
    const submittedFormData = uploadPod.mock.calls[0][0];
    expect(submittedFormData.get("jobId")).toBe("job1");
    expect(submittedFormData.get("driverId")).toBe("driver1");
    expect(submittedFormData.get("podFile").name).toBe("pod.pdf");
    expect(listPodsByDriver).toHaveBeenCalledTimes(2);
  });

  test("PASS: with no job id in the route, the upload form is hidden and a helper message is shown instead", async () => {
    listPodsByDriver.mockResolvedValue({ data: [] });
    renderAt("/driver/pods/upload");

    expect(
      await screen.findByText("To upload a POD, open the job from View All Jobs.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload POD" })).not.toBeInTheDocument();
  });

  test("PASS: an approved POD is locked — its edit/delete actions are hidden", async () => {
    listPodsByDriver.mockResolvedValue({
      data: [{ _id: "pod1", jobId: "job1", status: "approved", notes: "All good" }],
    });
    renderAt("/driver/pods/upload/job1");

    expect(await screen.findByText("Approved by admin — locked")).toBeInTheDocument();
    expect(screen.queryByLabelText("edit POD notes")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("delete POD")).not.toBeInTheDocument();
  });

  test("PASS: deleting a POD is guarded by window.confirm — declining never calls deletePod", async () => {
    listPodsByDriver.mockResolvedValue({
      data: [{ _id: "pod1", jobId: "job1", status: "pending", notes: "" }],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderAt("/driver/pods/upload/job1");

    const deleteButton = await screen.findByLabelText("delete POD");
    await userEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(deletePod).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  test("PASS: a pending POD linked to a job shows 'Edit / Replace POD', which navigates to that job's upload route", async () => {
    listPodsByDriver.mockResolvedValue({
      data: [{ _id: "pod1", jobId: { _id: "job1", jobDate: "2026-07-20", pickupLocation: "A", deliveryLocation: "B" }, status: "pending", notes: "" }],
    });

    renderAt("/driver/pods/upload");

    const editReplaceButton = await screen.findByRole("button", { name: "Edit / Replace POD" });
    await userEvent.click(editReplaceButton);

    expect(await screen.findByText("This POD will be linked to the selected job.")).toBeInTheDocument();
  });

  test("PASS: an approved POD does not show 'Edit / Replace POD' — locked once approved, same as the notes-edit action", async () => {
    listPodsByDriver.mockResolvedValue({
      data: [{ _id: "pod1", jobId: { _id: "job1", jobDate: "2026-07-20" }, status: "approved", notes: "" }],
    });

    renderAt("/driver/pods/upload");

    expect(await screen.findByText("Approved by admin — locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit / Replace POD" })).not.toBeInTheDocument();
  });

  test("PASS: POD records are grouped under a date heading, most recent date first", async () => {
    // Constructed via local-time components (not a UTC ISO literal) so the
    // calendar day this resolves to is stable regardless of the test
    // runner's timezone — the component reads it back via
    // toLocaleDateString in that same local timezone.
    const julyFirstLocalNoon = new Date(2026, 6, 1, 12, 0, 0).toISOString();
    const julyFifteenthLocalNoon = new Date(2026, 6, 15, 12, 0, 0).toISOString();
    listPodsByDriver.mockResolvedValue({
      data: [
        { _id: "pod-old", jobId: "job-old", status: "pending", uploadDate: julyFirstLocalNoon, notes: "" },
        { _id: "pod-new", jobId: "job-new", status: "pending", uploadDate: julyFifteenthLocalNoon, notes: "" },
      ],
    });

    renderAt("/driver/pods/upload");

    await screen.findByText("Recent POD uploads");
    const headings = screen.getAllByText(/2026$/).map((el) => el.textContent);
    const julyFifteenIndex = headings.findIndex((text) => text.includes("Jul 15"));
    const julyFirstIndex = headings.findIndex((text) => text.includes("Jul 1,"));

    expect(julyFifteenIndex).toBeGreaterThanOrEqual(0);
    expect(julyFirstIndex).toBeGreaterThanOrEqual(0);
    expect(julyFifteenIndex).toBeLessThan(julyFirstIndex);
  });

  test("PASS: a pod_approved real-time event triggers a refetch while this page is open — no manual reload needed", async () => {
    listPodsByDriver.mockResolvedValueOnce({
      data: [{ _id: "pod1", jobId: "job1", status: "pending", notes: "" }],
    });

    const { rerender } = renderAt("/driver/pods/upload/job1");

    expect(await screen.findByText("Pending approval")).toBeInTheDocument();
    expect(listPodsByDriver).toHaveBeenCalledTimes(1);

    // Admin approves the POD elsewhere — NotificationContext's socket
    // listener receives the event and exposes it as lastEvent; this page
    // reacts to that change, not to a page reload.
    listPodsByDriver.mockResolvedValueOnce({
      data: [{ _id: "pod1", jobId: "job1", status: "approved", notes: "" }],
    });
    useNotifications.mockReturnValue({ lastEvent: { type: "pod_approved", resourceType: "jobpod", resourceId: "pod1" } });
    rerender(<MemoryRouter initialEntries={["/driver/pods/upload/job1"]}>{podRoutes()}</MemoryRouter>);

    await waitFor(() => expect(listPodsByDriver).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Approved by admin — locked")).toBeInTheDocument();
  });

  test("PASS: an unrelated real-time event (e.g. a diary approval) does not trigger a POD refetch", async () => {
    listPodsByDriver.mockResolvedValue({
      data: [{ _id: "pod1", jobId: "job1", status: "pending", notes: "" }],
    });

    const { rerender } = renderAt("/driver/pods/upload/job1");
    await screen.findByText("Pending approval");
    expect(listPodsByDriver).toHaveBeenCalledTimes(1);

    useNotifications.mockReturnValue({ lastEvent: { type: "diary_approved", resourceType: "workdiary", resourceId: "diary1" } });
    rerender(<MemoryRouter initialEntries={["/driver/pods/upload/job1"]}>{podRoutes()}</MemoryRouter>);

    await waitFor(() => expect(listPodsByDriver).toHaveBeenCalledTimes(1));
  });
});
