import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import { env } from "./config/env.js";
import { testConnection, closePool } from "./config/database.js";
import { authRoutes } from "./routes/auth.js";
import { keyRoutes } from "./routes/keys.js";
import { contactRoutes } from "./routes/contacts.js";
import { messageRoutes } from "./routes/messages.js";
import { setupWebSocket } from "./ws/handler.js";
import { purgeOldMessages } from "./services/messageService.js";
import { purgeExpiredSessions } from "./services/sessionService.js";
import { generalLimiter } from "./middleware/rateLimit.js";

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "warn" : "info",
    transport:
      env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss Z" } }
        : undefined,
    redact: {
      paths: ["req.headers.cookie", "req.headers.authorization"],
      censor: "[REDACTED]",
    },
  },
  trustProxy: env.NODE_ENV === "production",
});

// --- Security Headers ---
fastify.addHook("onSend", async (_request, reply) => {
  reply.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "0");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  reply.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' wss://*.arila.app wss://*.onrender.com wss://*.up.railway.app",
      "img-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
});

// --- Static Files & SPA Fallback ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, "../../client/dist"),
  prefix: "/",
  wildcard: false,
});

fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith("/api/") || request.url.startsWith("/ws")) {
    return reply.status(404).send({ error: "Not Found" });
  }
  return reply.sendFile("index.html");
});

// --- Plugins ---
await fastify.register(cors, {
  origin: env.NODE_ENV === "production" ? ["https://arila.app", "https://demo.arila.app", /\.onrender\.com$/, /\.up\.railway\.app$/] : "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"],
});

await fastify.register(cookie, {
  secret: env.SESSION_SECRET,
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ noServer: true, maxPayload: 131072 });
(fastify as unknown as { websocketServer: WebSocketServer }).websocketServer = wss;
await setupWebSocket(fastify);

// --- Routes ---
await fastify.register(authRoutes);
await fastify.register(keyRoutes);
await fastify.register(contactRoutes);
await fastify.register(messageRoutes);

// --- Health Check ---
fastify.get("/api/health", { preHandler: [generalLimiter] }, async (_request, reply) => {
  try {
    await testConnection();
    return reply.send({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    return reply.status(503).send({ status: "error", message: "Database unavailable" });
  }
});

// --- Purge Cron (every 5 minutes) ---
const purgeInterval = setInterval(async () => {
  try {
    const msgCount = await purgeOldMessages(env.MESSAGE_QUEUE_TTL);
    const sessCount = await purgeExpiredSessions();
    if (msgCount > 0 || sessCount > 0) {
      fastify.log.info(`Purged ${msgCount} old messages, ${sessCount} expired sessions`);
    }
  } catch (err) {
    fastify.log.error(err, "Purge job failed");
  }
}, 300000); // 5 minutes
purgeInterval.unref();

// --- Graceful Shutdown ---
const shutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully`);
  clearInterval(purgeInterval);
  wss.close();
  await fastify.close();
  await closePool();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// --- Start ---
try {
  await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
  fastify.log.info(`Arila server running on port ${env.PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
