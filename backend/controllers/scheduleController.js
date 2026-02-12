const Schedule = require("../models/Schedule");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");

const createSchedule = asyncHandler(async (req, res) => {
  const { title, description, date, startTime, endTime, targetRole, driverId } = req.body;

  const schedule = await Schedule.create({
    title,
    description: description || "",
    date,
    startTime,
    endTime,
    targetRole: targetRole || "all",
    driver: driverId || null,
    createdBy: req.user._id,
  });

  await schedule.populate("driver", "name email role");

  return success(res, { schedule }, "Schedule created", 201);
});

const getSchedules = asyncHandler(async (req, res) => {
  const { role, _id: userId } = req.user;

  const filter =
    role === "admin"
      ? {}
      : {
          $or: [
            { targetRole: "all" },
            { targetRole: role },
            { driver: userId },
          ],
        };

  const schedules = await Schedule.find(filter)
    .sort({ date: 1, startTime: 1 })
    .populate("driver", "name email role")
    .populate("createdBy", "name email role");

  return success(res, { schedules });
});

module.exports = {
  createSchedule,
  getSchedules,
};
