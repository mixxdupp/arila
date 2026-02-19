import srp from "secure-remote-password/server.js";

interface SRPServerSession {
  serverSecretEphemeral: string;
  serverPublicEphemeral: string;
}

// In-memory store for SRP handshake state (lives only during login flow)
// Key: username, Value: server ephemeral pair
const srpSessions = new Map<string, SRPServerSession>();

export function generateServerEphemeral(verifier: string): {
  serverPublicEphemeral: string;
  serverSecretEphemeral: string;
} {
  const serverEphemeral = srp.generateEphemeral(verifier);
  return {
    serverPublicEphemeral: serverEphemeral.public,
    serverSecretEphemeral: serverEphemeral.secret,
  };
}

export function storeSRPSession(username: string, session: SRPServerSession): void {
  srpSessions.set(username, session);
  // Auto-cleanup after 2 minutes to prevent memory leaks from abandoned logins
  setTimeout(() => {
    srpSessions.delete(username);
  }, 120000);
}

export function getSRPSession(username: string): SRPServerSession | undefined {
  return srpSessions.get(username);
}

export function deleteSRPSession(username: string): void {
  srpSessions.delete(username);
}

export function verifyClientProof(
  serverSecretEphemeral: string,
  clientPublicEphemeral: string,
  clientProof: string,
  salt: string,
  verifier: string,
  username: string
): string {
  // Throws if proof is invalid
  const serverSession = srp.deriveSession(
    serverSecretEphemeral,
    clientPublicEphemeral,
    salt,
    username,
    verifier,
    clientProof
  );
  return serverSession.proof;
}
