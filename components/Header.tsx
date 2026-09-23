"use client";

import Link from "next/link";
import { BookOpen, Menu, Package, Search, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";
import CartDrawer from "./CartDrawer";
import Logo from "./Logo";

const navItems = ["Home", "Shop", "Categories", "Brands", "My Orders", "About", "Contact", "Brochure"];
const navHref = (item: string) =>
  item === "Home"
    ? "/#hero"
    : item === "My Orders"
    ? "/my-orders"
    : "/" + item.toLowerCase().replaceAll(" ", "-");

export default function Header() {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const { count, setOpen } = useCart();

  if (pathname.startsWith("/admin")) return null;

  return (
    <>
      <div className="announcement">
        <span>Premium Electronics & Home Appliances Across the UAE</span>
        <a href="tel:+971565685090">Call: +971 56 568 5090</a>
        <span className="announce-alt">Bulk Orders, Corporate Supply & Hospitality Solutions Available</span>
      </div>
      <header>
        <Logo variant="header" />
        <nav>
          {navItems.map((item) =>
            item === "Brochure" ? (
              <a
                key={item}
                href="/brochures/HALIMA_TRADING_UPDATED_.pdf"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View company brochure"
                className="nav-brochure-link"
              >
                <BookOpen size={14} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "4px" }} />
                Brochure
              </a>
            ) : (
              <Link key={item} href={navHref(item)}>
                {item}
              </Link>
            )
          )}
        </nav>
        <div className="header-actions">
          <Link href="/shop" aria-label="Search">
            <Search />
          </Link>
          <Link href="/my-orders" aria-label="My Orders" title="My Orders" className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:border-zinc-400">
            <Package size={16} />
            <span className="hidden md:inline">My Orders</span>
          </Link>
          <button
            id="navbar-cart-btn"
            className="navbar-cart-btn"
            onClick={() => setOpen(true)}
            aria-label={`Cart with ${count} items`}
          >
            <ShoppingBag />
            <i>{count}</i>
          </button>
          <Link className="btn primary compact" href="/shop">
            Shop Now
          </Link>
          <button className="menu-btn" onClick={() => setMenu(true)} aria-label="Open menu">
            <Menu />
          </button>
        </div>
      </header>
      {menu && (
        <div className="mobile-menu">
          <button onClick={() => setMenu(false)} aria-label="Close menu">
            <X />
          </button>
          <Logo variant="drawer" onClick={() => setMenu(false)} />
          {navItems.map((item) =>
            item === "Brochure" ? (
              <a
                key={item}
                onClick={() => setMenu(false)}
                href="/brochures/HALIMA_TRADING_UPDATED_.pdf"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View company brochure"
              >
                <BookOpen size={20} style={{ display: "inline-block", verticalAlign: "middle", marginRight: "8px" }} />
                Brochure
              </a>
            ) : (
              <Link onClick={() => setMenu(false)} key={item} href={navHref(item)}>
                {item}
              </Link>
            )
          )}
          <Link className="btn primary" href="/shop" onClick={() => setMenu(false)}>
            Shop Now
          </Link>
        </div>
      )}
      <CartDrawer />
    </>
  );
}
