const express = require("express");
const { body, param } = require("express-validator");
const complaintController = require("../controllers/complaintController");
const authMiddleware = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleGuard");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(authMiddleware);

router.post(
  "/",
  roleGuard("student"),
  [
    body("description")
      .trim()
      .notEmpty()
      .withMessage("Description is required")
      .isLength({ max: 2000 })
      .withMessage("Description too long"),
    body("rideId").optional().isMongoId().withMessage("Invalid ride ID"),
  ],
  validateRequest,
  complaintController.createComplaint,
);

router.get("/mine", roleGuard("student"), complaintController.getMyComplaints);

router.get("/", roleGuard("admin"), complaintController.getAllComplaints);

router.patch(
  "/:complaintId/status",
  roleGuard("admin"),
  [
    param("complaintId").isMongoId().withMessage("Invalid complaint ID"),
    body("status").isIn(["waiting", "assigned", "completed"]).withMessage("Invalid status"),
    body("adminRemark").optional().isString(),
  ],
  validateRequest,
  complaintController.updateComplaintStatus,
);

module.exports = router;
