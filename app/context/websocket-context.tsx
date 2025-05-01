// websocket.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router";

interface IWebSocketContext {
  socket: WebSocket | null;
  sendMessage: (message: any) => void;
  addListener: (callback: (data: any) => void) => void;
  removeListener: (callback: (data: any) => void) => void;
  sendMessageWithAck: (ws: WebSocket, message: any) => Promise<any>;
}

const WebSocketContext = createContext<IWebSocketContext | null>(null);

export const WebSocketProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const navigate = useNavigate();
  const listeners = useRef<((data: any) => void)[]>([]);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connectWebSocket = useCallback(() => {
    const ws = new WebSocket("ws://localhost:3001");

    ws.onopen = () => {
      console.log("WebSocket connected");
      setSocket(ws);
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("websocket message", data);

      listeners.current.forEach((callback) => callback(data));
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setSocket(null);

      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        setTimeout(() => connectWebSocket(), 2000);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }, []);

  useEffect(() => {
    connectWebSocket();

    return () => {
      socket?.close();
    };
  }, [connectWebSocket]);

  const sendMessage = (message: any) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not connected");
    }
  };

  const addListener = (callback: (data: any) => void) => {
    listeners.current.push(callback);
  };

  const removeListener = (callback: (data: any) => void) => {
    listeners.current = listeners.current.filter((cb) => cb !== callback);
  };

  const sendMessageWithAck = (ws: WebSocket, message: any) => {
    return new Promise((resolve, reject) => {
      const id = Date.now() + Math.random();

      const listener = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data?.ackId === id) {
          ws.removeEventListener("message", listener);
          resolve(data.payload);
        }
      };

      ws.addEventListener("message", listener);

      ws.send(JSON.stringify({ ...message, ackId: id }));

      setTimeout(() => {
        ws.removeEventListener("message", listener);
        reject(new Error("Timeout waiting for ack"));
      }, 5000); // Optional timeout
    });
  };

  return (
    <WebSocketContext.Provider
  value={{ socket, sendMessage, addListener, removeListener, sendMessageWithAck }}
>
  {children}
</WebSocketContext.Provider>

  )
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};
