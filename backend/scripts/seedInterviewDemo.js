// ============================================================================
// ⚠️  DEMO/INTERVIEW DATA ONLY — NEVER RUN THIS AGAINST A PRODUCTION DATABASE.
// It inserts fictional drivers, trucks, jobs, PODs, work logs, and work
// diaries directly into MongoDB so an interviewer/demo audience has
// realistic-looking historical data to click through. Double-check
// MONGO_URI in your environment/.env before running this anywhere other
// than a local or disposable demo database.
//
// This script is STRICTLY ADDITIVE — it never deletes or resets anything.
// Cleanup is a separate, already-built script: backend/scripts/cleanupBeforeDemo.js
//
// Data is written directly via Mongoose models, bypassing the real
// controllers/routes entirely. That means it deliberately does NOT trigger
// notifications, emails, or activity-log entries (see services/
// notificationService.js / services/activityService.js, both untouched
// here) — this is historical-looking data, not a simulation of real user
// actions. Schema-level hooks (password hashing, truckNumber uppercasing,
// startedAt/completedAt auto-stamping, workLog date/workDate sync) still
// run as normal since those live on the models, not the controllers.
//
// Business rule enforced throughout: Work Diary applies ONLY to interstate
// jobs. A local job never gets a WorkDiary document here, under any
// circumstances — see workDiaryController.js's own upload-time validation
// ("Work diary pages can only be linked to interstate jobs") for the real
// app's equivalent rule.
//
// Usage (from the backend directory):
//   node scripts/seedInterviewDemo.js
// ============================================================================

const mongoose = require("mongoose");
require("dotenv").config();

const Driver = require("../models/driver");
const Truck = require("../models/truck");
const Job = require("../models/job");
const JobPod = require("../models/jobPod");
const WorkDiary = require("../models/workDiary");
const DailyWorkLog = require("../models/dailyWorkLog");

// Same admin identification method as createAdmin.js / cleanupBeforeDemo.js.
const ADMIN_EMAIL = "admin@example.com";

