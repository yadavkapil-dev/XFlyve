// Work diary upload interaction: the api module (network boundary) and
// useAuth are mocked; real react-router-dom (MemoryRouter + Routes) supplies
// the :id route param instead of mocking useParams, so routing behavior is
// real too. Mirrors UploadPod.test.jsx's structure, minus the approval-lock
// behavior PODs still have — work diaries have no approval workflow, so
// upload/edit/delete are always available.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import WorkDiary from "./WorkDiary";
import { useAuth } from "../../contexts/AuthContext";
import { uploadWorkDiary, listWorkDiariesByDriver, deleteWorkDiary } from "../../api";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../api", () => ({
  uploadWorkDiary: vi.fn(),
  listWorkDiariesByDriver: vi.fn(),
  deleteWorkDiary: vi.fn(),
  updateWorkDiaryNotes: vi.fn(),
}));

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

  test("PASS: every work diary shows edit and delete actions — no approval lock", async () => {
    listWorkDiariesByDriver.mockResolvedValue({
      data: [{ _id: "diary1", jobId: "job1", notes: "All good" }],
    });
    renderAt("/driver/work-diary/job1");

    expect(await screen.findByLabelText("edit work diary notes")).toBeInTheDocument();
    expect(screen.getByLabelText("delete work diary")).toBeInTheDocument();
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

});
