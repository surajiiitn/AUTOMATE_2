const User = require("../models/User");
const QueueEntry = require("../models/QueueEntry");
const Ride = require("../models/Ride");
const Trip = require("../models/Trip");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const ApiError = require("../utils/ApiError");
const { getIO } = require("../config/socket");
const { processQueue, emitRideState } = require("../services/queueService");

const ACTIVE_QUEUE_STATUSES = ["waiting", "assigned", "pickup", "in-transit"];
const ACTIVE_RIDE_STATUSES = ["forming", "ready", "in-transit"];

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

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new ApiError(409, "Email already exists");
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    status: "active",
    isActive: true,
    deactivatedAt: null,
    deactivatedBy: null,
    vehicleNumber: role === "driver" ? vehicleNumber || null : null,
  });

  return success(res, { user: toSafeUser(user) }, "User created", 201);
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

module.exports = {
  getUsers,
  createUser,
  removeUserById,
  removeUserByEmail,
};
