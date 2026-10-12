import { cookies } from "next/headers";
import { getMongoUserRawByEmail, verifyPassword } from "@/lib/repositories/users";
import { getAdminSessionSecret, signAdminSession, verifyAdminSession } from "@/lib/admin-session-token";

export const ADMIN_COOKIE_NAME = "halima_admin_session";

export interface AdminSession {
  id?: string;
  email: string;
  name: string;
  role: string;
  authenticatedAt: string;
  expiresAt?: string;
}

export class AdminSessionConfigError extends Error {}


/**
 * Get the current admin session from the signed session cookie.
 * Unsigned, tampered, expired or non-admin cookies all yield null.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const claims = verifyAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value, getAdminSessionSecret());
    if (!claims) return null;
    // The signature proves who logged in; the account record decides whether they still may.
    // Suspending, deleting or demoting an admin therefore takes effect on their next request.
    const user = await getMongoUserRawByEmail(claims.email);
    if (!user || user.status !== "ACTIVE" || (user.role !== "admin" && user.role !== "super_admin")) return null;
    return {
      id: claims.id ?? user.id,
      email: claims.email,
      name: user.name ?? claims.name,
      role: user.role,
      authenticatedAt: new Date(claims.iat * 1000).toISOString(),
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Check if the request is from an authenticated admin
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const session = await getAdminSession();
  if (session !== null) return true;
  return false;
}

/**
 * Create the signed session cookie value. Throws AdminSessionConfigError when no
 * signing secret is configured (production without ADMIN_SESSION_SECRET).
 */
export function createAdminSessionPayload(email: string, name: string, role = "admin", id?: string): string {
  const secret = getAdminSessionSecret();
  if (!secret) {
    throw new AdminSessionConfigError("ADMIN_SESSION_SECRET is not set (32+ characters required in production).");
  }
  return signAdminSession({ id, email, name, role }, secret);
}

/**
 * Authenticate admin with email and password against MongoDB users collection
 */
export async function authenticateAdminUser(email: string, pass: string): Promise<AdminSession | null> {
  const user = await getMongoUserRawByEmail(email);
  if (!user || user.status !== "ACTIVE") {
    return null;
  }

  if (user.role !== "super_admin" && user.role !== "admin") {
    return null;
  }

  // No password on record means no login — there is no built-in fallback password.
  if (!user.passwordHash || !user.salt) {
    return null;
  }

  const isValid = verifyPassword(pass, user.salt, user.passwordHash);
  if (!isValid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    authenticatedAt: new Date().toISOString(),
  };
}
