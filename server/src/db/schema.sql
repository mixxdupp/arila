-- Arila Database Schema
-- Zero-knowledge encrypted messenger
-- The server stores ONLY encrypted blobs and auth verifiers — never plaintext.

BEGIN;

-- Users table: minimal PII, no email, no phone
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) UNIQUE NOT NULL,
    pin VARCHAR(12) UNIQUE NOT NULL,
    srp_salt VARCHAR(512) NOT NULL,
    srp_verifier TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_pin ON users(pin);
CREATE INDEX idx_users_username ON users(username);

-- Signal Protocol key bundles
CREATE TABLE key_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    identity_key TEXT NOT NULL,
    signed_prekey_id INTEGER NOT NULL,
    signed_prekey TEXT NOT NULL,
    signed_prekey_signature TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_key_bundles_user_id ON key_bundles(user_id);

-- One-time prekeys (consumed on first message)
CREATE TABLE one_time_prekeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key TEXT NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_user_unused ON one_time_prekeys(user_id, used) WHERE used = FALSE;

-- Encrypted message queue (temporary — purged after delivery)
CREATE TABLE message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_payload TEXT NOT NULL,
    message_type VARCHAR(16) NOT NULL DEFAULT 'message',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_message_type CHECK (message_type IN ('message', 'receipt', 'key_update'))
);

CREATE INDEX idx_mq_recipient ON message_queue(recipient_id);

-- Sessions table (server-side session tracking)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

COMMIT;
