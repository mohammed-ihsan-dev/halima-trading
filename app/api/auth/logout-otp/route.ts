import { NextResponse } from "next/server";
import { OTP_COOKIE_NAME } from "@/lib/otp-auth";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "OTP session ended successfully.",
  });

  response.cookies.set({
    name: OTP_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
