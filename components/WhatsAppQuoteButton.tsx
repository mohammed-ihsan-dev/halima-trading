"use client";

import React, { useSyncExternalStore } from "react";
import Link from "next/link";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import {
  buildMultiProductQuoteMessage,
  buildWhatsAppUrl,
  getBusinessWhatsAppNumber,
  type QuoteProduct,
} from "@/lib/whatsapp";

const noSubscribe = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => "";

type QuoteItem = Omit<QuoteProduct, "url"> & { slug?: string; id?: string };

interface WhatsAppQuoteButtonProps {
  items: QuoteItem[];
  label?: string;
  className?: string;
}

/**
 * Opens WhatsApp with a prefilled price request. The customer still sends the message
 * themselves — nothing is submitted, reserved or ordered by clicking this.
 */
export default function WhatsAppQuoteButton({
  items,
  label = "Request Price on WhatsApp",
  className = "",
}: WhatsAppQuoteButtonProps) {
  // Absolute product links need the browser's origin. The server snapshot is "" (path-only
  // links), so server and hydration render match; the client then uses the real origin.
  const origin = useSyncExternalStore(noSubscribe, clientOrigin, serverOrigin);

  const number = getBusinessWhatsAppNumber();
  const names = items.map((i) => i.name).join(", ");

  if (!number || items.length === 0) {
    // No valid business number configured: offer the contact page instead of a broken link.
    return (
      <Link href="/contact" className={className} aria-label={`Contact us for the price of ${names}`}>
        <span>Contact us for price</span>
      </Link>
    );
  }

  const message = buildMultiProductQuoteMessage(
    items.map(({ slug, id, ...rest }) => ({
      ...rest,
      url: slug || id ? `${origin}/shop/${encodeURIComponent(slug || id || "")}` : undefined,
    }))
  );

  return (
    <a
      href={buildWhatsAppUrl(number, message)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label={`${label} for ${names} (opens WhatsApp in a new tab)`}
    >
      <WhatsAppIcon className="quote-wa-icon" />
      <span>{label}</span>
    </a>
  );
}
