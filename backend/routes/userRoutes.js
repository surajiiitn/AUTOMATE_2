const express = require("express");
const { body, param, query } = require("express-validator");
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

router.delete(
  "/:id",
  [
    param("id").isMongoId().withMessage("Invalid user ID"),
    query("permanent")
      .optional()
      .isBoolean()
      .withMessage("permanent must be true or false"),
  ],
  validateRequest,
  userController.removeUserById,
);

router.post(
  "/remove-by-email",
  [
    body("email").trim().isEmail().withMessage("Valid email is required"),
    body("permanent")
      .optional()
      .isBoolean()
      .withMessage("permanent must be true or false"),
  ],
  validateRequest,
  userController.removeUserByEmail,
);

router.patch(
  "/:id/reactivate",
  [param("id").isMongoId().withMessage("Invalid user ID")],
  validateRequest,
  userController.reactivateUserById,
);

router.post(
  "/:id/reactivate",
  [param("id").isMongoId().withMessage("Invalid user ID")],
  validateRequest,
  userController.reactivateUserById,
);

router.post(
  "/reactivate-by-email",
  [body("email").trim().isEmail().withMessage("Valid email is required")],
  validateRequest,
  userController.reactivateUserByEmail,
);

router.post(
  "/:id/reset-password",
  [param("id").isMongoId().withMessage("Invalid user ID")],
  validateRequest,
  userController.resetUserPasswordById,
);

router.delete(
  "/:id/permanent-delete",
  [param("id").isMongoId().withMessage("Invalid user ID")],
  validateRequest,
  userController.permanentDeleteUserById,
);

module.exports = router;
