import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { createHmac, timingSafeEqual } from "node:crypto";
import { validateSession } from "../services/sessionService.js";
import { fetchQueuedMessages, deleteQueuedMessage } from "../services/messageService.js";
import { addConnection, removeConnection, getConnectionByUserId, getOnlineUserIds } from "./rooms.js";
import { env } from "../config/env.js";

interface WSIncoming {
  type: string;
  [key: string]: unknown;
}

// Rate limiting for WS messages
const wsRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkWsRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = wsRateLimits.get(userId);

  if (!entry || entry.resetAt <= now) {
    wsRateLimits.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }

  entry.count++;
  return entry.count <= 120; // 120 messages per minute (includes acks, pings, typing)
}

// Cleanup WS rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of wsRateLimits) {
    if (entry.resetAt <= now) {
      wsRateLimits.delete(key);
    }
  }
}, 60000).unref();

async function authenticateWs(cookie: string | undefined, cookieSecret: string): Promise<string | null> {
  if (!cookie) return null;

  // Parse the session cookie from the cookie header
  const cookies = cookie.split(";").reduce<Record<string, string>>((acc, c) => {
    const [key, ...vals] = c.trim().split("=");
    if (key) acc[key] = vals.join("=");
    return acc;
  }, {});

  const sessionCookie = cookies["session"];
  if (!sessionCookie) return null;

  // Unsign the cookie (format: value.signature)
  const decoded = decodeURIComponent(sessionCookie);
  const dotIndex = decoded.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const value = decoded.slice(0, dotIndex);
  const signature = decoded.slice(dotIndex + 1);

  // Verify HMAC signature
  const expected = createHmac("sha256", cookieSecret).update(value).digest("base64").replace(/=+$/, "");
  if (signature.length !== expected.length) return null;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  // Validate the session token
  return validateSession(value);
}

async function deliverQueuedMessages(userId: string, ws: WebSocket): Promise<void> {
  try {
    const messages = await fetchQueuedMessages(userId);
    if (messages.length === 0) return;

    for (const msg of messages) {
      try {
        ws.send(JSON.stringify({
          type: "message",
          id: msg.id,
          encryptedPayload: msg.encrypted_payload,
          messageType: msg.message_type,
          timestamp: msg.created_at instanceof Date ? msg.created_at.toISOString() : msg.created_at,
        }));
        // Don't delete here — client sends "ack" after successful decryption,
        // which triggers deletion. This prevents message loss if the WS send
        // succeeds but the client never processes the message (e.g. page crash).
      } catch {
        break; // Stop if WebSocket fails
      }
    }
  } catch (err) {
    console.error("[Arila] deliverQueuedMessages error:", err);
  }
}

function handleMessage(userId: string, ws: WebSocket, data: RawData): void {
  if (!checkWsRateLimit(userId)) {
    ws.send(JSON.stringify({ type: "error", message: "Rate limit exceeded" }));
    return;
  }

  let parsed: WSIncoming;
  try {
    parsed = JSON.parse(data.toString()) as WSIncoming;
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    return;
  }

  switch (parsed.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong" }));
      break;

    case "typing": {
      const recipientId = parsed.recipientId;
      if (typeof recipientId !== "string") break;
      const recipientWs = getConnectionByUserId(recipientId);
      if (recipientWs) {
        recipientWs.send(JSON.stringify({ type: "typing", senderId: userId }));
      }
      break;
    }

    case "presence": {
      // Presence is handled automatically via connect/disconnect
      break;
    }

    case "delivered": {
      const messageId = parsed.messageId;
      const recipientId = parsed.recipientId;
      if (typeof messageId !== "string" || typeof recipientId !== "string") break;
      // Use authenticated userId as the sender — never trust client-supplied senderId
      const targetWs = getConnectionByUserId(recipientId);
      if (targetWs) {
        targetWs.send(JSON.stringify({ type: "delivered", messageId, from: userId }));
      }
      break;
    }

    case "ack": {
      // Client confirms it decrypted a message — safe to remove from queue
      const ackId = parsed.messageId;
      if (typeof ackId === "string") {
        void deleteQueuedMessage(ackId);
      }
      break;
    }

    default:
      break;
  }
}

export async function setupWebSocket(fastify: FastifyInstance): Promise<void> {
  const cookieSecret = env.SESSION_SECRET;

  fastify.server.on("upgrade", async (request, socket, head) => {
    fastify.log.info({ url: request.url }, "WebSocket upgrade request");

    // Only handle /ws path
    if (request.url !== "/ws") {
      socket.destroy();
      return;
    }

    const userId = await authenticateWs(request.headers.cookie, cookieSecret);
    if (!userId) {
      fastify.log.warn("WebSocket auth failed — no valid session cookie");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    fastify.log.info({ userId }, "WebSocket authenticated");

    // Use the ws library directly
    const wss = (fastify as unknown as { websocketServer?: import("ws").WebSocketServer }).websocketServer;
    if (!wss) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      addConnection(userId, ws);

      // Send currently-online users so the client knows who's online on connect
      const onlineIds = getOnlineUserIds().filter(id => id !== userId);
      for (const onlineId of onlineIds) {
        try {
          ws.send(JSON.stringify({ type: "presence", userId: onlineId, status: "online" }));
        } catch { break; }
      }

      // Deliver queued messages
      void deliverQueuedMessages(userId, ws);

      // Heartbeat
      let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) {
          ws.terminate();
          return;
        }
        alive = false;
        ws.ping();
      }, env.WS_HEARTBEAT_INTERVAL);

      ws.on("pong", () => {
        alive = true;
      });

      ws.on("message", (data) => {
        handleMessage(userId, ws, data);
      });

      ws.on("close", () => {
        clearInterval(heartbeat);
        removeConnection(userId, ws);
      });

      ws.on("error", () => {
        clearInterval(heartbeat);
        removeConnection(userId, ws);
      });
    });
  });
}
