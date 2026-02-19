import { query } from "../config/database.js";
import { generatePin } from "../utils/pin.js";
import type { User } from "../types/index.js";

interface CreateUserParams {
  username: string;
  srpSalt: string;
  srpVerifier: string;
}

interface CreateUserResult {
  id: string;
  pin: string;
}

export async function createUser(params: CreateUserParams): Promise<CreateUserResult> {
  const { username, srpSalt, srpVerifier } = params;

  // Generate unique PIN with retry on collision
  let pin: string;
  let attempts = 0;
  const maxAttempts = 10;

  while (true) {
    pin = generatePin();
    const existing = await query("SELECT 1 FROM users WHERE pin = $1", [pin]);
    if (existing.rowCount === 0) break;
    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique PIN");
    }
  }

  const result = await query<{ id: string; pin: string }>(
    `INSERT INTO users (username, pin, srp_salt, srp_verifier)
     VALUES ($1, $2, $3, $4)
     RETURNING id, pin`,
    [username, pin, srpSalt, srpVerifier]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create user");
  }

  return { id: row.id, pin: row.pin };
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const result = await query<User>(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );
  return result.rows[0] ?? null;
}

export async function findUserByPin(pin: string): Promise<User | null> {
  const result = await query<User>(
    "SELECT * FROM users WHERE pin = $1",
    [pin]
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await query<User>(
    "SELECT * FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0] ?? null;
}

export async function updateLastSeen(userId: string): Promise<void> {
  await query("UPDATE users SET last_seen = NOW() WHERE id = $1", [userId]);
}
