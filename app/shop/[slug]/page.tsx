import { Metadata } from "next";
import Link from "next/link";
import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import { Check, ChevronRight, ShieldCheck, Truck } from "lucide-react";
import { getMongoProductByIdOrSlug, getMongoRelatedProducts } from "@/lib/repositories/products";
import { displayPrice, hasSellingPrice, isInStock } from "@/lib/pricing";
import ProductCard from "@/components/ProductCard";
import ProductClientActions from "@/components/product/ProductClientActions";
import ProductGallery from "@/components/product/ProductGallery";
import BackToCatalogueLink from "@/components/shop/BackToCatalogueLink";
import { companyContact } from "@/lib/company-config";
import { customerModel, displayModel } from "@/lib/product-model";

// generateMetadata and the page both need the product: one database read per request.
const getProduct = cache((slug: string) => getMongoProductByIdOrSlug(slug));

// Product text is admin-entered; escape "<" so a value containing "</script>" cannot end the JSON-LD block.
const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

const SITE = companyContact.siteUrl;
const DEFAULT_SHARE_IMAGE = `${SITE}/og.png`;
/** Product images usable as share / search images: absolute https URLs or site paths (never embedded data URIs). */
const shareableImages = (images: string[] = []) =>
  images
    .filter((img) => typeof img === "string" && (img.startsWith("https://") || (img.startsWith("/") && !img.startsWith("//"))))
    .map((img) => (img.startsWith("/") ? `${SITE}${img}` : img));

export const revalidate = 60; // 60s ISR for responsive product detail updates

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return {
      title: "Product Not Found",
      description: "The requested product could not be found in our catalog.",
    };
  }

  // The root layout's title template appends " | Halima Trading"; share cards get the full name.
  const title = product.name;
  const shareTitle = `${product.name} | Halima Trading L.L.C.`;
  const description = product.description
    ? product.description.slice(0, 160)
    : `Buy ${product.name} (${product.brand}) in Abu Dhabi & UAE from Halima Trading L.L.C.`;
  const mainImage = shareableImages(product.images)[0] || DEFAULT_SHARE_IMAGE;
  const canonicalUrl = `${SITE}/shop/${product.slug || product.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: shareTitle,
      description,
      url: canonicalUrl,
      type: "website",
      images: [{ url: mainImage, width: 800, height: 600, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [mainImage],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = await getMongoRelatedProducts(product.id, 4);
  const productUrl = `${SITE}/shop/${product.slug || product.id}`;
  const model = customerModel(product);
  const images = shareableImages(product.images);

  // JSON-LD Product Schema
  const productJsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: images.length ? images : [DEFAULT_SHARE_IMAGE],
    description: product.description,
    sku: product.sku || product.id,
    // Only a single, verified model number (records combining two models get none).
    ...(model ? { mpn: model } : {}),
    brand: {
      "@type": "Brand",
      name: product.brand,
    },
    // Only advertise an Offer when there is a real price; "Contact for Price" products get none
    // (previously a made-up AED 1899 was published for them).
    ...(hasSellingPrice(product)
      ? {
          offers: {
            "@type": "Offer",
            url: productUrl,
            priceCurrency: "AED",
            price: product.price,
            availability: isInStock(product)
              ? "https://schema.org/InStock"
              : "https://schema.org/LimitedAvailability",
            itemCondition: "https://schema.org/NewCondition",
          },
        }
      : {}),
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
        item: SITE,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Shop",
        item: `${SITE}/shop`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: productUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />

      <div className="breadcrumbs">
        <Link href="/">Home</Link>
        <ChevronRight size={14} />
        {/* Static fallback for prerendering; the client link restores the originating page and filters. */}
        <Suspense fallback={<Link href="/shop">Shop</Link>}>
          <BackToCatalogueLink />
        </Suspense>
        <ChevronRight size={14} />
        <span>{product.name}</span>
      </div>

      <section className="product-detail">
        <ProductGallery images={product.images || []} productName={product.name} />

        <div className="detail-copy min-w-0 w-full max-w-full">
          <span className="stock">
            <Check size={14} /> {isInStock(product) ? "In stock" : "Available on request"}
          </span>
          <small>
            {product.brand} · {product.category}
          </small>
          <h1>{product.name}</h1>
          <p className="model">Model: {displayModel(product)}</p>
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
          <div className="detail-price flex flex-col items-start gap-1">
            <span className={hasSellingPrice(product) ? undefined : "is-quote"}>{displayPrice(product)}</span>
            {(product.deliveryRate || 0) === 0 ? (
              <span className="font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg text-xs tracking-wide">
                FREE DELIVERY
              </span>
            ) : (
              <span className="font-bold text-slate-700 text-xs bg-slate-100 border border-slate-200 px-3 py-1 rounded-lg">
                Delivery: AED {product.deliveryRate?.toFixed(2)}
              </span>
            )}
          </div>

          {/* Interactive Client Actions */}
          <ProductClientActions product={product} />

          <div className="service-notes">
            <span>
              <Truck size={18} />
              <b>{(product.deliveryRate || 0) === 0 ? "FREE DELIVERY" : `Delivery: AED ${product.deliveryRate?.toFixed(2)}`}</b>
              <small>All UAE Emirates</small>
            </span>
            <span>
              <ShieldCheck size={18} />
              <b>Warranty support</b>
              <small>Manufacturer terms apply</small>
            </span>
          </div>
        </div>
      </section>

      {relatedProducts.length > 0 && (
        <section className="detail-tabs section">
          <h2>Related products</h2>
          <div className="product-grid">
            {relatedProducts.map((x) => (
              <ProductCard product={x} key={x.id} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
