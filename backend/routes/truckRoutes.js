const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const { requireAdmin } = require("../middlewares/roleMiddleware");
const truckController = require("../controllers/truckController");
const validateRequest = require("../middlewares/validateRequest");
const {
  truckCreateValidator,
  truckUpdateValidator,
} = require("../validators/truckValidator");

router.use(authMiddleware);

router.get("/", requireAdmin, truckController.getAllTrucks);

router.post(
  "/",
  requireAdmin,
  ...truckCreateValidator,
  validateRequest,
  truckController.addTruck
);

router.put(
  "/:truckId",
  requireAdmin,
  ...truckUpdateValidator,
  validateRequest,
  truckController.updateTruck
);

// Optional: Create this array validator if needed, or inline it
const { param } = require("express-validator");
const truckIdParamValidator = [param("truckId").isMongoId().withMessage("Invalid truck ID")];

router.delete(
  "/:truckId",
  requireAdmin,
  ...truckIdParamValidator,
  truckController.deleteTruck
);

module.exports = router;
