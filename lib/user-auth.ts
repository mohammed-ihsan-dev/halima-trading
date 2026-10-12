import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { deriveSigningKey } from "@/lib/admin-session-token";
import type { SafeUser } from "@/lib/repositories/users";
import type { MongoOrderDoc } from "@/lib/repositories/orders";

export const USER_COOKIE_NAME = "halima_customer_session";

export interface CustomerSession {
  id: string;
  email: string;
  name: string;
  phone?: string;
  authenticatedAt: string;
}

const CUSTOMER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/** v1.<base64url(JSON)>.<base64url(HMAC-SHA256)> with a key derived for customer sessions. */
function signCustomerSession(session: CustomerSession & { exp: number }): string {
  const key = deriveSigningKey("customer-session");
  if (!key) throw new Error("Customer sessions are not configured: set ADMIN_SESSION_SECRET.");
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `v1.${body}.${createHmac("sha256", key).update(`v1.${body}`).digest("base64url")}`;
}

export function verifyCustomerSessionToken(token: string | undefined, now = Math.floor(Date.now() / 1000)): CustomerSession | null {
  const key = deriveSigningKey("customer-session");
  if (!token || !key) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const expected = createHmac("sha256", key).update(`v1.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    if (!decoded?.email || !decoded?.id || !Number.isInteger(decoded.exp) || decoded.exp <= now) return null;
    const { exp: _exp, ...session } = decoded;
    void _exp;
    return session as CustomerSession;
  } catch {
    return null;
  }
}

/**
 * Get current customer session from the signed session cookie.
 * Unsigned (legacy), tampered or expired cookies yield null.
 */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  try {
    const cookieStore = await cookies();
    return verifyCustomerSessionToken(cookieStore.get(USER_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

/**
 * Create the signed customer session value for the HttpOnly cookie.
 */
export function createCustomerSessionPayload(user: SafeUser): string {
  return signCustomerSession({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    authenticatedAt: new Date().toISOString(),
    exp: Math.floor(Date.now() / 1000) + CUSTOMER_SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Server-side order ownership validator.
 * Prevents Customer A from accessing Customer B's order.
 */
export function verifyOrderOwnership(
  order: MongoOrderDoc,
  session: CustomerSession | null,
  isAdmin: boolean = false
): boolean {
  // Admins can access any order
  if (isAdmin) return true;

  if (!session) return false;

  const orderEmail = (order.customerEmail || "").toLowerCase().trim();
  const sessionEmail = (session.email || "").toLowerCase().trim();

  // Check matching userId or matching customerEmail
  if (order.userId && order.userId === session.id) {
    return true;
  }

  if (orderEmail && sessionEmail && orderEmail === sessionEmail) {
    return true;
  }

  return false;
}
