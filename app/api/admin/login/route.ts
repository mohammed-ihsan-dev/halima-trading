import { NextResponse } from "next/server";
import { authenticateAdminUser, createAdminSessionPayload, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";

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
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    return NextResponse.json(
      { success: false, error: "Invalid email or password or insufficient privileges" },
      { status: 401 }
    );
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred during login" },
      { status: 500 }
    );
  }
}
