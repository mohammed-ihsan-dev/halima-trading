import { NextResponse } from "next/server";
import { sendOtpToPhone } from "@/lib/otp-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone } = body;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { success: false, error: "A valid mobile phone number is required." },
        { status: 400 }
      );
    }

    const result = await sendOtpToPhone(phone);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send verification code." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your mobile number.",
      resendAvailableAt: result.resendAvailableAt,
      expiresAt: result.expiresAt,
      devOtpMessage: result.devOtpMessage,
    });
  } catch (error: any) {
    console.error("Error in /api/auth/send-otp:", error);
    return NextResponse.json(
      { success: false, error: "Server error generating verification code. Please try again." },
      { status: 500 }
    );
  }
}
