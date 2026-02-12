import api from "@/lib/api";
import { ChatMessage } from "@/types/domain";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export type ChatRoomType = "queue" | "trip";

export interface ChatRoomContext {
  roomType: ChatRoomType;
  roomId: string;
  tripId?: string;
  rideId?: string;
  label: string;
  otherUser?: {
    id: string;
    name: string;
    email: string;
    role: "student" | "driver";
  } | null;
  students?: Array<{
    id: string;
    name: string;
    email: string;
    role: "student";
  }>;
}

export interface ChatContext {
  queueRoom: ChatRoomContext | null;
  tripRooms: ChatRoomContext[];
  defaultRoom: ChatRoomContext | null;
}

export const getCurrentChatContextRequest = async () => {
  const response = await api.get<ApiResponse<{ context: ChatContext }>>("/chat/context");
  return response.data.data.context;
};

export const getRoomMessagesRequest = async (roomType: ChatRoomType, roomId: string) => {
  const response = await api.get<ApiResponse<{ messages: ChatMessage[] }>>("/chat/messages", {
    params: {
      roomType,
      roomId,
    },
  });

  return response.data.data.messages;
};

export const sendRoomMessageRequest = async (
  roomType: ChatRoomType,
  roomId: string,
  content: string,
) => {
  const response = await api.post<ApiResponse<{ message: ChatMessage }>>("/chat/messages", {
    roomType,
    roomId,
    content,
  });

  return response.data.data.message;
};

// Backward-compatible exports for legacy callers.
export const getCurrentChatRoomRequest = async () => {
  const context = await getCurrentChatContextRequest();
  return context.defaultRoom;
};
export const getRideMessagesRequest = (rideId: string) => getRoomMessagesRequest("trip", rideId);
export const sendRideMessageRequest = (rideId: string, content: string) => (
  sendRoomMessageRequest("trip", rideId, content)
);
