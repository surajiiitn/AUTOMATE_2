import api from "@/lib/api";
import { Complaint } from "@/types/domain";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export const submitComplaintRequest = async (description: string, rideId?: string | null) => {
  const response = await api.post<ApiResponse<{ complaint: Complaint }>>("/complaints", {
    description,
    rideId: rideId || undefined,
  });

  return response.data.data.complaint;
};

export const getMyComplaintsRequest = async () => {
  const response = await api.get<ApiResponse<{ complaints: Complaint[] }>>("/complaints/mine");
  return response.data.data.complaints;
};

export const getAllComplaintsRequest = async () => {
  const response = await api.get<ApiResponse<{ complaints: Complaint[] }>>("/complaints");
  return response.data.data.complaints;
};

export const updateComplaintStatusRequest = async (
  complaintId: string,
  status: "waiting" | "assigned" | "completed",
  adminRemark?: string,
) => {
  const response = await api.patch<ApiResponse<{ complaint: Complaint }>>(
    `/complaints/${complaintId}/status`,
    {
      status,
      adminRemark,
    },
  );

  return response.data.data.complaint;
};
