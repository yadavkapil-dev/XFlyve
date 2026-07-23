// POD upload interaction: the api module (network boundary) and useAuth are
// mocked; real react-router-dom (MemoryRouter + Routes) supplies the :id
// route param instead of mocking useParams, so routing behavior is real too.
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DriverPOD from "./UploadPod";
import { useAuth } from "../../contexts/AuthContext";
import { uploadPod, listPodsByDriver, deletePod } from "../../api";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../api", () => ({
  uploadPod: vi.fn(),
  listPodsByDriver: vi.fn(),
  deletePod: vi.fn(),
  updatePodNotes: vi.fn(),
}));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/driver/pods/upload/:id" element={<DriverPOD />} />
        <Route path="/driver/pods/upload" element={<DriverPOD />} />
      </Routes>
    </MemoryRouter>
  );

describe("DriverPOD — POD upload interaction", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { _id: "driver1" } });
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
});
