// Real-document seeding helpers for integration tests — every helper here
// writes through the REAL Mongoose models (so Driver's password-hashing
// pre-save hook, schema validation, etc. all run for real), never mocks.
const jwt = require("jsonwebtoken");
const Driver = require("../../models/driver");
const Truck = require("../../models/truck");
const Job = require("../../models/job");

const PASSWORD = "Password123!";
let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${++counter}`;

const createDriver = async (overrides = {}) => {
  const role = overrides.role || "driver";
  const driver = await Driver.create({
    name: overrides.name || (role === "admin" ? "Test Admin" : "Test Driver"),
    email: overrides.email || `${unique(role)}@example.com`,
    password: overrides.password || PASSWORD,
    role,
    recordStatus: overrides.recordStatus || "active",
    active: overrides.active !== undefined ? overrides.active : true,
  });
  return driver;
};

const createTruck = async (overrides = {}) => {
  return Truck.create({
    truckNumber: overrides.truckNumber || unique("TRK"),
    status: overrides.status || "available",
    recordStatus: overrides.recordStatus || "active",
  });
};

// Signs a token with the exact same shape/secret authController.login uses
// ({ id, role }, process.env.JWT_SECRET, 7d expiry) — used by tests that
// need an authenticated request but aren't specifically exercising the
// login endpoint itself (that's covered directly in auth.integration.test.js).
const signToken = (driver) =>
  jwt.sign({ id: driver._id.toString(), role: driver.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

const authHeader = (driver) => `Bearer ${signToken(driver)}`;

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const createJob = async (overrides = {}) => {
  const driver = overrides.assignedTo || (await createDriver());
  const truck = overrides.assignedTruck || (await createTruck());
  return Job.create({
    title: overrides.title || "Integration test run",
    description: overrides.description || "Deliver freight",
    pickupLocation: overrides.pickupLocation || "Depot",
    deliveryLocation: overrides.deliveryLocation || "Customer site",
    assignedTo: driver._id || driver,
    assignedTruck: truck._id || truck,
    jobDate: overrides.jobDate || tomorrow(),
    jobType: overrides.jobType || "local",
    status: overrides.status || "pending",
  });
};

module.exports = {
  PASSWORD,
  createDriver,
  createTruck,
  createJob,
  signToken,
  authHeader,
  tomorrow,
};
