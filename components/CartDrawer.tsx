"use client";

import Link from "next/link";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { whatsappUrl } from "@/lib/whatsapp";
import { emailUrl } from "@/lib/email";
import { formatCurrency } from "@/lib/currency";
import WhatsAppIcon from "./WhatsAppIcon";

export default function CartDrawer() {
  const c = useCart();
  if (!c.open) return null;

  return (
    <div className="drawer-wrap" onMouseDown={() => c.setOpen(false)}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <small>Your selection</small>
            <h2>Shopping cart ({c.count})</h2>
          </div>
          <div className="flex items-center gap-2">
            {c.items.length > 0 && (
              <button
                onClick={c.clear}
                className="clear-cart-btn"
                title="Clear all items from cart"
                aria-label="Clear all items from cart"
              >
                <Trash2 size={14} /> Clear Cart
              </button>
            )}
            <button onClick={() => c.setOpen(false)} aria-label="Close cart drawer">
              <X />
            </button>
          </div>
        </div>

        <div className="drawer-items">
          {c.items.length === 0 ? (
            <div className="empty">
              <span>⌑</span>
              <h3>Your cart is ready for something great.</h3>
              <Link href="/shop" onClick={() => c.setOpen(false)}>
                Explore products
              </Link>
            </div>
          ) : (
            c.items.map((x) => (
              <div className="cart-line" key={x.id}>
                <img src={x.images[0]} alt={x.name} />
                <div>
                  <b>{x.name}</b>
                  <small>
                    {x.brand} · {x.model}
                  </small>
                  <span>{formatCurrency(x.price)}</span>
                  <div className="qty">
                    <button onClick={() => c.update(x.id, x.quantity - 1)}>
                      <Minus />
                    </button>
                    <b>{x.quantity}</b>
                    <button onClick={() => c.update(x.id, x.quantity + 1)}>
                      <Plus />
                    </button>
                    <button className="trash" onClick={() => c.remove(x.id)} title="Remove item">
                      <Trash2 />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {c.items.length > 0 && (
          <div className="drawer-foot">
            <div>
              <span>Estimated total</span>
              <b>{formatCurrency(c.total)}</b>
            </div>
            <small>Final pricing and availability will be confirmed by our team.</small>
            <a className="btn primary full" href={whatsappUrl(c.items)}>
              <WhatsAppIcon />
              Proceed via WhatsApp
            </a>
            <a className="btn secondary full" href={emailUrl(c.items)}>
              Send order by email
            </a>
            <Link className="text-link center" href="/cart" onClick={() => c.setOpen(false)}>
              View full cart
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
