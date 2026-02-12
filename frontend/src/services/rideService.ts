import api from "@/lib/api";
import { CurrentRide, DriverRide, RideHistoryItem } from "@/types/domain";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface DriverCurrentRideData {
  ride: DriverRide | null;
  waitingCount: number;
}

export interface AdminQueueEntry {
  id: string;
  student: {
    id: string;
    name: string;
    email: string;
  } | null;
  pickup: string;
  destination: string;
  position: number;
  status: string;
  queueAt: string;
}

export interface AdminQueueOverview {
  waitingQueue: AdminQueueEntry[];
  activeRides: DriverRide[];
}

export const bookRideRequest = async (pickup: string, destination: string) => {
  const response = await api.post<ApiResponse<{ currentRide: CurrentRide }>>("/rides/book", {
    pickup,
    destination,
  });

  return response.data.data.currentRide;
};

export const getStudentCurrentRideRequest = async () => {
  const response = await api.get<ApiResponse<{ currentRide: CurrentRide | null }>>("/rides/student/current");
  return response.data.data.currentRide;
};

export const getStudentHistoryRequest = async () => {
  const response = await api.get<ApiResponse<{ rides: RideHistoryItem[] }>>("/rides/student/history");
  return response.data.data.rides;
};

export const getDriverCurrentRideRequest = async () => {
  const response = await api.get<ApiResponse<DriverCurrentRideData>>("/rides/driver/current");
  return response.data.data;
};

export const markArrivedRequest = async (queueEntryId: string) => {
  await api.patch<ApiResponse<{ queueEntryId: string; status: string }>>(
    `/rides/driver/students/${queueEntryId}/arrive`,
  );
};

export const cancelStudentRequest = async (queueEntryId: string) => {
  const response = await api.patch<ApiResponse<{ status: string; cancelCount: number }>>(
    `/rides/driver/students/${queueEntryId}/cancel`,
  );

  return response.data.data;
};

export const startTripRequest = async () => {
  const response = await api.patch<ApiResponse<DriverCurrentRideData>>("/rides/driver/start");
  return response.data.data;
};

export const completeTripRequest = async () => {
  const response = await api.patch<ApiResponse<{ rideId: string; status: string }>>(
    "/rides/driver/complete",
  );

  return response.data.data;
};

export const getAdminQueueRequest = async () => {
  const response = await api.get<ApiResponse<AdminQueueOverview>>("/rides/admin/queue");
  return response.data.data;
};

export const getAdminStatsRequest = async () => {
  const response = await api.get<ApiResponse<{ stats: { students: number; drivers: number; activeQueue: number; complaints: number } }>>(
    "/rides/admin/stats",
  );

  return response.data.data.stats;
};
