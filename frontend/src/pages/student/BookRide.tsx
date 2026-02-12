import { useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  ArrowDown,
  Loader2,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { bookRideRequest } from "@/services/rideService";
import { extractErrorMessage } from "@/lib/api";

const locations = [
  "Main Gate",
  "Hostel A",
  "Hostel B",
  "Faculty of Science",
  "Library",
  "Sports Complex",
  "Cafeteria",
  "Admin Block",
];

const BookRide = () => {
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [booking, setBooking] = useState<"idle" | "loading" | "booked">("idle");
  const [error, setError] = useState<string | null>(null);
  const [bookingDetails, setBookingDetails] = useState<{
    queuePosition: number | null;
    estimatedWaitMinutes: number;
  } | null>(null);

  const handleBook = async () => {
    if (!pickup || !destination) {
      return;
    }

    setBooking("loading");
    setError(null);

    try {
      const currentRide = await bookRideRequest(pickup, destination);
      setBookingDetails({
        queuePosition: currentRide.queuePosition,
        estimatedWaitMinutes: currentRide.estimatedWaitMinutes,
      });
      setBooking("booked");
    } catch (bookingError) {
      setError(extractErrorMessage(bookingError, "Unable to book ride"));
      setBooking("idle");
    }
  };

  if (booking === "booked") {
    return (
      <div className="max-w-sm mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-5 text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-2"
        >
          <h2 className="font-display text-xl font-bold">Ride Booked!</h2>
          <p className="text-muted-foreground text-sm">
            You are #{bookingDetails?.queuePosition || 1} in queue. Estimated wait: ~
            {bookingDetails?.estimatedWaitMinutes || 3} mins
          </p>
        </motion.div>
        <div className="card-elevated p-4 w-full">
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span className="font-medium">{pickup}</span>
            <span className="text-muted-foreground">→</span>
            <MapPin className="w-4 h-4 text-destructive shrink-0" />
            <span className="font-medium">{destination}</span>
          </div>
        </div>
        <button
          onClick={() => {
            setBooking("idle");
            setError(null);
            setBookingDetails(null);
            setPickup("");
            setDestination("");
          }}
          className="h-11 px-8 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
        >
          Book Another
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold tracking-tight">Book a Ride</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Select pickup and destination
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-elevated p-5 space-y-4"
      >
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary" /> Pickup
          </label>
          <select
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            className="w-full h-12 px-4 rounded-xl bg-muted/50 border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all appearance-none"
          >
            <option value="">Select pickup point</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-center py-1">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <ArrowDown className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-destructive" /> Destination
          </label>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full h-12 px-4 rounded-xl bg-muted/50 border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all appearance-none"
          >
            <option value="">Select destination</option>
            {locations
              .filter((l) => l !== pickup)
              .map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
          </select>
        </div>
      </motion.div>

      {error ? (
        <div className="text-xs rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      ) : null}

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <button
          onClick={handleBook}
          disabled={!pickup || !destination || booking === "loading"}
          className="w-full h-13 py-3.5 rounded-xl btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {booking === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {booking === "loading" ? "Booking..." : "Book Ride"}
        </button>
      </motion.div>
    </div>
  );
};

export default BookRide;
