"use client";

import React from "react";
import Link from "next/link";
import { Check, Eye, Heart, ShoppingBag, Snowflake, Zap } from "lucide-react";
import type { Product } from "@/data/products";
import { formatCurrency } from "@/lib/currency";
import { useCart } from "@/context/CartContext";

interface ProductCardProps {
  product: Product;
  featuredStyle?: boolean;
}

export default function ProductCard({ product, featuredStyle = false }: ProductCardProps) {
  const { add, isInCart } = useCart();
  const inCart = isInCart(product.id);

  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = "/featured/hisense-window-ac.png";
  };

  if (featuredStyle) {
    return (
      <article className="feature-product-card">
        <div className="feature-brand">
          <b>{product.brand}</b>
          <span className={product.inStock ? "feature-stock" : "feature-stock out"}>
            {product.inStock ? "In Stock" : "On Request"}
          </span>
        </div>
        <Link className="feature-image" href={`/shop/${product.slug || product.id}`}>
          <img
            src={product.images?.[0] || "/featured/hisense-window-ac.png"}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={handleImgError}
          />
        </Link>
        <div className="feature-card-body">
          <Link href={`/shop/${product.slug || product.id}`}>
            <h3>{product.name}</h3>
          </Link>
          <div className="feature-specs">
            <span>
              <Snowflake size={14} /> {product.specifications?.Capacity || product.subcategory || "Appliance"}
            </span>
            <span>▣ {product.subcategory || product.category}</span>
          </div>
          <div className="feature-price">{formatCurrency(product.price)}</div>
          <div className="feature-actions flex flex-wrap items-center gap-2 mt-4">
            {/* Red Button: Add to Cart */}
            <button
              className={`flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all text-white border-0 cursor-pointer ${
                inCart
                  ? "bg-zinc-800 dark:bg-zinc-700"
                  : "bg-red-600 hover:bg-red-700 active:bg-red-800"
              }`}
              onClick={(e) => add(product, 1, e)}
            >
              {inCart ? (
                <>
                  <Check size={15} /> Added
                </>
              ) : (
                <>
                  <ShoppingBag size={15} /> Add to Cart
                </>
              )}
            </button>

            {/* Green Button: Buy Now */}
            <Link
              href={`/checkout/order-details?productId=${product.id}&quantity=1`}
              className="flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-all no-underline border-0"
              aria-label="Buy Now"
            >
              <Zap size={15} />
              <span>Buy Now</span>
            </Link>

            {/* White/Outlined Button: View Details */}
            <Link
              href={`/shop/${product.slug || product.id}`}
              className="px-3 min-h-[40px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all no-underline"
              aria-label="View Details"
            >
              <Eye size={15} />
              <span className="hidden sm:inline">Details</span>
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="product-card">
      <div className="product-img">
        <img
          src={product.images?.[0] || "/featured/hisense-window-ac.png"}
          alt={product.name}
          loading="lazy"
          decoding="async"
          onError={handleImgError}
        />
        <button aria-label="Add to wishlist">
          <Heart size={16} />
        </button>
        <span className={product.inStock ? "stock" : "stock out"}>
          {product.inStock ? "In stock" : "On request"}
        </span>
      </div>
      <div className="product-info">
        <small>
          {product.brand} · {product.category}
        </small>
        <Link href={`/shop/${product.slug || product.id}`}>
          <h3>{product.name}</h3>
        </Link>
        <p className="model">Model {product.model}</p>
        <p>{(product.features || []).slice(0, 2).join(" · ")}</p>
        <div className="price">{formatCurrency(product.price)}</div>
        <div className="product-actions flex flex-wrap items-center gap-2 mt-3">
          {/* Red Button: Add to Cart */}
          <button
            className={`flex-1 min-h-[38px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all text-white border-0 cursor-pointer ${
              inCart
                ? "bg-zinc-800 dark:bg-zinc-700"
                : "bg-red-600 hover:bg-red-700 active:bg-red-800"
            }`}
            onClick={(e) => add(product, 1, e)}
          >
            {inCart ? (
              <>
                <Check size={14} /> Added
              </>
            ) : (
              <>
                <ShoppingBag size={14} /> Add to Cart
              </>
            )}
          </button>

          {/* Green Button: Buy Now */}
          <Link
            href={`/checkout/order-details?productId=${product.id}&quantity=1`}
            className="flex-1 min-h-[38px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-all no-underline border-0"
            aria-label="Buy Now"
            title="Buy Now"
          >
            <Zap size={14} />
            <span>Buy Now</span>
          </Link>

          {/* White/Outlined Button: View Details */}
          <Link
            href={`/shop/${product.slug || product.id}`}
            className="px-2.5 min-h-[38px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all no-underline"
            aria-label="View Details"
            title="View Details"
          >
            <Eye size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
