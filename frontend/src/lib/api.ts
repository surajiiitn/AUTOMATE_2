import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("automate_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const extractErrorMessage = (error: unknown, fallback = "Something went wrong") => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message) {
      return message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

export default api;
