"use client";

import React, { useState } from "react";
import {
  Check,
  ShoppingBag,
  Minus,
  Plus,
  MessageCircle,
  Mail,
  Download,
} from "lucide-react";
import type { Product } from "@/data/products";
import { useCart } from "@/context/CartContext";

interface ProductClientActionsProps {
  product: Product;
}

export default function ProductClientActions({ product }: ProductClientActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const { add, isInCart } = useCart();
  const inCart = isInCart(product.id);

  const whatsappMessage = encodeURIComponent(
    `Hello Halima Trading, I would like to order ${quantity} × ${product.name}, model ${product.model || "Standard"}.`
  );

  const emailSubject = encodeURIComponent(`${product.name} enquiry`);

  return (
    <>
      <div className="buy-row">
        <div className="qty big">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            aria-label="Decrease quantity"
          >
            <Minus size={16} />
          </button>
          <b>{quantity}</b>
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            aria-label="Increase quantity"
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          type="button"
          className={inCart ? "btn primary added-in-cart" : "btn primary"}
          onClick={(e) => add(product, quantity, e)}
        >
          {inCart ? (
            <>
              <Check size={18} /> Added to cart
            </>
          ) : (
            <>
              <ShoppingBag size={18} /> Add to cart
            </>
          )}
        </button>
      </div>

      <div className="detail-actions">
        <a
          className="btn secondary"
          href={`https://wa.me/971565685090?text=${whatsappMessage}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={18} /> Buy via WhatsApp
        </a>
        <a
          className="btn secondary"
          href={`mailto:Halimatradingest@gmail.com?subject=${emailSubject}`}
        >
          <Mail size={18} /> Email enquiry
        </a>
        <button type="button" className="btn secondary">
          <Download size={18} /> Specification
        </button>
      </div>
    </>
  );
}
