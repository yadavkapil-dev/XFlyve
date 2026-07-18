const Driver = require("../models/driver");
const Job = require("../models/job");
const Truck = require("../models/truck");
const DailyWorkLog = require("../models/dailyWorkLog");
const JobPod = require("../models/jobPod");

const exportToExcel = require("../utils/excelExport");
const generateZip = require("../utils/zipGenerator");
const logger = require("../utils/logger");

const ADMIN_ROLE = "admin"; // Use constants for roles

// GET /api/admin/drivers
exports.getAllDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ recordStatus: { $ne: "archived" } }).select("-password");
    return res.status(200).json({
      status: "success",
      count: drivers.length,
      data: drivers,
    });
  } catch (err) {
    logger.error("Failed to get all drivers: %o", err);
    return res.status(500).json({ status: "error", message: "Server error fetching drivers" });
  }
};

// GET /api/admin/export-drivers
exports.exportDriversExcel = async (req, res) => {
  try {
    const drivers = await Driver.find().select("-password").lean();

    const headers = [
      { label: "Name", key: "name" },
      { label: "Email", key: "email" },
      { label: "Phone", key: "phone" },
      { label: "Role", key: "role" },
    ];

    const filename = `drivers_${Date.now()}`;
    await exportToExcel(drivers, headers, filename, res);
  } catch (err) {
    logger.error("Failed to export drivers to Excel: %o", err);
    res.status(500).json({ status: "error", message: "Server error exporting drivers" });
  }
};

// DELETE /api/admin/drivers/:driverId
exports.deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    // Basic driverId format validation (fallback)
    if (!driverId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid driver ID",
      });
    }

    // Prevent admin from deleting own account
    if (req.user.id.toString() === driverId.toString()) {
      return res.status(400).json({
        status: "fail",
        message: "You cannot delete your own admin account",
      });
    }

    const activeJob = await Job.exists({ assignedTo: driverId, status: { $in: ["pending", "in-progress"] }, recordStatus: { $ne: "archived" } });

    if (activeJob) {
      return res.status(409).json({
        status: "fail",
        message: "Cannot archive driver while they have active jobs",
      });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ status: "fail", message: "Driver not found" });
    }

    driver.recordStatus = "archived";
    driver.active = false;
    await driver.save();

    return res.status(200).json({ status: "success", message: "Driver archived", data: driver });
  } catch (err) {
    logger.error("Failed to delete driver %s: %o", req.params.driverId, err);
    return res.status(500).json({ status: "error", message: "Server error deleting driver" });
  }
};

// GET /api/admin/stats
exports.getSystemStats = async (req, res) => {
  try {
    const [jobCount, driverCount, truckCount, logCount] = await Promise.all([
      Job.countDocuments(),
      Driver.countDocuments(),
      Truck.countDocuments(),
      DailyWorkLog.countDocuments(),
    ]);

    return res.status(200).json({
      status: "success",
      data: {
        totalJobs: jobCount,
        totalDrivers: driverCount,
        totalTrucks: truckCount,
        totalLogs: logCount,
      },
    });
  } catch (err) {
    logger.error("Failed to get system stats: %o", err);
    return res.status(500).json({ status: "error", message: "Server error fetching stats" });
  }
};

// GET /api/admin/download-all-pods
exports.downloadAllPods = async (req, res) => {
  try {
    const pods = await JobPod.find({ fileUrl: { $exists: true, $ne: null } })
      .select("fileUrl driverId uploadDate createdAt")
      .populate("driverId", "name")
      .lean();

    if (pods.length === 0) {
      return res.status(404).json({ status: "fail", message: "No POD files found" });
    }

    const usedNames = new Set();
    const files = pods.map((pod) => {
      const driverName = (pod.driverId?.name || "driver").trim().replace(/[^a-z0-9]+/gi, "_");
      const dateStr = new Date(pod.uploadDate || pod.createdAt || 0).toISOString().slice(0, 10);
      const baseName = `POD-${driverName}-${dateStr}`;

      let name = `${baseName}.pdf`;
      let suffix = 1;
      while (usedNames.has(name)) {
        name = `${baseName}-${suffix++}.pdf`;
      }
      usedNames.add(name);

      return { url: pod.fileUrl, name };
    });

    logger.info(`Zipping ${files.length} POD files`);
    await generateZip(files, "all_pods.zip", res);
  } catch (err) {
    logger.error("Failed to download all PODs: %o", err);
    if (!res.headersSent) {
      res.status(500).json({ status: "error", message: "Server error generating PODs ZIP" });
    }
  }
};

