import type { FastifyRequest, FastifyReply } from "fastify";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  max: number;
  windowMs: number;
  keyFn?: (request: FastifyRequest) => string;
}

function createLimiterStore() {
  const store = new Map<string, RateLimitEntry>();

  // Cleanup expired entries every 60 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 60000).unref();

  return store;
}

function getClientIp(request: FastifyRequest): string {
  // request.ip already respects Fastify's trustProxy setting
  return request.ip;
}

export function createRateLimiter(config: RateLimitConfig) {
  const store = createLimiterStore();

  return async function rateLimitHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const key = config.keyFn ? config.keyFn(request) : getClientIp(request);
    const now = Date.now();

    const existing = store.get(key);

    if (!existing || existing.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + config.windowMs });
      return;
    }

    existing.count++;

    const remaining = Math.max(0, config.max - existing.count);
    const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);

    reply.header("X-RateLimit-Limit", config.max);
    reply.header("X-RateLimit-Remaining", remaining);
    reply.header("X-RateLimit-Reset", Math.ceil(existing.resetAt / 1000));

    if (existing.count > config.max) {
      reply.header("Retry-After", retryAfterSec);
      return reply.status(429).send({
        error: "Too many requests",
        retryAfter: retryAfterSec,
      });
    }
  };
}

// --- Pre-configured limiters ---

// Registration: 5 requests per hour per IP
export const registerLimiter = createRateLimiter({
  max: 5,
  windowMs: 3600000,
});

// Login: 10 requests per minute per IP (each SRP login = 2 calls: start + finish)
export const loginLimiter = createRateLimiter({
  max: 10,
  windowMs: 60000,
});

// Key fetch: 20 requests per minute per user
export const keyFetchLimiter = createRateLimiter({
  max: 20,
  windowMs: 60000,
  keyFn: (request) => `key:${request.userId}`,
});

// Message send: 60 requests per minute per user
export const messageSendLimiter = createRateLimiter({
  max: 60,
  windowMs: 60000,
  keyFn: (request) => `msg:${request.userId}`,
});

// General API: 100 requests per minute per user
export const generalLimiter = createRateLimiter({
  max: 100,
  windowMs: 60000,
  keyFn: (request) => `gen:${request.userId}`,
});
