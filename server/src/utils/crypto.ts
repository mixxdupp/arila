import { createHash, randomBytes } from "node:crypto";

export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}
