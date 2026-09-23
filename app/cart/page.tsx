"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatCurrency } from "@/lib/currency";
import { emailUrl } from "@/lib/email";
import CheckoutModal from "@/components/checkout/CheckoutModal";

export default function Cart() {
  const c = useCart();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  return (
    <>
      <section className="page-hero compact-hero">
        <span className="eyebrow light">Your selection</span>
        <h1>Shopping cart.</h1>
      </section>

      <section className="cart-page">
        {c.items.length === 0 ? (
          <div className="empty large">
            <h2>Your cart is empty.</h2>
            <p>Explore our range of home and commercial appliance solutions.</p>
            <Link className="btn primary" href="/shop">
              Continue shopping
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-table">
              {c.items.map((x) => (
                <div className="cart-row" key={x.id}>
                  <img src={x.images[0]} alt={x.name} />
                  <div>
                    <h3>{x.name}</h3>
                    <small>
                      {x.brand} · Model {x.model}
                    </small>
                    <span>{formatCurrency(x.price)}</span>
                  </div>
                  <div className="qty big">
                    <button onClick={() => c.update(x.id, x.quantity - 1)}>
                      <Minus />
                    </button>
                    <b>{x.quantity}</b>
                    <button onClick={() => c.update(x.id, x.quantity + 1)}>
                      <Plus />
                    </button>
                  </div>
                  <b>{x.price === null ? "On request" : formatCurrency(x.price * x.quantity)}</b>
                  <button onClick={() => c.remove(x.id)} title="Remove item">
                    <Trash2 />
                  </button>
                </div>
              ))}
              <div className="cart-controls">
                <Link href="/shop">← Continue shopping</Link>
                <button onClick={c.clear} className="clear-cart-btn" title="Clear all items from cart">
                  <Trash2 size={15} /> Clear cart
                </button>
              </div>
            </div>

            <aside className="summary">
              <small>Order summary</small>
              <h2>Estimated total</h2>
              <div>
                <span>Total items</span>
                <b>{c.count}</b>
              </div>
              <div>
                <span>Items Subtotal</span>
                <b>{formatCurrency(c.total)}</b>
              </div>
              <div className="sum-total">
                <span>Delivery Charge</span>
                <b className="text-emerald-600 uppercase">
                  {c.items.reduce((sum, x) => sum + (x.deliveryRate || 0) * x.quantity, 0) === 0
                    ? "FREE DELIVERY"
                    : formatCurrency(c.items.reduce((sum, x) => sum + (x.deliveryRate || 0) * x.quantity, 0))}
                </b>
              </div>
              <p>Final pricing and delivery calculation confirmed on secure checkout.</p>
              <button
                className="btn primary full flex items-center justify-center gap-2 mb-2"
                onClick={() => setIsCheckoutOpen(true)}
              >
                <CreditCard size={18} />
                Pay Securely with Card
              </button>
              <a className="btn secondary full" href={emailUrl(c.items)}>
                Send order by email
              </a>
              <Link className="btn secondary full" href="/quote">
                Request formal quotation
              </Link>
            </aside>
          </>
        )}
      </section>

      <CheckoutModal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} />
    </>
  );
}

