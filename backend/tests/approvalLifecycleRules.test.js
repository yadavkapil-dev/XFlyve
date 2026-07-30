// Business rule under test, shared by POD/WorkDiary/WorkLog: once an admin
// approves a driver-submitted record, a driver can no longer edit or delete
// it (locked); an admin can always edit/delete regardless of status; and if
// a driver edits a REJECTED record, it silently resurrects back to "pending"
// (an implicit resubmission) with the rejection fields cleared.
//
// None of updatePOD/deletePOD/updateWorkDiary/deleteWorkDiary/updateWorkLog/
// deleteWorkLog had any test coverage before this file — this was the
// biggest concrete gap found in "business rules".

const mongoose = require("mongoose");

const makeResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const VALID_ID = new mongoose.Types.ObjectId().toString();
const OWNER_DRIVER_ID = new mongoose.Types.ObjectId().toString();
const OTHER_DRIVER_ID = new mongoose.Types.ObjectId().toString();

// ---------------------------------------------------------------------------
// jobPodController: updatePOD / deletePOD
// ---------------------------------------------------------------------------
describe("Business rule: POD lock/resubmit (updatePOD, deletePOD)", () => {
  const loadController = () => {
    jest.resetModules();

    const JobPod = { findById: jest.fn(), deleteOne: jest.fn().mockResolvedValue({}) };
    const Job = { updateOne: jest.fn().mockResolvedValue({}) };
    const cloudinary = { uploader: { destroy: jest.fn().mockResolvedValue({}) } };

    jest.doMock("../models/jobPod", () => JobPod);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../config/cloudinary", () => cloudinary);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => ({ notifyUser: jest.fn(), notifyAdmins: jest.fn() }));
    jest.doMock("../services/activityService", () => ({ logActivity: jest.fn() }));

    return { controller: require("../controllers/jobPodController"), JobPod, Job, cloudinary };
  };

  afterEach(() => jest.restoreAllMocks());

  test("updatePOD: 404 when the POD doesn't exist", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce(null);

    const res = makeResponse();
    await controller.updatePOD({ params: { podId: VALID_ID }, body: {}, user: { id: OWNER_DRIVER_ID, role: "driver" } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("updatePOD: 403 when a different driver (not the owner, not admin) tries to edit", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce({ driverId: OWNER_DRIVER_ID, status: "pending", save: jest.fn() });

    const res = makeResponse();
    await controller.updatePOD(
      { params: { podId: VALID_ID }, body: { notes: "x" }, user: { id: OTHER_DRIVER_ID, role: "driver" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("updatePOD: driver cannot edit an approved POD (locked, 409)", async () => {
    const { controller, JobPod } = loadController();
    const pod = { driverId: OWNER_DRIVER_ID, status: "approved", notes: "old", save: jest.fn() };
    JobPod.findById.mockResolvedValueOnce(pod);

    const res = makeResponse();
    await controller.updatePOD(
      { params: { podId: VALID_ID }, body: { notes: "new" }, user: { id: OWNER_DRIVER_ID, role: "driver" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(pod.save).not.toHaveBeenCalled();
    expect(pod.notes).toBe("old");
  });

  test("updatePOD: admin CAN edit an approved POD — the lock only applies to drivers", async () => {
    const { controller, JobPod } = loadController();
    const pod = { driverId: OWNER_DRIVER_ID, status: "approved", notes: "old", save: jest.fn().mockResolvedValue(undefined) };
    JobPod.findById.mockResolvedValueOnce(pod);

    const res = makeResponse();
    await controller.updatePOD(
      { params: { podId: VALID_ID }, body: { notes: "corrected by admin" }, user: { id: "admin-1", role: "admin" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(pod.notes).toBe("corrected by admin");
    expect(pod.status).toBe("approved"); // admin editing doesn't change status
    expect(pod.save).toHaveBeenCalledTimes(1);
  });

  test("updatePOD: a driver editing a REJECTED pod resubmits it — status resets to pending and rejection fields clear", async () => {
    const { controller, JobPod } = loadController();
    const pod = {
      driverId: OWNER_DRIVER_ID,
      status: "rejected",
      notes: "old",
      rejectedBy: "admin-1",
      rejectedAt: new Date(),
      rejectionReason: "blurry",
      save: jest.fn().mockResolvedValue(undefined),
    };
    JobPod.findById.mockResolvedValueOnce(pod);

    const res = makeResponse();
    await controller.updatePOD(
      { params: { podId: VALID_ID }, body: { notes: "resubmitted" }, user: { id: OWNER_DRIVER_ID, role: "driver" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(pod.status).toBe("pending");
    expect(pod.rejectedBy).toBeNull();
    expect(pod.rejectedAt).toBeNull();
    expect(pod.rejectionReason).toBeUndefined();
  });

  test("updatePOD: a driver editing a PENDING pod does not change its status", async () => {
    const { controller, JobPod } = loadController();
    const pod = { driverId: OWNER_DRIVER_ID, status: "pending", notes: "old", save: jest.fn().mockResolvedValue(undefined) };
    JobPod.findById.mockResolvedValueOnce(pod);

    const res = makeResponse();
    await controller.updatePOD(
      { params: { podId: VALID_ID }, body: { notes: "tweaked" }, user: { id: OWNER_DRIVER_ID, role: "driver" } },
      res
    );

    expect(pod.status).toBe("pending");
  });

  test("deletePOD: driver cannot delete an approved POD (locked, 409) and no cleanup runs", async () => {
    const { controller, JobPod, cloudinary, Job } = loadController();
    JobPod.findById.mockResolvedValueOnce({ driverId: OWNER_DRIVER_ID, status: "approved", publicId: "pods/abc" });

    const res = makeResponse();
    await controller.deletePOD({ params: { podId: VALID_ID }, user: { id: OWNER_DRIVER_ID, role: "driver" } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    expect(Job.updateOne).not.toHaveBeenCalled();
    expect(JobPod.deleteOne).not.toHaveBeenCalled();
  });

  test("deletePOD: admin CAN delete an approved POD, cleaning up the Cloudinary file and the job's podIds", async () => {
    const { controller, JobPod, cloudinary, Job } = loadController();
    const jobId = new mongoose.Types.ObjectId().toString();
    JobPod.findById.mockResolvedValueOnce({
      _id: VALID_ID,
      driverId: OWNER_DRIVER_ID,
      status: "approved",
      publicId: "pods/abc",
      jobId,
    });

    const res = makeResponse();
    await controller.deletePOD({ params: { podId: VALID_ID }, user: { id: "admin-1", role: "admin" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith("pods/abc", { resource_type: "raw" });
    expect(Job.updateOne).toHaveBeenCalledWith({ _id: jobId }, { $pull: { podIds: VALID_ID } });
    expect(JobPod.deleteOne).toHaveBeenCalledWith({ _id: VALID_ID });
  });

  test("deletePOD: 403 when a different driver (not owner, not admin) tries to delete", async () => {
    const { controller, JobPod } = loadController();
    JobPod.findById.mockResolvedValueOnce({ driverId: OWNER_DRIVER_ID, status: "pending" });

    const res = makeResponse();
    await controller.deletePOD({ params: { podId: VALID_ID }, user: { id: OTHER_DRIVER_ID, role: "driver" } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ---------------------------------------------------------------------------
// workDiaryController: updateWorkDiary / deleteWorkDiary — same rule, lighter
// coverage since the logic mirrors POD's exactly.
// ---------------------------------------------------------------------------
describe("Business rule: Work Diary lock/resubmit (updateWorkDiary, deleteWorkDiary)", () => {
  const loadController = () => {
    jest.resetModules();

    const WorkDiary = { findById: jest.fn(), deleteOne: jest.fn().mockResolvedValue({}) };
    const Job = { updateOne: jest.fn().mockResolvedValue({}) };
    const cloudinary = { uploader: { destroy: jest.fn().mockResolvedValue({}) } };

    jest.doMock("../models/workDiary", () => WorkDiary);
    jest.doMock("../models/job", () => Job);
    jest.doMock("../config/cloudinary", () => cloudinary);
    jest.doMock("../utils/logger", () => ({ error: jest.fn() }));
    jest.doMock("../services/notificationService", () => ({ notifyUser: jest.fn(), notifyAdmins: jest.fn() }));
    jest.doMock("../services/activityService", () => ({ logActivity: jest.fn() }));

    return { controller: require("../controllers/workDiaryController"), WorkDiary, Job, cloudinary };
  };

  afterEach(() => jest.restoreAllMocks());

  test("updateWorkDiary: driver cannot edit an approved diary (locked, 409)", async () => {
    const { controller, WorkDiary } = loadController();
    const diary = { driverId: OWNER_DRIVER_ID, status: "approved", notes: "old", save: jest.fn() };
    WorkDiary.findById.mockResolvedValueOnce(diary);

    const res = makeResponse();
    await controller.updateWorkDiary(
      { params: { id: VALID_ID }, body: { notes: "new" }, user: { id: OWNER_DRIVER_ID, role: "driver" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(diary.save).not.toHaveBeenCalled();
  });

  test("updateWorkDiary: admin CAN edit an approved diary", async () => {
    const { controller, WorkDiary } = loadController();
    const diary = { driverId: OWNER_DRIVER_ID, status: "approved", notes: "old", save: jest.fn().mockResolvedValue(undefined) };
    WorkDiary.findById.mockResolvedValueOnce(diary);

    const res = makeResponse();
    await controller.updateWorkDiary(
      { params: { id: VALID_ID }, body: { notes: "corrected" }, user: { id: "admin-1", role: "admin" } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(diary.save).toHaveBeenCalledTimes(1);
  });

  test("updateWorkDiary: driver editing a rejected diary resubmits it to pending", async () => {
    const { controller, WorkDiary } = loadController();
    const diary = {
      driverId: OWNER_DRIVER_ID,
      status: "rejected",
      notes: "old",
      rejectedBy: "admin-1",
      rejectedAt: new Date(),
      rejectionReason: "missing pages",
      save: jest.fn().mockResolvedValue(undefined),
    };
    WorkDiary.findById.mockResolvedValueOnce(diary);

    const res = makeResponse();
    await controller.updateWorkDiary(
      { params: { id: VALID_ID }, body: { notes: "resubmitted" }, user: { id: OWNER_DRIVER_ID, role: "driver" } },
      res
    );

    expect(diary.status).toBe("pending");
    expect(diary.rejectionReason).toBeUndefined();
  });

  test("deleteWorkDiary: driver cannot delete an approved diary (locked, 409)", async () => {
    const { controller, WorkDiary, Job } = loadController();
    WorkDiary.findById.mockResolvedValueOnce({ driverId: OWNER_DRIVER_ID, status: "approved" });

    const res = makeResponse();
    await controller.deleteWorkDiary({ params: { id: VALID_ID }, user: { id: OWNER_DRIVER_ID, role: "driver" } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(Job.updateOne).not.toHaveBeenCalled();
  });

  test("deleteWorkDiary: admin CAN delete an approved diary, cleaning up Cloudinary and the job's diaryIds", async () => {
    const { controller, WorkDiary, cloudinary, Job } = loadController();
    const jobId = new mongoose.Types.ObjectId().toString();
    WorkDiary.findById.mockResolvedValueOnce({
      _id: VALID_ID,
      driverId: OWNER_DRIVER_ID,
      status: "approved",
      publicId: "diaries/xyz",
      jobId,
    });

    const res = makeResponse();
    await controller.deleteWorkDiary({ params: { id: VALID_ID }, user: { id: "admin-1", role: "admin" } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith("diaries/xyz", { resource_type: "raw" });
    expect(Job.updateOne).toHaveBeenCalledWith({ _id: jobId }, { $pull: { diaryIds: VALID_ID } });
  });
});
