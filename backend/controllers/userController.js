const User = require("../models/User");
const QueueEntry = require("../models/QueueEntry");
const Ride = require("../models/Ride");
const Trip = require("../models/Trip");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const ApiError = require("../utils/ApiError");
const { getIO } = require("../config/socket");
const { processQueue, emitRideState } = require("../services/queueService");
const { sendMail } = require("../services/mailService");
const { permanentDeleteUserWithCleanup } = require("../services/userDeletionService");

const ACTIVE_QUEUE_STATUSES = ["waiting", "assigned", "pickup", "in-transit"];
const ACTIVE_RIDE_STATUSES = ["forming", "ready", "in-transit"];
const TEMP_PASSWORD_LENGTH = 12;
const TEMP_PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

const toSafeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  isActive: user.isActive !== false,
  deactivatedAt: user.deactivatedAt || null,
  deactivatedBy: user.deactivatedBy ? user.deactivatedBy.toString() : null,
  vehicleNumber: user.vehicleNumber,
});

const parsePermanentFlag = (rawValue) => {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }

  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }

  return false;
};

const generateTemporaryPassword = (length = TEMP_PASSWORD_LENGTH) => {
  const bytes = crypto.randomBytes(length);
  let password = "";

  for (let index = 0; index < length; index += 1) {
    password += TEMP_PASSWORD_CHARSET[bytes[index] % TEMP_PASSWORD_CHARSET.length];
  }

  return password;
};

const ensureAdminCanRemoveUser = async (adminUserId, targetUser) => {
  if (targetUser._id.toString() === adminUserId.toString()) {
    throw new ApiError(400, "You cannot remove your own account");
  }

  if (targetUser.role !== "admin") {
    return;
  }

  const otherActiveAdminCount = await User.countDocuments({
    _id: { $ne: targetUser._id },
    role: "admin",
    isActive: { $ne: false },
    status: "active",
  });

  if (otherActiveAdminCount === 0) {
    throw new ApiError(400, "Cannot remove the last active admin");
  }
};

const removeStudentFromQueueAndTrips = async (studentId, timestamp) => {
  const activeEntries = await QueueEntry.find({
    student: studentId,
    status: { $in: ACTIVE_QUEUE_STATUSES },
  }).select("_id ride");

  if (activeEntries.length === 0) {
    return [];
  }

  const queueEntryIds = activeEntries.map((entry) => entry._id);
  const rideIds = [...new Set(
    activeEntries
      .map((entry) => entry.ride?.toString())
      .filter(Boolean),
  )];

  await QueueEntry.updateMany(
    { _id: { $in: queueEntryIds } },
    {
      $set: {
        status: "removed",
        ride: null,
        driver: null,
        completedAt: timestamp,
      },
      $unset: {
        arrivedAt: 1,
        startedAt: 1,
      },
    },
  );

  if (rideIds.length === 0) {
    return [];
  }

  await Ride.updateMany(
    { _id: { $in: rideIds } },
    {
      $pull: {
        students: { $in: queueEntryIds },
      },
    },
  );

  await Trip.updateMany(
    { ride: { $in: rideIds } },
    {
      $pull: {
        students: studentId,
      },
    },
  );

  const emptyRideDocs = await Ride.find({
    _id: { $in: rideIds },
    status: { $in: ACTIVE_RIDE_STATUSES },
    students: { $size: 0 },
  }).select("_id");

  const emptyRideIds = emptyRideDocs.map((ride) => ride._id.toString());

  if (emptyRideIds.length > 0) {
    await Ride.updateMany(
      { _id: { $in: emptyRideIds } },
      {
        $set: {
          status: "cancelled",
          completedAt: timestamp,
        },
      },
    );

    await Trip.updateMany(
      { ride: { $in: emptyRideIds }, status: "in-transit" },
      {
        $set: {
          status: "cancelled",
          completedAt: timestamp,
        },
      },
    );
  }

  return [...new Set([...rideIds, ...emptyRideIds])];
};

