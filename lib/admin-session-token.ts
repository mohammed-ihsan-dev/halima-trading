/**
 * Signed admin session tokens.
 *
 * Format: v1.<base64url(JSON payload)>.<base64url(HMAC-SHA256)>
 * The HMAC covers the version and payload, so any edit to the role, email or expiry
 * invalidates the token. Verification is constant-time and checks expiry, issue
 * time and role. No Next.js imports — usable from route handlers and tests alike.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // matches the cookie maxAge
export const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const VERSION = "v1";
const MIN_SECRET_LENGTH = 32;
const CLOCK_SKEW_SECONDS = 60;

export interface AdminSessionClaims {
  id?: string;
  email: string;
  name: string;
  role: string;
  /** Issued at, seconds since epoch. */
  iat: number;
  /** Expires at, seconds since epoch. */
  exp: number;
}

declare global {
  var _halimaDevAdminSecret: string | undefined;
}

/**
 * The signing secret. Production requires ADMIN_SESSION_SECRET (32+ characters) and
 * fails closed without it. Development falls back to a random per-process secret,
 * so local sessions simply end when the dev server restarts.
 */
export function getAdminSessionSecret(env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.ADMIN_SESSION_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;
  if (env.NODE_ENV === "production") return null;
  globalThis._halimaDevAdminSecret ??= randomBytes(32).toString("hex");
  return globalThis._halimaDevAdminSecret;
}

/**
 * A separate key per token type (OTP, customer session, …) derived from the same
 * ADMIN_SESSION_SECRET, so a token of one kind can never verify as another.
 * Null exactly when getAdminSessionSecret() is null (production without a secret).
 */
export function deriveSigningKey(purpose: string, env: Record<string, string | undefined> = process.env): Buffer | null {
  const base = getAdminSessionSecret(env);
  return base ? createHmac("sha256", base).update(`halima:${purpose}:v1`).digest() : null;
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const sign = (secret: string, body: string) => createHmac("sha256", secret).update(`${VERSION}.${body}`).digest();

export function signAdminSession(
  user: { id?: string; email: string; name: string; role: string },
  secret: string,
  now: number = Math.floor(Date.now() / 1000)
): string {
  if (!ADMIN_ROLES.has(user.role)) throw new Error("Only admin roles can receive an admin session.");
  const claims: AdminSessionClaims = {
    id: user.id, email: user.email, name: user.name, role: user.role,
    iat: now, exp: now + ADMIN_SESSION_MAX_AGE_SECONDS,
  };
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  return `${VERSION}.${body}.${b64url(sign(secret, body))}`;
}

/** Returns the claims only if the token is authentic, unexpired and carries an admin role. */
export function verifyAdminSession(
  token: string | undefined | null,
  secret: string | null,
  now: number = Math.floor(Date.now() / 1000)
): AdminSessionClaims | null {
  if (!token || !secret || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, body, signature] = parts;

  const expected = sign(secret, body);
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let claims: AdminSessionClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !claims || typeof claims !== "object" ||
    typeof claims.email !== "string" || !claims.email ||
    typeof claims.role !== "string" || !ADMIN_ROLES.has(claims.role) ||
    !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)
  ) {
    return null;
  }
  if (claims.exp <= now) return null; // expired
  if (claims.iat > now + CLOCK_SKEW_SECONDS) return null; // issued in the future
  if (claims.exp - claims.iat > ADMIN_SESSION_MAX_AGE_SECONDS) return null; // longer-lived than we ever issue
  return claims;
}
