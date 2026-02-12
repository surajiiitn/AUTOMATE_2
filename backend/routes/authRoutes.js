const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { authLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

router.post(
  "/signup",
  authLimiter,
  [
    body("name").trim().isLength({ min: 2 }).withMessage("Name is required"),
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("role").isIn(["student", "driver", "admin"]).withMessage("Invalid role"),
    body("vehicleNumber")
      .optional()
      .isString()
      .withMessage("Vehicle number must be a string"),
  ],
  validateRequest,
  authController.signup,
);

router.post(
  "/login",
  authLimiter,
  [
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password").isString().notEmpty().withMessage("Password is required"),
    body("role")
      .optional()
      .isIn(["student", "driver", "admin"])
      .withMessage("Invalid role"),
  ],
  validateRequest,
  authController.login,
);

router.get("/me", authMiddleware, authController.me);

module.exports = router;
