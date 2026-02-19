import { query } from "../config/database.js";
import { sha256, generateSessionToken } from "../utils/crypto.js";
import { env } from "../config/env.js";

interface SessionResult {
  token: string;
  userId: string;
  expiresAt: Date;
}

export async function createSession(userId: string): Promise<SessionResult> {
  const token = generateSessionToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return { token, userId, expiresAt };
}

export async function validateSession(token: string): Promise<string | null> {
  const tokenHash = sha256(token);

  const result = await query<{ user_id: string; expires_at: Date }>(
    `SELECT user_id, expires_at FROM sessions
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  return row.user_id;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  const tokenHash = sha256(token);
  await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

export async function deleteSessionsByUser(userId: string): Promise<void> {
  await query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

export async function purgeExpiredSessions(): Promise<number> {
  const result = await query("DELETE FROM sessions WHERE expires_at < NOW()");
  return result.rowCount ?? 0;
}
