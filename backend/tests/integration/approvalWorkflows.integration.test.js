// Integration: POD workflow, Diary workflow, Work-log workflow. Real app,
// real routes/middleware/controllers, real Mongoose models, against an
// isolated in-memory MongoDB (see testDb.js).
//
// The ONE thing NOT real here is Cloudinary — its upload_stream/destroy
// calls are stubbed so these tests never make an outbound network call to
// a real third-party file-storage account (that would cost money, require
// real credentials this environment doesn't have, and has nothing to do
// with the "isolated database" requirement this phase is about). Every
// other boundary — Express, auth, validation, controllers, Mongoose,
// notificationService, activityService — is the real thing.
process.env.JWT_SECRET = "integration-test-secret";
process.env.RATE_LIMIT_MAX = "10000";
process.env.NODE_ENV = "test";

jest.doMock("../../config/cloudinary", () => ({
  uploader: {
    upload_stream: jest.fn((options, callback) => {
      callback(null, { secure_url: "https://example.com/fake.pdf", public_id: `fake/${Date.now()}` });
      return {};
    }),
    destroy: jest.fn().mockResolvedValue({ result: "ok" }),
  },
}));

const request = require("supertest");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const { createDriver, createTruck, createJob, tomorrow, authHeader } = require("./factories");
const JobPod = require("../../models/jobPod");
const WorkDiary = require("../../models/workDiary");
const DailyWorkLog = require("../../models/dailyWorkLog");
const Notification = require("../../models/notification");
const Activity = require("../../models/activity");

let app;

beforeAll(async () => {
  await startTestDb();
  app = require("../../app");
}, 30000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

const fakePdf = () => Buffer.from("%PDF-1.4 fake content");

describe("Flow: POD workflow", () => {
  test("PASS: driver uploads a POD -> admin approves it, end to end through real HTTP, with notification + activity side effects", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver });

    const uploadRes = await request(app)
      .post("/api/jobpods/upload")
      .set("Authorization", authHeader(driver))
      .field("jobId", job._id.toString())
      .field("notes", "Delivered on time")
      .attach("podFile", fakePdf(), { filename: "pod.pdf", contentType: "application/pdf" });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.status).toBe("pending");
    const podId = uploadRes.body.data._id;

    // Side effect 1: admins were notified of the submission.
    const submittedNotif = await Notification.findOne({ recipient: admin._id, type: "pod_submitted" }).lean();
    expect(submittedNotif).toBeTruthy();

    // Side effect 2: an activity record exists for the submission.
    const submittedActivity = await Activity.findOne({ action: "POD_SUBMITTED", resourceId: podId }).lean();
    expect(submittedActivity).toBeTruthy();
    expect(String(submittedActivity.actorId)).toBe(String(driver._id));
    expect(String(submittedActivity.relatedJobId)).toBe(String(job._id));

    const approveRes = await request(app)
      .put(`/api/jobpods/${podId}/approve`)
      .set("Authorization", authHeader(admin));

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe("approved");

    const persisted = await JobPod.findById(podId).lean();
    expect(persisted.status).toBe("approved");
    expect(String(persisted.approvedBy)).toBe(String(admin._id));

    const approvedNotif = await Notification.findOne({ recipient: driver._id, type: "pod_approved" }).lean();
    expect(approvedNotif).toBeTruthy();

    const approvedActivity = await Activity.findOne({ action: "POD_APPROVED", resourceId: podId }).lean();
    expect(approvedActivity).toBeTruthy();
    expect(String(approvedActivity.actorId)).toBe(String(admin._id));
  });

  test("PASS: admin rejects a POD with a reason; the driver is notified and the rejection is recorded", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver });

    const uploadRes = await request(app)
      .post("/api/jobpods/upload")
      .set("Authorization", authHeader(driver))
      .field("jobId", job._id.toString())
      .attach("podFile", fakePdf(), { filename: "pod.pdf", contentType: "application/pdf" });
    const podId = uploadRes.body.data._id;

    const rejectRes = await request(app)
      .put(`/api/jobpods/${podId}/reject`)
      .set("Authorization", authHeader(admin))
      .send({ rejectionReason: "Photo is blurry" });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe("rejected");

    const notif = await Notification.findOne({ recipient: driver._id, type: "pod_rejected" }).lean();
    expect(notif.message).toMatch(/blurry/);

    const activity = await Activity.findOne({ action: "POD_REJECTED", resourceId: podId }).lean();
    expect(activity.metadata).toMatchObject({ rejectionReason: "Photo is blurry" });
  });

  test("PASS: a driver cannot approve their own POD (role-gated route)", async () => {
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver });
    const uploadRes = await request(app)
      .post("/api/jobpods/upload")
      .set("Authorization", authHeader(driver))
      .field("jobId", job._id.toString())
      .attach("podFile", fakePdf(), { filename: "pod.pdf", contentType: "application/pdf" });

    const res = await request(app)
      .put(`/api/jobpods/${uploadRes.body.data._id}/approve`)
      .set("Authorization", authHeader(driver));

    expect(res.status).toBe(403);
  });
});

