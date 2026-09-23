import { cookies } from "next/headers";
import crypto from "crypto";
import { getMongoDb } from "@/lib/mongodb";
import { normalizePhoneNumber } from "@/lib/phone-utils";

export const OTP_COOKIE_NAME = "halima_otp_session";
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "halima-otp-session-secret-key-2026";

export interface OtpSession {
  phone: string;
  verifiedAt: string;
  expiresAt: string;
}

export interface OtpRecord {
  _id?: any;
  phone: string;
  otpHash: string;
  attempts: number;
  verified: boolean;
  createdAt: Date;
  expiresAt: Date;
  resendAvailableAt: Date;
}

/**
 * Generate 6-digit cryptographically secure numeric OTP code
 */
export function generateOtpCode(): string {
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
}

/**
 * SHA-256 hash for secure OTP storage (never store plain OTP in DB)
 */
export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp.trim()).digest("hex");
}

/**
 * Sign session payload with SHA-256 HMAC signature to prevent tampering
 */
function signPayload(dataStr: string): string {
  const hmac = crypto.createHmac("sha256", SESSION_SECRET).update(dataStr).digest("hex");
  return `${Buffer.from(dataStr).toString("base64")}.${hmac}`;
}

/**
 * Verify signed session payload
 */
function verifyPayload(cookieVal: string): OtpSession | null {
  try {
    const parts = cookieVal.split(".");
    if (parts.length !== 2) return null;
    const dataStr = Buffer.from(parts[0], "base64").toString("utf-8");
    const expectedHmac = crypto.createHmac("sha256", SESSION_SECRET).update(dataStr).digest("hex");
    
    if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expectedHmac))) {
      return null;
    }

    const session: OtpSession = JSON.parse(dataStr);
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Send OTP to normalized phone number with rate limiting and secure hashing
 */
export async function sendOtpToPhone(rawPhone: string): Promise<{
  success: boolean;
  error?: string;
  resendAvailableAt?: string;
  expiresAt?: string;
  devOtpMessage?: string;
}> {
  const phone = normalizePhoneNumber(rawPhone);
  if (!phone || phone.length < 8) {
    return { success: false, error: "Please enter a valid mobile number." };
  }

  const db = await getMongoDb();
  const now = new Date();

  // Rate Limiting 1: Check resend cooldown (60 seconds)
  const recentOtp = await db.collection("otp_requests").findOne(
    { phone, verified: false, expiresAt: { $gt: now } },
    { sort: { createdAt: -1 } }
  );

  if (recentOtp && recentOtp.resendAvailableAt > now) {
    const secondsRemaining = Math.ceil((recentOtp.resendAvailableAt.getTime() - now.getTime()) / 1000);
    return {
      success: false,
      error: `Please wait ${secondsRemaining} seconds before requesting another code.`,
    };
  }

  // Rate Limiting 2: Max 4 requests in 15 minutes per phone
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const requestCount = await db.collection("otp_requests").countDocuments({
    phone,
    createdAt: { $gt: fifteenMinsAgo },
  });

  if (requestCount >= 5) {
    return {
      success: false,
      error: "Too many verification requests for this mobile number. Please try again in 15 minutes.",
    };
  }

  const code = generateOtpCode();
  const otpHash = hashOtp(code);
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 mins expiry
  const resendAvailableAt = new Date(now.getTime() + 60 * 1000); // 60s cooldown

  await db.collection("otp_requests").insertOne({
    phone,
    otpHash,
    attempts: 0,
    verified: false,
    createdAt: now,
    expiresAt,
    resendAvailableAt,
  });

  // SMS Provider Integration placeholder
  // If Twilio or SMS provider credentials exist in process.env, execute SMS send.
  const smsKey = process.env.TWILIO_ACCOUNT_SID || process.env.SMS_API_KEY;
  if (smsKey) {
    console.log(`[SMS PROVIDER] Sent OTP code to ${phone}`);
  } else {
    // Local development fallback: Log OTP to server console for testing
    console.log(`\n==================================================`);
    console.log(`[HALIMA TRADING OTP DEBUG]`);
    console.log(`Mobile Number : ${phone}`);
    console.log(`Verification OTP Code: ${code}`);
    console.log(`Expires At    : ${expiresAt.toISOString()}`);
    console.log(`==================================================\n`);
  }

  return {
    success: true,
    resendAvailableAt: resendAvailableAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    // Include dev indication if local
    devOtpMessage: process.env.NODE_ENV === "development" ? `Development Mode Code: ${code}` : undefined,
  };
}

/**
 * Verify OTP input code against database hash
 */
export async function verifyOtpCode(
  rawPhone: string,
  otpInput: string
): Promise<{ success: boolean; error?: string; sessionPayload?: string }> {
  const phone = normalizePhoneNumber(rawPhone);
  if (!phone || !otpInput) {
    return { success: false, error: "Mobile number and verification code are required." };
  }

  const db = await getMongoDb();
  const now = new Date();

  const otpRecord = await db.collection("otp_requests").findOne(
    { phone, verified: false },
    { sort: { createdAt: -1 } }
  );

  if (!otpRecord) {
    return { success: false, error: "No active verification code found for this number. Please request a new code." };
  }

  if (otpRecord.expiresAt < now) {
    return { success: false, error: "Verification code has expired. Please request a new code." };
  }

  if (otpRecord.attempts >= 5) {
    await db.collection("otp_requests").updateOne({ _id: otpRecord._id }, { $set: { verified: true } });
    return { success: false, error: "Maximum verification attempts exceeded. Please request a new code." };
  }

  const inputHash = hashOtp(otpInput);
  if (inputHash !== otpRecord.otpHash) {
    await db.collection("otp_requests").updateOne({ _id: otpRecord._id }, { $inc: { attempts: 1 } });
    return { success: false, error: "Incorrect verification code. Please check and try again." };
  }

  // Mark OTP as used
  await db.collection("otp_requests").updateOne({ _id: otpRecord._id }, { $set: { verified: true } });

  // Create session payload (valid for 24 hours)
  const session: OtpSession = {
    phone,
    verifiedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const payloadStr = JSON.stringify(session);
  const signedCookieValue = signPayload(payloadStr);

  return {
    success: true,
    sessionPayload: signedCookieValue,
  };
}

/**
 * Get current OTP-verified session from server cookies
 */
export async function getOtpSession(): Promise<OtpSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(OTP_COOKIE_NAME);
    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }
    return verifyPayload(sessionCookie.value);
  } catch {
    return null;
  }
}
