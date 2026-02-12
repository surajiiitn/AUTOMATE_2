const express = require("express");
const { body, param, query } = require("express-validator");
const chatController = require("../controllers/chatController");
const authMiddleware = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleGuard");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(authMiddleware);
router.use(roleGuard("student", "driver"));

router.get("/context", chatController.getCurrentRoom);
router.get("/current-room", chatController.getCurrentRoom);

router.get(
  "/messages",
  [
    query("roomType")
      .isIn(["queue", "trip"])
      .withMessage("roomType must be queue or trip"),
    query("roomId")
      .optional()
      .custom((value, { req }) => {
        if (req.query.roomType === "trip" && (!value || !/^[a-fA-F0-9]{24}$/.test(value))) {
          throw new Error("roomId is required for trip chat");
        }
        return true;
      }),
  ],
  validateRequest,
  chatController.getMessagesByRoom,
);

router.post(
  "/messages",
  [
    body("roomType")
      .isIn(["queue", "trip"])
      .withMessage("roomType must be queue or trip"),
    body("roomId")
      .optional()
      .custom((value, { req }) => {
        if (req.body.roomType === "trip" && (!value || !/^[a-fA-F0-9]{24}$/.test(value))) {
          throw new Error("roomId is required for trip chat");
        }
        return true;
      }),
    body("content")
      .trim()
      .notEmpty()
      .withMessage("Message content is required")
      .isLength({ max: 1000 })
      .withMessage("Message is too long"),
  ],
  validateRequest,
  chatController.sendMessageByRoom,
);

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
