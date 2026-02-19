/**
 * Arila Full Integration Test
 * Tests: registration, login (SRP), key bundles, contacts, messaging,
 *        WebSocket delivery, receipts, session validation, rate limiting, logout
 */
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRequire = createRequire(join(__dirname, "server", "package.json"));
const srp = serverRequire("secure-remote-password/client");

const { default: WebSocket } = await import("ws");

const BASE = "http://localhost:3001";

const results = [];
function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  const icon = pass ? "PASS" : "FAIL";
  console.log(`  [${icon}] ${name}${detail ? " — " + detail : ""}`);
}

async function api(method, path, body, cookie) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookieArr = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, setCookieArr };
}

function extractSessionCookie(setCookieArr) {
  const header = setCookieArr.find(c => c.startsWith("session="));
  if (!header) return null;
  // Extract just the session=value part (before the first ;)
  const match = header.match(/^(session=[^;]+)/);
  return match ? match[1] : null;
}

// ── Helpers ──
function generateKeys(count) {
  const keys = [];
  for (let i = 1; i <= count; i++) {
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(i, 0);
    for (let j = 4; j < 32; j++) buf[j] = Math.floor(Math.random() * 256);
    keys.push({ keyId: i, publicKey: buf.toString("base64") });
  }
  return keys;
}

function fakeIdentityKey() {
  const buf = Buffer.alloc(65);
  buf[0] = 0x04;
  for (let j = 1; j < 65; j++) buf[j] = Math.floor(Math.random() * 256);
  return buf.toString("base64");
}

function fakeSignedPreKey() {
  return {
    signedPreKeyId: 1,
    signedPreKey: fakeIdentityKey(),
    signedPreKeySignature: Buffer.alloc(64).fill(0xAB).toString("base64"),
  };
}

async function srpLogin(username, password) {
  const startRes = await api("POST", "/api/auth/login/start", { username });
  if (startRes.status !== 200) throw new Error(`login/start failed: ${startRes.status} ${startRes.text}`);
  const { salt, serverPublicEphemeral } = startRes.json;
  const privateKey = srp.derivePrivateKey(salt, username, password);
  const clientEphemeral = srp.generateEphemeral();
  const clientSession = srp.deriveSession(
    clientEphemeral.secret, serverPublicEphemeral, salt, username, privateKey
  );
  const finishRes = await api("POST", "/api/auth/login/finish", {
    username,
    clientPublicEphemeral: clientEphemeral.public,
    clientProof: clientSession.proof,
  });
  const cookie = extractSessionCookie(finishRes.setCookieArr);
  return { status: finishRes.status, cookie, json: finishRes.json };
}

function dbQuery(sql) {
  return execSync(
    `docker exec arila-db psql -U arila -d arila -t -c "${sql}"`,
    { encoding: "utf8" }
  ).trim();
}

// ══════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════
let alicePin, bobPin, aliceCookie, bobCookie, aliceUserId, bobUserId;

console.log("\n═══ Arila Integration Tests ═══\n");

// ── a. Register Alice ──
try {
  const salt = srp.generateSalt();
  const privateKey = srp.derivePrivateKey(salt, "alice", "testpass123");
  const verifier = srp.deriveVerifier(privateKey);
  const res = await api("POST", "/api/auth/register", {
    username: "alice", srpSalt: salt, srpVerifier: verifier,
  });
  alicePin = res.json?.pin;
  record("a. Register Alice", res.status === 201 && !!alicePin, `PIN: ${alicePin}`);
} catch (e) { record("a. Register Alice", false, e.message); }

// ── b. Register Bob ──
try {
  const salt = srp.generateSalt();
  const privateKey = srp.derivePrivateKey(salt, "bob", "testpass456");
  const verifier = srp.deriveVerifier(privateKey);
  const res = await api("POST", "/api/auth/register", {
    username: "bob", srpSalt: salt, srpVerifier: verifier,
  });
  bobPin = res.json?.pin;
  record("b. Register Bob", res.status === 201 && !!bobPin, `PIN: ${bobPin}`);
} catch (e) { record("b. Register Bob", false, e.message); }

// ── c. Login Alice ──
try {
  const { status, cookie } = await srpLogin("alice", "testpass123");
  aliceCookie = cookie;
  record("c. Login Alice", status === 200 && !!aliceCookie, aliceCookie ? "cookie set" : "no cookie");
} catch (e) { record("c. Login Alice", false, e.message); }

// ── d. Login Bob ──
try {
  const { status, cookie } = await srpLogin("bob", "testpass456");
  bobCookie = cookie;
  record("d. Login Bob", status === 200 && !!bobCookie, bobCookie ? "cookie set" : "no cookie");
} catch (e) { record("d. Login Bob", false, e.message); }

// ── e. Upload Key Bundles ──
try {
  const aliceBundle = { identityKey: fakeIdentityKey(), ...fakeSignedPreKey(), oneTimePreKeys: generateKeys(10) };
  const resA = await api("POST", "/api/keys/bundle", aliceBundle, aliceCookie);
  record("e1. Upload Alice key bundle", resA.status === 200, `status ${resA.status}`);

  const bobBundle = { identityKey: fakeIdentityKey(), ...fakeSignedPreKey(), oneTimePreKeys: generateKeys(10) };
  const resB = await api("POST", "/api/keys/bundle", bobBundle, bobCookie);
  record("e2. Upload Bob key bundle", resB.status === 200, `status ${resB.status}`);
} catch (e) { record("e. Upload Key Bundles", false, e.message); }