exports.createDriver = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      driverType,
      phone,
      active,
      recordStatus,
      payType,
      hourlyRate,
      kmRate,
      deliveryRate,
      abn,
    } = req.body;

    const normalizedEmail = email.trim().toLowerCase();
    const existingDriver = await Driver.findOne({ email: normalizedEmail });
    if (existingDriver) {
      if (existingDriver.recordStatus !== "archived") {
        return res.status(409).json({
          status: "fail",
          message: "A driver with this email already exists",
        });
      }

      existingDriver.name = name;
      existingDriver.email = normalizedEmail;
      existingDriver.password = password;
      existingDriver.driverType = driverType;
      existingDriver.phone = phone;
      existingDriver.active = true;
      existingDriver.recordStatus = "active";
      existingDriver.payType = payType;
      existingDriver.hourlyRate = hourlyRate;
      existingDriver.kmRate = kmRate;
      existingDriver.deliveryRate = deliveryRate;
      existingDriver.abn = abn;
      existingDriver.role = "driver";
      await existingDriver.save();

      const restoredDriver = existingDriver.toObject();
      delete restoredDriver.password;

      return res.status(201).json({
        status: "success",
        message: "Driver created successfully",
        data: restoredDriver,
      });
    }

    const newDriver = new Driver({
      name,
      email: normalizedEmail,
      password,
      driverType,
      phone,
      active,
      recordStatus,
      payType,
      hourlyRate,
      kmRate,
      deliveryRate,
      abn,
      role: "driver", // force role to driver
    });

    await newDriver.save();

    return res.status(201).json({ status: "success", message: "Driver created successfully" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        status: "fail",
        message: "A driver with this email already exists",
      });
    }

    if (err.name === "ValidationError") {
      const validationErrors = Object.values(err.errors).map(error => ({
        field: error.path,
        message: error.message,
      }));

      return res.status(422).json({
        success: false,
        status: "fail",
        message: validationErrors.map(error => error.message).join(", "),
        errors: validationErrors,
      });
    }

    logger.error("Failed to create driver: %o", err);
    return res.status(500).json({ status: "error", message: "Server error creating driver" });
  }
};

exports.updateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { name, email, password } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ status: "fail", message: "Driver not found" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingDriver = await Driver.findOne({
      email: normalizedEmail,
      _id: { $ne: driverId },
    }).lean();

    if (existingDriver) {
      return res.status(409).json({ status: "fail", message: "Email already in use" });
    }

    driver.name = name;
    driver.email = normalizedEmail;
    if (password && password.trim()) {
      driver.password = password.trim();
    }

    await driver.save();

    const updatedDriver = driver.toObject();
    delete updatedDriver.password;

    return res.status(200).json({
      status: "success",
      message: "Driver updated successfully",
      data: updatedDriver,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ status: "fail", message: "Email already in use" });
    }

    if (err.name === "ValidationError") {
      const validationErrors = Object.values(err.errors).map(error => ({
        field: error.path,
        message: error.message,
      }));

      return res.status(422).json({
        success: false,
        status: "fail",
        message: validationErrors.map(error => error.message).join(", "),
        errors: validationErrors,
      });
    }

    logger.error("Failed to update driver %s: %o", req.params.driverId, err);
    return res.status(500).json({ status: "error", message: "Server error updating driver" });
  }
};
