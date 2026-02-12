const express = require("express");
const { body, query } = require("express-validator");
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const roleGuard = require("../middleware/roleGuard");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

router.use(authMiddleware, roleGuard("admin"));

router.get(
  "/",
  [
    query("role")
      .optional()
      .isIn(["student", "driver", "admin"])
      .withMessage("Invalid role filter"),
    query("q").optional().isString(),
  ],
  validateRequest,
  userController.getUsers,
);

router.post(
  "/",
  [
    body("name").trim().isLength({ min: 2 }).withMessage("Name is required"),
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 chars"),
    body("role").isIn(["student", "driver", "admin"]).withMessage("Invalid role"),
    body("vehicleNumber").optional().isString(),
  ],
  validateRequest,
  userController.createUser,
);

module.exports = router;
