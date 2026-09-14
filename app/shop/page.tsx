import { Metadata } from "next";
import { Suspense } from "react";
import { getMongoProducts } from "@/lib/repositories/products";
import ShopClientView from "@/components/shop/ShopClientView";
import ProductCardSkeleton from "@/components/ProductCardSkeleton";

export const revalidate = 60; // 60s ISR for responsive product catalog updates

export const metadata: Metadata = {
  title: "Product Catalog | Electronics & Home Appliances",
  description:
    "Explore air conditioners, refrigerators, washing machines, kitchen appliances and electronics from trusted global brands in Abu Dhabi & UAE.",
  alternates: {
    canonical: "https://halimatrading.ae/shop",
  },
  openGraph: {
    title: "Product Catalog | Halima Trading L.L.C.",
    description: "Browse premium home appliances and cooling solutions available across the UAE.",
    url: "https://halimatrading.ae/shop",
  },
};

export default async function ShopPage() {
  const products = await getMongoProducts();

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow light">Product catalogue</span>
        <h1>Find the right appliance.</h1>
        <p>Search trusted brands and request current pricing from our Abu Dhabi team.</p>
      </section>
      <Suspense
        fallback={
          <section className="shop-layout">
            <div className="shop-results w-full">
              <div className="product-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            </div>
          </section>
        }
      >
        <ShopClientView initialProducts={products} />
      </Suspense>
    </>
  );
}
