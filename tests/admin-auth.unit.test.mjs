// Unit tests for signed admin sessions (lib/admin-session-token.ts).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

const {
  signAdminSession,
  verifyAdminSession,
  getAdminSessionSecret,
  ADMIN_SESSION_MAX_AGE_SECONDS,
} = await import("@/lib/admin-session-token");

const SECRET = "test-secret-0123456789-abcdefghijklmnop"; // 39 chars
const admin = { id: "u-admin", email: "admin@halimatrading.com", name: "Halima Admin", role: "super_admin" };
const now = 1_800_000_000;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("a legitimately signed admin session verifies and carries its claims", () => {
  const claims = verifyAdminSession(signAdminSession(admin, SECRET, now), SECRET, now + 10);
  assert.equal(claims.email, admin.email);
  assert.equal(claims.role, "super_admin");
  assert.equal(claims.exp - claims.iat, ADMIN_SESSION_MAX_AGE_SECONDS);
});

test("missing or empty cookies are rejected", () => {
  for (const token of [undefined, null, "", "   "]) assert.equal(verifyAdminSession(token, SECRET, now), null);
});

test("the old unsigned base64 cookie format is rejected (the forgery that used to work)", () => {
  const legacy = Buffer.from(JSON.stringify({ email: "attacker@example.com", name: "x", role: "super_admin" })).toString("base64");
  assert.equal(verifyAdminSession(legacy, SECRET, now), null);
});

test("a forged token with a made-up signature is rejected", () => {
  const body = b64({ email: "attacker@example.com", name: "x", role: "super_admin", iat: now, exp: now + 3600 });
  assert.equal(verifyAdminSession(`v1.${body}.${Buffer.alloc(32).toString("base64url")}`, SECRET, now), null);
  assert.equal(verifyAdminSession(`v1.${body}.`, SECRET, now), null);
});

test("editing the payload of a genuine token (privilege or identity change) breaks the signature", () => {
  const genuine = signAdminSession({ ...admin, role: "admin" }, SECRET, now);
  const [v, , sig] = genuine.split(".");
  const tampered = `${v}.${b64({ ...admin, role: "super_admin", iat: now, exp: now + ADMIN_SESSION_MAX_AGE_SECONDS })}.${sig}`;
  assert.equal(verifyAdminSession(tampered, SECRET, now), null);
});

test("a token signed with a different secret is rejected", () => {
  assert.equal(verifyAdminSession(signAdminSession(admin, "another-secret-0123456789-abcdefghijk", now), SECRET, now), null);
});

test("expired sessions are rejected", () => {
  const token = signAdminSession(admin, SECRET, now);
  assert.ok(verifyAdminSession(token, SECRET, now + ADMIN_SESSION_MAX_AGE_SECONDS - 1));
  assert.equal(verifyAdminSession(token, SECRET, now + ADMIN_SESSION_MAX_AGE_SECONDS), null);
});

test("tokens dated in the future are rejected", () => {
  assert.equal(verifyAdminSession(signAdminSession(admin, SECRET, now + 3600), SECRET, now), null);
});

test("non-admin roles can neither be issued nor verified as admin sessions", () => {
  assert.throws(() => signAdminSession({ ...admin, role: "customer" }, SECRET, now));
  // Even correctly signed, a customer role must not pass.
  const body = b64({ email: "c@example.com", name: "c", role: "customer", iat: now, exp: now + 3600 });
  const sig = createHmac("sha256", SECRET).update(`v1.${body}`).digest("base64url");
  assert.equal(verifyAdminSession(`v1.${body}.${sig}`, SECRET, now), null);
});

test("malformed tokens never throw", () => {
  for (const token of ["v1", "v1..", "v2.a.b", "v1.%%%.%%%", "v1.e30.xyz", "x".repeat(5000)]) {
    assert.equal(verifyAdminSession(token, SECRET, now), null);
  }
});

test("production without ADMIN_SESSION_SECRET fails closed; short secrets are not accepted", () => {
  assert.equal(getAdminSessionSecret({ NODE_ENV: "production" }), null);
  assert.equal(getAdminSessionSecret({ NODE_ENV: "production", ADMIN_SESSION_SECRET: "too-short" }), null);
  assert.equal(getAdminSessionSecret({ NODE_ENV: "production", ADMIN_SESSION_SECRET: SECRET }), SECRET);
  assert.equal(verifyAdminSession(signAdminSession(admin, SECRET, now), null, now), null, "no secret → no session");
});

test("development without a secret uses a random per-process secret, never a hard-coded one", () => {
  const dev = getAdminSessionSecret({ NODE_ENV: "development" });
  assert.ok(dev && dev.length >= 32);
  assert.equal(getAdminSessionSecret({ NODE_ENV: "development" }), dev);
  assert.notEqual(dev, "halima-trading-admin-secret-session-2026");
});
