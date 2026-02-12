const QueueEntry = require("../models/QueueEntry");
const Ride = require("../models/Ride");
const Trip = require("../models/Trip");
const User = require("../models/User");
const Complaint = require("../models/Complaint");
const ApiError = require("../utils/ApiError");
const { emitToAll, emitToRole, emitToRide, emitToUser } = require("./socketService");

const MAX_RIDE_SIZE = 4;
const ACTIVE_QUEUE_STATUSES = ["waiting", "assigned", "pickup", "in-transit"];

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

const getAvailableDriver = async () => {
  const busyDriverIds = await Ride.distinct("driver", {
    status: { $in: ["forming", "ready", "in-transit"] },
    driver: { $ne: null },
  });

  return User.findOne({
    role: "driver",
    status: "active",
    _id: { $nin: busyDriverIds },
  }).sort({ createdAt: 1 });
};

const emitQueueSnapshot = async () => {
  const waitingEntries = await QueueEntry.find({ status: "waiting" })
    .sort({ queueAt: 1, createdAt: 1 })
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

  emitToAll("queue:updated", payload);
  emitToRole("admin", "queue:updated", payload);
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

  if (ride.driver) {
    emitToUser(ride.driver._id.toString(), "ride:updated", payload);
  }

  for (const entry of ride.students) {
    if (entry.student?._id) {
      emitToUser(entry.student._id.toString(), "ride:updated", payload);
    }
  }
};

const notifyRideFull = async (rideId) => {
  const ride = await loadRideWithDetails(rideId);
  if (!ride) {
    return;
  }

  const payload = {
    message: "Ride group is full and ready for driver action",
    ride: serializeRideForDriver(ride),
  };

  if (ride.driver) {
    emitToUser(ride.driver._id.toString(), "ride:full", payload);
  }

  emitToRole("driver", "ride:full", payload);
  emitToRole("admin", "ride:full", payload);
};

const assignDriverIfPossible = async (ride) => {
  if (ride.driver || ride.students.length < ride.maxSeats) {
    return false;
  }

  const driver = await getAvailableDriver();
  if (!driver) {
    return false;
  }

  ride.driver = driver._id;
  await QueueEntry.updateMany(
    { _id: { $in: ride.students } },
    {
      $set: {
        driver: driver._id,
      },
    },
  );

  return true;
};

