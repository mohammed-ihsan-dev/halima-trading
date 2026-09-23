import { cookies } from "next/headers";
import { getMongoUserRawByEmail, verifyPassword, SafeUser } from "@/lib/repositories/users";
import { MongoOrderDoc } from "@/lib/repositories/orders";

export const USER_COOKIE_NAME = "halima_customer_session";

export interface CustomerSession {
  id: string;
  email: string;
  name: string;
  phone?: string;
  authenticatedAt: string;
}

/**
 * Get current customer session from server cookies
 */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(USER_COOKIE_NAME);
    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString("utf-8"));
    if (decoded && decoded.email && decoded.id) {
      return decoded as CustomerSession;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create base64 customer session payload for HttpOnly cookie
 */
export function createCustomerSessionPayload(user: SafeUser): string {
  const session: CustomerSession = {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    authenticatedAt: new Date().toISOString(),
  };
  return Buffer.from(JSON.stringify(session)).toString("base64");
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