const now = new Date();
const daysAgo = (n, hours = 8, minutes = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const admin = await Driver.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    console.log(
      `⚠️  No admin account found matching email "${ADMIN_EMAIL}" — PODs will be seeded with approvedBy: null. Run backend/scripts/createAdmin.js first if you want a realistic approver.`
    );
  }
  const approverId = admin ? admin._id : null;

  // --- Drivers ---------------------------------------------------------
  // 2 active (Marcus has a mix of local/interstate history), 1 archived
  // (Dennis — an ex-driver who still has a completed interstate job on
  // record, so their compliance history is discoverable after leaving).
  const marcus = await Driver.create({
    name: "Marcus Chen",
    email: "marcus.chen@example.com",
    password: "Interview123!",
    role: "driver",
    phone: "0412 345 678",
    active: true,
    recordStatus: "active",
    hourlyRate: 38,
    kmRate: 0.85,
  });

  const priya = await Driver.create({
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
    password: "Interview123!",
    role: "driver",
    phone: "0423 456 789",
    active: true,
    recordStatus: "active",
    hourlyRate: 40,
    kmRate: 0.9,
  });

  const dennis = await Driver.create({
    name: "Dennis Whitfield",
    email: "dennis.whitfield@example.com",
    password: "Interview123!",
    role: "driver",
    phone: "0434 567 890",
    active: false,
    recordStatus: "archived",
    hourlyRate: 36,
    kmRate: 0.8,
  });

  console.log(`Created drivers: ${marcus.name} (active), ${priya.name} (active), ${dennis.name} (archived)`);

  // --- Trucks ------------------------------------------------------------
  const truck1 = await Truck.create({
    truckNumber: "TRK-101",
    status: "available",
    recordStatus: "active",
    assignedDriver: marcus._id,
    lastMaintenanceDate: daysAgo(35),
  });

  const truck2 = await Truck.create({
    truckNumber: "TRK-202",
    status: "on-route",
    recordStatus: "active",
    assignedDriver: priya._id,
    lastMaintenanceDate: daysAgo(20),
  });

  const truck3 = await Truck.create({
    truckNumber: "TRK-303",
    status: "out-of-service",
    recordStatus: "active",
    lastMaintenanceDate: daysAgo(20),
  });

  console.log(`Created trucks: ${truck1.truckNumber}, ${truck2.truckNumber}`);

  // --- Jobs ----------------------------------------------------------------
  // 6 jobs spread across the last 10 days. 4 completed, 1 in-progress,
  // 1 pending. Mix of local/interstate. Marcus has both a completed
  // interstate and a completed local job (the "mix of history" driver).
  // Dennis (archived) has exactly one job: a completed interstate run,
  // so it carries a POD + work log + work diary.
  const job1InterstateMarcus = await Job.create({
    title: "Melbourne to Sydney Freight Run",
    description: "Palletised freight run from Melbourne to the Sydney markets.",
    pickupLocation: "Melbourne Distribution Centre, VIC",
    deliveryLocation: "Sydney Markets, NSW",
    assignedTo: marcus._id,
    assignedTruck: truck1._id,
    jobDate: daysAgo(9),
    startTime: "05:30",
    jobType: "interstate",
    status: "completed",
    startedAt: daysAgo(9, 5, 30),
    completedAt: daysAgo(9, 17, 45),
  });

  const job2LocalMarcus = await Job.create({
    title: "Melbourne Metro Delivery Run",
    description: "Local metro delivery covering the south-east suburbs.",
    pickupLocation: "Melbourne CBD Depot, VIC",
    deliveryLocation: "Dandenong South, VIC",
    assignedTo: marcus._id,
    assignedTruck: truck1._id,
    jobDate: daysAgo(6),
    startTime: "08:00",
    jobType: "local",
    status: "completed",
    startedAt: daysAgo(6, 8, 0),
    completedAt: daysAgo(6, 15, 30),
  });

  const job3InterstatePriya = await Job.create({
    title: "Brisbane to Newcastle Line Haul",
    description: "Interstate line haul carrying refrigerated goods.",
    pickupLocation: "Brisbane Freight Terminal, QLD",
    deliveryLocation: "Newcastle Port, NSW",
    assignedTo: priya._id,
    assignedTruck: truck2._id,
    jobDate: daysAgo(4),
    startTime: "04:45",
    jobType: "interstate",
    status: "completed",
    startedAt: daysAgo(4, 4, 45),
    completedAt: daysAgo(4, 16, 15),
  });

  const job4LocalPriyaInProgress = await Job.create({
    title: "Ipswich Local Delivery",
    description: "Same-day local delivery run to Ipswich.",
    pickupLocation: "Brisbane CBD, QLD",
    deliveryLocation: "Ipswich, QLD",
    assignedTo: priya._id,
    assignedTruck: truck2._id,
    jobDate: daysAgo(2),
    startTime: "09:00",
    jobType: "local",
    status: "in-progress",
    startedAt: daysAgo(2, 9, 0),
  });

  const job5InterstateDennis = await Job.create({
    title: "Adelaide to Perth Long Haul",
    description: "Long-haul interstate run of fresh produce.",
    pickupLocation: "Adelaide Produce Markets, SA",
    deliveryLocation: "Perth Distribution Hub, WA",
    assignedTo: dennis._id,
    assignedTruck: truck1._id,
    jobDate: daysAgo(8),
    startTime: "03:00",
    jobType: "interstate",
    status: "completed",
    startedAt: daysAgo(8, 3, 0),
    completedAt: daysAgo(8, 20, 0),
  });

  const job6LocalMarcusPending = await Job.create({
    title: "Geelong Local Delivery",
    description: "Scheduled local delivery run to Geelong.",
    pickupLocation: "Melbourne CBD Depot, VIC",
    deliveryLocation: "Geelong, VIC",
    assignedTo: marcus._id,
    assignedTruck: truck2._id,
    jobDate: daysAgo(0),
    startTime: "10:00",
    jobType: "local",
    status: "pending",
  });

  await Truck.updateOne({ _id: truck2._id }, { assignedJob: job4LocalPriyaInProgress._id });

  console.log("Created 6 jobs (4 completed, 1 in-progress, 1 pending)");

  // --- PODs, work logs, and work diaries for completed jobs -----------
  // Every completed job (regardless of type) gets one approved POD and
  // one work log entry. Only completed INTERSTATE jobs also get a work
  // diary — local jobs never get one, per the business rule above.
  const completedJobs = [
    { job: job1InterstateMarcus, driver: marcus, truck: truck1, slug: "melbourne-sydney" },
    { job: job2LocalMarcus, driver: marcus, truck: truck1, slug: "melbourne-dandenong" },
    { job: job3InterstatePriya, driver: priya, truck: truck2, slug: "brisbane-newcastle" },
    { job: job5InterstateDennis, driver: dennis, truck: truck1, slug: "adelaide-perth" },
  ];

  for (const { job, driver, truck, slug } of completedJobs) {
    const uploadedAt = new Date(job.completedAt.getTime() + 60 * 60 * 1000);

    const pod = await JobPod.create({
      driverId: driver._id,
      jobId: job._id,
      fileUrl: `https://res.cloudinary.com/xflyve-demo/raw/upload/pods/${slug}-pod.pdf`,
      publicId: `pods/${slug}-pod`,
      uploadDate: uploadedAt,
      status: "approved",
      approvedBy: approverId,
      approvedAt: uploadedAt,
      notes: "Signed proof of delivery on file.",
    });
    await Job.updateOne({ _id: job._id }, { $addToSet: { podIds: pod._id } });

    const isInterstate = job.jobType === "interstate";
    await DailyWorkLog.create({
      driverId: driver._id,
      date: job.jobDate,
      workDate: job.jobDate,
      hours: isInterstate ? 12.5 : 7.5,
      kilometers: isInterstate ? 1450 : 65,
      ...(isInterstate
        ? { interstateStartKm: 128400, interstateEndKm: 129850 }
        : { localStartTime: job.startTime, localEndTime: "15:30" }),
      deliveriesDone: isInterstate ? 1 : 6,
      deliveryLocations: [job.deliveryLocation],
      jobIds: [job._id],
      notes: `Work log for ${job.title}.`,
    });

    if (isInterstate) {
      const diary = await WorkDiary.create({
        driverId: driver._id,
        jobId: job._id,
        truckId: truck._id,
        workDate: job.jobDate,
        fileUrl: `https://res.cloudinary.com/xflyve-demo/raw/upload/diaries/${slug}-diary.pdf`,
        publicId: `diaries/${slug}-diary`,
        uploadDate: uploadedAt,
        notes: "NHVR work diary pages for this trip.",
      });
      await Job.updateOne({ _id: job._id }, { $addToSet: { diaryIds: diary._id } });
    }
  }

  console.log("Created PODs + work logs for all 4 completed jobs, and work diaries for the 3 completed interstate jobs");
  console.log("");
  console.log("Seed complete.");
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
