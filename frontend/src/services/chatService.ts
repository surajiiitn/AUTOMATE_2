import api from "@/lib/api";
import { ChatMessage } from "@/types/domain";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ChatRoomContext {
  rideId: string;
  isGlobal?: boolean;
  otherUser: {
    id: string;
    name: string;
    email: string;
    role: "student" | "driver" | "admin";
  } | null;
}

export const getCurrentChatRoomRequest = async () => {
  const response = await api.get<ApiResponse<{ room: ChatRoomContext | null }>>("/chat/current-room");
  return response.data.data.room;
};

export const getRideMessagesRequest = async (rideId: string) => {
  const response = await api.get<ApiResponse<{ messages: ChatMessage[] }>>(`/chat/ride/${rideId}/messages`);
  return response.data.data.messages;
};

export const sendRideMessageRequest = async (rideId: string, content: string) => {
  const response = await api.post<ApiResponse<{ message: ChatMessage }>>(`/chat/ride/${rideId}/messages`, {
    content,
  });

  return response.data.data.message;
};
