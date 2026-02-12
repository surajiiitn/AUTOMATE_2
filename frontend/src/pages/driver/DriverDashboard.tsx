import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import StatusBadge from "@/components/StatusBadge";
import {
  Users,
  MapPin,
  Play,
  CheckCircle,
  XCircle,
  Bell,
  MessageSquare,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  cancelStudentRequest,
  completeTripRequest,
  DriverCurrentRideData,
  getDriverCurrentRideRequest,
  markArrivedRequest,
  startTripRequest,
} from "@/services/rideService";
import { getSchedulesRequest } from "@/services/scheduleService";
import { Schedule } from "@/types/domain";
import { getSocket } from "@/lib/socket";
import { extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const DriverDashboard = () => {
  const { user } = useAuth();
  const [driverData, setDriverData] = useState<DriverCurrentRideData>({
    ride: null,
    waitingCount: 0,
  });
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [rideData, scheduleData] = await Promise.all([
        getDriverCurrentRideRequest(),
        getSchedulesRequest(),
      ]);
      setDriverData(rideData);
      setSchedules(scheduleData);
    } catch (loadError) {
      setError(extractErrorMessage(loadError, "Unable to load driver dashboard"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshRideData = useCallback(async () => {
    try {
      const rideData = await getDriverCurrentRideRequest();
      setDriverData(rideData);
    } catch (_error) {
      // Ignore transient socket refresh failures.
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      return;
    }

    const refresh = () => {
      refreshRideData();
    };

    const handleQueueCount = (payload: { totalWaiting?: number } | undefined) => {
      if (typeof payload?.totalWaiting !== "number") {
        return;
      }

      setDriverData((prev) => ({
        ...prev,
        waitingCount: payload.totalWaiting ?? prev.waitingCount,
      }));
    };

    socket.on("ride:updated", refresh);
    socket.on("queue:updated", refresh);
    socket.on("queue:count", handleQueueCount);

    return () => {
      socket.off("ride:updated", refresh);
      socket.off("queue:updated", refresh);
      socket.off("queue:count", handleQueueCount);
    };
  }, [refreshRideData]);

  const ride = driverData.ride;
  const students = ride?.students || [];

  const handleArrive = async (queueEntryId: string) => {
    setIsActionLoading(queueEntryId);
    try {
      await markArrivedRequest(queueEntryId);
      await refreshRideData();
      toast.success("Student marked arrived");
    } catch (actionError) {
      toast.error(extractErrorMessage(actionError, "Failed to mark arrived"));
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCancel = async (queueEntryId: string) => {
    setIsActionLoading(queueEntryId);
    try {
      const result = await cancelStudentRequest(queueEntryId);
      await refreshRideData();
      if (result.cancelCount === 1) {
        toast.success("Student requeued to end");
      } else {
        toast.success("Student removed from queue");
      }
    } catch (actionError) {
      toast.error(extractErrorMessage(actionError, "Failed to cancel student"));
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleStartTrip = async () => {
    setIsActionLoading("trip-start");
    try {
      await startTripRequest();
      await refreshRideData();
      toast.success("Trip started");
    } catch (actionError) {
      toast.error(extractErrorMessage(actionError, "Unable to start trip"));
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleCompleteTrip = async () => {
    setIsActionLoading("trip-complete");
    try {
      await completeTripRequest();
      await refreshRideData();
      toast.success("Trip completed");
    } catch (actionError) {
      toast.error(extractErrorMessage(actionError, "Unable to complete trip"));
    } finally {
      setIsActionLoading(null);
    }
  };

  const canStartTrip =
    ride && ["waiting", "assigned"].includes(ride.status) && students.length > 0;
  const canCompleteTrip = ride && ride.status === "in-transit";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <motion.div {...fadeUp}>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Hi, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {ride
            ? ride.status === "in-transit"
              ? "Trip in progress"
              : "Ride assigned"
            : `Waiting for students (${driverData.waitingCount} in queue)`}
        </p>
      </motion.div>

      <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Ride Group
          </h2>
          <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-semibold">
            {students.length}/4
          </span>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading ride...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !ride ? (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-warning/8 border border-warning/20">
            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
              <Bell className="w-4 h-4 text-warning" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">No ride assigned yet</span>
              <p className="text-xs text-muted-foreground">
                Waiting queue: {driverData.waitingCount} students
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {students.map((student, i) => (
                <motion.div
                  key={student.queueEntryId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/40"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                    {student.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{student.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {student.pickup} to {student.destination}
                    </div>
                  </div>

                  {(["waiting", "assigned"] as const).includes(student.status as "waiting" | "assigned") && (
                    <div className="flex gap-1.5">
                      {student.status === "assigned" ? (
                        <button
                          onClick={() => handleArrive(student.queueEntryId)}
                          className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                          title="Arrived"
                          disabled={Boolean(isActionLoading)}
                        >
                          {isActionLoading === student.queueEntryId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                        </button>
                      ) : null}
                      <button
                        onClick={() => handleCancel(student.queueEntryId)}
                        className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                        title="Cancel"
                        disabled={Boolean(isActionLoading)}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {student.status === "pickup" && <StatusBadge status="pickup" />}
                  {student.status === "in-transit" && <StatusBadge status="in-transit" />}
                </motion.div>
              ))}
            </div>
          </>
        )}
      </motion.div>

      <div className="flex gap-3">
        {canStartTrip ? (
          <button
            onClick={handleStartTrip}
            disabled={isActionLoading === "trip-start"}
            className="flex-1 h-12 rounded-xl btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {isActionLoading === "trip-start" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Start Trip
          </button>
        ) : null}

        {canCompleteTrip ? (
          <button
            onClick={handleCompleteTrip}
            disabled={isActionLoading === "trip-complete"}
            className="flex-1 h-12 rounded-xl bg-success text-success-foreground font-semibold text-sm hover:brightness-105 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isActionLoading === "trip-complete" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Complete Trip
          </button>
        ) : null}

        <Link
          to="/driver/chat"
          className="h-12 w-12 rounded-xl card-interactive flex items-center justify-center"
        >
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
        </Link>
      </div>

      <div className="space-y-3">
        <h2 className="font-display font-semibold text-base">Schedule</h2>
        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedule entries available.</p>
        ) : (
          schedules.slice(0, 4).map((schedule) => (
            <div key={schedule._id} className="card-interactive p-4 space-y-1">
              <div className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                {schedule.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {schedule.date} • {schedule.startTime} - {schedule.endTime}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;
