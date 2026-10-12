import { companyContact } from "@/lib/company-config";

/**
 * WhatsApp click-to-chat helpers (https://wa.me/<number>?text=<message>).
 *
 * The business number comes from lib/company-config.ts (companyContact.whatsappRaw).
 * It can be overridden per environment with NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER, written in
 * international format: country code + number, digits only, no "+" or leading zeros
 * (e.g. 971565685090). "+971 56 568 5090" is also accepted and normalised.
 * An invalid number disables WhatsApp links instead of producing a broken one.
 */

/** Normalises a phone number to the digits wa.me expects, or returns null if it is not valid. */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.trim().replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  // E.164: up to 15 digits, country code never starts with 0.
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function getBusinessWhatsAppNumber(
  env: { NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER?: string } = {
    NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER,
  }
): string | null {
  const configured = env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER;
  // An explicit but invalid override disables links rather than silently using another number.
  if (configured !== undefined && configured.trim() !== "") return normalizeWhatsAppNumber(configured);
  return normalizeWhatsAppNumber(companyContact.whatsappRaw);
}

export function buildWhatsAppUrl(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Collapses whitespace and strips control characters from product text placed in a message. */
const clean = (value: unknown): string =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "";

const usable = (value: unknown) => {
  const v = clean(value);
  return v && v.toUpperCase() !== "N/A" ? v : "";
};

export interface QuoteProduct {
  name: string;
  brand?: string;
  model?: string;
  sku?: string;
  url?: string;
  quantity?: number;
}

function detailLines(p: QuoteProduct, { alwaysQuantity }: { alwaysQuantity: boolean }): string[] {
  const quantity = p.quantity && p.quantity > 0 ? p.quantity : 1;
  return [
    usable(p.brand) && `Brand: ${usable(p.brand)}`,
    usable(p.model) && `Model: ${usable(p.model)}`,
    usable(p.sku) && `SKU: ${usable(p.sku)}`,
    (alwaysQuantity || quantity > 1) && `Quantity: ${quantity}`,
    usable(p.url) && `Product link: ${usable(p.url)}`,
  ].filter(Boolean) as string[];
}

export function buildProductQuoteMessage(product: QuoteProduct): string {
  return [
    "Hello Halima Trading, I would like to know the price and availability of this product.",
    "",
    `Product: ${clean(product.name)}`,
    ...detailLines(product, { alwaysQuantity: false }),
    "",
    "Please share the current price, availability, and delivery details.",
  ].join("\n");
}

export function buildMultiProductQuoteMessage(products: QuoteProduct[]): string {
  if (products.length === 1) return buildProductQuoteMessage(products[0]);
  const blocks = products.map((p, i) =>
    [`${i + 1}. ${clean(p.name)}`, ...detailLines(p, { alwaysQuantity: true }).map((l) => `   ${l}`)].join("\n")
  );
  return [
    "Hello Halima Trading, I would like to know the price and availability of these products.",
    "",
    ...blocks.flatMap((b) => [b, ""]),
    "Please share the current prices, availability, and delivery details.",
  ].join("\n");
}

/** Plain chat link (no prefilled text), or null when no valid business number is configured. */
export const getWhatsAppChatUrl = (): string | null => {
  const number = getBusinessWhatsAppNumber();
  return number ? `https://wa.me/${number}` : null;
};

/**
 * General contact WhatsApp helper for customer service / inquiries.
 * Returns null when no valid business number is configured.
 */
export const getGeneralWhatsAppContactUrl = (message?: string): string | null => {
  const number = getBusinessWhatsAppNumber();
  return number ? buildWhatsAppUrl(number, message || "Hello Halima Trading, I have an inquiry.") : null;
};
