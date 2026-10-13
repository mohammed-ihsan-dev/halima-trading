"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShoppingBag, Minus, Plus, Zap, Mail, Download } from "lucide-react";
import type { Product } from "@/data/products";
import { useCart } from "@/context/CartContext";
import { hasSellingPrice, isInStock } from "@/lib/pricing";
import WhatsAppQuoteButton from "@/components/WhatsAppQuoteButton";

interface ProductClientActionsProps {
  product: Product;
}

export default function ProductClientActions({ product }: ProductClientActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const inStock = isInStock(product); // the rule checkout enforces
  const router = useRouter();
  const { add, isInCart } = useCart();
  const inCart = isInCart(product.id);

  const emailSubject = encodeURIComponent(`${product.name} enquiry`);

  const handleBuyNow = () => {
    if (!inStock) return;
    router.push(`/checkout/order-details?productId=${encodeURIComponent(product.id)}&quantity=${quantity}`);
  };

  const quoteOnly = !hasSellingPrice(product);

  return (
    <>
      {quoteOnly && (
        <p className="quote-note text-sm font-semibold text-slate-600 w-full max-w-full" role="note">
          This product is priced on request. Send us a WhatsApp message and our team will reply with the current
          price, availability and delivery details.
        </p>
      )}
      <div className="buy-row flex flex-wrap items-center gap-3 w-full max-w-full min-w-0">
        {/* Quantity Selector */}
        <div className="qty big shrink-0">
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

        {quoteOnly ? (
          <WhatsAppQuoteButton
            items={[{ name: product.name, brand: product.brand, model: product.model, sku: product.sku, slug: product.slug, id: product.id, quantity }]}
            className="flex-1 min-w-0 max-w-full min-h-[48px] py-3 px-4 sm:px-6 rounded-xl font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-all no-underline border-0"
          />
        ) : (
        <>
        {/* Red Button: Add to Cart */}
        <button
          type="button"
          disabled={!inStock}
          className={`flex-1 min-w-0 max-w-full min-h-[48px] py-3 px-4 sm:px-6 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all border-0 text-white ${
            inCart
              ? "bg-zinc-800 dark:bg-zinc-700"
              : "bg-red-600 hover:bg-red-700 active:bg-red-800"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          onClick={(e) => add(product, quantity, e)}
        >
          {inCart ? (
            <>
              <Check size={18} className="shrink-0" /> <span className="truncate">Added to Cart</span>
            </>
          ) : (
            <>
              <ShoppingBag size={18} className="shrink-0" /> <span className="truncate">{inStock ? "Add to Cart" : "Out of Stock"}</span>
            </>
          )}
        </button>

        {/* Green Button: Buy Now */}
        <button
          type="button"
          disabled={!inStock}
          className="flex-1 min-w-0 max-w-full min-h-[48px] py-3 px-4 sm:px-6 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-all border-0 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleBuyNow}
        >
          <Zap size={18} className="shrink-0" />
          <span className="truncate">{inStock ? "Buy Now" : "Out of Stock"}</span>
        </button>
        </>
        )}
      </div>

      <div className="detail-actions w-full max-w-full min-w-0">
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
