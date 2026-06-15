import {
  storeIdentityKeyPair,
  getIdentityKeyPair,
  storeSignedPreKey,
  getSignedPreKey,
  storePreKey,
  storeSession,
  getSession,
} from "./keyStore";

// Simple crypto primitives using Web Crypto API
async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  return {
    publicKey: arrayBufferToBase64(publicKeyRaw),
    privateKey: arrayBufferToBase64(privateKeyRaw),
  };
}

async function generateSignedPreKey(
  identityPrivateKey: string,
  keyId: number
): Promise<{
  keyId: number;
  publicKey: string;
  privateKey: string;
  signature: string;
}> {
  const keyPair = await generateKeyPair();

  // Sign the public key with identity key using ECDSA
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    base64ToArrayBuffer(identityPrivateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    base64ToArrayBuffer(keyPair.publicKey)
  );

  return {
    keyId,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    signature: arrayBufferToBase64(signature),
  };
}

async function deriveSharedSecret(
  privateKeyBase64: string,
  publicKeyBase64: string
): Promise<CryptoKey> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64ToArrayBuffer(privateKeyBase64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );

  const publicKey = await crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(publicKeyBase64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );

  return crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// Ratchet state stored per session
interface RatchetState {
  sendingChainKey: string;
  receivingChainKey: string;
  sendCounter: number;
  receiveCounter: number;
  rootKey: string;
  remotePublicKey: string;
  localKeyPair: { publicKey: string; privateKey: string };
}

async function hkdfDerive(
  inputKey: BufferSource,
  salt: BufferSource,
  info: string
): Promise<{ chainKey: ArrayBuffer; messageKey: ArrayBuffer }> {
  const key = await crypto.subtle.importKey("raw", inputKey, "HKDF", false, [
    "deriveBits",
  ]);
  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode(info),
    },
    key,
    512
  );
  return {
    chainKey: derived.slice(0, 32),
    messageKey: derived.slice(32, 64),
  };
}

async function ratchetStep(
  chainKeyBase64: string
): Promise<{ nextChainKey: string; messageKey: ArrayBuffer }> {
  const chainKeyBuffer = base64ToArrayBuffer(chainKeyBase64);
  const salt = new Uint8Array(32);
  const { chainKey, messageKey } = await hkdfDerive(
    chainKeyBuffer,
    salt,
    "ratchet"
  );
  return {
    nextChainKey: arrayBufferToBase64(chainKey),
    messageKey,
  };
}

// Serialize all encryption to prevent concurrent ratchet state corruption.
// Delivery receipts fire asynchronously and can race with user-initiated sends —
// both would read the same session, ratchet from the same point, and one would
// overwrite the other's advance.
let encryptChain: Promise<unknown> = Promise.resolve();

// Encrypt a message using the current ratchet state
export function encryptMessage(
  contactId: string,
  plaintext: string
): Promise<{ ciphertext: string; header: string }> {
  const result = encryptChain.then(() => encryptMessageImpl(contactId, plaintext));
  encryptChain = result.catch(() => {});
  return result;
}

async function encryptMessageImpl(
  contactId: string,
  plaintext: string
): Promise<{ ciphertext: string; header: string }> {
  const sessionData = await getSession(contactId);
  if (!sessionData) {
    throw new Error("No session established with this contact");
  }

  const state: RatchetState = JSON.parse(sessionData);

  const { nextChainKey, messageKey } = await ratchetStep(state.sendingChainKey);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await crypto.subtle.importKey(
    "raw",
    messageKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  );

  state.sendingChainKey = nextChainKey;
  state.sendCounter++;
  await storeSession(contactId, JSON.stringify(state));

  const header = JSON.stringify({
    publicKey: state.localKeyPair.publicKey,
    counter: state.sendCounter - 1,
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  });

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    header,
  };
}

