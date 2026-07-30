// Work diary upload interaction: the api module (network boundary) and
// useAuth are mocked; real react-router-dom (MemoryRouter + Routes) supplies
// the :id route param instead of mocking useParams, so routing behavior is
// real too. Mirrors UploadPod.test.jsx's structure — the two pages share the
// same shape (job-scoped upload form + history list with pending-only edit
// actions, grouped by date).
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import WorkDiary from "./WorkDiary";
import { useAuth } from "../../contexts/AuthContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { uploadWorkDiary, listWorkDiariesByDriver, deleteWorkDiary } from "../../api";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../contexts/NotificationContext", () => ({
  useNotifications: vi.fn(),
}));

vi.mock("../../api", () => ({
  uploadWorkDiary: vi.fn(),
  listWorkDiariesByDriver: vi.fn(),
  deleteWorkDiary: vi.fn(),
  updateWorkDiaryNotes: vi.fn(),
}));

// A function, not a cached element — see the identical comment in
// UploadPod.test.jsx: reusing the same JSX element reference across a
// render() and a later rerender() lets React bail out of re-rendering the
// subtree, silently skipping the re-invocation of useNotifications().
const diaryRoutes = () => (
  <Routes>
    <Route path="/driver/work-diary/:id" element={<WorkDiary />} />
    <Route path="/driver/work-diary" element={<WorkDiary />} />
  </Routes>
);

const renderAt = (path) =>
  render(<MemoryRouter initialEntries={[path]}>{diaryRoutes()}</MemoryRouter>);

