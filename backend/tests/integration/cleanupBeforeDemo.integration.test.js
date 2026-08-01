// Runs the real, unmodified backend/scripts/cleanupBeforeDemo.js as a child
// process against a genuinely isolated mongodb-memory-server instance (same
// pattern as seedInterviewDemo.integration.test.js). This is the most
// safety-critical script in the repo — it deletes real data — so its two
// contracts get a real regression test rather than only a manual code
// read: (1) with no flag, it is a pure dry run that deletes nothing at all,
// even when matching data exists; (2) with --confirm, it deletes
// everything except the one driver matching the admin email exactly.
//
// cwd is set to this file's own directory (no .env there), same reasoning
// as tests/e2e/start-e2e-backend.js and seedInterviewDemo's own test — the
// script's `require("dotenv").config()` call finds nothing, so only the
// MONGO_URI explicitly passed below is ever used.
const path = require("path");
const { execFileSync } = require("child_process");
const { startTestDb, stopTestDb, clearTestDb } = require("./testDb");
const Driver = require("../../models/driver");
const Truck = require("../../models/truck");
const Job = require("../../models/job");
const JobPod = require("../../models/jobPod");
const WorkDiary = require("../../models/workDiary");
const DailyWorkLog = require("../../models/dailyWorkLog");
const Notification = require("../../models/notification");
const Activity = require("../../models/activity");

const CLEANUP_SCRIPT = path.join(__dirname, "../../scripts/cleanupBeforeDemo.js");
const ADMIN_EMAIL = "admin@example.com";

let uri;

beforeAll(async () => {
  uri = await startTestDb();
}, 30000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(async () => {
  await clearTestDb();
});

const runCleanupScript = (args = []) =>
  execFileSync("node", [CLEANUP_SCRIPT, ...args], {
    cwd: __dirname,
    env: { ...process.env, MONGO_URI: uri },
    stdio: "pipe",
  }).toString();

const seedFixtureData = async () => {
  const admin = await Driver.create({ name: "Admin User", email: ADMIN_EMAIL, password: "admin123", role: "admin" });
  const driver = await Driver.create({ name: "Fixture Driver", email: "fixture.driver@example.com", password: "Pass123!", role: "driver" });
  const truck = await Truck.create({ truckNumber: "FIX-1" });
  const job = await Job.create({
    title: "Fixture Job",
    pickupLocation: "A",
    deliveryLocation: "B",
    assignedTo: driver._id,
    assignedTruck: truck._id,
    jobDate: new Date(),
    jobType: "local",
  });
  const pod = await JobPod.create({ driverId: driver._id, jobId: job._id, fileUrl: "https://example.com/pod.pdf" });
  const diary = await WorkDiary.create({ driverId: driver._id, jobId: job._id, fileUrl: "https://example.com/diary.pdf" });
  const workLog = await DailyWorkLog.create({ driverId: driver._id, date: new Date(), jobIds: [job._id] });
  const notification = await Notification.create({
    recipient: admin._id,
    type: "pod_submitted",
    title: "POD submitted",
    message: "Fixture Driver uploaded a POD for Fixture Job.",
    resourceType: "jobpod",
    resourceId: pod._id,
  });
  const activity = await Activity.create({
    actorId: driver._id,
    actorRole: "driver",
    action: "POD_SUBMITTED",
    resourceType: "jobpod",
    resourceId: pod._id,
  });

  return { admin, driver, truck, job, pod, diary, workLog, notification, activity };
};

describe("cleanupBeforeDemo.js — dry run (no --confirm) deletes absolutely nothing", () => {
  test("PASS (regression): every fixture document still exists after a dry run", async () => {
    await seedFixtureData();

    const output = runCleanupScript();

    expect(output).toMatch(/DRY RUN/);
    expect(output).toMatch(/Dry run complete\. No documents were deleted\./);

    await expect(Driver.countDocuments()).resolves.toBe(2);
    await expect(Truck.countDocuments()).resolves.toBe(1);
    await expect(Job.countDocuments()).resolves.toBe(1);
    await expect(JobPod.countDocuments()).resolves.toBe(1);
    await expect(WorkDiary.countDocuments()).resolves.toBe(1);
    await expect(DailyWorkLog.countDocuments()).resolves.toBe(1);
    await expect(Notification.countDocuments()).resolves.toBe(1);
    await expect(Activity.countDocuments()).resolves.toBe(1);
  });
});

describe("cleanupBeforeDemo.js — --confirm deletes everything except the admin driver", () => {
  test("PASS: the admin (matched by exact email) survives; every other collection is fully wiped", async () => {
    const { admin } = await seedFixtureData();

    const output = runCleanupScript(["--confirm"]);

    expect(output).toMatch(/LIVE DELETE/);
    expect(output).toMatch(/Cleanup complete\./);

    const remainingDrivers = await Driver.find({}).lean();
    expect(remainingDrivers).toHaveLength(1);
    expect(remainingDrivers[0]._id.toString()).toBe(admin._id.toString());
    expect(remainingDrivers[0].email).toBe(ADMIN_EMAIL);

    await expect(Truck.countDocuments()).resolves.toBe(0);
    await expect(Job.countDocuments()).resolves.toBe(0);
    await expect(JobPod.countDocuments()).resolves.toBe(0);
    await expect(WorkDiary.countDocuments()).resolves.toBe(0);
    await expect(DailyWorkLog.countDocuments()).resolves.toBe(0);
    await expect(Notification.countDocuments()).resolves.toBe(0);
    await expect(Activity.countDocuments()).resolves.toBe(0);
  });

  test("PASS: with no admin account present at all, --confirm still safely deletes every other collection", async () => {
    await seedFixtureData();
    await Driver.deleteOne({ email: ADMIN_EMAIL });

    const output = runCleanupScript(["--confirm"]);

    expect(output).toMatch(/No admin account found matching email/);
    await expect(Driver.countDocuments()).resolves.toBe(0);
    await expect(Job.countDocuments()).resolves.toBe(0);
  });
});
