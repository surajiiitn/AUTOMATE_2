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

router.post(
  "/biometric/register/options",
  authLimiter,
  authMiddleware,
  authController.beginBiometricRegistration,
);

router.post(
  "/biometric/register/verify",
  authLimiter,
  authMiddleware,
  [
    body("credential.id").isString().notEmpty().withMessage("Credential ID is required"),
    body("credential.rawId").isString().notEmpty().withMessage("Credential rawId is required"),
    body("credential.type").equals("public-key").withMessage("Invalid credential type"),
    body("credential.response.clientDataJSON")
      .isString()
      .notEmpty()
      .withMessage("clientDataJSON is required"),
    body("credential.response.publicKey")
      .isString()
      .notEmpty()
      .withMessage("Credential public key is required"),
    body("credential.response.transports")
      .optional()
      .isArray()
      .withMessage("Credential transports must be an array"),
  ],
  validateRequest,
  authController.completeBiometricRegistration,
);

router.post(
  "/biometric/login/options",
  authLimiter,
  [
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("role")
      .optional()
      .isIn(["student", "driver", "admin"])
      .withMessage("Invalid role"),
  ],
  validateRequest,
  authController.beginBiometricLogin,
);

router.post(
  "/biometric/login/verify",
  authLimiter,
  [
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("role")
      .optional()
      .isIn(["student", "driver", "admin"])
      .withMessage("Invalid role"),
    body("credential.id").isString().notEmpty().withMessage("Credential ID is required"),
    body("credential.rawId").isString().notEmpty().withMessage("Credential rawId is required"),
    body("credential.type").equals("public-key").withMessage("Invalid credential type"),
    body("credential.response.clientDataJSON")
      .isString()
      .notEmpty()
      .withMessage("clientDataJSON is required"),
    body("credential.response.authenticatorData")
      .isString()
      .notEmpty()
      .withMessage("authenticatorData is required"),
    body("credential.response.signature")
      .isString()
      .notEmpty()
      .withMessage("signature is required"),
  ],
  validateRequest,
  authController.completeBiometricLogin,
);

router.get("/me", authMiddleware, authController.me);

module.exports = router;
