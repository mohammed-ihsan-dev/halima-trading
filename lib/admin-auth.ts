import { cookies } from "next/headers";
import { getMongoUserRawByEmail, verifyPassword } from "@/lib/repositories/users";

export const ADMIN_COOKIE_NAME = "halima_admin_session";
export const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "halima-trading-admin-secret-session-2026";

export interface AdminSession {
  id?: string;
  email: string;
  name: string;
  role: string;
  authenticatedAt: string;
}

export const DEFAULT_ADMIN_CREDENTIALS = {
  email: "admin@halimatrading.com",
  password: "HalimaAdmin2026!",
  name: "Halima Admin",
  role: "super_admin",
};

/**
 * Get current admin session from server cookies
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);
    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString("utf-8"));
    if (decoded && decoded.email && (decoded.role === "super_admin" || decoded.role === "admin")) {
      return decoded as AdminSession;
    }
    return null;
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
 * Create encoded session string
 */
export function createAdminSessionPayload(email: string, name: string, role = "admin", id?: string): string {
  const session: AdminSession = {
    id,
    email,
    name,
    role,
    authenticatedAt: new Date().toISOString(),
  };
  return Buffer.from(JSON.stringify(session)).toString("base64");
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

  if (!user.passwordHash || !user.salt) {
    // Check default admin fallback password
    if (email.toLowerCase() === DEFAULT_ADMIN_CREDENTIALS.email.toLowerCase() && pass === DEFAULT_ADMIN_CREDENTIALS.password) {
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authenticatedAt: new Date().toISOString(),
      };
    }
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
