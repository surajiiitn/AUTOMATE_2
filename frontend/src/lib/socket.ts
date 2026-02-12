import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socketInstance: Socket | null = null;

export const getSocket = (): Socket | null => {
  const token = localStorage.getItem("automate_token");
  if (!token) {
    return null;
  }

  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      auth: {
        token,
      },
    });
  }

  if (!socketInstance.connected && socketInstance.disconnected) {
    socketInstance.auth = { token };
    socketInstance.connect();
  }

  return socketInstance;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
