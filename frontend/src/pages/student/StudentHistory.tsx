import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import StatusBadge from "@/components/StatusBadge";
import { ArrowRight, CalendarDays } from "lucide-react";
import { RideHistoryItem, Schedule } from "@/types/domain";
import { getStudentHistoryRequest } from "@/services/rideService";
import { getSchedulesRequest } from "@/services/scheduleService";
import { extractErrorMessage } from "@/lib/api";

const StudentHistory = () => {
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [rideData, scheduleData] = await Promise.all([
          getStudentHistoryRequest(),
          getSchedulesRequest(),
        ]);

        setRides(rideData);
        setSchedules(scheduleData);
      } catch (loadError) {
        setError(extractErrorMessage(loadError, "Unable to load history"));
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Booking History</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{rides.length} rides total</p>
      </div>

      <div className="space-y-3">
        <h2 className="font-display font-semibold text-base">Schedule</h2>
        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedules available.</p>
        ) : (
          schedules.map((schedule, i) => (
            <motion.div
              key={schedule._id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card-interactive p-4 space-y-2"
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="w-4 h-4 text-primary" />
                {schedule.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {schedule.date} • {schedule.startTime} - {schedule.endTime}
              </div>
              {schedule.description ? (
                <p className="text-sm text-muted-foreground">{schedule.description}</p>
              ) : null}
            </motion.div>
          ))
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading history...</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rides.length === 0 ? (
          <p className="text-sm text-muted-foreground">No past rides yet.</p>
        ) : (
          rides.map((ride, i) => (
            <motion.div
              key={ride.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card-interactive p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">{ride.date}</span>
                <StatusBadge status={ride.status} />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1.5 font-semibold">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  {ride.from}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-1.5 font-semibold">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  {ride.to}
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                <span>
                  Driver: <span className="text-foreground font-medium">{ride.driver}</span>
                </span>
                <span className="font-semibold text-foreground">{ride.fare}</span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentHistory;
