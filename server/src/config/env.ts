import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  SESSION_MAX_AGE: z.coerce.number().int().positive().default(86400000),
  WS_HEARTBEAT_INTERVAL: z.coerce.number().int().positive().default(30000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_AUTH_WINDOW: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_GENERAL_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_GENERAL_WINDOW: z.coerce.number().int().positive().default(3600000),
  MESSAGE_QUEUE_TTL: z.coerce.number().int().positive().default(86400000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.flatten().fieldErrors;
  console.error("Invalid environment variables:", formatted);
  process.exit(1);
}

export const env = parsed.data;
