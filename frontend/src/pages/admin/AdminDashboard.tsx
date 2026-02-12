import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Car,
  AlertTriangle,
  Activity,
  Plus,
  Search,
  TrendingUp,
  CalendarDays,
  Loader2,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { useLocation } from "react-router-dom";
import {
  getAdminQueueRequest,
  getAdminStatsRequest,
  AdminQueueOverview,
} from "@/services/rideService";
import { createUserRequest, getUsersRequest } from "@/services/userService";
import {
  getAllComplaintsRequest,
  updateComplaintStatusRequest,
} from "@/services/complaintService";
import { createScheduleRequest, getSchedulesRequest } from "@/services/scheduleService";
import { Complaint, Schedule, User, UserRole } from "@/types/domain";
import { extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { getSocket } from "@/lib/socket";

type Tab = "overview" | "users" | "complaints" | "queue" | "schedules";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

const mapPathToTab = (path: string): Tab => {
  if (path.includes("/users")) {
    return "users";
  }

  if (path.includes("/complaints")) {
    return "complaints";
  }

  if (path.includes("/logs")) {
    return "schedules";
  }

  return "overview";
};

const AdminDashboard = () => {
  const location = useLocation();

  const [tab, setTab] = useState<Tab>(mapPathToTab(location.pathname));
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [queueOverview, setQueueOverview] = useState<AdminQueueOverview>({
    waitingQueue: [],
    activeRides: [],
  });
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [stats, setStats] = useState({
    students: 0,
    drivers: 0,
    activeQueue: 0,
    complaints: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student" as UserRole,
    vehicleNumber: "",
  });

  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    targetRole: "all" as "student" | "driver" | "all",
    driverId: "",
  });

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsData, usersData, complaintsData, queueData, scheduleData] = await Promise.all([
        getAdminStatsRequest(),
        getUsersRequest(),
        getAllComplaintsRequest(),
        getAdminQueueRequest(),
        getSchedulesRequest(),
      ]);

      setStats(statsData);
      setUsers(usersData);
      setComplaints(complaintsData);
      setQueueOverview(queueData);
      setSchedules(scheduleData);
    } catch (loadError) {
      setError(extractErrorMessage(loadError, "Unable to load admin dashboard"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setTab(mapPathToTab(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      return;
    }

    const refresh = () => {
      loadDashboard();
    };

    socket.on("queue:updated", refresh);
    socket.on("ride:updated", refresh);
    socket.on("complaint:new", refresh);

    return () => {
      socket.off("queue:updated", refresh);
      socket.off("ride:updated", refresh);
      socket.off("complaint:new", refresh);
    };
  }, [loadDashboard]);

  const filteredUsers = useMemo(
    () => users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase())),
    [users, search],
  );

  const driverUsers = useMemo(() => users.filter((u) => u.role === "driver"), [users]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);

    try {
      await createUserRequest({
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
        vehicleNumber: userForm.role === "driver" ? userForm.vehicleNumber : undefined,
      });

      toast.success("User created");
      setShowAddUser(false);
      setUserForm({
        name: "",
        email: "",
        password: "",
        role: "student",
        vehicleNumber: "",
      });
      await loadDashboard();
    } catch (createError) {
      toast.error(extractErrorMessage(createError, "Unable to create user"));
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleComplaintStatusUpdate = async (
    complaintId: string,
    status: "waiting" | "assigned" | "completed",
  ) => {
    try {
      await updateComplaintStatusRequest(complaintId, status);
      toast.success("Complaint status updated");
      await loadDashboard();
    } catch (updateError) {
      toast.error(extractErrorMessage(updateError, "Unable to update complaint"));
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingSchedule(true);

    try {
      await createScheduleRequest({
        title: scheduleForm.title,
        description: scheduleForm.description,
        date: scheduleForm.date,
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        targetRole: scheduleForm.targetRole,
        driverId:
          scheduleForm.targetRole === "driver" && scheduleForm.driverId
            ? scheduleForm.driverId
            : undefined,
      });

      toast.success("Schedule created");
      setScheduleForm({
        title: "",
        description: "",
        date: "",
        startTime: "",
        endTime: "",
        targetRole: "all",
        driverId: "",
      });
      await loadDashboard();
    } catch (scheduleError) {
      toast.error(extractErrorMessage(scheduleError, "Unable to create schedule"));
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  const statsCards = [
    {
      label: "Students",
      value: stats.students.toString(),
      icon: <Users className="w-5 h-5" />,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Drivers",
      value: stats.drivers.toString(),
      icon: <Car className="w-5 h-5" />,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Active Queue",
      value: stats.activeQueue.toString(),
      icon: <Activity className="w-5 h-5" />,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Complaints",
      value: stats.complaints.toString(),
      icon: <AlertTriangle className="w-5 h-5" />,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div {...fadeUp}>
        <h1 className="font-display text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your campus transport</p>
      </motion.div>

      <div className="flex gap-1 p-1 bg-muted rounded-xl overflow-x-auto">
        {(["overview", "users", "complaints", "queue", "schedules"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 min-w-fit py-2.5 px-4 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
              tab === t
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {tab === "overview" && !isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {statsCards.map((s, i) => (
            <motion.div
              key={s.label}
              {...fadeUp}
              transition={{ delay: i * 0.05 }}
              className="card-elevated p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl ${s.bg} ${s.color} flex items-center justify-center`}>
                  {s.icon}
                </div>
                <TrendingUp className="w-3.5 h-3.5 text-success" />
              </div>
              <div>
                <div className="font-display text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}

      {tab === "users" && !isLoading ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-card border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
            <button
              onClick={() => setShowAddUser((prev) => !prev)}
              className="h-11 px-5 rounded-xl btn-primary text-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>

          {showAddUser ? (
            <form onSubmit={handleCreateUser} className="card-elevated p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={userForm.name}
                  onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Name"
                  className="h-10 px-3 rounded-lg bg-card border border-input text-sm"
                  required
                />
                <input
                  value={userForm.email}
                  onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Email"
                  type="email"
                  className="h-10 px-3 rounded-lg bg-card border border-input text-sm"
                  required
                />
                <input
                  value={userForm.password}
                  onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Password"
                  type="password"
                  className="h-10 px-3 rounded-lg bg-card border border-input text-sm"
                  required
                />
                <select
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm((prev) => ({ ...prev, role: e.target.value as UserRole }))
                  }
                  className="h-10 px-3 rounded-lg bg-card border border-input text-sm"
                >
                  <option value="student">Student</option>
                  <option value="driver">Driver</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {userForm.role === "driver" ? (
                <input
                  value={userForm.vehicleNumber}
                  onChange={(e) =>
                    setUserForm((prev) => ({ ...prev, vehicleNumber: e.target.value }))
                  }
                  placeholder="Vehicle Number"
                  className="h-10 px-3 rounded-lg bg-card border border-input text-sm w-full"
                />
              ) : null}

              <button
                type="submit"
                disabled={isCreatingUser}
                className="h-10 px-4 rounded-lg btn-primary text-sm disabled:opacity-60 flex items-center gap-2"
              >
                {isCreatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Create User
              </button>
            </form>
          ) : null}

          {filteredUsers.map((u, i) => (
            <motion.div
              key={u.id}
              {...fadeUp}
              transition={{ delay: i * 0.03 }}
              className="card-interactive p-4 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                {u.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{u.name}</div>
                <div className="text-xs text-muted-foreground">
                  {u.email} • <span className="capitalize">{u.role}</span>
                </div>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  u.status === "active"
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {u.status || "active"}
              </span>
            </motion.div>
          ))}
        </div>
      ) : null}

      {tab === "complaints" && !isLoading ? (
        <div className="space-y-3">
          {complaints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No complaints found.</p>
          ) : (
            complaints.map((c, i) => (
              <motion.div
                key={c._id}
                {...fadeUp}
                transition={{ delay: i * 0.05 }}
                className="card-elevated p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{c.student?.name || "Student"}</span>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.description}</p>
                <div className="flex gap-2">
                  {(["waiting", "assigned", "completed"] as const).map((statusOption) => (
                    <button
                      key={statusOption}
                      onClick={() => handleComplaintStatusUpdate(c._id, statusOption)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border ${
                        c.status === statusOption
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {statusOption}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </motion.div>
            ))
          )}
        </div>
      ) : null}

      {tab === "queue" && !isLoading ? (
        <div className="space-y-3">
          {queueOverview.waitingQueue.map((q, i) => (
            <motion.div
              key={q.id}
              {...fadeUp}
              transition={{ delay: i * 0.05 }}
              className="card-interactive p-4 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full btn-primary flex items-center justify-center text-sm font-bold">
                {q.position}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{q.student?.name || "Student"}</div>
                <div className="text-xs text-muted-foreground">
                  {q.pickup} → {q.destination}
                </div>
              </div>
              <StatusBadge status={q.status as "waiting" | "assigned" | "pickup" | "in-transit" | "completed" | "cancelled"} />
            </motion.div>
          ))}

          {queueOverview.activeRides.map((ride) => (
            <div key={ride.id} className="card-elevated p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Ride {ride.id.slice(-5)}</span>
                <StatusBadge status={ride.status} />
              </div>
              <div className="text-xs text-muted-foreground">
                Driver: {ride.driver?.name || "Unassigned"} • {ride.students.length}/4 students
              </div>
            </div>
          ))}

          {queueOverview.waitingQueue.length === 0 && queueOverview.activeRides.length === 0 ? (
            <p className="text-sm text-muted-foreground">Queue is empty.</p>
          ) : null}
        </div>
      ) : null}

      {tab === "schedules" && !isLoading ? (
        <div className="space-y-3">
          <form onSubmit={handleCreateSchedule} className="card-elevated p-4 space-y-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Create Schedule
            </div>

            <input
              value={scheduleForm.title}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Title"
              className="h-10 px-3 rounded-lg bg-card border border-input text-sm w-full"
              required
            />

            <textarea
              value={scheduleForm.description}
              onChange={(e) =>
                setScheduleForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Description"
              className="min-h-20 px-3 py-2 rounded-lg bg-card border border-input text-sm w-full"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="date"
                value={scheduleForm.date}
                onChange={(e) => setScheduleForm((prev) => ({ ...prev, date: e.target.value }))}
                className="h-10 px-3 rounded-lg bg-card border border-input text-sm"
                required
              />
              <select
                value={scheduleForm.targetRole}
                onChange={(e) =>
                  setScheduleForm((prev) => ({
                    ...prev,
                    targetRole: e.target.value as "student" | "driver" | "all",
                  }))
                }
                className="h-10 px-3 rounded-lg bg-card border border-input text-sm"
              >
                <option value="all">All</option>
                <option value="student">Students</option>
                <option value="driver">Drivers</option>
              </select>
              <input
                type="time"
                value={scheduleForm.startTime}
                onChange={(e) =>
                  setScheduleForm((prev) => ({ ...prev, startTime: e.target.value }))
                }
                className="h-10 px-3 rounded-lg bg-card border border-input text-sm"
                required
              />
              <input
                type="time"
                value={scheduleForm.endTime}
                onChange={(e) => setScheduleForm((prev) => ({ ...prev, endTime: e.target.value }))}
                className="h-10 px-3 rounded-lg bg-card border border-input text-sm"
                required
              />
            </div>

            {scheduleForm.targetRole === "driver" ? (
              <select
                value={scheduleForm.driverId}
                onChange={(e) =>
                  setScheduleForm((prev) => ({ ...prev, driverId: e.target.value }))
                }
                className="h-10 px-3 rounded-lg bg-card border border-input text-sm w-full"
              >
                <option value="">Select Driver</option>
                {driverUsers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} ({driver.email})
                  </option>
                ))}
              </select>
            ) : null}

            <button
              type="submit"
              disabled={isCreatingSchedule}
              className="h-10 px-4 rounded-lg btn-primary text-sm flex items-center gap-2 disabled:opacity-60"
            >
              {isCreatingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Schedule
            </button>
          </form>

          {schedules.map((schedule, i) => (
            <motion.div
              key={schedule._id}
              {...fadeUp}
              transition={{ delay: i * 0.05 }}
              className="card-interactive p-4"
            >
              <div className="text-sm font-semibold">{schedule.title}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {schedule.date} • {schedule.startTime} - {schedule.endTime} • {schedule.targetRole}
              </div>
              {schedule.description ? (
                <p className="text-sm text-muted-foreground mt-2">{schedule.description}</p>
              ) : null}
            </motion.div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default AdminDashboard;
