"use client";

import React from "react";
import Link from "next/link";
import { Eye, Heart, ShoppingBag, Snowflake } from "lucide-react";
import WhatsAppIcon from "./WhatsAppIcon";
import type { Product } from "@/data/products";
import { formatCurrency } from "@/lib/currency";
import { useCart } from "@/context/CartContext";
import { productWhatsAppUrl } from "@/lib/whatsapp";

interface ProductCardProps {
  product: Product;
  featuredStyle?: boolean;
}

export default function ProductCard({ product, featuredStyle = false }: ProductCardProps) {
  const { add } = useCart();

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
          <div className="feature-actions">
            <button onClick={(e) => add(product, 1, e)}>
              <ShoppingBag size={15} /> Add to Cart
            </button>
            <a href={productWhatsAppUrl(product)}>
              <WhatsAppIcon />
              <span>
                Order on
                <br />
                WhatsApp
              </span>
            </a>
            <Link href={`/shop/${product.slug || product.id}`}>
              <Eye size={15} />
              <span>
                View
                <br />
                Details
              </span>
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
        <div className="product-actions">
          <button onClick={(e) => add(product, 1, e)}>
            <ShoppingBag size={15} /> Add to cart
          </button>
          <a href={productWhatsAppUrl(product)} aria-label="Order on WhatsApp">
            <WhatsAppIcon />
          </a>
          <Link href={`/shop/${product.slug || product.id}`} aria-label="Quick view">
            <Eye size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
