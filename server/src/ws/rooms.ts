import type { WebSocket } from "ws";

// In-memory map: userId → WebSocket connection
const connections = new Map<string, WebSocket>();

export function addConnection(userId: string, ws: WebSocket): void {
  // Close existing connection for this user (one session at a time)
  const existing = connections.get(userId);
  if (existing && existing.readyState === existing.OPEN) {
    existing.close(4000, "New connection established");
  }
  connections.set(userId, ws);

  // Broadcast online presence to all other connected users
  broadcastPresence(userId, "online");
}

export function removeConnection(userId: string, ws: WebSocket): void {
  const current = connections.get(userId);
  // Only remove if it's the same connection (prevents race conditions)
  if (current === ws) {
    connections.delete(userId);
    broadcastPresence(userId, "offline");
  }
}

function broadcastPresence(userId: string, status: "online" | "offline"): void {
  const message = JSON.stringify({ type: "presence", userId, status });
  for (const [otherId, ws] of connections) {
    if (otherId !== userId && ws.readyState === ws.OPEN) {
      try {
        ws.send(message);
      } catch {
        // Ignore send failures
      }
    }
  }
}

export function getConnectionByUserId(userId: string): WebSocket | undefined {
  const ws = connections.get(userId);
  if (ws && ws.readyState === ws.OPEN) {
    return ws;
  }
  return undefined;
}

export function isUserOnline(userId: string): boolean {
  return getConnectionByUserId(userId) !== undefined;
}

export function getOnlineUserIds(): string[] {
  const online: string[] = [];
  for (const [userId, ws] of connections) {
    if (ws.readyState === ws.OPEN) {
      online.push(userId);
    }
  }
  return online;
}

export function broadcastToUsers(userIds: string[], message: string): void {
  for (const userId of userIds) {
    const ws = getConnectionByUserId(userId);
    if (ws) {
      try {
        ws.send(message);
      } catch {
        // Ignore send failures
      }
    }
  }
}