const processQueue = async () => {
  const waitingEntries = await QueueEntry.find({ status: "waiting" }).sort({ queueAt: 1, createdAt: 1 });
  const openRides = await Ride.find({ status: { $in: ["forming", "ready"] } }).sort({ createdAt: 1 });

  let cursor = 0;
  const impactedRideIds = new Set();
  const newlyReadyRideIds = new Set();

  for (const ride of openRides) {
    const wasReady = ride.status === "ready" && ride.students.length >= ride.maxSeats;

    while (ride.students.length < ride.maxSeats && cursor < waitingEntries.length) {
      const entry = waitingEntries[cursor];
      cursor += 1;

      if (entry.status !== "waiting") {
        continue;
      }

      ride.students.push(entry._id);
      entry.status = "assigned";
      entry.ride = ride._id;
      if (ride.driver) {
        entry.driver = ride.driver;
      }
      await entry.save();
    }

    ride.status = ride.students.length >= ride.maxSeats ? "ready" : "forming";
    const driverAssignedNow = await assignDriverIfPossible(ride);
    await ride.save();

    impactedRideIds.add(ride._id.toString());
    const becameReady = !wasReady && ride.status === "ready";
    if (becameReady || driverAssignedNow) {
      newlyReadyRideIds.add(ride._id.toString());
    }
  }

  while (waitingEntries.length - cursor >= MAX_RIDE_SIZE) {
    const ride = await Ride.create({
      status: "forming",
      maxSeats: MAX_RIDE_SIZE,
      students: [],
    });

    for (let i = 0; i < MAX_RIDE_SIZE; i += 1) {
      const entry = waitingEntries[cursor];
      cursor += 1;

      entry.status = "assigned";
      entry.ride = ride._id;
      await entry.save();

      ride.students.push(entry._id);
    }

    ride.status = "ready";
    await assignDriverIfPossible(ride);
    await ride.save();

    impactedRideIds.add(ride._id.toString());
    newlyReadyRideIds.add(ride._id.toString());
  }

  await emitQueueSnapshot();

  for (const rideId of impactedRideIds) {
    await emitRideState(rideId);
  }

  for (const rideId of newlyReadyRideIds) {
    await notifyRideFull(rideId);
  }
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
      .sort({ queueAt: 1, createdAt: 1 })
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
  const existingActiveEntry = await QueueEntry.findOne({
    student: studentId,
    status: { $in: ACTIVE_QUEUE_STATUSES },
  });

  if (existingActiveEntry) {
    throw new ApiError(409, "You already have an active booking");
  }

  await QueueEntry.create({
    student: studentId,
    pickup,
    destination,
    status: "waiting",
    queueAt: new Date(),
  });

  await processQueue();
  return getStudentCurrentRide(studentId);
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
    status: { $in: ["forming", "ready", "in-transit"] },
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

  const waitingCount = await QueueEntry.countDocuments({ status: "waiting" });

  return {
    ride: serializeRideForDriver(ride),
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
  const { queueEntry, ride } = await requireDriverQueueEntry(driverId, queueEntryId);

  if (!["forming", "ready"].includes(ride.status)) {
    throw new ApiError(400, "Cannot cancel a student after trip has started");
  }

  queueEntry.cancelCount += 1;

  ride.students = ride.students.filter((studentEntryId) => {
    return studentEntryId.toString() !== queueEntry._id.toString();
  });

  if (queueEntry.cancelCount === 1) {
    queueEntry.status = "waiting";
    queueEntry.queueAt = new Date();
    queueEntry.ride = null;
    queueEntry.driver = null;
  } else {
    queueEntry.status = "cancelled";
    queueEntry.ride = null;
    queueEntry.driver = null;
  }

  if (ride.students.length === 0) {
    ride.status = "cancelled";
  } else if (ride.students.length < ride.maxSeats) {
    ride.status = "forming";
  }

  await queueEntry.save();
  await ride.save();

  await processQueue();
  await emitRideState(ride._id.toString());

  return {
    queueEntryId: queueEntry._id.toString(),
    status: queueEntry.status,
    cancelCount: queueEntry.cancelCount,
  };
};

const startTrip = async (driverId) => {
  const ride = await Ride.findOne({
    driver: driverId,
    status: { $in: ["forming", "ready"] },
  }).sort({ createdAt: 1 });

  if (!ride) {
    throw new ApiError(404, "No active ride found to start");
  }

  if (ride.students.length === 0) {
    throw new ApiError(400, "Ride has no students");
  }

  ride.status = "in-transit";
  ride.startedAt = new Date();
  await ride.save();

  const queueEntries = await QueueEntry.find({ _id: { $in: ride.students } });
  const studentIds = [];
  const pickupPoints = new Set();
  const destinations = new Set();

  for (const entry of queueEntries) {
    entry.status = "in-transit";
    entry.startedAt = new Date();
    await entry.save();

    studentIds.push(entry.student);
    pickupPoints.add(entry.pickup);
    destinations.add(entry.destination);
  }

  await Trip.findOneAndUpdate(
    { ride: ride._id },
    {
      ride: ride._id,
      driver: driverId,
      students: studentIds,
      pickupPoints: [...pickupPoints],
      destinations: [...destinations],
      status: "in-transit",
      startedAt: ride.startedAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await emitRideState(ride._id.toString());
  await emitQueueSnapshot();

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
  await processQueue();

  return {
    rideId: ride._id.toString(),
    status: ride.status,
  };
};

const getAdminQueueOverview = async () => {
  const waitingEntries = await QueueEntry.find({ status: "waiting" })
    .sort({ queueAt: 1, createdAt: 1 })
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
    Complaint.countDocuments({ status: { $in: ["waiting", "assigned"] } }),
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
      status: { $in: ["forming", "ready", "in-transit"] },
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
