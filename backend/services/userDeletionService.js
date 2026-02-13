const mongoose = require("mongoose");
const QueueEntry = require("../models/QueueEntry");
const Ride = require("../models/Ride");
const Trip = require("../models/Trip");
const Message = require("../models/Message");
const Complaint = require("../models/Complaint");
const User = require("../models/User");
const { getIO } = require("../config/socket");
const { processQueue, emitRideState } = require("./queueService");

const ACTIVE_QUEUE_STATUSES = ["waiting", "assigned", "pickup", "in-transit"];
const ACTIVE_RIDE_STATUSES = ["forming", "ready", "in-transit"];

const toObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  return new mongoose.Types.ObjectId(value);
};

const loadOptionalNotificationModel = () => {
  if (mongoose.models.Notification) {
    return mongoose.models.Notification;
  }

  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    return require("../models/Notification");
  } catch (_error) {
    return null;
  }
};

const disconnectUserSockets = async (userId) => {
  const io = getIO();
  if (!io) {
    return;
  }

  await io.in(`user:${userId}`).disconnectSockets(true);
};

const cleanupQueueForStudent = async (studentObjectId, now) => {
  const activeEntries = await QueueEntry.find({
    student: studentObjectId,
    status: { $in: ACTIVE_QUEUE_STATUSES },
  }).select("_id ride");

  if (activeEntries.length === 0) {
    return [];
  }

  const queueEntryIds = activeEntries.map((entry) => entry._id);
  const impactedRideIds = [...new Set(
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
        completedAt: now,
      },
      $unset: {
        arrivedAt: 1,
        startedAt: 1,
      },
    },
  );

  if (impactedRideIds.length > 0) {
    await Ride.updateMany(
      { _id: { $in: impactedRideIds } },
      { $pull: { students: { $in: queueEntryIds } } },
    );
  }

  return impactedRideIds;
};

const cleanupActiveRidesForDriver = async (driverObjectId, now) => {
  const activeRides = await Ride.find({
    driver: driverObjectId,
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
          queueAt: now,
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
        completedAt: now,
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
        completedAt: now,
      },
    },
  );

  await QueueEntry.updateMany(
    {
      driver: driverObjectId,
      status: { $in: ACTIVE_QUEUE_STATUSES },
    },
    {
      $set: {
        driver: null,
      },
      $unset: {
        arrivedAt: 1,
      },
    },
  );

  return rideIds;
};

const cancelEmptyActiveRides = async (rideIds, now) => {
  if (rideIds.length === 0) {
    return [];
  }

  const emptyActiveRides = await Ride.find({
    _id: { $in: rideIds },
    status: { $in: ACTIVE_RIDE_STATUSES },
    students: { $size: 0 },
  }).select("_id");

  if (emptyActiveRides.length === 0) {
    return [];
  }

  const emptyRideIds = emptyActiveRides.map((ride) => ride._id.toString());

  await Ride.updateMany(
    { _id: { $in: emptyRideIds } },
    {
      $set: {
        status: "cancelled",
        completedAt: now,
      },
    },
  );

  await Trip.updateMany(
    { ride: { $in: emptyRideIds }, status: "in-transit" },
    {
      $set: {
        status: "cancelled",
        completedAt: now,
      },
    },
  );

  return emptyRideIds;
};

const annotateTripAndRideHistoryForDeletedUser = async ({ userObjectId, role, now }) => {
  const userId = userObjectId.toString();
  const marker = {
    deletedUser: true,
    oldUserId: userId,
    deletedAt: now,
  };

  const tripOps = [];
  const rideOps = [];

  if (role === "driver") {
    tripOps.push(
      Trip.updateMany(
        { driver: userObjectId },
        {
          $set: {
            driver: null,
            deletedDriver: marker,
          },
        },
        { strict: false },
      ),
    );

    rideOps.push(
      Ride.updateMany(
        { driver: userObjectId },
        {
          $set: {
            driver: null,
            deletedDriver: marker,
          },
        },
        { strict: false },
      ),
    );
  }

  if (role === "student") {
    tripOps.push(
      Trip.updateMany(
        { students: userObjectId },
        {
          $pull: { students: userObjectId },
          $addToSet: {
            deletedStudents: marker,
          },
        },
        { strict: false },
      ),
    );
  }

  if (tripOps.length > 0) {
    await Promise.all(tripOps);
  }

  if (rideOps.length > 0) {
    await Promise.all(rideOps);
  }
};

const annotateChatMessages = async ({ userObjectId, now }) => {
  const marker = {
    deletedUser: true,
    oldUserId: userObjectId.toString(),
    deletedAt: now,
  };

  await Message.updateMany(
    {
      $or: [
        { senderId: userObjectId },
        { sender: userObjectId },
      ],
    },
    {
      $set: {
        senderDeleted: true,
        deletedSender: marker,
      },
    },
    { strict: false },
  );
};

const cleanupComplaintsAndNotifications = async ({ userObjectId }) => {
  await Complaint.deleteMany({ student: userObjectId });
  await Complaint.updateMany(
    { resolvedBy: userObjectId },
    { $set: { resolvedBy: null } },
  );

  const NotificationModel = loadOptionalNotificationModel();
  if (!NotificationModel) {
    return;
  }

  await NotificationModel.deleteMany({
    $or: [
      { user: userObjectId },
      { recipient: userObjectId },
      { sender: userObjectId },
      { createdBy: userObjectId },
    ],
  });
};

const emitCleanupUpdates = async (rideIds) => {
  if (rideIds.length === 0) {
    await processQueue();
    return;
  }

  await processQueue();

  for (const rideId of rideIds) {
    // eslint-disable-next-line no-await-in-loop
    await emitRideState(rideId);
  }
};

const permanentDeleteUserWithCleanup = async ({ userId, role }) => {
  const userObjectId = toObjectId(userId);
  const now = new Date();

  const impactedRideIds = new Set();

  if (role === "student") {
    const studentRideIds = await cleanupQueueForStudent(userObjectId, now);
    for (const rideId of studentRideIds) {
      impactedRideIds.add(rideId);
    }
  }

  if (role === "driver") {
    const driverRideIds = await cleanupActiveRidesForDriver(userObjectId, now);
    for (const rideId of driverRideIds) {
      impactedRideIds.add(rideId);
    }
  }

  await annotateTripAndRideHistoryForDeletedUser({
    userObjectId,
    role,
    now,
  });

  const emptyRideIds = await cancelEmptyActiveRides([...impactedRideIds], now);
  for (const rideId of emptyRideIds) {
    impactedRideIds.add(rideId);
  }

  await annotateChatMessages({ userObjectId, now });
  await cleanupComplaintsAndNotifications({ userObjectId });
  await disconnectUserSockets(userObjectId.toString());

  await User.deleteOne({ _id: userObjectId });

  await emitCleanupUpdates([...impactedRideIds]);

  return {
    deletedUserId: userObjectId.toString(),
    impactedRideIds: [...impactedRideIds],
    deletedAt: now.toISOString(),
  };
};

module.exports = {
  permanentDeleteUserWithCleanup,
};
