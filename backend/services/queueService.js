const QueueEntry = require("../models/QueueEntry");
const Ride = require("../models/Ride");
const Trip = require("../models/Trip");
const User = require("../models/User");
const Complaint = require("../models/Complaint");
const ApiError = require("../utils/ApiError");
const {
  emitToRole,
  emitToRide,
  emitToUser,
  addUsersToTripRoom,
  removeUsersFromTripRoom,
} = require("./socketService");

const MAX_RIDE_SIZE = 4;
const ACTIVE_QUEUE_STATUSES = ["waiting", "assigned", "pickup", "in-transit"];
const QUEUE_SORT = { queueAt: 1, createdAt: 1, _id: 1 };
const QUEUE_WATCHER_ROLES = ["student", "driver", "admin"];

const emitToQueueWatchers = (event, payload) => {
  for (const role of QUEUE_WATCHER_ROLES) {
    emitToRole(role, event, payload);
  }
};

const estimateWaitMinutes = (queuePosition, status) => {
  if (status === "waiting") {
    return Math.max(1, queuePosition || 1) * 3;
  }

  if (status === "assigned") {
    return 3;
  }

  if (status === "pickup") {
    return 1;
  }

  return 0;
};

const formatRideStatus = (status) => {
  if (status === "forming") {
    return "waiting";
  }

  if (status === "ready") {
    return "assigned";
  }

  return status;
};

const loadRideWithDetails = async (rideId) => {
  return Ride.findById(rideId)
    .populate("driver", "name email role")
    .populate({
      path: "students",
      populate: {
        path: "student",
        select: "name email role",
      },
    });
};

const serializeRideForDriver = (ride) => {
  if (!ride) {
    return null;
  }

  return {
    id: ride._id.toString(),
    status: formatRideStatus(ride.status),
    seatsFilled: ride.students.length,
    maxSeats: ride.maxSeats,
    driver: ride.driver
      ? {
          id: ride.driver._id.toString(),
          name: ride.driver.name,
          email: ride.driver.email,
        }
      : null,
    students: ride.students.map((entry) => ({
      queueEntryId: entry._id.toString(),
      id: entry.student?._id?.toString() || null,
      name: entry.student?.name || "Unknown",
      email: entry.student?.email || "",
      pickup: entry.pickup,
      destination: entry.destination,
      status: entry.status,
      cancelCount: entry.cancelCount,
    })),
    createdAt: ride.createdAt,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
  };
};

const emitQueueSnapshot = async () => {
  const waitingEntries = await QueueEntry.find({ status: "waiting" })
    .sort(QUEUE_SORT)
    .populate("student", "name email");

  const waiting = waitingEntries.map((entry, index) => ({
    id: entry._id.toString(),
    studentId: entry.student?._id?.toString() || null,
    studentName: entry.student?.name || "Unknown",
    pickup: entry.pickup,
    destination: entry.destination,
    status: entry.status,
    position: index + 1,
    queueAt: entry.queueAt,
  }));

  const payload = {
    waiting,
    totalWaiting: waiting.length,
    updatedAt: new Date().toISOString(),
  };

  emitToQueueWatchers("queue:updated", payload);
  emitToQueueWatchers("queue:count", {
    totalWaiting: waiting.length,
    updatedAt: payload.updatedAt,
  });
};

const emitRideState = async (rideId) => {
  const ride = await loadRideWithDetails(rideId);
  if (!ride) {
    return;
  }

  const serializedRide = serializeRideForDriver(ride);
  const payload = { ride: serializedRide };

  emitToRide(ride._id.toString(), "ride:updated", payload);
  emitToRole("admin", "ride:updated", payload);
};

const processQueue = async () => {
  await emitQueueSnapshot();
};

