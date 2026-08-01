// ============================================================================
// ⚠️  DANGER — DEMO/DEV DATA RESET ONLY. NEVER RUN THIS AGAINST A PRODUCTION
// DATABASE. It deletes real business records (jobs, PODs, work diaries,
// work logs, notifications, activity history, and every driver/truck
// account except the seeded admin) with no way to undo it once --confirm
// is passed. Double-check MONGO_URI in your environment/.env before running
// this anywhere other than a local or disposable demo database.
// ============================================================================
//
// Wipes every collection back to a clean slate before a demo, preserving
// only the one admin account backend/scripts/createAdmin.js seeds — that
// script is the definitive source of truth for what "the admin account"
// means here (see the email match below), not a guess about role or any
// other field.
//
// Usage:
//   node backend/scripts/cleanupBeforeDemo.js            # dry run (default) — prints counts only
//   node backend/scripts/cleanupBeforeDemo.js --confirm   # actually deletes
const mongoose = require("mongoose");
require("dotenv").config();

const Driver = require("../models/driver");
const Truck = require("../models/truck");
const Job = require("../models/job");
const JobPod = require("../models/jobPod");
const WorkDiary = require("../models/workDiary");
const DailyWorkLog = require("../models/dailyWorkLog");
const Notification = require("../models/notification");
const Activity = require("../models/activity");

// The exact identification method backend/scripts/createAdmin.js uses to
// find/create its seeded admin — Driver.findOne({ email: "admin@example.com" }).
// Mirrored here verbatim so "the admin account to preserve" always means
// the same thing in both scripts.
const ADMIN_EMAIL = "admin@example.com";

const isConfirmed = process.argv.includes("--confirm");

// Driver is the only collection with an exclusion — every other collection
// here is wiped completely, no exceptions.
const targets = [
  { name: "Driver", model: Driver, query: { email: { $ne: ADMIN_EMAIL } } },
  { name: "Truck", model: Truck, query: {} },
  { name: "Job", model: Job, query: {} },
  { name: "JobPod", model: JobPod, query: {} },
  { name: "WorkDiary", model: WorkDiary, query: {} },
  { name: "DailyWorkLog", model: DailyWorkLog, query: {} },
  { name: "Notification", model: Notification, query: {} },
  { name: "Activity", model: Activity, query: {} },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (${isConfirmed ? "LIVE DELETE" : "DRY RUN"} mode)`);
  console.log("");

  const preservedAdmins = await Driver.find({ email: ADMIN_EMAIL }).select("email name role").lean();
  if (preservedAdmins.length === 0) {
    console.log(`⚠️  No admin account found matching email "${ADMIN_EMAIL}" — nothing will be preserved in Driver.`);
    console.log(`   (Run backend/scripts/createAdmin.js first if that's not intentional.)`);
  } else {
    console.log(`Admin account(s) that will be PRESERVED (matched by email, same as createAdmin.js):`);
    preservedAdmins.forEach((admin) => {
      console.log(`  - ${admin.email} (name: "${admin.name}", role: "${admin.role}")`);
    });
  }
  console.log("");

  const counts = [];
  for (const target of targets) {
    const count = await target.model.countDocuments(target.query);
    counts.push({ ...target, count });
  }

  console.log(isConfirmed ? "Deleting:" : "Would delete (dry run — pass --confirm to actually delete):");
  counts.forEach(({ name, count }) => {
    console.log(`  ${name}: ${count}`);
  });
  console.log("");

  if (!isConfirmed) {
    console.log("Dry run complete. No documents were deleted. Re-run with --confirm to actually delete.");
    await mongoose.connection.close();
    process.exit(0);
  }

  for (const target of counts) {
    const result = await target.model.deleteMany(target.query);
    console.log(`Deleted ${result.deletedCount} document(s) from ${target.name}.`);
  }

  console.log("");
  console.log("Cleanup complete.");
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Cleanup script failed:", err);
  process.exit(1);
});
