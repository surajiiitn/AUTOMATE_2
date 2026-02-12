import api from "@/lib/api";
import { User, UserRole } from "@/types/domain";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export const getUsersRequest = async (params?: { q?: string; role?: UserRole }) => {
  const response = await api.get<ApiResponse<{ users: User[] }>>("/users", { params });
  return response.data.data.users;
};

export const createUserRequest = async (payload: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  vehicleNumber?: string;
}) => {
  const response = await api.post<ApiResponse<{ user: User }>>("/users", payload);
  return response.data.data.user;
};
