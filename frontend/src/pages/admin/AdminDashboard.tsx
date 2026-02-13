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
  Trash2,
  KeyRound,
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
import { Complaint, ComplaintStatus, Schedule, User, UserRole } from "@/types/domain";
import api, { extractErrorMessage } from "@/lib/api";
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

const getUserStatus = (user: User): "active" | "inactive" => (
  user.status === "inactive" ? "inactive" : "active"
);

const AdminDashboard = () => {
  const location = useLocation();

  const [tab, setTab] = useState<Tab>(mapPathToTab(location.pathname));
  const [search, setSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | UserRole>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [users, setUsers] = useState<User[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [queueOverview, setQueueOverview] = useState<AdminQueueOverview>({
    waitingQueue: [],
    activeRides: [],
  });
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [complaintResponseDrafts, setComplaintResponseDrafts] = useState<Record<string, string>>({});
  const [stats, setStats] = useState({
    students: 0,
    drivers: 0,
    activeQueue: 0,
    complaints: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingComplaintId, setUpdatingComplaintId] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [reactivatingUserId, setReactivatingUserId] = useState<string | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<string | null>(null);
  const [permanentDeletingUserId, setPermanentDeletingUserId] = useState<string | null>(null);
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
    setComplaintResponseDrafts((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const complaint of complaints) {
        if (next[complaint._id] === undefined) {
          next[complaint._id] = complaint.adminResponse || "";
          changed = true;
        }
      }

      for (const complaintId of Object.keys(next)) {
        if (!complaints.some((complaint) => complaint._id === complaintId)) {
          delete next[complaintId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [complaints]);

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
    socket.on("complaint:statusUpdated", refresh);

    return () => {
      socket.off("queue:updated", refresh);
      socket.off("ride:updated", refresh);
      socket.off("complaint:new", refresh);
      socket.off("complaint:statusUpdated", refresh);
    };
  }, [loadDashboard]);

  const userStats = useMemo(() => {
    const active = users.filter((user) => getUserStatus(user) === "active").length;
    return {
      total: users.length,
      active,
      inactive: users.length - active,
    };
  }, [users]);

  const filteredUsers = useMemo(
    () => users.filter((u) => {
      const query = search.toLowerCase();
      const status = getUserStatus(u);

      const matchesSearch = (
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      );
      const matchesRole = userRoleFilter === "all" || u.role === userRoleFilter;
      const matchesStatus = userStatusFilter === "all" || status === userStatusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    }),
    [users, search, userRoleFilter, userStatusFilter],
  );

  const driverUsers = useMemo(() => users.filter((u) => u.role === "driver"), [users]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);

    try {
      const createResult = await createUserRequest({
        name: userForm.name,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
        vehicleNumber: userForm.role === "driver" ? userForm.vehicleNumber : undefined,
      });

      if (createResult.emailSent) {
        toast.success("User created and credentials email sent");
      } else {
        const errorMessage = createResult.emailError
          ? ` ${createResult.emailError}`
          : "";
        toast.error(`User created, but email was not sent.${errorMessage}`);
      }
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
    payload: {
      status?: ComplaintStatus;
      adminResponse?: string;
    },
  ) => {
    const normalizedResponse = payload.adminResponse?.trim();
    const requestPayload = {
      status: payload.status,
      adminResponse: normalizedResponse ? normalizedResponse : undefined,
    };

    if (!requestPayload.status && requestPayload.adminResponse === undefined) {
      return;
    }

    setUpdatingComplaintId(complaintId);
    try {
      const updated = await updateComplaintStatusRequest(complaintId, requestPayload);
      setComplaintResponseDrafts((prev) => ({
        ...prev,
        [complaintId]: updated.adminResponse || "",
      }));
      toast.success("Complaint status updated");
      await loadDashboard();
    } catch (updateError) {
      toast.error(extractErrorMessage(updateError, "Unable to update complaint"));
    } finally {
      setUpdatingComplaintId(null);
    }
  };

  const handleDeactivateUser = async (targetUser: User) => {
    if (
      !window.confirm(
        `Deactivate ${targetUser.name} (${targetUser.email})? This will block login and remove active assignments.`,
      )
    ) {
      return;
    }

    setRemovingUserId(targetUser.id);

    try {
      await api.delete(`/users/${targetUser.id}`);
      setUsers((prev) => prev.filter((user) => user.id !== targetUser.id));
      toast.success("User deactivated");
      await loadDashboard();
    } catch (removeError) {
      toast.error(extractErrorMessage(removeError, "Unable to deactivate user"));
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleReactivateUser = async (targetUser: User) => {
    setReactivatingUserId(targetUser.id);

    try {
      await api.post(`/admin/users/${targetUser.id}/reactivate`);
      setUsers((prev) => prev.map((user) => (
        user.id === targetUser.id
          ? {
              ...user,
              status: "active",
            }
          : user
      )));
      toast.success("User reactivated");
      await loadDashboard();
    } catch (reactivateError) {
      toast.error(extractErrorMessage(reactivateError, "Unable to reactivate user"));
    } finally {
      setReactivatingUserId(null);
    }
  };

  const handleResetPassword = async (targetUser: User) => {
    if (!window.confirm(`Send temporary password to ${targetUser.email}?`)) {
      return;
    }

    setResettingPasswordUserId(targetUser.id);

    try {
      await api.post(`/admin/users/${targetUser.id}/reset-password`);
      toast.success("Temporary password sent to user email");
    } catch (resetError) {
      toast.error(extractErrorMessage(resetError, "Unable to reset password"));
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  const handlePermanentDeleteUser = async (targetUser: User) => {
    if (!window.confirm("This action cannot be undone")) {
      return;
    }

    setPermanentDeletingUserId(targetUser.id);

    try {
      await api.delete(`/admin/users/${targetUser.id}/permanent-delete`);
      setUsers((prev) => prev.filter((user) => user.id !== targetUser.id));
      toast.success("User permanently deleted");
      await loadDashboard();
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError, "Unable to permanently delete user"));
    } finally {
      setPermanentDeletingUserId(null);
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
    <div className={`${tab === "users" ? "max-w-6xl" : "max-w-2xl"} mx-auto space-y-6`}>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="card-elevated p-3">
              <div className="text-xs text-muted-foreground">Total users</div>
              <div className="text-lg font-semibold">{userStats.total}</div>
            </div>
            <div className="card-elevated p-3">
              <div className="text-xs text-muted-foreground">Active</div>
              <div className="text-lg font-semibold text-success">{userStats.active}</div>
            </div>
            <div className="card-elevated p-3">
              <div className="text-xs text-muted-foreground">Inactive</div>
              <div className="text-lg font-semibold text-muted-foreground">{userStats.inactive}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-card border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value as "all" | UserRole)}
              className="h-11 px-3 rounded-xl bg-card border border-input text-sm"
            >
              <option value="all">All roles</option>
              <option value="student">Student</option>
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value as "all" | "active" | "inactive")}
              className="h-11 px-3 rounded-xl bg-card border border-input text-sm"
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              onClick={() => setShowAddUser((prev) => !prev)}
              className="h-11 px-5 rounded-xl btn-primary text-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> {showAddUser ? "Close" : "Add User"}
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

          {filteredUsers.length === 0 ? (
            <div className="card-elevated p-6 text-center">
              <p className="text-sm font-semibold">No users found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try a different search term or update the filters.
              </p>
            </div>
          ) : (
            filteredUsers.map((u, i) => {
              const status = getUserStatus(u);
              const isActive = status === "active";
              const isToggleLoading = (
                (isActive && removingUserId === u.id)
                || (!isActive && reactivatingUserId === u.id)
              );

              return (
                <motion.div
                  key={u.id}
                  {...fadeUp}
                  transition={{ delay: i * 0.03 }}
                  className="card-interactive p-4 space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                      {u.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-primary/10 text-primary capitalize">
                        {u.role}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                          isActive
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {status}
                      </span>
                      {u.role === "driver" && u.vehicleNumber ? (
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-warning/10 text-warning">
                          {u.vehicleNumber}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={() => handleResetPassword(u)}
                      disabled={resettingPasswordUserId === u.id}
                      className="h-9 px-3 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {resettingPasswordUserId === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      Reset Password
                    </button>
                    <button
                      onClick={() => (isActive ? handleDeactivateUser(u) : handleReactivateUser(u))}
                      disabled={isToggleLoading}
                      className={`h-9 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                        isActive
                          ? "border border-destructive/30 text-destructive hover:bg-destructive/10"
                          : "border border-success/30 text-success hover:bg-success/10"
                      }`}
                    >
                      {isToggleLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        isActive
                          ? <Trash2 className="w-3.5 h-3.5" />
                          : <Plus className="w-3.5 h-3.5" />
                      )}
                      {isActive ? "Deactivate User" : "Reactivate User"}
                    </button>
                    <button
                      onClick={() => handlePermanentDeleteUser(u)}
                      disabled={permanentDeletingUserId === u.id}
                      className="h-9 px-3 rounded-lg border border-destructive text-destructive text-xs font-semibold hover:bg-destructive/15 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {permanentDeletingUserId === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      Permanent Delete
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
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
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {c.complaintText || c.description}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(["submitted", "in_review", "resolved", "rejected"] as const).map((statusOption) => (
                    <button
                      key={statusOption}
                      onClick={() =>
                        handleComplaintStatusUpdate(c._id, {
                          status: statusOption,
                          adminResponse: complaintResponseDrafts[c._id] || "",
                        })
                      }
                      disabled={updatingComplaintId === c._id}
                      className={`text-[11px] px-2.5 py-1 rounded-full border ${
                        c.status === statusOption
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground"
                      } disabled:opacity-50`}
                    >
                      {statusOption}
                    </button>
                  ))}
                </div>
                <textarea
                  value={complaintResponseDrafts[c._id] || ""}
                  onChange={(event) =>
                    setComplaintResponseDrafts((prev) => ({
                      ...prev,
                      [c._id]: event.target.value,
                    }))
                  }
                  placeholder="Admin response..."
                  className="w-full min-h-20 px-3 py-2 rounded-lg bg-card border border-input text-sm"
                />
                <button
                  onClick={() =>
                    handleComplaintStatusUpdate(c._id, {
                      adminResponse: complaintResponseDrafts[c._id] || "",
                    })
                  }
                  disabled={updatingComplaintId === c._id}
                  className="h-9 px-3 rounded-lg border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/5 disabled:opacity-50"
                >
                  Save Response
                </button>
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
