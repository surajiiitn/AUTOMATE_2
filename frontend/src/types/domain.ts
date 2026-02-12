export type UserRole = "student" | "driver" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: "active" | "inactive";
  vehicleNumber?: string | null;
}

export type RideStatus =
  | "waiting"
  | "assigned"
  | "pickup"
  | "in-transit"
  | "completed"
  | "cancelled";

export type ComplaintStatus = "submitted" | "in_review" | "resolved" | "rejected";

export interface CurrentRide {
  id: string;
  status: RideStatus;
  pickup: string;
  destination: string;
  queuePosition: number | null;
  estimatedWaitMinutes: number;
  cancelCount: number;
  rideId: string | null;
  driver: {
    id: string;
    name: string;
    email: string;
  } | null;
  updatedAt: string;
}

export interface RideHistoryItem {
  id: string;
  date: string;
  from: string;
  to: string;
  status: RideStatus;
  driver: string;
  fare: string;
}

export interface DriverRideStudent {
  queueEntryId: string;
  id: string | null;
  name: string;
  email: string;
  pickup: string;
  destination: string;
  status: RideStatus;
  cancelCount: number;
}

export interface DriverRide {
  id: string;
  status: RideStatus;
  seatsFilled: number;
  maxSeats: number;
  driver: {
    id: string;
    name: string;
    email: string;
  } | null;
  students: DriverRideStudent[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Complaint {
  _id: string;
  complaintText: string;
  description?: string;
  status: ComplaintStatus;
  createdAt: string;
  updatedAt: string;
  tripId?: string | null;
  rideId?: string | null;
  adminResponse?: string;
  adminRemark?: string;
  student?: {
    _id: string;
    name: string;
    email: string;
    role: UserRole;
  };
}

export interface Schedule {
  _id: string;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  targetRole: "student" | "driver" | "all";
  driver?: {
    _id: string;
    name: string;
    email: string;
    role: UserRole;
  } | null;
  createdBy?: {
    _id: string;
    name: string;
    email: string;
    role: UserRole;
  };
}

export interface ChatMessage {
  id: string;
  roomType: "queue" | "trip";
  roomId: string;
  content: string;
  sender: {
    id: string;
    name: string;
    role: UserRole;
  };
  createdAt: string;
  rideId?: string;
}
