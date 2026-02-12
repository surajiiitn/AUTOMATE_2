const express = require("express");
const { body, param } = require("express-validator");
const rideController = require("../controllers/rideController");
const authMiddleware = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleGuard");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(authMiddleware);

router.post(
  "/book",
  roleGuard("student"),
  [
    body("pickup").trim().notEmpty().withMessage("Pickup is required"),
    body("destination").trim().notEmpty().withMessage("Destination is required"),
  ],
  validateRequest,
  rideController.bookRide,
);

router.get("/student/current", roleGuard("student"), rideController.getStudentCurrentRide);
router.get("/student/history", roleGuard("student"), rideController.getStudentHistory);

router.get("/driver/current", roleGuard("driver"), rideController.getDriverCurrentRide);

router.patch(
  "/driver/students/:queueEntryId/arrive",
  roleGuard("driver"),
  [param("queueEntryId").isMongoId().withMessage("Invalid queue entry ID")],
  validateRequest,
  rideController.markArrived,
);

router.patch(
  "/driver/students/:queueEntryId/cancel",
  roleGuard("driver"),
  [param("queueEntryId").isMongoId().withMessage("Invalid queue entry ID")],
  validateRequest,
  rideController.cancelStudent,
);

router.patch("/driver/start", roleGuard("driver"), rideController.startTrip);
router.patch("/driver/complete", roleGuard("driver"), rideController.completeTrip);

router.get("/admin/queue", roleGuard("admin"), rideController.getAdminQueue);
router.get("/admin/stats", roleGuard("admin"), rideController.getAdminStats);

module.exports = router;