// Decrypt a message
export async function decryptMessage(
  contactId: string,
  ciphertext: string,
  header: string
): Promise<string> {
  const sessionData = await getSession(contactId);
  if (!sessionData) {
    throw new Error("No session established with this contact");
  }

  const state: RatchetState = JSON.parse(sessionData);
  const headerData = JSON.parse(header) as {
    publicKey: string;
    counter: number;
    iv: string;
  };

  // Check if we need a DH ratchet step
  if (headerData.publicKey !== state.remotePublicKey) {
    // Step 1: Derive receiving chain and intermediate root key
    const sharedSecret = await deriveSharedSecret(
      state.localKeyPair.privateKey,
      headerData.publicKey
    );
    const sharedBits = await crypto.subtle.exportKey("raw", sharedSecret);
    const { chainKey: newReceivingChain, messageKey: intermediateRootKey } =
      await hkdfDerive(
        sharedBits,
        base64ToArrayBuffer(state.rootKey),
        "dh-ratchet"
      );

    // Step 2: Derive sending chain and new root key (using intermediate root key)
    const newKeyPair = await generateKeyPair();
    const newSharedSecret = await deriveSharedSecret(
      newKeyPair.privateKey,
      headerData.publicKey
    );
    const newSharedBits = await crypto.subtle.exportKey("raw", newSharedSecret);
    const { chainKey: newSendingChain, messageKey: newRootKey } =
      await hkdfDerive(
        newSharedBits,
        intermediateRootKey,
        "dh-ratchet"
      );

    state.remotePublicKey = headerData.publicKey;
    state.receivingChainKey = arrayBufferToBase64(newReceivingChain);
    state.sendingChainKey = arrayBufferToBase64(newSendingChain);
    state.rootKey = arrayBufferToBase64(newRootKey);
    state.localKeyPair = newKeyPair;
    state.receiveCounter = 0;
    state.sendCounter = 0;
  }

  const { nextChainKey, messageKey } = await ratchetStep(
    state.receivingChainKey
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    messageKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(headerData.iv) },
    aesKey,
    base64ToArrayBuffer(ciphertext)
  );

  state.receivingChainKey = nextChainKey;
  state.receiveCounter++;
  await storeSession(contactId, JSON.stringify(state));

  return new TextDecoder().decode(decrypted);
}

// Initialize keys on registration
export async function initializeKeys(): Promise<{
  identityKey: string;
  signedPreKeyId: number;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKeys: Array<{ keyId: number; publicKey: string }>;
}> {
  const identityKeyPair = await generateKeyPair();
  await storeIdentityKeyPair(identityKeyPair);

  const signedPreKeyId = 1;
  const signedPreKeyData = await generateSignedPreKey(
    identityKeyPair.privateKey,
    signedPreKeyId
  );
  await storeSignedPreKey(signedPreKeyData);

  // Generate 100 One-Time PreKeys concurrently for significantly faster login/registration
  const preKeyPromises = Array.from({ length: 100 }, async (_, index) => {
    const keyId = index + 1;
    const preKeyPair = await generateKeyPair();
    await storePreKey({ keyId, ...preKeyPair });
    return { keyId, publicKey: preKeyPair.publicKey };
  });

  const oneTimePreKeys = await Promise.all(preKeyPromises);

  return {
    identityKey: identityKeyPair.publicKey,
    signedPreKeyId,
    signedPreKey: signedPreKeyData.publicKey,
    signedPreKeySignature: signedPreKeyData.signature,
    oneTimePreKeys,
  };
}

// Pre-key info returned when establishing a new session (needed by receiver)
export interface PreKeyInfo {
  identityKey: string;
  ephemeralKey: string;
}

