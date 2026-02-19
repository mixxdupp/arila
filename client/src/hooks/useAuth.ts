import { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { api } from "../services/api";
import { initializeKeys } from "../crypto/signalManager";
import { clearAllKeys, getIdentityKeyPair } from "../crypto/keyStore";

async function ensureKeysUploaded(): Promise<void> {
  try {
    // Check if local identity key exists AND server has the bundle
    const localIdentity = await getIdentityKeyPair();
    if (localIdentity) {
      try {
        const { exists } = await api.get<{ exists: boolean }>("/keys/check");
        if (exists) {
          console.log("[Arila] Key bundle exists on server and local keys intact (session restore)");
          return;
        }
        // Server doesn't have bundle — fall through to regenerate
      } catch {
        // Check failed — fall through to regenerate
      }
    } else {
      console.log("[Arila] No local identity key — must regenerate (session restore)");
    }

    // Generate fresh keys and upload — clear everything since identity changed
    console.log("[Arila] Generating new key bundle (session restore)...");
    await clearAllKeys();
    const bundle = await initializeKeys();
    console.log("[Arila] Uploading key bundle to server...");
    await api.post("/keys/bundle", bundle);
    console.log("[Arila] Key bundle uploaded successfully (session restore)");
  } catch (err) {
    console.error("[Arila] Failed to generate/upload key bundle:", err);
  }
}

export function useAuth() {
  const { isAuthenticated, pin, username, loading, error, login, logout, register, clearError } =
    useAuthStore();

  useEffect(() => {
    // Check if we have a valid session on mount
    let cancelled = false;
    async function checkSession() {
      try {
        const result = await api.get<{ userId: string; pin: string; username: string }>("/auth/me");
        if (!cancelled) {
          // Ensure Signal Protocol keys exist BEFORE marking authenticated
          // (setting isAuthenticated triggers WebSocket, which delivers messages)
          await ensureKeysUploaded();
          useAuthStore.setState({
            isAuthenticated: true,
            userId: result.userId,
            pin: result.pin,
            username: result.username,
          });
        }
      } catch {
        // No valid session — stay on auth screen
      }
    }
    if (!isAuthenticated) {
      void checkSession();
    }
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return { isAuthenticated, pin, username, loading, error, login, logout, register, clearError };
}
