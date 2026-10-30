import { companyContact } from "@/lib/company-config";
import { buildProductQuoteMessage, type QuoteProduct } from "@/lib/whatsapp";

/**
 * mailto: link for a product price request, addressed to the company email from lib/company-config.ts.
 * The body is the same message as the WhatsApp price request (product, brand, model, SKU, quantity, link).
 * Line breaks are encoded as CRLF, as RFC 6068 requires for mailto bodies.
 */
export function buildPriceEmailUrl(product: QuoteProduct, to: string = companyContact.email): string {
  const name = product.name.replace(/\s+/g, " ").trim();
  const subject = `Price enquiry: ${name}`;
  const body = buildProductQuoteMessage(product).replace(/\r?\n/g, "\r\n");
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
