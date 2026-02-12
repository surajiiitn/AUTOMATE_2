import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Send, CheckCheck, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  getCurrentChatRoomRequest,
  getRideMessagesRequest,
  sendRideMessageRequest,
  ChatRoomContext,
} from "@/services/chatService";
import { ChatMessage } from "@/types/domain";
import { getSocket } from "@/lib/socket";
import { extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";

const ChatPage = () => {
  const { user } = useAuth();
  const [room, setRoom] = useState<ChatRoomContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((item) => item.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  const loadChat = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const chatRoom = await getCurrentChatRoomRequest();
      setRoom(chatRoom);

      if (!chatRoom?.rideId) {
        setMessages([]);
        return;
      }

      const chatMessages = await getRideMessagesRequest(chatRoom.rideId);
      setMessages(chatMessages);
    } catch (loadError) {
      setError(extractErrorMessage(loadError, "Unable to load chat"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (!room?.rideId) {
      return;
    }

    const socket = getSocket();
    if (!socket) {
      return;
    }

    const handleMessage = (message: ChatMessage) => {
      if (message.rideId !== room.rideId) {
        return;
      }

      appendMessage(message);
    };

    socket.emit("chat:join", { rideId: room.rideId });
    socket.on("chat:message", handleMessage);

    return () => {
      socket.off("chat:message", handleMessage);
    };
  }, [appendMessage, room?.rideId]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !room?.rideId) {
      return;
    }

    setIsSending(true);
    setInput("");

    try {
      const socket = getSocket();

      if (socket && socket.connected) {
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            "chat:send",
            { rideId: room.rideId, content },
            (response: { ok: boolean; message?: ChatMessage | string }) => {
              if (!response?.ok) {
                const errorMessage =
                  typeof response?.message === "string"
                    ? response.message
                    : "Failed to send message";
                reject(new Error(errorMessage));
                return;
              }

              if (response.message && typeof response.message !== "string") {
                appendMessage(response.message);
              }

              resolve();
            },
          );
        });
      } else {
        const message = await sendRideMessageRequest(room.rideId, content);
        appendMessage(message);
      }
    } catch (sendError) {
      setInput(content);
      toast.error(extractErrorMessage(sendError, "Unable to send message"));
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto h-[60vh] flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto h-[60vh] flex items-center justify-center text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (!room?.rideId) {
    return (
      <div className="max-w-lg mx-auto h-[60vh] flex flex-col items-center justify-center text-center space-y-2">
        <p className="text-sm text-muted-foreground">No chat room found yet.</p>
        <p className="text-xs text-muted-foreground">
          Chat becomes available after your first ride assignment.
        </p>
      </div>
    );
  }

  const roomName = room.isGlobal
    ? "Campus Chat"
    : room.otherUser?.name || (user?.role === "student" ? "Driver" : "Student");

  return (
    <div className="max-w-lg mx-auto flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)]">
      <div className="flex items-center gap-3 pb-4 border-b border-border/60">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
          {roomName.charAt(0)}
        </div>
        <div>
          <div className="text-sm font-semibold">{roomName}</div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs text-muted-foreground">
              {room.isGlobal ? "All users" : "Online"}
            </span>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.map((msg) => {
          const isMe = msg.sender.id === user?.id;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] px-4 py-2.5 text-sm leading-relaxed ${
                  isMe
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-lg shadow-sm"
                    : "bg-muted text-foreground rounded-2xl rounded-bl-lg"
                }`}
              >
                <p>{msg.content}</p>
                <div
                  className={`flex items-center gap-1 mt-1.5 text-[10px] ${
                    isMe
                      ? "text-primary-foreground/50 justify-end"
                      : "text-muted-foreground"
                  }`}
                >
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {isMe && <CheckCheck className="w-3 h-3 text-info" />}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-border/60">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 h-11 px-4 rounded-xl bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isSending}
          className="w-11 h-11 rounded-xl btn-primary flex items-center justify-center disabled:opacity-40"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};

export default ChatPage;
