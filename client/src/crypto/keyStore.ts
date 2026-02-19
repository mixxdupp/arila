import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "arila-keys";
const DB_VERSION = 3; // Bump to force IndexedDB upgrade and wipe stale data

interface ArilaKeyDB {
  identityKeys: {
    key: string;
    value: { publicKey: string; privateKey: string };
  };
  signedPreKeys: {
    key: number;
    value: {
      keyId: number;
      publicKey: string;
      privateKey: string;
      signature: string;
    };
  };
  preKeys: {
    key: number;
    value: {
      keyId: number;
      publicKey: string;
      privateKey: string;
    };
  };
  sessions: {
    key: string;
    value: {
      contactId: string;
      sessionData: string;
    };
  };
}

let dbInstance: IDBPDatabase<ArilaKeyDB> | null = null;

async function getDB(): Promise<IDBPDatabase<ArilaKeyDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ArilaKeyDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // On version upgrade, wipe all stores to force fresh key generation
      for (const name of db.objectStoreNames) {
        db.deleteObjectStore(name);
      }
      db.createObjectStore("identityKeys");
      db.createObjectStore("signedPreKeys", { keyPath: "keyId" });
      db.createObjectStore("preKeys", { keyPath: "keyId" });
      db.createObjectStore("sessions", { keyPath: "contactId" });
    },
  });

  return dbInstance;
}

// Identity Key Pair
export async function storeIdentityKeyPair(keyPair: {
  publicKey: string;
  privateKey: string;
}): Promise<void> {
  const db = await getDB();
  await db.put("identityKeys", keyPair, "local");
}

export async function getIdentityKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
} | null> {
  const db = await getDB();
  const result = await db.get("identityKeys", "local");
  return result ?? null;
}

// Signed PreKeys
export async function storeSignedPreKey(key: {
  keyId: number;
  publicKey: string;
  privateKey: string;
  signature: string;
}): Promise<void> {
  const db = await getDB();
  await db.put("signedPreKeys", key);
}

export async function getSignedPreKey(keyId: number): Promise<{
  keyId: number;
  publicKey: string;
  privateKey: string;
  signature: string;
} | null> {
  const db = await getDB();
  const result = await db.get("signedPreKeys", keyId);
  return result ?? null;
}

// One-Time PreKeys
export async function storePreKey(key: {
  keyId: number;
  publicKey: string;
  privateKey: string;
}): Promise<void> {
  const db = await getDB();
  await db.put("preKeys", key);
}

export async function getPreKey(keyId: number): Promise<{
  keyId: number;
  publicKey: string;
  privateKey: string;
} | null> {
  const db = await getDB();
  const result = await db.get("preKeys", keyId);
  return result ?? null;
}

export async function removePreKey(keyId: number): Promise<void> {
  const db = await getDB();
  await db.delete("preKeys", keyId);
}

export async function getAllPreKeyIds(): Promise<number[]> {
  const db = await getDB();
  const keys = await db.getAllKeys("preKeys");
  return keys as number[];
}

// Sessions
export async function storeSession(contactId: string, sessionData: string): Promise<void> {
  const db = await getDB();
  await db.put("sessions", { contactId, sessionData });
}

export async function getSession(contactId: string): Promise<string | null> {
  const db = await getDB();
  const result = await db.get("sessions", contactId);
  return result?.sessionData ?? null;
}

export async function removeSession(contactId: string): Promise<void> {
  const db = await getDB();
  await db.delete("sessions", contactId);
}

// Clear only sessions (used on login to remove stale sessions)
export async function clearSessions(): Promise<void> {
  const db = await getDB();
  await db.clear("sessions");
}

// Clear all keys (used on logout)
export async function clearAllKeys(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ["identityKeys", "signedPreKeys", "preKeys", "sessions"],
    "readwrite"
  );
  await Promise.all([
    tx.objectStore("identityKeys").clear(),
    tx.objectStore("signedPreKeys").clear(),
    tx.objectStore("preKeys").clear(),
    tx.objectStore("sessions").clear(),
    tx.done,
  ]);
}
