import { NextResponse } from "next/server";
import { verifyOtpCode, OTP_COOKIE_NAME } from "@/lib/otp-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, otp } = body;

    if (!phone || !otp) {
      return NextResponse.json(
        { success: false, error: "Both mobile number and verification code are required." },
        { status: 400 }
      );
    }

    const result = await verifyOtpCode(phone, otp);
    if (!result.success || !result.sessionPayload) {
      return NextResponse.json(
        { success: false, error: result.error || "Verification failed." },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Mobile number verified successfully.",
    });

    // Set secure HttpOnly cookie for temporary OTP session
    response.cookies.set({
      name: OTP_COOKIE_NAME,
      value: result.sessionPayload,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return response;
  } catch (error: any) {
    console.error("Error in /api/auth/verify-otp:", error);
    return NextResponse.json(
      { success: false, error: "Server error during verification. Please try again." },
      { status: 500 }
    );
  }
}
