import api from "@/lib/api";
import { User, UserRole } from "@/types/domain";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

interface AuthPayload {
  email: string;
  password: string;
  role?: UserRole;
}

interface AuthResponse {
  token: string;
  user: User;
}

export const loginRequest = async (payload: AuthPayload) => {
  const response = await api.post<ApiResponse<AuthResponse>>("/auth/login", payload);
  return response.data.data;
};

export const signupRequest = async (payload: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  vehicleNumber?: string;
}) => {
  const response = await api.post<ApiResponse<AuthResponse>>("/auth/signup", payload);
  return response.data.data;
};

export const meRequest = async () => {
  const response = await api.get<ApiResponse<{ user: User }>>("/auth/me");
  return response.data.data.user;
};
