import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api, ApiRequestError } from "../services/api";

interface Contact {
  userId: string;
  pin: string;
  addedAt: string;
}

interface ContactState {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
  addContact: (pin: string) => Promise<Contact>;
  removeContact: (userId: string) => void;
  getContact: (userId: string) => Contact | undefined;
  getContactByPin: (pin: string) => Contact | undefined;
  clearContacts: () => void;
  clearError: () => void;
}

export const useContactStore = create<ContactState>()(
  persist(
    (set, get) => ({
      contacts: [],
      loading: false,
      error: null,

      addContact: async (pin: string): Promise<Contact> => {
        set({ loading: true, error: null });
        try {
          const result = await api.get<{ userId: string; pin: string }>(
            `/contacts/lookup/${pin}`
          );

          const existing = get().contacts.find((c) => c.userId === result.userId);
          if (existing) {
            set({ loading: false });
            return existing;
          }

          const contact: Contact = {
            userId: result.userId,
            pin: result.pin,
            addedAt: new Date().toISOString(),
          };

          set((state) => ({
            contacts: [...state.contacts, contact],
            loading: false,
          }));

          return contact;
        } catch (err) {
          const message =
            err instanceof ApiRequestError ? err.message : "Failed to add contact";
          set({ loading: false, error: message });
          throw err;
        }
      },

      removeContact: (userId: string) => {
        set((state) => ({
          contacts: state.contacts.filter((c) => c.userId !== userId),
        }));
      },

      getContact: (userId: string) => {
        return get().contacts.find((c) => c.userId === userId);
      },

      getContactByPin: (pin: string) => {
        return get().contacts.find((c) => c.pin === pin);
      },

      clearContacts: () => set({ contacts: [], error: null }),
      clearError: () => set({ error: null }),
    }),
    {
      name: "arila-contacts",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ contacts: state.contacts }),
    }
  )
);
