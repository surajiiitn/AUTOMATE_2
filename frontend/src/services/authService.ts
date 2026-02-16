import api from "@/lib/api";
import {
  BiometricLoginCredentialPayload,
  BiometricRegistrationCredentialPayload,
  ServerBiometricLoginOptions,
  ServerBiometricRegistrationOptions,
} from "@/lib/webauthn";
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

export const beginBiometricRegistrationRequest = async () => {
  const response = await api.post<ApiResponse<{ publicKey: ServerBiometricRegistrationOptions }>>(
    "/auth/biometric/register/options",
  );
  return response.data.data;
};

export const verifyBiometricRegistrationRequest = async (payload: {
  credential: BiometricRegistrationCredentialPayload;
}) => {
  const response = await api.post<ApiResponse<{ credentialId: string; credentialCount: number }>>(
    "/auth/biometric/register/verify",
    payload,
  );
  return response.data.data;
};

export const beginBiometricLoginRequest = async (payload: {
  email: string;
  role?: UserRole;
}) => {
  const response = await api.post<ApiResponse<{ publicKey: ServerBiometricLoginOptions }>>(
    "/auth/biometric/login/options",
    payload,
  );
  return response.data.data;
};

export const verifyBiometricLoginRequest = async (payload: {
  email: string;
  role?: UserRole;
  credential: BiometricLoginCredentialPayload;
}) => {
  const response = await api.post<ApiResponse<AuthResponse>>(
    "/auth/biometric/login/verify",
    payload,
  );
  return response.data.data;
};
