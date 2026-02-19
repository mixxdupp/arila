import { encryptMessage, decryptMessage, establishSessionResponder } from "./signalManager";
import type { PreKeyInfo } from "./signalManager";

interface SealedMessage {
  recipientId: string;
  encryptedPayload: string;
  messageType: "message" | "receipt" | "key_update";
}

interface InnerPayload {
  senderId: string;
  senderPin: string;
  type: "text" | "delivery_receipt" | "read_receipt" | "disappearing_config";
  content: string;
  timestamp: string;
  disappearAfter: number | null;
}

/** Envelope format: includes pre-key info for first message so receiver can establish session */
interface SealedEnvelope {
  ciphertext: string;
  header: string;
  preKey?: PreKeyInfo; // Present on first message to a contact
}

export async function sealMessage(
  contactId: string,
  recipientId: string,
  senderId: string,
  senderPin: string,
  content: string,
  disappearAfter: number | null = null,
  preKeyInfo: PreKeyInfo | null = null
): Promise<SealedMessage> {
  const innerPayload: InnerPayload = {
    senderId,
    senderPin,
    type: "text",
    content,
    timestamp: new Date().toISOString(),
    disappearAfter,
  };

  const { ciphertext, header } = await encryptMessage(
    contactId,
    JSON.stringify(innerPayload)
  );

  const envelope: SealedEnvelope = { ciphertext, header };
  if (preKeyInfo) {
    envelope.preKey = preKeyInfo;
  }

  return {
    recipientId,
    encryptedPayload: JSON.stringify(envelope),
    messageType: "message",
  };
}

export async function sealReceipt(
  contactId: string,
  recipientId: string,
  senderId: string,
  senderPin: string,
  messageId: string,
  receiptType: "delivery_receipt" | "read_receipt"
): Promise<SealedMessage> {
  const innerPayload: InnerPayload = {
    senderId,
    senderPin,
    type: receiptType,
    content: messageId,
    timestamp: new Date().toISOString(),
    disappearAfter: null,
  };

  const { ciphertext, header } = await encryptMessage(
    contactId,
    JSON.stringify(innerPayload)
  );

  return {
    recipientId,
    encryptedPayload: JSON.stringify({ ciphertext, header } as SealedEnvelope),
    messageType: "receipt",
  };
}

/**
 * Unseal an incoming message that already has an established session.
 * Does NOT handle pre-key messages — use unsealPreKeyMessage for those.
 */
export async function unsealMessage(
  contactId: string,
  encryptedPayload: string
): Promise<InnerPayload> {
  const envelope = JSON.parse(encryptedPayload) as SealedEnvelope;

  if (envelope.preKey) {
    // Pre-key message: establish (or re-establish) responder session
    await establishSessionResponder(
      contactId,
      envelope.preKey.identityKey,
      envelope.preKey.ephemeralKey
    );
  }

  const decrypted = await decryptMessage(contactId, envelope.ciphertext, envelope.header);
  return JSON.parse(decrypted) as InnerPayload;
}

/**
 * Unseal a pre-key message using a temporary session ID.
 * The caller is responsible for moving the session to the correct contact
 * based on the senderPin in the returned payload.
 */
export async function unsealPreKeyMessage(
  tempSessionId: string,
  encryptedPayload: string
): Promise<InnerPayload> {
  const envelope = JSON.parse(encryptedPayload) as SealedEnvelope;

  if (!envelope.preKey) {
    throw new Error("Not a pre-key message");
  }

  await establishSessionResponder(
    tempSessionId,
    envelope.preKey.identityKey,
    envelope.preKey.ephemeralKey
  );

  const decrypted = await decryptMessage(tempSessionId, envelope.ciphertext, envelope.header);
  return JSON.parse(decrypted) as InnerPayload;
}
