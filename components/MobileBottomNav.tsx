"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Store, BookOpen } from "lucide-react";
import WhatsAppIcon from "./WhatsAppIcon";

export default function MobileBottomNav() {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) return null;

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
      <Link href="/">
        <Home />
        <span>Home</span>
      </Link>
      <Link href="/shop">
        <Store />
        <span>Shop</span>
      </Link>
      <a
        href="/brochures/HALIMA_TRADING_UPDATED_.pdf"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View Halima Trading company brochure"
      >
        <BookOpen />
        <span>Brochure</span>
      </a>
      <a className="mobile-wa" href="https://wa.me/971565685090" aria-label="WhatsApp Support">
        <WhatsAppIcon />
        <span>WhatsApp</span>
      </a>
    </nav>
  );
}

