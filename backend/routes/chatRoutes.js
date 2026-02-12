const express = require("express");
const { body, param } = require("express-validator");
const chatController = require("../controllers/chatController");
const authMiddleware = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleGuard");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(authMiddleware);
router.use(roleGuard("student", "driver", "admin"));

router.get("/current-room", chatController.getCurrentRoom);

router.get(
  "/ride/:rideId/messages",
  [param("rideId").isMongoId().withMessage("Invalid ride ID")],
  validateRequest,
  chatController.getMessages,
);

router.post(
  "/ride/:rideId/messages",
  [
    param("rideId").isMongoId().withMessage("Invalid ride ID"),
    body("content")
      .trim()
      .notEmpty()
      .withMessage("Message content is required")
      .isLength({ max: 1000 })
      .withMessage("Message is too long"),
  ],
  validateRequest,
  chatController.sendMessage,
);

module.exports = router;