describe("WorkDiary — work diary upload interaction", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { _id: "driver1" } });
    useNotifications.mockReturnValue({ lastEvent: null });
  });

  test("PASS: submitting without selecting a file shows a validation error and never calls uploadWorkDiary", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [] });
    renderAt("/driver/work-diary/job1");

    const submitButton = await screen.findByRole("button", { name: "Upload Work Diary Pages" });
    await userEvent.click(submitButton);

    expect(await screen.findByText("Please select a PDF file to upload.")).toBeInTheDocument();
    expect(uploadWorkDiary).not.toHaveBeenCalled();
  });

  test("PASS: selecting a PDF and submitting uploads it linked to the route's job id, then refreshes the list", async () => {
    listWorkDiariesByDriver.mockResolvedValueOnce({ data: [] });
    uploadWorkDiary.mockResolvedValue({ _id: "diary1", status: "pending" });
    listWorkDiariesByDriver.mockResolvedValueOnce({
      data: [{ _id: "diary1", jobId: "job1", status: "pending", notes: "" }],
    });

    renderAt("/driver/work-diary/job1");

    const file = new File(["%PDF-1.4"], "diary.pdf", { type: "application/pdf" });
    const fileInput = document.querySelector('input[type="file"]');
    await userEvent.upload(fileInput, file);

    await userEvent.click(screen.getByRole("button", { name: "Upload Work Diary Pages" }));

    await waitFor(() => expect(uploadWorkDiary).toHaveBeenCalledTimes(1));
    const submittedFormData = uploadWorkDiary.mock.calls[0][0];
    expect(submittedFormData.get("jobId")).toBe("job1");
    expect(submittedFormData.get("driverId")).toBe("driver1");
    expect(submittedFormData.get("workDiaryFile").name).toBe("diary.pdf");
    expect(listWorkDiariesByDriver).toHaveBeenCalledTimes(2);
  });

  test("PASS: with no job id in the route, the upload form is hidden and a helper message is shown instead", async () => {
    listWorkDiariesByDriver.mockResolvedValue({ data: [] });
    renderAt("/driver/work-diary");

    expect(
      await screen.findByText("To upload work diary pages, open an interstate job from View All Jobs.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload Work Diary Pages" })).not.toBeInTheDocument();
  });

  test("PASS: an approved work diary is locked — its edit/delete actions are hidden", async () => {
    listWorkDiariesByDriver.mockResolvedValue({
      data: [{ _id: "diary1", jobId: "job1", status: "approved", notes: "All good" }],
    });
    renderAt("/driver/work-diary/job1");

    expect(await screen.findByText("Approved by admin — locked")).toBeInTheDocument();
    expect(screen.queryByLabelText("edit work diary notes")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("delete work diary")).not.toBeInTheDocument();
  });

  test("PASS: deleting a work diary is guarded by window.confirm — declining never calls deleteWorkDiary", async () => {
    listWorkDiariesByDriver.mockResolvedValue({
      data: [{ _id: "diary1", jobId: "job1", status: "pending", notes: "" }],
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderAt("/driver/work-diary/job1");

    const deleteButton = await screen.findByLabelText("delete work diary");
    await userEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteWorkDiary).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  test("PASS: a pending diary linked to a job shows 'Edit / Replace Diary', which navigates to that job's upload route", async () => {
    listWorkDiariesByDriver.mockResolvedValue({
      data: [{ _id: "diary1", jobId: { _id: "job1", jobDate: "2026-07-20", pickupLocation: "A", deliveryLocation: "B" }, status: "pending", notes: "" }],
    });

    renderAt("/driver/work-diary");

    const editReplaceButton = await screen.findByRole("button", { name: "Edit / Replace Diary" });
    await userEvent.click(editReplaceButton);

    expect(await screen.findByText("This work diary will be linked to the selected interstate job.")).toBeInTheDocument();
  });

  test("PASS: an approved diary does not show 'Edit / Replace Diary' — locked once approved, same as the notes-edit action", async () => {
    listWorkDiariesByDriver.mockResolvedValue({
      data: [{ _id: "diary1", jobId: { _id: "job1", jobDate: "2026-07-20" }, status: "approved", notes: "" }],
    });

    renderAt("/driver/work-diary");

    expect(await screen.findByText("Approved by admin — locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit / Replace Diary" })).not.toBeInTheDocument();
  });

  test("PASS: work diary records are grouped under a date heading, most recent date first", async () => {
    // Constructed via local-time components (not a UTC ISO literal) so the
    // calendar day this resolves to is stable regardless of the test
    // runner's timezone — the component reads it back via
    // toLocaleDateString in that same local timezone.
    const julyFirstLocalNoon = new Date(2026, 6, 1, 12, 0, 0).toISOString();
    const julyFifteenthLocalNoon = new Date(2026, 6, 15, 12, 0, 0).toISOString();
    listWorkDiariesByDriver.mockResolvedValue({
      data: [
        { _id: "diary-old", jobId: "job-old", status: "pending", uploadDate: julyFirstLocalNoon, notes: "" },
        { _id: "diary-new", jobId: "job-new", status: "pending", uploadDate: julyFifteenthLocalNoon, notes: "" },
      ],
    });

    renderAt("/driver/work-diary");

    await screen.findByText("Recent diary uploads");
    const headings = screen.getAllByText(/2026$/).map((el) => el.textContent);
    const julyFifteenIndex = headings.findIndex((text) => text.includes("Jul 15"));
    const julyFirstIndex = headings.findIndex((text) => text.includes("Jul 1,"));

    expect(julyFifteenIndex).toBeGreaterThanOrEqual(0);
    expect(julyFirstIndex).toBeGreaterThanOrEqual(0);
    expect(julyFifteenIndex).toBeLessThan(julyFirstIndex);
  });

  test("PASS: a diary_approved real-time event triggers a refetch while this page is open — no manual reload needed", async () => {
    listWorkDiariesByDriver.mockResolvedValueOnce({
      data: [{ _id: "diary1", jobId: "job1", status: "pending", notes: "" }],
    });

    const { rerender } = renderAt("/driver/work-diary/job1");

    expect(await screen.findByText("Pending approval")).toBeInTheDocument();
    expect(listWorkDiariesByDriver).toHaveBeenCalledTimes(1);

    // Admin approves the diary elsewhere — NotificationContext's socket
    // listener receives the event and exposes it as lastEvent; this page
    // reacts to that change, not to a page reload.
    listWorkDiariesByDriver.mockResolvedValueOnce({
      data: [{ _id: "diary1", jobId: "job1", status: "approved", notes: "" }],
    });
    useNotifications.mockReturnValue({ lastEvent: { type: "diary_approved", resourceType: "workdiary", resourceId: "diary1" } });
    rerender(<MemoryRouter initialEntries={["/driver/work-diary/job1"]}>{diaryRoutes()}</MemoryRouter>);

    await waitFor(() => expect(listWorkDiariesByDriver).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Approved by admin — locked")).toBeInTheDocument();
  });

  test("PASS: an unrelated real-time event (e.g. a POD approval) does not trigger a diary refetch", async () => {
    listWorkDiariesByDriver.mockResolvedValue({
      data: [{ _id: "diary1", jobId: "job1", status: "pending", notes: "" }],
    });

    const { rerender } = renderAt("/driver/work-diary/job1");
    await screen.findByText("Pending approval");
    expect(listWorkDiariesByDriver).toHaveBeenCalledTimes(1);

    useNotifications.mockReturnValue({ lastEvent: { type: "pod_approved", resourceType: "jobpod", resourceId: "pod1" } });
    rerender(<MemoryRouter initialEntries={["/driver/work-diary/job1"]}>{diaryRoutes()}</MemoryRouter>);

    await waitFor(() => expect(listWorkDiariesByDriver).toHaveBeenCalledTimes(1));
  });
});
