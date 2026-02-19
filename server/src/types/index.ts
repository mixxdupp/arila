export interface User {
  id: string;
  username: string;
  pin: string;
  srp_salt: string;
  srp_verifier: string;
  created_at: Date;
  last_seen: Date;
}

export interface KeyBundle {
  id: string;
  user_id: string;
  identity_key: string;
  signed_prekey_id: number;
  signed_prekey: string;
  signed_prekey_signature: string;
  created_at: Date;
}

export interface OneTimePreKey {
  id: string;
  user_id: string;
  key_id: number;
  public_key: string;
  used: boolean;
  created_at: Date;
}

export interface QueuedMessage {
  id: string;
  recipient_id: string;
  encrypted_payload: string;
  message_type: "message" | "receipt" | "key_update";
  created_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}
