import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight, ShieldCheck, Truck } from "lucide-react";
import {
  getMongoProductByIdOrSlug,
  getMongoProducts,
} from "@/lib/repositories/products";
import { formatCurrency } from "@/lib/currency";
import ProductCard from "@/components/ProductCard";
import ProductClientActions from "@/components/product/ProductClientActions";

export const revalidate = 3600; // 1 hour ISR

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getMongoProductByIdOrSlug(slug);

  if (!product) {
    return {
      title: "Product Not Found | Halima Trading L.L.C.",
      description: "The requested product could not be found in our catalog.",
    };
  }

  const title = `${product.name} | Halima Trading L.L.C.`;
  const description = product.description
    ? product.description.slice(0, 160)
    : `Buy ${product.name} (${product.brand}) in Abu Dhabi & UAE from Halima Trading L.L.C.`;
  const mainImage = product.images?.[0] || "https://halimatrading.ae/og.png";
  const canonicalUrl = `https://halimatrading.ae/shop/${product.slug || product.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
      images: [{ url: mainImage, width: 800, height: 600, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [mainImage],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getMongoProductByIdOrSlug(slug);

  if (!product) {
    notFound();
  }

  const allProducts = await getMongoProducts();
  const relatedProducts = allProducts.filter((x) => x.id !== product.id).slice(0, 4);

  // JSON-LD Product Schema
  const productJsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: product.images || ["https://halimatrading.ae/og.png"],
    description: product.description,
    sku: product.sku || product.id,
    mpn: product.model || product.id,
    brand: {
      "@type": "Brand",
      name: product.brand,
    },
    offers: {
      "@type": "Offer",
      url: `https://halimatrading.ae/shop/${product.slug || product.id}`,
      priceCurrency: "AED",
      price: product.price || "1899",
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/LimitedAvailability",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  // JSON-LD Breadcrumb Schema
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://halimatrading.ae",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Shop",
        item: "https://halimatrading.ae/shop",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: `https://halimatrading.ae/shop/${product.slug || product.id}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <ChevronRight size={14} />
        <Link href="/shop">Shop</Link>
        <ChevronRight size={14} />
        <span>{product.name}</span>
      </div>

      <section className="product-detail">
        <div className="gallery">
          <div className="gallery-main">
            <img
              src={product.images?.[0] || "/featured/hisense-window-ac.png"}
              alt={product.name}
              loading="eager"
            />
          </div>
          <button className="thumb" aria-label="Product thumbnail">
            <img
              src={product.images?.[0] || "/featured/hisense-window-ac.png"}
              alt={`${product.name} thumbnail`}
              loading="lazy"
            />
          </button>
        </div>

        <div className="detail-copy">
          <span className="stock">
            <Check size={14} /> {product.inStock ? "In stock" : "Available on request"}
          </span>
          <small>
            {product.brand} · {product.category}
          </small>
          <h1>{product.name}</h1>
          <p className="model">Model: {product.model}</p>
          <p className="lead">{product.description}</p>
          {product.features && product.features.length > 0 && (
            <ul>
              {product.features.map((x) => (
                <li key={x}>
                  <Check size={14} /> {x}
                </li>
              ))}
            </ul>
          )}
          <div className="detail-price">
            {formatCurrency(product.price)}
            <small>Final price and delivery confirmed on enquiry</small>
          </div>

          {/* Interactive Client Actions */}
          <ProductClientActions product={product} />

          <div className="service-notes">
            <span>
              <Truck size={18} />
              <b>UAE delivery</b>
              <small>Confirmed with your order</small>
            </span>
            <span>
              <ShieldCheck size={18} />
              <b>Warranty support</b>
              <small>Manufacturer terms apply</small>
            </span>
          </div>
        </div>
      </section>

      <section className="detail-tabs section">
        <h2>Technical specifications</h2>
        <div className="specs">
          {product.specifications &&
            Object.entries(product.specifications).map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
        </div>
        <h2>Related products</h2>
        <div className="product-grid">
          {relatedProducts.map((x) => (
            <ProductCard product={x} key={x.id} />
          ))}
        </div>
      </section>
    </>
  );
}
