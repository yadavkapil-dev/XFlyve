// Runs the real, unmodified backend/scripts/seedInterviewDemo.js as a child
// process against a genuinely isolated mongodb-memory-server instance (same
// isolation tool as every other integration test here), then asserts on the
// resulting collections directly. This is the actual product-safety
// contract the script promises: it must NEVER create a WorkDiary for a
// local job, no matter what data it seeds — that's a real business rule
// (workDiaryController.js rejects this at upload time too), not just a
// script-comment claim, so it needs a real regression test rather than
// only a manual code read.
//
// cwd is set to this file's own directory, which has no .env of its own —
// same reasoning as tests/e2e/start-e2e-backend.js — so the script's own
// `require("dotenv").config()` call finds nothing and only the MONGO_URI
// explicitly passed below is ever used. The real backend/.env is never
// read or touched.
const path = require("path");
const { execFileSync } = require("child_process");
const { startTestDb, stopTestDb } = require("./testDb");
const Driver = require("../../models/driver");
const Truck = require("../../models/truck");
const Job = require("../../models/job");
const JobPod = require("../../models/jobPod");
const WorkDiary = require("../../models/workDiary");
const DailyWorkLog = require("../../models/dailyWorkLog");

const SEED_SCRIPT = path.join(__dirname, "../../scripts/seedInterviewDemo.js");

beforeAll(async () => {
  const uri = await startTestDb();
  execFileSync("node", [SEED_SCRIPT], {
    cwd: __dirname,
    env: { ...process.env, MONGO_URI: uri },
    stdio: "pipe",
  });
}, 30000);

afterAll(async () => {
  await stopTestDb();
});

describe("seedInterviewDemo.js — seeds exactly the fixed cast described in its own comments", () => {
  test("PASS: 3 drivers — 2 active, 1 archived", async () => {
    const drivers = await Driver.find({}).lean();
    expect(drivers).toHaveLength(3);

    const marcus = drivers.find((d) => d.email === "marcus.chen@example.com");
    const priya = drivers.find((d) => d.email === "priya.sharma@example.com");
    const dennis = drivers.find((d) => d.email === "dennis.whitfield@example.com");

    expect(marcus.recordStatus).toBe("active");
    expect(priya.recordStatus).toBe("active");
    expect(dennis.recordStatus).toBe("archived");
  });

  test("PASS: 3 trucks created", async () => {
    const trucks = await Truck.find({}).lean();
    expect(trucks).toHaveLength(3);
  });

  test("PASS: 6 jobs — 4 completed, 1 in-progress, 1 pending", async () => {
    const jobs = await Job.find({}).lean();
    expect(jobs).toHaveLength(6);

    const byStatus = jobs.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {});
    expect(byStatus).toEqual({ completed: 4, "in-progress": 1, pending: 1 });
  });
});

describe("seedInterviewDemo.js — business rule: Work Diary is interstate-only, no exceptions", () => {
  test("PASS (regression): zero WorkDiary documents are linked to a local job", async () => {
    const diaries = await WorkDiary.find({}).populate("jobId", "jobType").lean();
    expect(diaries.length).toBeGreaterThan(0); // sanity check the script actually created some

    const linkedToLocalJob = diaries.filter((diary) => diary.jobId?.jobType === "local");
    expect(linkedToLocalJob).toHaveLength(0);
  });

  test("PASS: exactly one WorkDiary per completed interstate job (3 total)", async () => {
    const diaries = await WorkDiary.find({}).populate("jobId", "jobType status").lean();
    expect(diaries).toHaveLength(3);
    diaries.forEach((diary) => {
      expect(diary.jobId.jobType).toBe("interstate");
      expect(diary.jobId.status).toBe("completed");
    });
  });

  test("PASS: the one completed LOCAL job (Melbourne Metro Delivery Run) has a POD and a work log, but no work diary", async () => {
    const localCompletedJob = await Job.findOne({ title: "Melbourne Metro Delivery Run" }).lean();
    expect(localCompletedJob.jobType).toBe("local");
    expect(localCompletedJob.status).toBe("completed");

    const pod = await JobPod.findOne({ jobId: localCompletedJob._id }).lean();
    const workLog = await DailyWorkLog.findOne({ jobIds: localCompletedJob._id }).lean();
    const diary = await WorkDiary.findOne({ jobId: localCompletedJob._id }).lean();

    expect(pod).not.toBeNull();
    expect(workLog).not.toBeNull();
    expect(diary).toBeNull();
  });
});

describe("seedInterviewDemo.js — completed-job records (POD + work log for every type)", () => {
  test("PASS: exactly 4 approved PODs — one per completed job, regardless of local/interstate", async () => {
    const pods = await JobPod.find({}).lean();
    expect(pods).toHaveLength(4);
    pods.forEach((pod) => expect(pod.status).toBe("approved"));
  });

  test("PASS: exactly 4 work logs — one per completed job", async () => {
    const workLogs = await DailyWorkLog.find({}).lean();
    expect(workLogs).toHaveLength(4);
  });

  test("PASS: the archived driver (Dennis) has the full compliance record set — POD, work log, and work diary — demonstrating the ex-driver lookup capability", async () => {
    const dennis = await Driver.findOne({ email: "dennis.whitfield@example.com" }).lean();
    expect(dennis.recordStatus).toBe("archived");

    const dennisJob = await Job.findOne({ assignedTo: dennis._id }).lean();
    expect(dennisJob.jobType).toBe("interstate");
    expect(dennisJob.status).toBe("completed");

    const pod = await JobPod.findOne({ driverId: dennis._id }).lean();
    const workLog = await DailyWorkLog.findOne({ driverId: dennis._id }).lean();
    const diary = await WorkDiary.findOne({ driverId: dennis._id }).lean();

    expect(pod).not.toBeNull();
    expect(workLog).not.toBeNull();
    expect(diary).not.toBeNull();
  });
});