const removeDriverFromActiveTrips = async (driverId, timestamp) => {
  const activeRides = await Ride.find({
    driver: driverId,
    status: { $in: ACTIVE_RIDE_STATUSES },
  }).select("_id students");

  if (activeRides.length === 0) {
    return [];
  }

  const rideIds = activeRides.map((ride) => ride._id.toString());
  const queueEntryIds = activeRides
    .flatMap((ride) => ride.students || [])
    .map((id) => id.toString());

  if (queueEntryIds.length > 0) {
    await QueueEntry.updateMany(
      {
        _id: { $in: queueEntryIds },
        status: { $in: ["assigned", "pickup", "in-transit"] },
      },
      {
        $set: {
          status: "waiting",
          ride: null,
          driver: null,
          queueAt: timestamp,
        },
        $unset: {
          arrivedAt: 1,
          startedAt: 1,
          completedAt: 1,
        },
      },
    );
  }

  await Ride.updateMany(
    { _id: { $in: rideIds } },
    {
      $set: {
        status: "cancelled",
        completedAt: timestamp,
        driver: null,
      },
    },
  );

  await Trip.updateMany(
    {
      ride: { $in: rideIds },
      status: "in-transit",
    },
    {
      $set: {
        status: "cancelled",
        completedAt: timestamp,
        driver: null,
      },
    },
  );

  return rideIds;
};

const cleanupActiveAssignments = async (targetUser, timestamp) => {
  if (targetUser.role === "student") {
    return removeStudentFromQueueAndTrips(targetUser._id, timestamp);
  }

  if (targetUser.role === "driver") {
    return removeDriverFromActiveTrips(targetUser._id, timestamp);
  }

  return [];
};

const disconnectUserSockets = async (userId) => {
  const io = getIO();
  if (!io) {
    return;
  }

  await io.in(`user:${userId}`).disconnectSockets(true);
};

const emitPostRemovalUpdates = async (rideIds) => {
  try {
    await processQueue();

    for (const rideId of rideIds) {
      // eslint-disable-next-line no-await-in-loop
      await emitRideState(rideId);
    }
  } catch (_error) {
    // Snapshot and ride emits are best-effort for admin account actions.
  }
};

const removeUserAccount = async ({ targetUser, adminUserId, permanent }) => {
  await ensureAdminCanRemoveUser(adminUserId, targetUser);

  const now = new Date();
  const affectedRideIds = await cleanupActiveAssignments(targetUser, now);

  if (permanent) {
    await User.deleteOne({ _id: targetUser._id });
  } else if (targetUser.isActive !== false || targetUser.status !== "inactive") {
    targetUser.isActive = false;
    targetUser.status = "inactive";
    targetUser.deactivatedAt = now;
    targetUser.deactivatedBy = adminUserId;
    await targetUser.save();
  }

  await disconnectUserSockets(targetUser._id.toString());
  await emitPostRemovalUpdates(affectedRideIds);

  return {
    userId: targetUser._id.toString(),
    email: targetUser.email,
    action: permanent ? "deleted" : "deactivated",
  };
};

const reactivateUserAccount = async (targetUser) => {
  if (targetUser.isActive !== false && targetUser.status === "active") {
    return {
      userId: targetUser._id.toString(),
      email: targetUser.email,
      action: "already_active",
      user: toSafeUser(targetUser),
    };
  }

  targetUser.isActive = true;
  targetUser.status = "active";
  targetUser.deactivatedAt = null;
  targetUser.deactivatedBy = null;
  await targetUser.save();

  return {
    userId: targetUser._id.toString(),
    email: targetUser.email,
    action: "reactivated",
    user: toSafeUser(targetUser),
  };
};

