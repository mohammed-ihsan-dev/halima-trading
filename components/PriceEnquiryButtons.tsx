"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { buildPriceEmailUrl } from "@/lib/email-enquiry";
import { buildProductQuoteMessage, buildWhatsAppUrl, getBusinessWhatsAppNumber, type QuoteProduct } from "@/lib/whatsapp";

const noSubscribe = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => "";

/** WhatsApp logo as a single-colour glyph (Simple Icons, CC0), drawn in the button's text colour (white). */
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

type EnquiryProduct = Omit<QuoteProduct, "url"> & { slug?: string; id?: string };

interface PriceEnquiryButtonsProps {
  product: EnquiryProduct;
  /** "card" for product cards, "detail" for the product page (taller buttons, larger text). */
  variant?: "card" | "detail";
}

/**
 * Price requests for products without a selling price: a green WhatsApp box and a red email box, each showing its
 * icon + "for Price", splitting one row 50/50. Both only open the customer's own WhatsApp / email app with a prefilled
 * message — nothing is sent or ordered. The full wording ("WhatsApp for Price", "Email for Price") is the accessible
 * name and tooltip. Sizing follows the width the pair actually has (container queries in globals.css).
 */
export default function PriceEnquiryButtons({ product, variant = "card" }: PriceEnquiryButtonsProps) {
  // Absolute product links need the browser's origin. The server snapshot is "" (path-only links), so server and
  // hydration render match; the client then uses the real origin.
  const origin = useSyncExternalStore(noSubscribe, clientOrigin, serverOrigin);
  const { slug, id, ...details } = product;
  const ref = slug || id;
  const item: QuoteProduct = { ...details, url: ref ? `${origin}/shop/${encodeURIComponent(ref)}` : undefined };
  const number = getBusinessWhatsAppNumber();

  return (
    <div className={`price-enquiry is-${variant}`}>
      <div className="price-enquiry-row">
        {number ? (
          <a
            href={buildWhatsAppUrl(number, buildProductQuoteMessage(item))}
            target="_blank"
            rel="noopener noreferrer"
            className="price-enquiry-btn is-whatsapp"
            aria-label={`WhatsApp for the price of ${product.name} (opens WhatsApp in a new tab)`}
            title="WhatsApp for Price"
          >
            {/* Wrapped in a span with the whatsapp-icon class so the site's global wa.me link styles (which hide a
                bare <svg> and inject a PNG logo) leave this glyph alone. */}
            <span className="price-enquiry-icon whatsapp-icon" aria-hidden="true">
              <WhatsAppGlyph />
            </span>
            <span className="price-enquiry-label">for Price</span>
          </a>
        ) : (
          // No valid business number configured: the contact page instead of a broken link.
          <Link href="/contact" className="price-enquiry-btn is-whatsapp" aria-label={`Contact us for the price of ${product.name}`}>
            <span className="price-enquiry-label">Contact for Price</span>
          </Link>
        )}
        <a href={buildPriceEmailUrl(item)} className="price-enquiry-btn is-email" aria-label={`Email for the price of ${product.name}`} title="Email for Price">
          <span className="price-enquiry-icon" aria-hidden="true">
            <Mail strokeWidth={2.4} />
          </span>
          <span className="price-enquiry-label">for Price</span>
        </a>
      </div>
    </div>
  );
}
