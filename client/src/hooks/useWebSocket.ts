import { useEffect, useState, useCallback } from "react";
import {
  connectWebSocket,
  disconnectWebSocket,
  sendWsMessage,
  addWsMessageHandler,
  addWsStateHandler,
  getWsState,
} from "../services/ws";
import type { WsState } from "../services/ws";
import { useAuthStore } from "../stores/authStore";

export function useWebSocket() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [connectionState, setConnectionState] = useState<WsState>(getWsState);

  useEffect(() => {
    if (isAuthenticated) {
      connectWebSocket();
    } else {
      // Only disconnect on explicit logout (isAuthenticated flipped to false)
      disconnectWebSocket();
    }
  }, [isAuthenticated]);

  // Subscribe to state changes (separate effect so it's always active)
  useEffect(() => {
    setConnectionState(getWsState());
    const unsub = addWsStateHandler(setConnectionState);
    return unsub;
  }, []);

  const send = useCallback((data: Record<string, unknown>) => {
    sendWsMessage(data);
  }, []);

  const subscribe = useCallback((handler: (data: unknown) => void) => {
    return addWsMessageHandler(handler);
  }, []);

  return { connectionState, send, subscribe };
}