// ── f. Fetch Key Bundle ──
try {
  const res1 = await api("GET", `/api/keys/bundle/${bobPin}`, null, aliceCookie);
  const hasFields = res1.json?.identityKey && res1.json?.signedPreKey && res1.json?.signedPreKeySignature;
  const firstPreKey = res1.json?.oneTimePreKey;
  record("f1. Fetch Bob key bundle", res1.status === 200 && !!hasFields, "identityKey, signedPreKey, signature present");

  const res2 = await api("GET", `/api/keys/bundle/${bobPin}`, null, aliceCookie);
  const differentPreKey = !res2.json?.oneTimePreKey || (firstPreKey?.keyId !== res2.json?.oneTimePreKey?.keyId);
  record("f2. One-time prekey consumed", differentPreKey, `first=${firstPreKey?.keyId}, second=${res2.json?.oneTimePreKey?.keyId}`);
} catch (e) { record("f. Fetch Key Bundle", false, e.message); }

// ── g. PIN Lookup ──
try {
  const res = await api("GET", `/api/contacts/lookup/${bobPin}`, null, aliceCookie);
  bobUserId = res.json?.userId;
  record("g. PIN Lookup Bob", res.status === 200 && !!bobUserId, `userId: ${bobUserId}`);
} catch (e) { record("g. PIN Lookup", false, e.message); }

// Get Alice's userId
try {
  const res = await api("GET", `/api/contacts/lookup/${alicePin}`, null, bobCookie);
  aliceUserId = res.json?.userId;
} catch {}

// ── h. Send Encrypted Message ──
let sentMessageId;
const testPayload = Buffer.from("encrypted-test-message-content").toString("base64");
try {
  const res = await api("POST", "/api/messages/send", {
    recipientId: bobUserId, encryptedPayload: testPayload, messageType: "message",
  }, aliceCookie);
  sentMessageId = res.json?.id;
  record("h. Send encrypted message", res.status === 201 && !!sentMessageId, `messageId: ${sentMessageId}`);
} catch (e) { record("h. Send encrypted message", false, e.message); }

// ── i. Verify Message Queued ──
try {
  const out = dbQuery(`SELECT COUNT(*) FROM message_queue WHERE recipient_id = '${bobUserId}';`);
  const count = parseInt(out, 10);
  record("i. Message queued in DB", count >= 1, `${count} message(s) in queue`);
} catch (e) { record("i. Message queued in DB", false, e.message); }

// ── j. WebSocket Test ──
try {
  const delivered = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WS timeout")), 5000);
    const ws = new WebSocket("ws://localhost:3001/ws", { headers: { Cookie: bobCookie } });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "message") {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    });
    ws.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
  const payloadMatch = delivered.encryptedPayload === testPayload;
  record("j. WebSocket delivers queued message", !!delivered && payloadMatch, `payload match: ${payloadMatch}`);
} catch (e) { record("j. WebSocket delivers queued message", false, e.message); }

// ── k. Delivery Receipt — Queue cleared after WS delivery ──
try {
  // Small delay to let the server delete queued messages
  await new Promise(r => setTimeout(r, 500));
  const out = dbQuery(`SELECT COUNT(*) FROM message_queue WHERE recipient_id = '${bobUserId}';`);
  const count = parseInt(out, 10);
  record("k. Message removed from queue after WS delivery", count === 0, `${count} message(s) remaining`);
} catch (e) { record("k. Delivery receipt", false, e.message); }

// ── l. Session Validation ──
try {
  const res1 = await api("GET", "/api/auth/me", null, aliceCookie);
  record("l1. /auth/me with valid cookie", res1.status === 200 && res1.json?.username === "alice", `username: ${res1.json?.username}`);

  const res2 = await api("GET", "/api/auth/me", null, "session=invalid.cookie");
  record("l2. /auth/me with invalid cookie", res2.status === 401, `status: ${res2.status}`);
} catch (e) { record("l. Session validation", false, e.message); }

// ── m. Rate Limiting ──
try {
  // Register limiter allows 5 per hour per IP. We already used 2 (alice, bob).
  // Send 4 more: 3 succeed (total=5), 6th = 429.
  let lastRes;
  for (let i = 1; i <= 4; i++) {
    const s = srp.generateSalt();
    const pk = srp.derivePrivateKey(s, `ratelim${i}`, "pass");
    const v = srp.deriveVerifier(pk);
    lastRes = await api("POST", "/api/auth/register", { username: `ratelim${i}`, srpSalt: s, srpVerifier: v });
  }
  record("m. Rate limiting (6th register → 429)", lastRes.status === 429, `status: ${lastRes.status}`);
} catch (e) { record("m. Rate limiting", false, e.message); }

// ── n. Logout ──
try {
  const res1 = await api("POST", "/api/auth/logout", null, aliceCookie);
  const hasClearCookie = res1.setCookieArr.some(c => c.startsWith("session="));
  record("n1. Logout clears cookie", res1.status === 200 && hasClearCookie, `set-cookie present: ${hasClearCookie}`);

  // After logout, the session token hash should be deleted from DB — cookie is now invalid
  const res2 = await api("GET", "/api/auth/me", null, aliceCookie);
  record("n2. /auth/me after logout → 401", res2.status === 401, `status: ${res2.status}`);
} catch (e) { record("n. Logout", false, e.message); }

// ══════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log("  INTEGRATION TEST SUMMARY");
console.log("═══════════════════════════════════════════════════");
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`\n  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}\n`);
console.log("  #   Test                                         Result");
console.log("  ─── ──────────────────────────────────────────── ──────");
results.forEach((r, i) => {
  const icon = r.pass ? "✓" : "✗";
  const label = r.name.padEnd(48);
  console.log(`  ${String(i+1).padStart(2)}) ${icon} ${label} ${r.pass ? "PASS" : "FAIL"}`);
  if (!r.pass && r.detail) console.log(`       └─ ${r.detail}`);
});
console.log("");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("  All tests passed!\n");
}
