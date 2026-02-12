import api from "@/lib/api";
import { Schedule } from "@/types/domain";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export const getSchedulesRequest = async () => {
  const response = await api.get<ApiResponse<{ schedules: Schedule[] }>>("/schedules");
  return response.data.data.schedules;
};

export const createScheduleRequest = async (payload: {
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  targetRole?: "student" | "driver" | "all";
  driverId?: string;
}) => {
  const response = await api.post<ApiResponse<{ schedule: Schedule }>>("/schedules", payload);
  return response.data.data.schedule;
};
