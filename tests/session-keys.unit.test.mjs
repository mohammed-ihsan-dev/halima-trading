// Per-purpose signing keys, signed customer sessions, and removal of hard-coded fallbacks.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.ADMIN_SESSION_SECRET ??= "unit-test-secret-0123456789-abcdefghijk";
const { deriveSigningKey } = await import("@/lib/admin-session-token");
const { createCustomerSessionPayload, verifyCustomerSessionToken } = await import("@/lib/user-auth");

const user = { id: "u-1", email: "ahmed@example.com", name: "Ahmed", phone: "+971501234567", role: "customer", status: "ACTIVE" };

test("each token type gets its own key, and production without a secret gets none", () => {
  const env = { NODE_ENV: "production", ADMIN_SESSION_SECRET: "x".repeat(40) };
  const otp = deriveSigningKey("otp-session", env);
  const customer = deriveSigningKey("customer-session", env);
  assert.ok(otp && customer);
  assert.notDeepEqual(otp, customer);
  assert.notDeepEqual(otp, Buffer.from(env.ADMIN_SESSION_SECRET));
  assert.equal(deriveSigningKey("otp-session", { NODE_ENV: "production" }), null);
});

test("customer sessions are signed and verify", () => {
  const token = createCustomerSessionPayload(user);
  assert.match(token, /^v1\.[\w-]+\.[\w-]+$/);
  const session = verifyCustomerSessionToken(token);
  assert.equal(session.email, user.email);
  assert.equal(session.id, user.id);
});

test("legacy unsigned, tampered, wrong-key and expired customer sessions are rejected", () => {
  const legacy = Buffer.from(JSON.stringify({ id: "u-2", email: "victim@example.com", name: "x" })).toString("base64");
  assert.equal(verifyCustomerSessionToken(legacy), null);

  const [v, , sig] = createCustomerSessionPayload(user).split(".");
  const forgedBody = Buffer.from(JSON.stringify({ id: "u-2", email: "victim@example.com", name: "x", exp: 9e9 })).toString("base64url");
  assert.equal(verifyCustomerSessionToken(`${v}.${forgedBody}.${sig}`), null);

  const otherKey = createHmac("sha256", "other").update(`v1.${forgedBody}`).digest("base64url");
  assert.equal(verifyCustomerSessionToken(`v1.${forgedBody}.${otherKey}`), null);

  const key = deriveSigningKey("customer-session");
  const expiredBody = Buffer.from(JSON.stringify({ id: "u-1", email: user.email, name: "x", exp: 1000 })).toString("base64url");
  const expired = `v1.${expiredBody}.${createHmac("sha256", key).update(`v1.${expiredBody}`).digest("base64url")}`;
  assert.equal(verifyCustomerSessionToken(expired), null);
  assert.equal(verifyCustomerSessionToken(undefined), null);
});

test("no hard-coded session secret or default admin password remains in the auth code", async () => {
  for (const file of ["lib/admin-auth.ts", "lib/admin-session-token.ts", "lib/otp-auth.ts", "lib/user-auth.ts"]) {
    const src = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /halima-otp-session-secret-key-2026|halima-trading-admin-secret-session-2026/, file);
    assert.doesNotMatch(src, /HalimaAdmin2026!|DEFAULT_ADMIN_CREDENTIALS/, file);
    assert.doesNotMatch(src, /process\.env\.ADMIN_SESSION_SECRET\s*\|\|/, `${file} must not fall back to a literal secret`);
  }
});
