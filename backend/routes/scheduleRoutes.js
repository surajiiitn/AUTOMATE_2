const express = require("express");
const { body } = require("express-validator");
const scheduleController = require("../controllers/scheduleController");
const authMiddleware = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleGuard");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(authMiddleware);

router.get("/", scheduleController.getSchedules);

router.post(
  "/",
  roleGuard("admin"),
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("date").trim().notEmpty().withMessage("Date is required"),
    body("startTime").trim().notEmpty().withMessage("Start time is required"),
    body("endTime").trim().notEmpty().withMessage("End time is required"),
    body("targetRole")
      .optional()
      .isIn(["student", "driver", "all"])
      .withMessage("Invalid target role"),
    body("driverId").optional().isMongoId().withMessage("Invalid driver ID"),
  ],
  validateRequest,
  scheduleController.createSchedule,
);

module.exports = router;
