import { create } from "zustand";
import type { Message, MessageStatus, DisappearTimer } from "../types";

interface Conversation {
  contactId: string;
  messages: Message[];
  disappearTimer: DisappearTimer | null;
  unreadCount: number;
}

interface ChatState {
  conversations: Record<string, Conversation>;
  activeContactId: string | null;
  typingUsers: Record<string, number>; // userId → timeout handle

  setActiveContact: (contactId: string | null) => void;
  addMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, status: MessageStatus) => void;
  markMessagesRead: (contactId: string) => void;
  deleteMessage: (contactId: string, messageId: string) => void;
  setDisappearTimer: (contactId: string, timer: DisappearTimer | null) => void;
  setTyping: (userId: string) => void;
  clearTyping: (userId: string) => void;
  getConversation: (contactId: string) => Conversation;
  clearAll: () => void;
}

function emptyConversation(contactId: string): Conversation {
  return {
    contactId,
    messages: [],
    disappearTimer: null,
    unreadCount: 0,
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: {},
  activeContactId: null,
  typingUsers: {},

  setActiveContact: (contactId: string | null) => {
    set({ activeContactId: contactId });
    if (contactId) {
      // Clear unread count when opening a conversation
      set((state) => {
        const conv = state.conversations[contactId];
        if (conv && conv.unreadCount > 0) {
          return {
            conversations: {
              ...state.conversations,
              [contactId]: { ...conv, unreadCount: 0 },
            },
          };
        }
        return state;
      });
    }
  },

  addMessage: (message: Message) => {
    set((state) => {
      const contactId =
        message.senderId === "self" ? message.recipientId : message.senderId;
      const conv = state.conversations[contactId] ?? emptyConversation(contactId);

      // Check for duplicate
      if (conv.messages.some((m) => m.id === message.id)) {
        return state;
      }

      const isIncoming = message.senderId !== "self";
      const isActive = state.activeContactId === contactId;

      return {
        conversations: {
          ...state.conversations,
          [contactId]: {
            ...conv,
            messages: [...conv.messages, message],
            unreadCount:
              isIncoming && !isActive ? conv.unreadCount + 1 : conv.unreadCount,
          },
        },
      };
    });
  },

  updateMessageStatus: (messageId: string, status: MessageStatus) => {
    set((state) => {
      const newConvs = { ...state.conversations };
      for (const [key, conv] of Object.entries(newConvs)) {
        const msgIndex = conv.messages.findIndex((m) => m.id === messageId);
        if (msgIndex !== -1) {
          const messages = [...conv.messages];
          const msg = messages[msgIndex];
          if (msg) {
            messages[msgIndex] = { ...msg, status };
            newConvs[key] = { ...conv, messages };
          }
          break;
        }
      }
      return { conversations: newConvs };
    });
  },

  markMessagesRead: (contactId: string) => {
    set((state) => {
      const conv = state.conversations[contactId];
      if (!conv) return state;
      return {
        conversations: {
          ...state.conversations,
          [contactId]: { ...conv, unreadCount: 0 },
        },
      };
    });
  },

  deleteMessage: (contactId: string, messageId: string) => {
    set((state) => {
      const conv = state.conversations[contactId];
      if (!conv) return state;
      return {
        conversations: {
          ...state.conversations,
          [contactId]: {
            ...conv,
            messages: conv.messages.filter((m) => m.id !== messageId),
          },
        },
      };
    });
  },

  setDisappearTimer: (contactId: string, timer: DisappearTimer | null) => {
    set((state) => {
      const conv = state.conversations[contactId] ?? emptyConversation(contactId);
      return {
        conversations: {
          ...state.conversations,
          [contactId]: { ...conv, disappearTimer: timer },
        },
      };
    });
  },

  setTyping: (userId: string) => {
    const existing = get().typingUsers[userId];
    if (existing) {
      clearTimeout(existing);
    }

    const handle = window.setTimeout(() => {
      set((state) => {
        const { [userId]: _, ...rest } = state.typingUsers;
        return { typingUsers: rest };
      });
    }, 3000);

    set((state) => ({
      typingUsers: { ...state.typingUsers, [userId]: handle },
    }));
  },

  clearTyping: (userId: string) => {
    const existing = get().typingUsers[userId];
    if (existing) {
      clearTimeout(existing);
    }
    set((state) => {
      const { [userId]: _, ...rest } = state.typingUsers;
      return { typingUsers: rest };
    });
  },

  getConversation: (contactId: string) => {
    return get().conversations[contactId] ?? emptyConversation(contactId);
  },

  clearAll: () => set({ conversations: {}, activeContactId: null, typingUsers: {} }),
}));
