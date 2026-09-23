/**
 * Phone Number Normalization and Formatting Utilities for Halima Trading L.L.C.
 *
 * Ensures all phone numbers entered during Website Checkout, Admin External Orders,
 * and My Orders OTP verification map consistently to canonical E.164 representation.
 */

/**
 * Normalizes any UAE / GCC / International phone string to standard canonical representation (e.g. +971501234567 or +918590698873).
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return "";

  // Remove spaces, dashes, parentheses, dots
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, "");

  // If starts with +, strip + temporarily for digit checks
  let hasPlus = cleaned.startsWith("+");
  if (hasPlus) {
    cleaned = cleaned.slice(1);
  }

  // Remove leading zeros if present before UAE local code
  // Handles 0501234567 -> 971501234567
  if (cleaned.startsWith("05") && cleaned.length === 10) {
    cleaned = "971" + cleaned.slice(1);
  } else if (cleaned.startsWith("5") && cleaned.length === 9) {
    cleaned = "971" + cleaned;
  }

  // Ensure leading +
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
}

/**
 * Extracts raw digit sequence (stripping + and all non-digit characters).
 * Example: "+971 50 123 4567" -> "971501234567"
 * Example: "+91 85906 98873" -> "918590698873"
 */
export function extractPhoneDigits(rawPhone: string): string {
  if (!rawPhone) return "";
  const normalized = normalizePhoneNumber(rawPhone);
  return normalized.replace(/[^\d]/g, "");
}

/**
 * Returns a masked phone string for UI display during OTP verification (e.g. +971 50 *** 4567).
 */
export function maskPhoneNumber(phone: string): string {
  const norm = normalizePhoneNumber(phone);
  if (norm.length < 8) return norm;
  const start = norm.slice(0, 6); // e.g. +97150
  const end = norm.slice(-4);     // e.g. 4567
  return `${start} *** ${end}`;
}

/**
 * Formats normalized phone for human reading (e.g. +971 50 123 4567).
 */
export function formatPhoneDisplay(phone: string): string {
  const norm = normalizePhoneNumber(phone);
  if (norm.startsWith("+971") && norm.length === 13) {
    return `+971 ${norm.slice(4, 6)} ${norm.slice(6, 9)} ${norm.slice(9)}`;
  }
  return norm;
}
