import { NextResponse } from "next/server";
import {
  authenticateAdminUser,
  createAdminSessionPayload,
  ADMIN_COOKIE_NAME,
  AdminSessionConfigError,
} from "@/lib/admin-auth";
import { ADMIN_SESSION_MAX_AGE_SECONDS } from "@/lib/admin-session-token";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const sessionUser = await authenticateAdminUser(email, password);

    if (sessionUser) {
      const payload = createAdminSessionPayload(
        sessionUser.email,
        sessionUser.name,
        sessionUser.role,
        sessionUser.id
      );

      const response = NextResponse.json({
        success: true,
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
          name: sessionUser.name,
          role: sessionUser.role,
        },
      });

      response.cookies.set({
        name: ADMIN_COOKIE_NAME,
        value: payload,
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: ADMIN_SESSION_MAX_AGE_SECONDS, // same lifetime as the signed token
      });

      return response;
    }

    return NextResponse.json(
      { success: false, error: "Invalid email or password or insufficient privileges" },
      { status: 401 }
    );
  } catch (error) {
    if (error instanceof AdminSessionConfigError) {
      console.error("Admin login unavailable:", error.message);
      return NextResponse.json(
        { success: false, error: "Admin login is not configured on this server. Set ADMIN_SESSION_SECRET." },
        { status: 503 }
      );
    }
    console.error("Admin login error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred during login" },
      { status: 500 }
    );
  }
}
