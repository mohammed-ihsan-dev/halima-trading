// Admin authentication over HTTP against a running server backed by an ISOLATED local DB.
// Required env: TEST_BASE_URL, TEST_ADMIN_SESSION_SECRET (the ADMIN_SESSION_SECRET that server uses).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test, { before } from "node:test";

const BASE = process.env.TEST_BASE_URL;
const SECRET = process.env.TEST_ADMIN_SESSION_SECRET;
const skip = !(BASE && SECRET) && "set TEST_BASE_URL and TEST_ADMIN_SESSION_SECRET";
const COOKIE = "halima_admin_session";
let signAdminSession, ADMIN_SESSION_MAX_AGE_SECONDS, validCookie;

const GET_ROUTES = [
  "/api/admin/session", "/api/admin/products", "/api/admin/orders", "/api/admin/users",
  "/api/admin/payments", "/api/admin/stats", "/api/admin/products/import/template?format=csv",
];
const POST_ROUTES = ["/api/admin/products/import", "/api/admin/products/import/catalogue-dry-run"];

const call = (path, cookie, method = "GET") => {
  const init = { method, headers: cookie ? { cookie } : {} };
  if (method === "POST") {
    const fd = new FormData();
    fd.append("file", new File(["[]"], "x.json"));
    init.body = fd;
  }
  return fetch(BASE + path, init);
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const admin = { id: "u-admin", email: "admin@halimatrading.com", name: "Halima Admin", role: "super_admin" };

before(async () => {
  if (skip) return;
  ({ signAdminSession, ADMIN_SESSION_MAX_AGE_SECONDS } = await import("@/lib/admin-session-token"));
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: admin.email, password: "HalimaAdmin2026!" }),
  });
  assert.equal(res.status, 200, "legitimate admin login must keep working");
  validCookie = res.headers.get("set-cookie").split(";")[0];
});

test("legitimate login issues a signed, httpOnly session that unlocks every admin route", { skip }, async () => {
  assert.match(validCookie, new RegExp(`^${COOKIE}=v1\\.[\\w-]+\\.[\\w-]+$`));
  for (const path of GET_ROUTES) assert.equal((await call(path, validCookie)).status, 200, path);
  for (const path of POST_ROUTES) assert.notEqual((await call(path, validCookie, "POST")).status, 401, path);
});

test("wrong password does not log in", { skip }, async () => {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: admin.email, password: "wrong" }),
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
});

const now = () => Math.floor(Date.now() / 1000);
const badSessions = {
  missing: () => null,
  "forged legacy unsigned cookie": () => `${COOKIE}=${Buffer.from(JSON.stringify(admin)).toString("base64")}`,
  "forged signature": () => `${COOKIE}=v1.${b64({ ...admin, iat: now(), exp: now() + 3600 })}.${"A".repeat(43)}`,
  "tampered payload": () => {
    const [, , sig] = validCookie.split("=")[1].split(".");
    return `${COOKIE}=v1.${b64({ ...admin, email: "attacker@example.com", iat: now(), exp: now() + 3600 })}.${sig}`;
  },
  "signed with another secret": () => `${COOKIE}=${signAdminSession(admin, "x".repeat(40))}`,
  expired: () => `${COOKIE}=${signAdminSession(admin, SECRET, now() - ADMIN_SESSION_MAX_AGE_SECONDS - 5)}`,
  "customer role, correctly signed": () => {
    const body = b64({ email: "c@example.com", name: "c", role: "customer", iat: now(), exp: now() + 3600 });
    return `${COOKIE}=v1.${body}.${createHmac("sha256", SECRET).update(`v1.${body}`).digest("base64url")}`;
  },
};

for (const [label, make] of Object.entries(badSessions)) {
  test(`${label} → 401 on every protected admin route`, { skip }, async () => {
    const cookie = make();
    for (const path of GET_ROUTES) assert.equal((await call(path, cookie)).status, 401, `${label} ${path}`);
    for (const path of POST_ROUTES) assert.equal((await call(path, cookie, "POST")).status, 401, `${label} POST ${path}`);
  });
}

test("logout clears the session cookie", { skip }, async () => {
  const res = await fetch(`${BASE}/api/admin/logout`, { method: "POST", headers: { cookie: validCookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("set-cookie"), new RegExp(`${COOKIE}=;`));
});
