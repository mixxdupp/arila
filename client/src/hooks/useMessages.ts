import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "../stores/chatStore";
import { useAuthStore } from "../stores/authStore";
import { useContactStore } from "../stores/contactStore";
import { useWebSocket } from "./useWebSocket";
import { sendWsMessage } from "../services/ws";
import { sealMessage, sealReceipt, unsealMessage, unsealPreKeyMessage } from "../crypto/sealedSender";
import { ensureSession } from "../crypto/sessionManager";
import { hasSession } from "../crypto/signalManager";
import { getSession, storeSession, removeSession } from "../crypto/keyStore";
import { api } from "../services/api";
import type { Message } from "../types";

// Buffer for messages that arrived before the sender was added as a contact.
// Stored outside the hook so it persists across re-renders.
interface PendingMessage {
  encryptedPayload: string;
  id: string;
  timestamp: string;
  receivedAt: number;
}
const pendingMessages: PendingMessage[] = [];
const PENDING_TTL = 5 * 60 * 1000; // 5 minutes

// Serialize all message decryption to prevent concurrent ratchet state corruption.
// Two messages for the same contact processed in parallel would read the same
// session state and overwrite each other's ratchet advances.
let processingChain = Promise.resolve();

// Track processed message IDs to skip duplicate delivery.
// Messages are queued on server AND pushed via WS — both may arrive.
// Without this, the second copy would fail to decrypt (ratchet already advanced).
const processedMessageIds = new Set<string>();
const PROCESSED_IDS_MAX = 500;

// Track how many times a message has failed decryption across reconnections.
// After MAX_DECRYPT_RETRIES, the message is permanently dropped and ACK'd.
const decryptionFailures = new Map<string, number>();
const MAX_DECRYPT_RETRIES = 3;

