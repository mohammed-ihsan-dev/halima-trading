"use client";

import { usePathname } from "next/navigation";
import { BookOpen, Mail, Phone, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";
import WhatsAppIcon from "./WhatsAppIcon";

export default function FloatingContacts() {
  const pathname = usePathname();
  const { setOpen, count } = useCart();

  if (pathname?.startsWith("/admin")) return null;

  return (
    <div className="floating-actions">
      <a
        className="brochure-btn"
        href="/brochures/HALIMA_TRADING_UPDATED_.pdf"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View company brochure"
        title="View Company Brochure"
      >
        <BookOpen />
      </a>
      <a className="wa" href="https://wa.me/971565685090" aria-label="WhatsApp">
        <WhatsAppIcon />
      </a>
      <a href="tel:+971565685090" aria-label="Call">
        <Phone />
      </a>
      <a href="mailto:Halimatradingest@gmail.com" aria-label="Email">
        <Mail />
      </a>
      <button onClick={() => setOpen(true)} aria-label="Cart">
        <ShoppingBag />
        <i>{count}</i>
      </button>
    </div>
  );
}
