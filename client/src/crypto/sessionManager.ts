import { api } from "../services/api";
import { establishSession, hasSession } from "./signalManager";
import type { PreKeyInfo } from "./signalManager";

interface KeyBundleResponse {
  identityKey: string;
  signedPreKeyId: number;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey: { keyId: number; publicKey: string } | null;
}

/**
 * Ensures a session exists with the contact.
 * Returns PreKeyInfo if a new session was just created (first message),
 * or null if session already existed.
 */
export async function ensureSession(contactId: string, pin: string): Promise<PreKeyInfo | null> {
  const exists = await hasSession(contactId);
  if (exists) return null;

  const bundle = await api.get<KeyBundleResponse>(`/keys/bundle/${pin}`);

  const preKeyInfo = await establishSession(contactId, {
    identityKey: bundle.identityKey,
    signedPreKey: bundle.signedPreKey,
    signedPreKeySignature: bundle.signedPreKeySignature,
    signedPreKeyId: bundle.signedPreKeyId,
    oneTimePreKey: bundle.oneTimePreKey,
  });

  return preKeyInfo;
}