const getStudentCurrentRide = async (studentId) => {
  const entry = await QueueEntry.findOne({
    student: studentId,
    status: { $in: ACTIVE_QUEUE_STATUSES },
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .populate("driver", "name email role")
    .populate({ path: "ride", populate: { path: "driver", select: "name email role" } });

  if (!entry) {
    return null;
  }

  let queuePosition = null;
  if (entry.status === "waiting") {
    const waitingEntries = await QueueEntry.find({ status: "waiting" })
      .sort(QUEUE_SORT)
      .select("_id");

    queuePosition = waitingEntries.findIndex((item) => item._id.toString() === entry._id.toString()) + 1;
  }

  if (!queuePosition && entry.ride?.students?.length) {
    queuePosition =
      entry.ride.students.findIndex((id) => id.toString() === entry._id.toString()) + 1 || null;
  }

  const driver = entry.driver || entry.ride?.driver || null;

  return {
    id: entry._id.toString(),
    status: entry.status,
    pickup: entry.pickup,
    destination: entry.destination,
    queuePosition,
    estimatedWaitMinutes: estimateWaitMinutes(queuePosition, entry.status),
    cancelCount: entry.cancelCount,
    rideId: entry.ride?._id?.toString() || null,
    driver: driver
      ? {
          id: driver._id.toString(),
          name: driver.name,
          email: driver.email,
        }
      : null,
    updatedAt: entry.updatedAt,
  };
};

const bookRide = async (studentId, pickup, destination) => {
  try {
    const result = await QueueEntry.updateOne(
      {
        student: studentId,
        status: { $in: ACTIVE_QUEUE_STATUSES },
      },
      {
        $setOnInsert: {
          student: studentId,
          pickup,
          destination,
          status: "waiting",
          queueAt: new Date(),
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount === 0) {
      throw new ApiError(409, "You already have an active booking");
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error?.code === 11000) {
      throw new ApiError(409, "You already have an active booking");
    }

    throw error;
  }

  await emitQueueSnapshot();
  return getStudentCurrentRide(studentId);
};

const leaveQueue = async (studentId) => {
  const queueEntry = await QueueEntry.findOneAndUpdate(
    {
      student: studentId,
      status: "waiting",
    },
    {
      $set: {
        status: "removed",
        ride: null,
        driver: null,
        completedAt: new Date(),
      },
    },
    {
      new: true,
      sort: QUEUE_SORT,
    },
  );

  if (!queueEntry) {
    const lockedEntry = await QueueEntry.findOne({
      student: studentId,
      status: { $in: ["assigned", "pickup", "in-transit"] },
    }).select("_id");

    if (lockedEntry) {
      throw new ApiError(409, "Cannot leave queue after trip is locked");
    }

    throw new ApiError(404, "No waiting queue entry found");
  }

  await emitQueueSnapshot();
  const payload = {
    queueEntryId: queueEntry._id.toString(),
    status: queueEntry.status,
  };
  emitToUser(studentId.toString(), "queue:left", payload);
  return payload;
};

const getStudentRideHistory = async (studentId) => {
  const entries = await QueueEntry.find({
    student: studentId,
    status: { $nin: ACTIVE_QUEUE_STATUSES },
  })
    .sort({ updatedAt: -1 })
    .populate("driver", "name")
    .populate({ path: "ride", populate: { path: "driver", select: "name" } });

  return entries.map((entry) => {
    const driverName = entry.driver?.name || entry.ride?.driver?.name || "Not assigned";
    const date = entry.completedAt || entry.updatedAt || entry.createdAt;

    return {
      id: entry._id.toString(),
      date: new Date(date).toLocaleString(),
      from: entry.pickup,
      to: entry.destination,
      status: entry.status === "removed" ? "cancelled" : entry.status,
      driver: driverName,
      fare: "—",
    };
  });
};

const getDriverCurrentRide = async (driverId) => {
  const ride = await Ride.findOne({
    driver: driverId,
    status: "in-transit",
  })
    .sort({ createdAt: 1 })
    .populate("driver", "name email role")
    .populate({
      path: "students",
      populate: {
        path: "student",
        select: "name email role",
      },
    });

  const [waitingCount, waitingEntries] = await Promise.all([
    QueueEntry.countDocuments({ status: "waiting" }),
    QueueEntry.find({ status: "waiting" })
      .sort(QUEUE_SORT)
      .limit(MAX_RIDE_SIZE)
      .populate("student", "name email role"),
  ]);

  let queuePreviewRide = null;
  if (!ride && waitingEntries.length > 0) {
    queuePreviewRide = {
      id: "queue-preview",
      status: "waiting",
      seatsFilled: waitingEntries.length,
      maxSeats: MAX_RIDE_SIZE,
      driver: null,
      students: waitingEntries.map((entry) => ({
        queueEntryId: entry._id.toString(),
        id: entry.student?._id?.toString() || null,
        name: entry.student?.name || "Unknown",
        email: entry.student?.email || "",
        pickup: entry.pickup,
        destination: entry.destination,
        status: "waiting",
        cancelCount: entry.cancelCount,
      })),
      createdAt: waitingEntries[0].createdAt,
      startedAt: null,
      completedAt: null,
    };
  }

  return {
    ride: serializeRideForDriver(ride) || queuePreviewRide,
    waitingCount,
  };
};

const requireDriverQueueEntry = async (driverId, queueEntryId) => {
  const queueEntry = await QueueEntry.findById(queueEntryId).populate("student", "name email");
  if (!queueEntry) {
    throw new ApiError(404, "Queue entry not found");
  }

  if (!queueEntry.ride) {
    throw new ApiError(400, "Queue entry is not assigned to a ride");
  }

  const ride = await Ride.findById(queueEntry.ride);
  if (!ride) {
    throw new ApiError(404, "Ride not found");
  }

  if (!ride.driver || ride.driver.toString() !== driverId.toString()) {
    throw new ApiError(403, "This ride is not assigned to you");
  }

  return { queueEntry, ride };
};

const markStudentArrived = async (driverId, queueEntryId) => {
  const { queueEntry, ride } = await requireDriverQueueEntry(driverId, queueEntryId);

  if (!["assigned", "pickup"].includes(queueEntry.status)) {
    throw new ApiError(400, "Only assigned students can be marked arrived");
  }

  queueEntry.status = "pickup";
  queueEntry.arrivedAt = new Date();
  await queueEntry.save();

  await emitRideState(ride._id.toString());
  await emitQueueSnapshot();

  return {
    queueEntryId: queueEntry._id.toString(),
    status: queueEntry.status,
  };
};

const cancelStudentFromRide = async (driverId, queueEntryId) => {
  const queueEntry = await QueueEntry.findById(queueEntryId).select(
    "_id student status cancelCount ride driver",
  );
  if (!queueEntry) {
    throw new ApiError(404, "Queue entry not found");
  }

  if (!["waiting", "assigned"].includes(queueEntry.status)) {
    throw new ApiError(400, "Only waiting or assigned students can be cancelled");
  }

  const entryDriverId = queueEntry.driver?.toString() || null;
  if (entryDriverId && entryDriverId !== driverId.toString()) {
    throw new ApiError(403, "This queue entry is not assigned to you");
  }

  const rideId = queueEntry.ride?.toString() || null;
  if (rideId) {
    const ride = await Ride.findById(rideId).select("_id status driver");
    if (!ride) {
      throw new ApiError(404, "Ride not found");
    }

    if (ride.driver && ride.driver.toString() !== driverId.toString()) {
      throw new ApiError(403, "This ride is not assigned to you");
    }

    if (ride.status === "in-transit") {
      throw new ApiError(400, "Cannot cancel a student after trip has started");
    }
  }

  const isFirstCancel = queueEntry.cancelCount < 1;
  const nextStatus = isFirstCancel ? "waiting" : "cancelled";
  const nextCancelCount = queueEntry.cancelCount + 1;
  const now = new Date();

  const updateFilter = {
    _id: queueEntry._id,
    status: queueEntry.status,
    cancelCount: queueEntry.cancelCount,
  };

  if (rideId) {
    updateFilter.ride = queueEntry.ride;
  } else {
    updateFilter.ride = null;
  }

  if (queueEntry.driver) {
    updateFilter.driver = queueEntry.driver;
  } else {
    updateFilter.driver = null;
  }

  const updateResult = await QueueEntry.updateOne(
    updateFilter,
    {
      $inc: { cancelCount: 1 },
      $set: {
        status: nextStatus,
        queueAt: isFirstCancel ? now : queueEntry.queueAt || now,
        ride: null,
        driver: null,
        ...(isFirstCancel ? {} : { completedAt: now }),
      },
      $unset: {
        arrivedAt: 1,
        startedAt: 1,
        ...(isFirstCancel ? { completedAt: 1 } : {}),
      },
    },
  );

  if (updateResult.modifiedCount !== 1) {
    throw new ApiError(409, "Queue entry changed. Please retry.");
  }

  if (rideId) {
    await Ride.updateOne(
      { _id: rideId, status: { $ne: "in-transit" } },
      { $pull: { students: queueEntry._id } },
    );
  }

  await emitQueueSnapshot();

  if (rideId) {
    await emitRideState(rideId);
  }

  const queueEventPayload = {
    queueEntryId: queueEntry._id.toString(),
    studentId: queueEntry.student.toString(),
    cancelCount: nextCancelCount,
    status: nextStatus,
    updatedAt: now.toISOString(),
  };

  if (isFirstCancel) {
    emitToQueueWatchers("student:requeued", queueEventPayload);
    emitToQueueWatchers("queue:reordered", queueEventPayload);
  } else {
    emitToQueueWatchers("student:removed", queueEventPayload);
  }

  return {
    queueEntryId: queueEntry._id.toString(),
    status: nextStatus,
    cancelCount: nextCancelCount,
  };
};

const claimNextWaitingEntry = async (driverId, startedAt) => {
  return QueueEntry.findOneAndUpdate(
    { status: "waiting" },
    {
      $set: {
        status: "assigned",
        driver: driverId,
        startedAt,
      },
    },
    {
      sort: QUEUE_SORT,
      new: true,
    },
  );
};

const startTrip = async (driverId) => {
  const existingRide = await Ride.findOne({
    driver: driverId,
    status: "in-transit",
  }).sort({ createdAt: 1 });

  if (existingRide) {
    throw new ApiError(409, "You already have an active trip");
  }

  const startedAt = new Date();
  const claimedEntries = [];

  for (let i = 0; i < MAX_RIDE_SIZE; i += 1) {
    const entry = await claimNextWaitingEntry(driverId, startedAt);
    if (!entry) {
      break;
    }

    claimedEntries.push(entry);
  }

  if (claimedEntries.length === 0) {
    throw new ApiError(400, "No students waiting in queue");
  }

  const queueEntryIds = claimedEntries.map((entry) => entry._id);
  const studentIds = claimedEntries.map((entry) => entry.student);
  const pickupPoints = [...new Set(claimedEntries.map((entry) => entry.pickup))];
  const destinations = [...new Set(claimedEntries.map((entry) => entry.destination))];

  let ride = null;

  try {
    ride = await Ride.create({
      driver: driverId,
      students: queueEntryIds,
      status: "in-transit",
      maxSeats: MAX_RIDE_SIZE,
      startedAt,
    });

    const lockResult = await QueueEntry.updateMany(
      {
        _id: { $in: queueEntryIds },
        status: "assigned",
        driver: driverId,
      },
      {
        $set: {
          status: "in-transit",
          ride: ride._id,
          startedAt,
        },
      },
    );

    if (lockResult.modifiedCount !== queueEntryIds.length) {
      throw new ApiError(409, "Queue changed while starting trip. Please retry.");
    }

    await Trip.findOneAndUpdate(
      { ride: ride._id },
      {
        ride: ride._id,
        driver: driverId,
        students: studentIds,
        pickupPoints,
        destinations,
        status: "in-transit",
        startedAt,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    await QueueEntry.updateMany(
      {
        _id: { $in: queueEntryIds },
        status: "assigned",
        driver: driverId,
        ride: null,
      },
      {
        $set: {
          status: "waiting",
          driver: null,
        },
        $unset: {
          startedAt: 1,
        },
      },
    );

    if (ride?._id) {
      await Ride.deleteOne({ _id: ride._id });
      await Trip.deleteOne({ ride: ride._id });
    }

    if (error?.code === 11000) {
      throw new ApiError(409, "You already have an active trip");
    }

    throw error;
  }

  await emitQueueSnapshot();

  try {
    await addUsersToTripRoom(
      [driverId.toString(), ...studentIds.map((studentId) => studentId.toString())],
      ride._id.toString(),
    );
  } catch (_error) {
    // Room join updates are best-effort and should not break trip creation.
  }

  await emitRideState(ride._id.toString());

  const tripPayload = {
    rideId: ride._id.toString(),
    startedAt: startedAt.toISOString(),
    seatsFilled: queueEntryIds.length,
    maxSeats: MAX_RIDE_SIZE,
  };

  emitToUser(driverId.toString(), "trip:started", tripPayload);
  emitToRole("admin", "trip:started", tripPayload);

  for (const studentId of studentIds) {
    emitToUser(studentId.toString(), "trip:assigned", tripPayload);
  }

  return getDriverCurrentRide(driverId);
};

const completeTrip = async (driverId) => {
  const ride = await Ride.findOne({
    driver: driverId,
    status: "in-transit",
  }).sort({ createdAt: 1 });

  if (!ride) {
    throw new ApiError(404, "No in-transit ride found");
  }

  ride.status = "completed";
  ride.completedAt = new Date();
  await ride.save();

  await QueueEntry.updateMany(
    { _id: { $in: ride.students } },
    {
      $set: {
        status: "completed",
        completedAt: ride.completedAt,
      },
    },
  );

  await Trip.findOneAndUpdate(
    { ride: ride._id },
    {
      $set: {
        status: "completed",
        completedAt: ride.completedAt,
      },
    },
  );

  await emitRideState(ride._id.toString());
  await emitQueueSnapshot();

  try {
    const studentIds = await QueueEntry.find({ _id: { $in: ride.students } }).distinct("student");
    await removeUsersFromTripRoom(
      [driverId.toString(), ...studentIds.map((studentId) => studentId.toString())],
      ride._id.toString(),
    );
  } catch (_error) {
    // Room leave updates are best-effort and should not break trip completion.
  }

  emitToUser(driverId.toString(), "trip:completed", {
      rideId: ride._id.toString(),
      driver: driverId,
      completedAt: ride.completedAt.toISOString(),
    },
  );

  return {
    rideId: ride._id.toString(),
    status: ride.status,
  };
};

const getAdminQueueOverview = async () => {
  const waitingEntries = await QueueEntry.find({ status: "waiting" })
    .sort(QUEUE_SORT)
    .populate("student", "name email role");

  const activeRides = await Ride.find({ status: { $in: ["forming", "ready", "in-transit"] } })
    .sort({ createdAt: 1 })
    .populate("driver", "name email role")
    .populate({
      path: "students",
      populate: {
        path: "student",
        select: "name email role",
      },
    });

  return {
    waitingQueue: waitingEntries.map((entry, index) => ({
      id: entry._id.toString(),
      student: entry.student
        ? {
            id: entry.student._id.toString(),
            name: entry.student.name,
            email: entry.student.email,
          }
        : null,
      pickup: entry.pickup,
      destination: entry.destination,
      position: index + 1,
      status: entry.status,
      queueAt: entry.queueAt,
    })),
    activeRides: activeRides.map((ride) => serializeRideForDriver(ride)),
  };
};

const getAdminStats = async () => {
  const [students, drivers, activeQueue, complaints] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "driver" }),
    QueueEntry.countDocuments({ status: { $in: ACTIVE_QUEUE_STATUSES } }),
    Complaint.countDocuments({ status: { $in: ["submitted", "in_review", "waiting", "assigned"] } }),
  ]);

  return {
    students,
    drivers,
    activeQueue,
    complaints,
  };
};

const getActiveRideForUser = async (userId, role) => {
  if (role === "student") {
    const queueEntry = await QueueEntry.findOne({
      student: userId,
      status: { $in: ["assigned", "pickup", "in-transit"] },
      ride: { $ne: null },
    })
      .sort({ updatedAt: -1 })
      .populate("driver", "name email role")
      .populate({
        path: "ride",
        populate: {
          path: "driver",
          select: "name email role",
        },
      });

    if (!queueEntry || !queueEntry.ride) {
      return null;
    }

    return {
      rideId: queueEntry.ride._id.toString(),
      otherUser: queueEntry.driver || queueEntry.ride.driver || null,
    };
  }

  if (role === "driver") {
    const ride = await Ride.findOne({
      driver: userId,
      status: "in-transit",
    })
      .sort({ createdAt: 1 })
      .populate({
        path: "students",
        populate: {
          path: "student",
          select: "name email role",
        },
      });

    if (!ride) {
      return null;
    }

    const firstStudent = ride.students[0]?.student || null;
    return {
      rideId: ride._id.toString(),
      otherUser: firstStudent,
    };
  }

  return null;
};

module.exports = {
  processQueue,
  bookRide,
  leaveQueue,
  getStudentCurrentRide,
  getStudentRideHistory,
  getDriverCurrentRide,
  markStudentArrived,
  cancelStudentFromRide,
  startTrip,
  completeTrip,
  getAdminQueueOverview,
  getAdminStats,
  getActiveRideForUser,
  loadRideWithDetails,
  emitRideState,
};
