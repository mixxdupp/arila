export const API_BASE = "/api";
export const WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
    : "";

export const PIN_PREFIX = "ARL-";
export const PIN_REGEX = /^ARL-[A-Z0-9]{6}$/;

export const SESSION_MAX_AGE = 86400000; // 24 hours
export const WS_RECONNECT_BASE = 1000; // 1 second
export const WS_RECONNECT_MAX = 30000; // 30 seconds
export const TYPING_TIMEOUT = 3000; // 3 seconds

export const DISAPPEAR_OPTIONS = [
  { label: "Off", value: null },
  { label: "30s", value: 30 },
  { label: "5m", value: 300 },
  { label: "1h", value: 3600 },
  { label: "24h", value: 86400 },
] as const;
