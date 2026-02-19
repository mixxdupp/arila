import { query } from "../config/database.js";
import type { QueuedMessage } from "../types/index.js";

interface QueueMessageParams {
  recipientId: string;
  encryptedPayload: string;
  messageType: "message" | "receipt" | "key_update";
}

export async function queueMessage(params: QueueMessageParams): Promise<{ id: string; timestamp: string }> {
  const result = await query<{ id: string; created_at: Date }>(
    `INSERT INTO message_queue (recipient_id, encrypted_payload, message_type)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [params.recipientId, params.encryptedPayload, params.messageType]
  );

  const row = result.rows[0];
  if (!row) throw new Error("Failed to queue message");

  return { id: row.id, timestamp: row.created_at.toISOString() };
}

export async function fetchQueuedMessages(userId: string): Promise<QueuedMessage[]> {
  const result = await query<QueuedMessage>(
    `SELECT id, recipient_id, encrypted_payload, message_type, created_at
     FROM message_queue
     WHERE recipient_id = $1
     ORDER BY created_at ASC`,
    [userId]
  );
  return result.rows;
}

export async function deleteQueuedMessage(messageId: string): Promise<void> {
  await query("DELETE FROM message_queue WHERE id = $1", [messageId]);
}

export async function deleteQueuedMessages(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await query(
    "DELETE FROM message_queue WHERE id = ANY($1::uuid[])",
    [messageIds]
  );
}

export async function purgeOldMessages(ttlMs: number): Promise<number> {
  const result = await query(
    "DELETE FROM message_queue WHERE created_at < NOW() - ($1 || ' milliseconds')::interval",
    [ttlMs.toString()]
  );
  return result.rowCount ?? 0;
}
