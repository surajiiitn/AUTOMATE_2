import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Send, CheckCheck, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  ChatContext,
  ChatRoomContext,
  getCurrentChatContextRequest,
  getRoomMessagesRequest,
  sendRoomMessageRequest,
} from "@/services/chatService";
import { ChatMessage } from "@/types/domain";
import { getSocket } from "@/lib/socket";
import { extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";

const ChatPage = () => {
  const { user } = useAuth();
  const [context, setContext] = useState<ChatContext | null>(null);
  const [activeRoom, setActiveRoom] = useState<ChatRoomContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isContextLoading, setIsContextLoading] = useState(true);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRoomRef = useRef<ChatRoomContext | null>(null);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((item) => item.id === message.id)) {
        return prev;
      }

      return [...prev, message];
    });
  }, []);

  const availableRooms = useMemo(() => {
    const rooms: ChatRoomContext[] = [];

    if (context?.queueRoom) {
      rooms.push(context.queueRoom);
    }

    if (context?.tripRooms?.length) {
      rooms.push(...context.tripRooms);
    }

    return rooms;
  }, [context]);

  const refreshContext = useCallback(async () => {
    setError(null);
    setIsContextLoading(true);

    try {
      const nextContext = await getCurrentChatContextRequest();
      const nextRooms: ChatRoomContext[] = [];

      if (nextContext.queueRoom) {
        nextRooms.push(nextContext.queueRoom);
      }

      if (nextContext.tripRooms?.length) {
        nextRooms.push(...nextContext.tripRooms);
      }

      setContext(nextContext);
      setActiveRoom((prevRoom) => {
        if (prevRoom) {
          const preserved = nextRooms.find(
            (room) => room.roomType === prevRoom.roomType && room.roomId === prevRoom.roomId,
          );

          if (preserved) {
            return preserved;
          }
        }

        return nextContext.defaultRoom || nextRooms[0] || null;
      });
    } catch (contextError) {
      setContext(null);
      setActiveRoom(null);
      setError(extractErrorMessage(contextError, "Unable to load chat"));
    } finally {
      setIsContextLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (!activeRoom?.roomType || !activeRoom?.roomId) {
      setMessages([]);
      return;
    }

    let isCancelled = false;

    const loadMessages = async () => {
      setIsMessagesLoading(true);

      try {
        const roomMessages = await getRoomMessagesRequest(activeRoom.roomType, activeRoom.roomId);
        if (!isCancelled) {
          setMessages(roomMessages);
        }
      } catch (messagesError) {
        if (!isCancelled) {
          setError(extractErrorMessage(messagesError, "Unable to load messages"));
          setMessages([]);
        }
      } finally {
        if (!isCancelled) {
          setIsMessagesLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [activeRoom?.roomType, activeRoom?.roomId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      return;
    }

    let isDisposed = false;
    const roomSnapshot = activeRoom;

    const emitWithAck = (eventName: string, payload: Record<string, unknown> = {}) => (
      new Promise<void>((resolve, reject) => {
        socket.emit(
          eventName,
          payload,
          (response: { ok: boolean; message?: string }) => {
            if (!response?.ok) {
              reject(new Error(response?.message || "Socket request failed"));
              return;
            }

            resolve();
          },
        );
      })
    );

    const syncRoom = async () => {
      if (!roomSnapshot) {
        return;
      }

      setIsJoiningRoom(true);

      try {
        if (roomSnapshot.roomType === "queue") {
          await emitWithAck("joinQueueChat");
        } else {
          const tripId = roomSnapshot.tripId;
          if (!tripId) {
            throw new Error("Trip is not available for chat");
          }

          await emitWithAck("joinTripChat", { tripId });
        }
      } catch (joinError) {
        if (!isDisposed) {
          setError(extractErrorMessage(joinError, "Unable to join chat room"));
        }
      } finally {
        if (!isDisposed) {
          setIsJoiningRoom(false);
        }
      }
    };

    syncRoom();

    return () => {
      isDisposed = true;

      if (!roomSnapshot) {
        return;
      }

      if (roomSnapshot.roomType === "queue") {
        socket.emit("leaveQueueChat", {});
        return;
      }

      socket.emit("leaveTripChat", {
        rideId: roomSnapshot.roomId,
      });
    };
  }, [activeRoom]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      return;
    }

    const handleQueueMessage = (message: ChatMessage) => {
      const room = activeRoomRef.current;
      if (!room || room.roomType !== "queue") {
        return;
      }

      if (message.roomType !== "queue") {
        return;
      }

      appendMessage(message);
    };

    const handleTripMessage = (message: ChatMessage) => {
      const room = activeRoomRef.current;
      if (!room || room.roomType !== "trip") {
        return;
      }

      if (message.roomType !== "trip" || message.roomId !== room.roomId) {
        return;
      }

      appendMessage(message);
    };

    const handleContextRefresh = () => {
      refreshContext();
    };

    socket.on("queueChatMessage", handleQueueMessage);
    socket.on("tripChatMessage", handleTripMessage);
    socket.on("queue:updated", handleContextRefresh);
    socket.on("queue:left", handleContextRefresh);
    socket.on("trip:assigned", handleContextRefresh);
    socket.on("trip:started", handleContextRefresh);
    socket.on("trip:completed", handleContextRefresh);

    return () => {
      socket.off("queueChatMessage", handleQueueMessage);
      socket.off("tripChatMessage", handleTripMessage);
      socket.off("queue:updated", handleContextRefresh);
      socket.off("queue:left", handleContextRefresh);
      socket.off("trip:assigned", handleContextRefresh);
      socket.off("trip:started", handleContextRefresh);
      socket.off("trip:completed", handleContextRefresh);
    };
  }, [appendMessage, refreshContext]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !activeRoom) {
      return;
    }

    setIsSending(true);
    setInput("");

    try {
      const socket = getSocket();

      if (socket && socket.connected) {
        const ackMessage = await new Promise<ChatMessage>((resolve, reject) => {
          if (activeRoom.roomType === "queue") {
            socket.emit(
              "queueChatMessage",
              { message: content },
              (response: { ok: boolean; message?: ChatMessage | string }) => {
                if (!response?.ok) {
                  const errorMessage =
                    typeof response?.message === "string"
                      ? response.message
                      : "Failed to send message";
                  reject(new Error(errorMessage));
                  return;
                }

                if (!response.message || typeof response.message === "string") {
                  reject(new Error("Message payload missing"));
                  return;
                }

                resolve(response.message);
              },
            );

            return;
          }

          if (!activeRoom.tripId) {
            reject(new Error("Trip is not available for chat"));
            return;
          }

          socket.emit(
            "tripChatMessage",
            {
              tripId: activeRoom.tripId,
              message: content,
            },
            (response: { ok: boolean; message?: ChatMessage | string }) => {
              if (!response?.ok) {
                const errorMessage =
                  typeof response?.message === "string"
                    ? response.message
                    : "Failed to send message";
                reject(new Error(errorMessage));
                return;
              }

              if (!response.message || typeof response.message === "string") {
                reject(new Error("Message payload missing"));
                return;
              }

              resolve(response.message);
            },
          );
        });

        appendMessage(ackMessage);
      } else {
        const message = await sendRoomMessageRequest(activeRoom.roomType, activeRoom.roomId, content);
        appendMessage(message);
      }
    } catch (sendError) {
      setInput(content);
      toast.error(extractErrorMessage(sendError, "Unable to send message"));
    } finally {
      setIsSending(false);
    }
  };

  if (isContextLoading) {
    return (
      <div className="max-w-lg mx-auto h-[60vh] flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (error && !activeRoom) {
    return (
      <div className="max-w-lg mx-auto h-[60vh] flex items-center justify-center text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (!activeRoom) {
    return (
      <div className="max-w-lg mx-auto h-[60vh] flex flex-col items-center justify-center text-center space-y-2">
        <p className="text-sm text-muted-foreground">No chat room available.</p>
        <p className="text-xs text-muted-foreground">
          {user?.role === "student"
            ? "Join the queue to enable chat."
            : "Queue chat is available when socket connection is active."}
        </p>
      </div>
    );
  }

  const roomName =
    activeRoom.roomType === "queue"
      ? user?.role === "student"
        ? "Driver"
        : "Queue Chat"
      : activeRoom.label || activeRoom.otherUser?.name || "Trip Chat";

  return (
    <div className="max-w-lg mx-auto flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)]">
      {user?.role === "driver" && availableRooms.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {availableRooms.map((room) => {
            const isActive = room.roomType === activeRoom.roomType && room.roomId === activeRoom.roomId;
            const label = room.roomType === "queue" ? "Queue" : room.label || "Trip";

            return (
              <button
                key={`${room.roomType}-${room.roomId}`}
                onClick={() => setActiveRoom(room)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center gap-3 pb-4 border-b border-border/60">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
          {roomName.charAt(0)}
        </div>
        <div>
          <div className="text-sm font-semibold">{roomName}</div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs text-muted-foreground">
              {isJoiningRoom ? "Connecting..." : "Online"}
            </span>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-3">
        {isMessagesLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          messages.map((msg) => {
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
          })
        )}
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-border/60">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 h-11 px-4 rounded-xl bg-muted border-0 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          disabled={isJoiningRoom || isMessagesLoading}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isSending || isJoiningRoom || isMessagesLoading}
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