// Establish session from a fetched key bundle (X3DH initiator side)
// Returns PreKeyInfo that must be included in the first message
export async function establishSession(
  contactId: string,
  bundle: {
    identityKey: string;
    signedPreKey: string;
    signedPreKeySignature: string;
    signedPreKeyId: number;
    oneTimePreKey?: { keyId: number; publicKey: string } | null;
  }
): Promise<PreKeyInfo> {
  const identityKeyPair = await getIdentityKeyPair();
  if (!identityKeyPair) {
    throw new Error("No identity key pair found");
  }

  // Verify signed prekey signature
  const verifyKey = await crypto.subtle.importKey(
    "raw",
    base64ToArrayBuffer(bundle.identityKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  const isValid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifyKey,
    base64ToArrayBuffer(bundle.signedPreKeySignature),
    base64ToArrayBuffer(bundle.signedPreKey)
  );

  if (!isValid) {
    throw new Error("Invalid signed prekey signature");
  }

  // X3DH: Generate ephemeral key
  const ephemeralKeyPair = await generateKeyPair();

  // DH1: identity_private x signed_prekey
  const dh1 = await deriveSharedSecret(
    identityKeyPair.privateKey,
    bundle.signedPreKey
  );

  // DH2: ephemeral_private x identity_key
  const dh2 = await deriveSharedSecret(
    ephemeralKeyPair.privateKey,
    bundle.identityKey
  );

  // DH3: ephemeral_private x signed_prekey
  const dh3 = await deriveSharedSecret(
    ephemeralKeyPair.privateKey,
    bundle.signedPreKey
  );

  // Combine DH results
  const dh1Bits = await crypto.subtle.exportKey("raw", dh1);
  const dh2Bits = await crypto.subtle.exportKey("raw", dh2);
  const dh3Bits = await crypto.subtle.exportKey("raw", dh3);

  const combined = new Uint8Array(
    dh1Bits.byteLength + dh2Bits.byteLength + dh3Bits.byteLength
  );
  combined.set(new Uint8Array(dh1Bits), 0);
  combined.set(new Uint8Array(dh2Bits), dh1Bits.byteLength);
  combined.set(new Uint8Array(dh3Bits), dh1Bits.byteLength + dh2Bits.byteLength);

  // Derive root key and chain keys
  const salt = new Uint8Array(32);
  const { chainKey: sendingChainKey, messageKey: rootKeyBuffer } =
    await hkdfDerive(combined, salt, "x3dh-init");

  const state: RatchetState = {
    sendingChainKey: arrayBufferToBase64(sendingChainKey),
    receivingChainKey: arrayBufferToBase64(sendingChainKey), // Will be updated on first received message
    sendCounter: 0,
    receiveCounter: 0,
    rootKey: arrayBufferToBase64(rootKeyBuffer),
    remotePublicKey: bundle.signedPreKey,
    localKeyPair: ephemeralKeyPair, // Use ephemeral key as first ratchet key so responder recognises it
  };

  await storeSession(contactId, JSON.stringify(state));

  return {
    identityKey: identityKeyPair.publicKey,
    ephemeralKey: ephemeralKeyPair.publicKey,
  };
}

// Establish session as responder (when receiving first message)
export async function establishSessionResponder(
  contactId: string,
  senderIdentityKey: string,
  senderEphemeralKey: string
): Promise<void> {
  const identityKeyPair = await getIdentityKeyPair();
  if (!identityKeyPair) {
    throw new Error("No identity key pair found");
  }

  // For responder, we use our signed prekey
  const signedPreKey = await getSignedPreKey(1);
  if (!signedPreKey) {
    throw new Error("No signed prekey found");
  }

  // DH1: signed_prekey_private x sender_identity
  const dh1 = await deriveSharedSecret(
    signedPreKey.privateKey,
    senderIdentityKey
  );

  // DH2: identity_private x sender_ephemeral
  const dh2 = await deriveSharedSecret(
    identityKeyPair.privateKey,
    senderEphemeralKey
  );

  // DH3: signed_prekey_private x sender_ephemeral
  const dh3 = await deriveSharedSecret(
    signedPreKey.privateKey,
    senderEphemeralKey
  );

  const dh1Bits = await crypto.subtle.exportKey("raw", dh1);
  const dh2Bits = await crypto.subtle.exportKey("raw", dh2);
  const dh3Bits = await crypto.subtle.exportKey("raw", dh3);

  const combined = new Uint8Array(
    dh1Bits.byteLength + dh2Bits.byteLength + dh3Bits.byteLength
  );
  combined.set(new Uint8Array(dh1Bits), 0);
  combined.set(new Uint8Array(dh2Bits), dh1Bits.byteLength);
  combined.set(new Uint8Array(dh3Bits), dh1Bits.byteLength + dh2Bits.byteLength);

  const salt = new Uint8Array(32);
  const { chainKey: receivingChainKey, messageKey: rootKeyBuffer } =
    await hkdfDerive(combined, salt, "x3dh-init");

  // DH ratchet for sending: derive a sending chain that the initiator can
  // reproduce when it performs the corresponding DH ratchet on receive.
  const newLocalKeyPair = await generateKeyPair();
  const sendDH = await deriveSharedSecret(
    newLocalKeyPair.privateKey,
    senderEphemeralKey
  );
  const sendDHBits = await crypto.subtle.exportKey("raw", sendDH);
  const { chainKey: sendingChainKey, messageKey: newRootKeyBuffer } =
    await hkdfDerive(sendDHBits, rootKeyBuffer, "dh-ratchet");

  const state: RatchetState = {
    sendingChainKey: arrayBufferToBase64(sendingChainKey),
    receivingChainKey: arrayBufferToBase64(receivingChainKey),
    sendCounter: 0,
    receiveCounter: 0,
    rootKey: arrayBufferToBase64(newRootKeyBuffer),
    remotePublicKey: senderEphemeralKey,
    localKeyPair: newLocalKeyPair,
  };

  await storeSession(contactId, JSON.stringify(state));
}

export async function hasSession(contactId: string): Promise<boolean> {
  const session = await getSession(contactId);
  return session !== null;
}

export async function generateMorePreKeys(
  startId: number,
  count: number
): Promise<Array<{ keyId: number; publicKey: string }>> {
  const preKeyPromises = Array.from({ length: count }, async (_, index) => {
    const keyId = startId + index;
    const preKeyPair = await generateKeyPair();
    await storePreKey({ keyId, ...preKeyPair });
    return { keyId, publicKey: preKeyPair.publicKey };
  });

  const oneTimePreKeys = await Promise.all(preKeyPromises);
  return oneTimePreKeys;
}

// --- Utility functions ---
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
