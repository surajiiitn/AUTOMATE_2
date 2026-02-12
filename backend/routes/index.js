const express = require("express");
const authRoutes = require("./authRoutes");
const rideRoutes = require("./rideRoutes");
const chatRoutes = require("./chatRoutes");
const complaintRoutes = require("./complaintRoutes");
const scheduleRoutes = require("./scheduleRoutes");
const userRoutes = require("./userRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/rides", rideRoutes);
router.use("/chat", chatRoutes);
router.use("/complaints", complaintRoutes);
router.use("/schedules", scheduleRoutes);
router.use("/users", userRoutes);

module.exports = router;
