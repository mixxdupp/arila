import { query, getClient } from "../config/database.js";
import type { KeyBundle, OneTimePreKey } from "../types/index.js";

interface KeyBundleUpload {
  userId: string;
  identityKey: string;
  signedPreKeyId: number;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKeys: Array<{ keyId: number; publicKey: string }>;
}

export async function uploadKeyBundle(data: KeyBundleUpload): Promise<void> {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    // Upsert key bundle
    await client.query(
      `INSERT INTO key_bundles (user_id, identity_key, signed_prekey_id, signed_prekey, signed_prekey_signature)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         identity_key = EXCLUDED.identity_key,
         signed_prekey_id = EXCLUDED.signed_prekey_id,
         signed_prekey = EXCLUDED.signed_prekey,
         signed_prekey_signature = EXCLUDED.signed_prekey_signature,
         created_at = NOW()`,
      [data.userId, data.identityKey, data.signedPreKeyId, data.signedPreKey, data.signedPreKeySignature]
    );

    // Delete old pre-keys before inserting fresh ones (identity may have changed)
    await client.query(
      "DELETE FROM one_time_prekeys WHERE user_id = $1",
      [data.userId]
    );

    // Insert one-time prekeys
    for (const otpk of data.oneTimePreKeys) {
      await client.query(
        `INSERT INTO one_time_prekeys (user_id, key_id, public_key)
         VALUES ($1, $2, $3)`,
        [data.userId, otpk.keyId, otpk.publicKey]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function fetchKeyBundle(userId: string): Promise<{
  identityKey: string;
  signedPreKeyId: number;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey: { keyId: number; publicKey: string } | null;
} | null> {
  const bundleResult = await query<KeyBundle>(
    "SELECT * FROM key_bundles WHERE user_id = $1",
    [userId]
  );

  const bundle = bundleResult.rows[0];
  if (!bundle) return null;

  // Fetch and consume one unused one-time prekey
  const otpkResult = await query<OneTimePreKey>(
    `UPDATE one_time_prekeys
     SET used = TRUE
     WHERE id = (
       SELECT id FROM one_time_prekeys
       WHERE user_id = $1 AND used = FALSE
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING key_id, public_key`,
    [userId]
  );

  const otpk = otpkResult.rows[0];

  return {
    identityKey: bundle.identity_key,
    signedPreKeyId: bundle.signed_prekey_id,
    signedPreKey: bundle.signed_prekey,
    signedPreKeySignature: bundle.signed_prekey_signature,
    oneTimePreKey: otpk ? { keyId: otpk.key_id, publicKey: otpk.public_key } : null,
  };
}

/** Check if a key bundle exists without consuming any pre-keys */
export async function bundleExists(userId: string): Promise<boolean> {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM key_bundles WHERE user_id = $1",
    [userId]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10) > 0;
}

export async function getUnusedPreKeyCount(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*) as count FROM one_time_prekeys WHERE user_id = $1 AND used = FALSE",
    [userId]
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}
