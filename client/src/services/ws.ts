import { WS_URL, WS_RECONNECT_BASE, WS_RECONNECT_MAX } from "../utils/constants";

type MessageHandler = (data: unknown) => void;
type StateHandler = (state: WsState) => void;

export type WsState = "connecting" | "open" | "closing" | "closed";

let socket: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let shouldBeConnected = false;
const messageHandlers = new Set<MessageHandler>();
const stateHandlers = new Set<StateHandler>();

function notifyState(state: WsState): void {
  for (const handler of stateHandlers) {
    handler(state);
  }
}

function getReconnectDelay(): number {
  const delay = Math.min(
    WS_RECONNECT_BASE * Math.pow(2, reconnectAttempts),
    WS_RECONNECT_MAX
  );
  return delay + Math.random() * 1000; // Jitter
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping" }));
    }
  }, 30000);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function clearReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (!shouldBeConnected) return;
  clearReconnect();
  reconnectAttempts++;
  const delay = getReconnectDelay();
  reconnectTimer = setTimeout(() => {
    if (shouldBeConnected) {
      openSocket();
    }
  }, delay);
}

function openSocket(): void {
  // Already connected or connecting — nothing to do
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
    return;
  }

  notifyState("connecting");
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    if (!shouldBeConnected) {
      // We were told to disconnect while the socket was still connecting.
      // Now that it's open we can cleanly close it.
      socket?.close(1000);
      return;
    }
    reconnectAttempts = 0;
    startHeartbeat();
    notifyState("open");
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as unknown;
      for (const handler of messageHandlers) {
        handler(data);
      }
    } catch {
      // Ignore malformed messages
    }
  };

  socket.onclose = (event) => {
    stopHeartbeat();
    socket = null;
    notifyState("closed");

    // Don't reconnect if closed intentionally or flag cleared
    if (event.code === 1000 || event.code === 4000 || !shouldBeConnected) return;

    scheduleReconnect();
  };

  socket.onerror = () => {
    // Error will trigger onclose
  };
}

/** Request a WebSocket connection. Idempotent — safe to call multiple times. */
export function connectWebSocket(): void {
  shouldBeConnected = true;
  clearReconnect();
  openSocket();
}

/** Permanently tear down the WebSocket (call on logout). */
export function disconnectWebSocket(): void {
  shouldBeConnected = false;
  clearReconnect();
  stopHeartbeat();
  reconnectAttempts = 0;

  if (socket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1000);
    }
    // If CONNECTING, don't close — onopen will see shouldBeConnected=false and close cleanly.
    // If CLOSING/CLOSED, nothing to do.
    if (socket.readyState !== WebSocket.CONNECTING) {
      socket = null;
    }
  }
  notifyState("closed");
}

export function sendWsMessage(data: Record<string, unknown>): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

export function addWsMessageHandler(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  return () => {
    messageHandlers.delete(handler);
  };
}

export function addWsStateHandler(handler: StateHandler): () => void {
  stateHandlers.add(handler);
  return () => {
    stateHandlers.delete(handler);
  };
}

export function getWsState(): WsState {
  if (!socket) return "closed";
  switch (socket.readyState) {
    case WebSocket.CONNECTING: return "connecting";
    case WebSocket.OPEN: return "open";
    case WebSocket.CLOSING: return "closing";
    case WebSocket.CLOSED: return "closed";
    default: return "closed";
  }
}
