const express = require("express");
const { body, param } = require("express-validator");
const complaintController = require("../controllers/complaintController");
const { COMPLAINT_STATUSES } = require("../models/Complaint");
const authMiddleware = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleGuard");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(authMiddleware);

router.post(
  "/",
  roleGuard("student"),
  [
    body("complaintText")
      .optional()
      .isString()
      .withMessage("Complaint text must be a string")
      .trim()
      .isLength({ max: 2000 })
      .withMessage("Complaint text too long"),
    body("description")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .trim()
      .isLength({ max: 2000 })
      .withMessage("Description too long"),
    body().custom((_, { req }) => {
      const complaintText = `${req.body.complaintText || req.body.description || ""}`.trim();
      if (!complaintText) {
        throw new Error("Complaint text is required");
      }

      return true;
    }),
    body("rideId").optional().isMongoId().withMessage("Invalid ride ID"),
    body("tripId").optional().isMongoId().withMessage("Invalid trip ID"),
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
    body("status").optional().isIn(COMPLAINT_STATUSES).withMessage("Invalid status"),
    body("adminResponse")
      .optional()
      .isString()
      .withMessage("Admin response must be text")
      .trim()
      .isLength({ max: 2000 })
      .withMessage("Admin response too long"),
    body("adminRemark")
      .optional()
      .isString()
      .withMessage("Admin response must be text")
      .trim()
      .isLength({ max: 2000 })
      .withMessage("Admin response too long"),
    body().custom((_, { req }) => {
      const hasStatus = typeof req.body.status === "string" && req.body.status.trim();
      const hasResponse =
        typeof req.body.adminResponse === "string"
          ? req.body.adminResponse.trim()
          : typeof req.body.adminRemark === "string"
            ? req.body.adminRemark.trim()
            : "";

      if (!hasStatus && !hasResponse) {
        throw new Error("Status or admin response is required");
      }

      return true;
    }),
  ],
  validateRequest,
  complaintController.updateComplaintStatus,
);

module.exports = router;
