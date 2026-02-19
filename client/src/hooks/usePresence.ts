import { useEffect, useState, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";

const onlineUsers = new Set<string>();

export function usePresence() {
  const { subscribe } = useWebSocket();
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribe((data: unknown) => {
      const msg = data as Record<string, unknown>;
      if (msg?.type === "presence") {
        const userId = msg.userId as string;
        const status = msg.status as string;
        if (status === "online") {
          onlineUsers.add(userId);
        } else {
          onlineUsers.delete(userId);
        }
        forceUpdate((n) => n + 1);
      }
    });

    return unsubscribe;
  }, [subscribe]);

  const isOnline = useCallback((userId: string): boolean => {
    return onlineUsers.has(userId);
  }, []);

  return { isOnline };
}
