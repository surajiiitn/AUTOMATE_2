import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import StatusBadge from "@/components/StatusBadge";
import {
  MapPin,
  Users,
  Clock,
  MessageSquare,
  AlertTriangle,
  Calendar,
  Car,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Complaint, CurrentRide, RideHistoryItem } from "@/types/domain";
import {
  getStudentCurrentRideRequest,
  getStudentHistoryRequest,
  leaveQueueRequest,
} from "@/services/rideService";
import { getMyComplaintsRequest, submitComplaintRequest } from "@/services/complaintService";
import { getSocket } from "@/lib/socket";
import { extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const StudentDashboard = () => {
  const { user } = useAuth();
  const [showComplaint, setShowComplaint] = useState(false);
  const [complaint, setComplaint] = useState("");
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const [isLeavingQueue, setIsLeavingQueue] = useState(false);

  const [currentRide, setCurrentRide] = useState<CurrentRide | null>(null);
  const [history, setHistory] = useState<RideHistoryItem[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCurrentRide = useCallback(async () => {
    const ride = await getStudentCurrentRideRequest();
    setCurrentRide(ride);
    setQueueCount((prev) => {
      if (!ride || ride.status !== "waiting") {
        return null;
      }

      return typeof prev === "number" ? prev : ride.queuePosition || 1;
    });
  }, []);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [ride, rideHistory, complaintItems] = await Promise.all([
        getStudentCurrentRideRequest(),
        getStudentHistoryRequest(),
        getMyComplaintsRequest(),
      ]);
      setCurrentRide(ride);
      setHistory(rideHistory.slice(0, 3));
      setComplaints(complaintItems.slice(0, 4));
      setQueueCount(ride?.status === "waiting" ? ride.queuePosition || 1 : null);
    } catch (loadError) {
      setError(extractErrorMessage(loadError, "Unable to load dashboard"));
    } finally {
      setIsLoading(false);
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

    const handleQueueUpdate = () => {
      loadCurrentRide().catch(() => {
        // Ignore transient socket refresh errors.
      });
    };

    const handleQueueCount = (payload: { totalWaiting?: number } | undefined) => {
      if (typeof payload?.totalWaiting !== "number") {
        return;
      }

      setQueueCount(payload.totalWaiting);
    };

    const handleComplaintUpdate = () => {
      getMyComplaintsRequest()
        .then((complaintItems) => setComplaints(complaintItems.slice(0, 4)))
        .catch(() => {
          // Ignore transient complaint refresh errors.
        });
    };

    socket.on("queue:updated", handleQueueUpdate);
    socket.on("queue:count", handleQueueCount);
    socket.on("ride:updated", handleQueueUpdate);
    socket.on("complaint:statusUpdated", handleComplaintUpdate);

    return () => {
      socket.off("queue:updated", handleQueueUpdate);
      socket.off("queue:count", handleQueueCount);
      socket.off("ride:updated", handleQueueUpdate);
      socket.off("complaint:statusUpdated", handleComplaintUpdate);
    };
  }, [loadCurrentRide]);

  const handleSubmitComplaint = async () => {
    const trimmed = complaint.trim();
    if (!trimmed) {
      return;
    }

    setIsSubmittingComplaint(true);
    try {
      await submitComplaintRequest(trimmed, currentRide?.rideId || undefined);
      const complaintItems = await getMyComplaintsRequest();
      setComplaints(complaintItems.slice(0, 4));
      toast.success("Complaint submitted");
      setShowComplaint(false);
      setComplaint("");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError, "Unable to submit complaint"));
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  const handleLeaveQueue = async () => {
    if (!currentRide || currentRide.status !== "waiting") {
      return;
    }

    if (!window.confirm("Leave the queue?")) {
      return;
    }

    setIsLeavingQueue(true);
    try {
      await leaveQueueRequest();
      toast.success("You have left the queue");
      await loadDashboard();
    } catch (leaveError) {
      toast.error(extractErrorMessage(leaveError, "Unable to leave queue"));
    } finally {
      setIsLeavingQueue(false);
    }
  };

  const progress = (() => {
    if (!currentRide) {
      return 0;
    }

    if (currentRide.status === "waiting") {
      return Math.max(12, 100 - (currentRide.queuePosition || 1) * 12);
    }

    if (currentRide.status === "assigned") {
      return 75;
    }

    if (currentRide.status === "pickup") {
      return 90;
    }

    if (currentRide.status === "in-transit") {
      return 100;
    }

    return 0;
  })();

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <motion.div {...fadeUp}>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Ready for your next ride?</p>
      </motion.div>

      <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
        <Link to="/student/book" className="group block w-full p-5 rounded-2xl btn-primary">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/15 flex items-center justify-center">
              <Car className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="font-display font-bold text-lg">Book a Ride</div>
              <div className="text-primary-foreground/70 text-sm">Tap to join the queue</div>
            </div>
            <ChevronRight className="w-5 h-5 text-primary-foreground/50 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </motion.div>

      <motion.div {...fadeUp} transition={{ delay: 0.15 }} className="card-elevated p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-base">Current Ride</h2>
          <StatusBadge status={currentRide?.status || "waiting"} />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading ride status...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !currentRide ? (
          <p className="text-sm text-muted-foreground">No active booking. Book a ride to join queue.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50">
                <Users className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-[11px] text-muted-foreground font-medium">Queue</div>
                  <div className="text-sm font-bold">#{currentRide.queuePosition || 1}</div>
                  {queueCount !== null ? (
                    <div className="text-[10px] text-muted-foreground">{queueCount} waiting</div>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/50">
                <Clock className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-[11px] text-muted-foreground font-medium">Est. Wait</div>
                  <div className="text-sm font-bold">~{currentRide.estimatedWaitMinutes} mins</div>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {currentRide.pickup} to {currentRide.destination}
              {currentRide.driver ? ` • Driver: ${currentRide.driver.name}` : ""}
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="h-full rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, hsl(var(--primary)), hsl(230 80% 68%))",
                }}
              />
            </div>
            {currentRide.status === "waiting" ? (
              <button
                onClick={handleLeaveQueue}
                disabled={isLeavingQueue}
                className="w-full h-10 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm font-semibold hover:bg-destructive/10 disabled:opacity-50"
              >
                {isLeavingQueue ? "Leaving..." : "Leave Queue"}
              </button>
            ) : null}
          </>
        )}
      </motion.div>

      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: <MessageSquare className="w-5 h-5" />,
            label: "Chat",
            to: "/student/chat",
            color: "text-info",
          },
          {
            icon: <Calendar className="w-5 h-5" />,
            label: "Schedule",
            to: "/student/history",
            color: "text-primary",
          },
          {
            icon: <AlertTriangle className="w-5 h-5" />,
            label: "Complain",
            action: () => setShowComplaint(true),
            color: "text-warning",
          },
        ].map((item, i) => (
          <motion.div key={i} {...fadeUp} transition={{ delay: 0.2 + i * 0.05 }}>
            {item.to ? (
              <Link to={item.to} className="flex flex-col items-center gap-2 p-4 rounded-2xl card-interactive">
                <span className={item.color}>{item.icon}</span>
                <span className="text-xs font-semibold">{item.label}</span>
              </Link>
            ) : (
              <button onClick={item.action} className="w-full flex flex-col items-center gap-2 p-4 rounded-2xl card-interactive">
                <span className={item.color}>{item.icon}</span>
                <span className="text-xs font-semibold">{item.label}</span>
              </button>
            )}
          </motion.div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-base">Complaints</h2>
        </div>

        {complaints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No complaints submitted yet.</p>
        ) : (
          complaints.map((item, i) => (
            <motion.div
              key={item._id}
              {...fadeUp}
              transition={{ delay: 0.25 + i * 0.05 }}
              className="card-interactive p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={item.status} />
                <span className="text-[11px] text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.complaintText || item.description}
              </p>
              {item.adminResponse ? (
                <p className="text-xs text-foreground/80 bg-muted/50 rounded-lg px-2.5 py-2">
                  Admin: {item.adminResponse}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Awaiting admin response.</p>
              )}
            </motion.div>
          ))
        )}
      </div>

      {showComplaint && (
        <div
          className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
          onClick={() => setShowComplaint(false)}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-card rounded-2xl p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display font-bold text-lg">Submit Complaint</h3>
            <textarea
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              placeholder="Describe your issue..."
              className="w-full h-28 p-3 rounded-xl bg-muted border-0 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowComplaint(false)}
                className="flex-1 h-11 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitComplaint}
                disabled={!complaint.trim() || isSubmittingComplaint}
                className="flex-1 h-11 rounded-xl btn-primary text-sm disabled:opacity-50"
              >
                {isSubmittingComplaint ? "Submitting..." : "Submit"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-base">Recent Rides</h2>
          <Link to="/student/history" className="text-xs font-semibold text-primary hover:underline">
            View all
          </Link>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ride history available yet.</p>
        ) : (
          history.map((ride, i) => (
            <motion.div
              key={ride.id}
              {...fadeUp}
              transition={{ delay: 0.3 + i * 0.05 }}
              className="card-interactive p-4 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {ride.from} → {ride.to}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {ride.date} • {ride.driver}
                </div>
              </div>
              <StatusBadge status={ride.status} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;