const getUsers = asyncHandler(async (req, res) => {
  const { q = "", role } = req.query;

  const filter = {};
  if (role) {
    filter.role = role;
  }

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }

  const users = await User.find(filter).sort({ createdAt: -1 });

  return success(res, {
    users: users.map(toSafeUser),
  });
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, vehicleNumber } = req.body;
  const normalizedEmail = email.toLowerCase();
  const loginUrl = process.env.APP_LOGIN_URL || process.env.FRONTEND_URL || "http://localhost:5173/login";

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    if (existing.isActive === false) {
      throw new ApiError(409, "User is deactivated. Use Reactivate option.");
    }

    throw new ApiError(409, "Email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const [user] = await User.insertMany([
    {
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      status: "active",
      isActive: true,
      deactivatedAt: null,
      deactivatedBy: null,
      vehicleNumber: role === "driver" ? vehicleNumber || null : null,
    },
  ]);

  const mailHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
      <h2 style="margin-bottom: 8px;">Welcome to Auto Mate</h2>
      <p>Your account has been created by an admin.</p>
      <p><strong>Login Email:</strong> ${normalizedEmail}</p>
      <p><strong>Assigned Password:</strong> ${password}</p>
      <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Please change your password immediately after your first login.</p>
    </div>
  `;

  let emailSent = true;
  let emailError = null;
  try {
    await sendMail(
      normalizedEmail,
      "Your Auto Mate Account Credentials",
      mailHtml,
    );
  } catch (mailError) {
    emailSent = false;
    emailError = mailError instanceof Error ? mailError.message : "Unknown email delivery error";
    // eslint-disable-next-line no-console
    console.error(
      `[admin:user:create] credentials email failed for ${normalizedEmail}: ${emailError}`,
    );
  }

  return success(
    res,
    { user: toSafeUser(user), emailSent, emailError },
    emailSent ? "User created and email sent" : "User created, but failed to send email",
    201,
  );
});

const removeUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const permanent = parsePermanentFlag(req.query.permanent);

  const targetUser = await User.findById(id);
  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  const result = await removeUserAccount({
    targetUser,
    adminUserId: req.user._id,
    permanent,
  });

  return success(
    res,
    result,
    permanent ? "User deleted permanently" : "User deactivated",
  );
});

const removeUserByEmail = asyncHandler(async (req, res) => {
  const email = req.body.email?.toLowerCase?.();
  const permanent = parsePermanentFlag(req.body.permanent);

  const targetUser = await User.findOne({ email });
  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  const result = await removeUserAccount({
    targetUser,
    adminUserId: req.user._id,
    permanent,
  });

  return success(
    res,
    result,
    permanent ? "User deleted permanently" : "User deactivated",
  );
});

const reactivateUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const targetUser = await User.findById(id);

  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  const result = await reactivateUserAccount(targetUser);

  return success(
    res,
    result,
    result.action === "already_active" ? "User already active" : "User reactivated",
  );
});

const reactivateUserByEmail = asyncHandler(async (req, res) => {
  const email = req.body.email?.toLowerCase?.();
  const targetUser = await User.findOne({ email });

  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  const result = await reactivateUserAccount(targetUser);

  return success(
    res,
    result,
    result.action === "already_active" ? "User already active" : "User reactivated",
  );
});

const resetUserPasswordById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const targetUser = await User.findById(id).select("_id email name");

  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  const temporaryPassword = generateTemporaryPassword();
  const hashedPassword = await bcrypt.hash(temporaryPassword, 12);
  const updatePayload = {
    password: hashedPassword,
  };

  if (User.schema.path("passwordResetRequired")) {
    updatePayload.passwordResetRequired = true;
  }

  await User.updateOne(
    { _id: targetUser._id },
    { $set: updatePayload },
  );

  const loginUrl = process.env.APP_LOGIN_URL || process.env.FRONTEND_URL || "http://localhost:5173/login";
  const mailHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
      <h2 style="margin-bottom: 8px;">Auto Mate Password Reset</h2>
      <p>An admin reset your password.</p>
      <p><strong>Temporary Password:</strong> ${temporaryPassword}</p>
      <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Please login and change your password immediately.</p>
    </div>
  `;

  try {
    await sendMail(
      targetUser.email,
      "Your Auto Mate Temporary Password",
      mailHtml,
    );
  } catch (mailError) {
    const emailError = mailError instanceof Error ? mailError.message : "Unknown email delivery error";
    // eslint-disable-next-line no-console
    console.error(
      `[admin:user:reset-password] email failed for ${targetUser.email}: ${emailError}`,
    );
    throw new ApiError(500, `Failed to send reset password email: ${emailError}`);
  }

  return success(
    res,
    { userId: targetUser._id.toString() },
    "Temporary password sent to user email",
  );
});

const permanentDeleteUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const targetUser = await User.findById(id).select("_id email role");

  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  await ensureAdminCanRemoveUser(req.user._id, targetUser);
  const result = await permanentDeleteUserWithCleanup({
    userId: targetUser._id,
    role: targetUser.role,
  });

  // eslint-disable-next-line no-console
  console.info(
    `[admin:user:permanent-delete] adminId=${req.user._id.toString()} deletedUserId=${result.deletedUserId} timestamp=${result.deletedAt}`,
  );

  return success(
    res,
    { userId: result.deletedUserId },
    "User permanently deleted",
  );
});

module.exports = {
  getUsers,
  createUser,
  removeUserById,
  removeUserByEmail,
  reactivateUserById,
  reactivateUserByEmail,
  resetUserPasswordById,
  permanentDeleteUserById,
};
