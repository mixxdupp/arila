import { create } from "zustand";
import { api, ApiRequestError } from "../services/api";
import srpClient from "secure-remote-password/client.js";
import { initializeKeys } from "../crypto/signalManager";
import { clearAllKeys, getIdentityKeyPair } from "../crypto/keyStore";

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  pin: string | null;
  username: string | null;
  loading: boolean;
  error: string | null;
  register: (username: string, password: string) => Promise<string>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userId: null,
  pin: null,
  username: null,
  loading: false,
  error: null,

  register: async (username: string, password: string): Promise<string> => {
    set({ loading: true, error: null });
    try {
      const salt = srpClient.generateSalt();
      const privateKey = srpClient.derivePrivateKey(salt, username, password);
      const verifier = srpClient.deriveVerifier(privateKey);

      const result = await api.post<{ pin: string }>("/auth/register", {
        username,
        srpSalt: salt,
        srpVerifier: verifier,
      });

      set({ loading: false, pin: result.pin });
      return result.pin;
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : "Registration failed";
      set({ loading: false, error: message });
      throw err;
    }
  },

  login: async (username: string, password: string): Promise<void> => {
    set({ loading: true, error: null });
    try {
      // Step 1: Start login — get salt + server ephemeral
      const startResult = await api.post<{
        salt: string;
        serverPublicEphemeral: string;
      }>("/auth/login/start", { username });

      // Step 2: Derive client proof
      const clientEphemeral = srpClient.generateEphemeral();
      const privateKey = srpClient.derivePrivateKey(
        startResult.salt,
        username,
        password
      );
      const clientSession = srpClient.deriveSession(
        clientEphemeral.secret,
        startResult.serverPublicEphemeral,
        startResult.salt,
        username,
        privateKey
      );

      // Step 3: Finish login — send proof, get server proof
      const finishResult = await api.post<{ serverProof: string }>(
        "/auth/login/finish",
        {
          username,
          clientPublicEphemeral: clientEphemeral.public,
          clientProof: clientSession.proof,
        }
      );

      // Step 4: Verify server proof
      srpClient.verifySession(
        clientEphemeral.public,
        clientSession,
        finishResult.serverProof
      );

      // Step 5: Fetch user info from /auth/me
      const me = await api.get<{ userId: string; pin: string; username: string }>("/auth/me");

      // Step 6: Ensure Signal Protocol keys exist BEFORE marking authenticated
      // (setting isAuthenticated triggers WebSocket, which delivers messages)
      await ensureKeysUploaded();

      set({
        isAuthenticated: true,
        userId: me.userId,
        pin: me.pin,
        username: me.username,
        loading: false,
      });
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : "Login failed";
      set({ loading: false, error: message });
      throw err;
    }
  },

  logout: async (): Promise<void> => {
    try {
      await api.post("/auth/logout", {});
    } catch {
      // Ignore errors on logout
    }
    set({
      isAuthenticated: false,
      userId: null,
      pin: null,
      username: null,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));

/** Generate Signal Protocol keys and upload to server if not already present */
async function ensureKeysUploaded(): Promise<void> {
  try {
    // Check if local identity key exists AND server has the bundle
    const localIdentity = await getIdentityKeyPair();
    if (localIdentity) {
      try {
        const { exists } = await api.get<{ exists: boolean }>("/keys/check");
        if (exists) {
          console.log("[Arila] Key bundle exists on server and local keys intact");
          return;
        }
        // Server doesn't have bundle — fall through to regenerate
      } catch {
        // Check failed — fall through to regenerate
      }
    } else {
      console.log("[Arila] No local identity key — must regenerate");
    }

    // Generate fresh keys and upload — clear everything since identity changed
    console.log("[Arila] Generating new key bundle...");
    await clearAllKeys();
    const bundle = await initializeKeys();
    console.log("[Arila] Uploading key bundle to server...");
    await api.post("/keys/bundle", bundle);
    console.log("[Arila] Key bundle uploaded successfully");
  } catch (err) {
    console.error("[Arila] Failed to generate/upload key bundle:", err);
  }
}
