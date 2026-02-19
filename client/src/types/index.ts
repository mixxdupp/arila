export interface Contact {
  userId: string;
  pin: string;
  addedAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  plaintext: string;
  timestamp: string;
  status: MessageStatus;
  disappearAfter: DisappearTimer | null;
  readAt: string | null;
}

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export type DisappearTimer = 30 | 300 | 3600 | 86400;

export interface ChatPreview {
  contactId: string;
  pin: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface WSIncomingMessage {
  type: "message";
  id: string;
  encryptedPayload: string;
  messageType: "message" | "receipt" | "key_update";
  timestamp: string;
}

export interface WSDelivered {
  type: "delivered";
  messageId: string;
}

export interface WSTyping {
  type: "typing";
  senderId: string;
}

export interface WSPresence {
  type: "presence";
  userId: string;
  status: "online" | "offline";
}