export function useMessages() {
  const { subscribe } = useWebSocket();
  const pin = useAuthStore((s) => s.pin);
  const contacts = useContactStore((s) => s.contacts);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessageStatus = useChatStore((s) => s.updateMessageStatus);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const activeContactId = useChatStore((s) => s.activeContactId);
  // Use refs for values needed inside the WS handler to avoid re-subscribing
  const activeContactIdRef = useRef(activeContactId);
  activeContactIdRef.current = activeContactId;

  const pinRef = useRef(pin);
  pinRef.current = pin;

  // Handle incoming WebSocket messages
  useEffect(() => {
    const unsubscribe = subscribe((data: unknown) => {
      const msg = data as Record<string, unknown>;
      if (!msg || typeof msg !== "object") return;

      switch (msg.type) {
        case "message": {
          void handleIncomingMessage(msg);
          break;
        }
        case "delivered": {
          const messageId = msg.messageId as string;
          if (messageId) {
            updateMessageStatus(messageId, "delivered");
          }
          break;
        }
        case "typing": {
          const senderId = msg.senderId as string;
          if (senderId) {
            setTyping(senderId);
          }
          break;
        }
        default:
          break;
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // When contacts change, retry any pending messages
  useEffect(() => {
    if (contacts.length === 0 || pendingMessages.length === 0) return;

    const now = Date.now();
    const toRetry = pendingMessages.filter((p) => now - p.receivedAt < PENDING_TTL);
    // Clear the array
    pendingMessages.length = 0;

    for (const pm of toRetry) {
      void tryDecrypt(pm);
    }
  }, [contacts.length]);

  async function tryDecrypt(pm: PendingMessage): Promise<boolean> {
    const currentContacts = useContactStore.getState().contacts;
    const envelope = JSON.parse(pm.encryptedPayload) as { preKey?: { identityKey: string; ephemeralKey: string } };

    // Pre-key messages: use a temp session ID to avoid corrupting real sessions
    if (envelope.preKey) {
      const tempId = "__prekey_temp__";
      try {
        const decrypted = await unsealPreKeyMessage(tempId, pm.encryptedPayload);

        // Find the actual contact by senderPin from decrypted payload
        const contact = currentContacts.find(c => c.pin === decrypted.senderPin)
          || currentContacts.find(c => c.userId === decrypted.senderId);

        if (!contact) {
          // Sender not in contacts — clean up temp session, buffer for later
          await removeSession(tempId);
          return false;
        }

        // Move session from temp to the correct contact — but only if one
        // doesn't already exist. A re-delivered pre-key message (e.g. after page
        // crash before ACK) would create a fresh X3DH session that overwrites
        // the already-advanced ratchet, breaking all future messages.
        const existingSession = await getSession(contact.userId);
        if (!existingSession) {
          const sessionData = await getSession(tempId);
          if (sessionData) {
            await storeSession(contact.userId, sessionData);
          }
        }
        await removeSession(tempId);

        deliverDecrypted(contact.userId, pm.id, pm.timestamp, decrypted);
        return true;
      } catch (err) {
        try { await removeSession(tempId); } catch { /* cleanup */ }
        console.warn("[Arila] Pre-key message decryption failed:", err);
        // Don't buffer — if our own keys can't decrypt it, nothing will change
        return true;
      }
    }

    // Non-pre-key messages: try contacts with existing sessions
    // decryptMessage doesn't persist state until success, so sessions are safe
    for (const contact of currentContacts) {
      try {
        if (await hasSession(contact.userId)) {
          const decrypted = await unsealMessage(contact.userId, pm.encryptedPayload);
          deliverDecrypted(contact.userId, pm.id, pm.timestamp, decrypted);
          return true;
        }
      } catch {
        // Decryption failed — wrong session. Session isn't corrupted because
        // decryptMessage only persists state after successful decrypt.
        continue;
      }
    }

    // No contact could decrypt — do NOT acknowledge.
    // Returning false keeps the message in the server queue so it can be
    // retried on the next reconnect (e.g. after a session key refresh).
    // Track failure count to eventually drop genuinely corrupt messages.
    const failKey = pm.id;
    const failCount = (decryptionFailures.get(failKey) ?? 0) + 1;
    decryptionFailures.set(failKey, failCount);

    if (failCount >= MAX_DECRYPT_RETRIES) {
      console.warn("[Arila] Permanently dropping undecryptable message after max retries", { id: pm.id, failCount });
      decryptionFailures.delete(failKey);
      return true; // ACK to server — genuinely unrecoverable
    }

    console.warn("[Arila] Decryption failed, keeping in server queue for retry", {
      id: pm.id,
      failCount,
      contactCount: currentContacts.length,
    });
    return false;
  }

  function deliverDecrypted(
    matchedContactId: string,
    serverMessageId: string,
    timestamp: string,
    decrypted: { type: string; content: string; timestamp: string; disappearAfter: number | null }
  ): void {
    // Track this message as processed to prevent duplicate decryption
    processedMessageIds.add(serverMessageId);
    if (processedMessageIds.size > PROCESSED_IDS_MAX) {
      const first = processedMessageIds.values().next().value;
      if (first) processedMessageIds.delete(first);
    }

    if (decrypted.type === "delivery_receipt") {
      updateMessageStatus(decrypted.content, "delivered");
      return;
    }
    if (decrypted.type === "read_receipt") {
      updateMessageStatus(decrypted.content, "read");
      return;
    }
    if (decrypted.type === "text") {
      const message: Message = {
        id: serverMessageId,
        senderId: matchedContactId,
        recipientId: "self",
        plaintext: decrypted.content,
        timestamp: timestamp || decrypted.timestamp,
        status: "delivered",
        disappearAfter: decrypted.disappearAfter as Message["disappearAfter"],
        readAt: null,
      };

      addMessage(message);

      // Send delivery receipt
      void (async () => {
        try {
          const contact = useContactStore.getState().getContact(matchedContactId);
          if (contact && pinRef.current) {
            const receipt = await sealReceipt(
              matchedContactId,
              matchedContactId,
              "self",
              pinRef.current,
              serverMessageId,
              "delivery_receipt"
            );
            await api.post("/messages/send", receipt);
          }
        } catch {
          // Receipt send failure is non-critical
        }
      })();

      // Handle disappearing message timer
      if (message.disappearAfter && activeContactIdRef.current === matchedContactId) {
        setTimeout(() => {
          deleteMessage(matchedContactId, serverMessageId);
        }, message.disappearAfter * 1000);
      }
    }
  }

  function handleIncomingMessage(msg: Record<string, unknown>): void {
    // Serialize processing to prevent concurrent ratchet state corruption
    processingChain = processingChain.then(async () => {
      try {
        const encryptedPayload = msg.encryptedPayload as string;
        const serverMessageId = msg.id as string;
        const timestamp = msg.timestamp as string;

        // Skip duplicate delivery (WS push + queue poll can both deliver the same message)
        if (processedMessageIds.has(serverMessageId)) {
          return;
        }

        const pm: PendingMessage = {
          encryptedPayload,
          id: serverMessageId,
          timestamp,
          receivedAt: Date.now(),
        };

        const delivered = await tryDecrypt(pm);

        if (delivered) {
          // Tell server we decrypted this message — safe to remove from queue.
          // Without this, queue drain on reconnect re-delivers messages whose
          // ratchet state has already advanced, causing decryption failures.
          sendWsMessage({ type: "ack", messageId: serverMessageId });
        }

        if (!delivered) {
          pendingMessages.push(pm);
          console.warn("[Arila] Buffered incoming message (no matching contact yet)", {
            contactCount: useContactStore.getState().contacts.length,
            hasPreKey: !!(JSON.parse(encryptedPayload) as { preKey?: unknown }).preKey,
            bufferedCount: pendingMessages.length,
          });
        }
      } catch (err) {
        console.error("[Arila] handleIncomingMessage error:", err);
      }
    });
  }

  const sendMessage = useCallback(
    async (contactId: string, text: string): Promise<void> => {
      const contact = useContactStore.getState().getContact(contactId);
      if (!contact || !pinRef.current) {
        console.warn("[Arila] sendMessage: missing contact or pin", { contact: !!contact, pin: !!pinRef.current });
        return;
      }

      const disappearTimer = useChatStore.getState().getConversation(contactId).disappearTimer;

      // Optimistic add — show the message immediately
      const tempId = crypto.randomUUID();
      const message: Message = {
        id: tempId,
        senderId: "self",
        recipientId: contactId,
        plaintext: text,
        timestamp: new Date().toISOString(),
        status: "sending",
        disappearAfter: disappearTimer,
        readAt: null,
      };
      addMessage(message);

      try {
        // Ensure encrypted session exists (returns pre-key info if new session)
        const preKeyInfo = await ensureSession(contactId, contact.pin);

        const sealed = await sealMessage(
          contactId,
          contactId,
          "self",
          pinRef.current,
          text,
          disappearTimer,
          preKeyInfo
        );

        const result = await api.post<{ id: string; timestamp: string }>(
          "/messages/send",
          sealed
        );

        // Update with real ID and status
        useChatStore.setState((state) => {
          const conv = state.conversations[contactId];
          if (!conv) return state;
          const messages = conv.messages.map((m) =>
            m.id === tempId
              ? { ...m, id: result.id, timestamp: result.timestamp, status: "sent" as const }
              : m
          );
          return {
            conversations: {
              ...state.conversations,
              [contactId]: { ...conv, messages },
            },
          };
        });
      } catch (err) {
        console.error("[Arila] Failed to send message:", err);
        updateMessageStatus(tempId, "failed");
      }
    },
    [addMessage, updateMessageStatus]
  );

  const sendReadReceipt = useCallback(
    async (contactId: string, messageId: string): Promise<void> => {
      try {
        const contact = useContactStore.getState().getContact(contactId);
        if (!contact || !pinRef.current) return;

        const receipt = await sealReceipt(
          contactId,
          contactId,
          "self",
          pinRef.current,
          messageId,
          "read_receipt"
        );
        await api.post("/messages/send", receipt);
      } catch {
        // Non-critical
      }
    },
    []
  );

  return { sendMessage, sendReadReceipt };
}
