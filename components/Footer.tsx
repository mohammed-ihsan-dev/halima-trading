"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtSign, Globe, Mail, MapPin, Phone, Share2 } from "lucide-react";
import Logo from "./Logo";
import { companyContact } from "@/lib/company-config";

export default function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer>
      <div className="footer-grid">
        <div>
          <Logo variant="footer" />
          <p>
            Premium electronics, air conditioning and home appliances for homes, businesses and
            projects across the UAE.
          </p>
          <div className="socials">
            <a href="#" aria-label="Social link">
              <AtSign />
            </a>
            <a href="#" aria-label="Website link">
              <Globe />
            </a>
            <a href="#" aria-label="Share link">
              <Share2 />
            </a>
          </div>
        </div>
        <div>
          <h4>Products</h4>
          {["Air Conditioning", "Refrigeration", "Laundry Appliances", "Kitchen Appliances", "Cooking Appliances"].map(
            (x) => (
              <Link href={`/shop?category=${encodeURIComponent(x)}`} key={x}>
                {x}
              </Link>
            )
          )}
        </div>
        <div>
          <h4>Company</h4>
          {[
            ["About", "/about"],
            ["Corporate Solutions", "/corporate-solutions"],
            ["Request a Quote", "/quote"], // was /request-a-quote (404)
            ["Contact", "/contact"],
            ["Shopping Cart", "/cart"], // was /shopping-cart (404)
          ].map(([label, href]) => (
            <Link href={href} key={label}>
              {label}
            </Link>
          ))}
        </div>
        <div>
          <h4>Visit & contact</h4>
          <p>
            <MapPin /> {companyContact.location}
          </p>
          <a href={`tel:${companyContact.phoneRaw}`}>
            <Phone /> {companyContact.phone}
          </a>
          <a href={`tel:${companyContact.landlineRaw}`}>
            <Phone /> {companyContact.landline}
          </a>
          <a href={`mailto:${companyContact.email}`}>
            <Mail /> {companyContact.email}
          </a>
          <form onSubmit={(e) => e.preventDefault()}>
            <input aria-label="Email for newsletter" placeholder="Your email address" />
            <button type="submit">Join</button>
          </form>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 {companyContact.name}. All Rights Reserved.</span>
        <span>Serving Abu Dhabi and the UAE since 1991.</span>
      </div>
    </footer>
  );
}