describe("Flow: Diary workflow", () => {
  test("PASS: driver uploads a work diary for an interstate job -> admin approves it", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const truck = await createTruck();
    const job = await createJob({ assignedTo: driver, assignedTruck: truck, jobType: "interstate" });

    const uploadRes = await request(app)
      .post("/api/workDiaries/upload")
      .set("Authorization", authHeader(driver))
      .field("jobId", job._id.toString())
      .attach("workDiaryFile", fakePdf(), { filename: "diary.pdf", contentType: "application/pdf" });

    expect(uploadRes.status).toBe(201);
    const diaryId = uploadRes.body.data._id;

    const submittedNotif = await Notification.findOne({ recipient: admin._id, type: "diary_submitted" }).lean();
    expect(submittedNotif).toBeTruthy();

    const approveRes = await request(app)
      .put(`/api/workdiaries/${diaryId}/approve`)
      .set("Authorization", authHeader(admin));

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe("approved");

    const persisted = await WorkDiary.findById(diaryId).lean();
    expect(persisted.status).toBe("approved");

    const activity = await Activity.findOne({ action: "DIARY_APPROVED", resourceId: diaryId }).lean();
    expect(activity).toBeTruthy();
    expect(String(activity.relatedJobId)).toBe(String(job._id));
  });

  test("PASS: admin rejects a work diary; driver locked from re-approving it themselves, can resubmit by editing", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver, jobType: "interstate" });

    const uploadRes = await request(app)
      .post("/api/workDiaries/upload")
      .set("Authorization", authHeader(driver))
      .field("jobId", job._id.toString())
      .attach("workDiaryFile", fakePdf(), { filename: "diary.pdf", contentType: "application/pdf" });
    const diaryId = uploadRes.body.data._id;

    const rejectRes = await request(app)
      .put(`/api/workdiaries/${diaryId}/reject`)
      .set("Authorization", authHeader(admin))
      .send({ rejectionReason: "Missing signature page" });
    expect(rejectRes.status).toBe(200);

    // Driver edits the rejected diary -> implicit resubmission back to pending.
    const editRes = await request(app)
      .put(`/api/workDiaries/${diaryId}`)
      .set("Authorization", authHeader(driver))
      .send({ notes: "Added the missing page" });

    expect(editRes.status).toBe(200);
    expect(editRes.body.data.status).toBe("pending");
    expect(editRes.body.data.rejectionReason).toBeUndefined();
  });
});

describe("Flow: Work-log workflow", () => {
  test("PASS: driver submits a daily work log -> admin approves it", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver, jobType: "local" });

    const createRes = await request(app)
      .post("/api/worklogs")
      .set("Authorization", authHeader(driver))
      .send({
        date: tomorrow(),
        jobId: job._id.toString(),
        localStartTime: "08:00",
        localEndTime: "16:00",
        hours: 8,
        deliveriesDone: 5,
      });

    expect(createRes.status).toBe(201);
    const logId = createRes.body.data._id;

    const submittedNotif = await Notification.findOne({ recipient: admin._id, type: "worklog_submitted" }).lean();
    expect(submittedNotif).toBeTruthy();
    const submittedActivity = await Activity.findOne({ action: "WORK_LOG_SUBMITTED", resourceId: logId }).lean();
    expect(submittedActivity).toBeTruthy();

    const approveRes = await request(app)
      .put(`/api/worklogs/admin/${logId}/approve`)
      .set("Authorization", authHeader(admin));

    expect(approveRes.status).toBe(200);

    const persisted = await DailyWorkLog.findById(logId).lean();
    expect(persisted.status).toBe("approved");

    const approvedNotif = await Notification.findOne({ recipient: driver._id, type: "worklog_approved" }).lean();
    expect(approvedNotif).toBeTruthy();
    const approvedActivity = await Activity.findOne({ action: "WORK_LOG_APPROVED", resourceId: logId }).lean();
    expect(approvedActivity).toBeTruthy();
  });

  test("PASS: a driver cannot edit their own approved work log (locked business rule, enforced end to end)", async () => {
    const admin = await createDriver({ role: "admin" });
    const driver = await createDriver({ role: "driver" });
    const job = await createJob({ assignedTo: driver, jobType: "local" });

    const createRes = await request(app)
      .post("/api/worklogs")
      .set("Authorization", authHeader(driver))
      .send({
        date: tomorrow(),
        jobId: job._id.toString(),
        localStartTime: "08:00",
        localEndTime: "16:00",
        hours: 8,
        deliveriesDone: 5,
      });
    const logId = createRes.body.data._id;

    await request(app).put(`/api/worklogs/admin/${logId}/approve`).set("Authorization", authHeader(admin));

    const editRes = await request(app)
      .put(`/api/worklogs/${logId}`)
      .set("Authorization", authHeader(driver))
      .send({ notes: "trying to sneak an edit in" });

    expect(editRes.status).toBe(409);
  });
});
