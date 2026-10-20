import { Metadata } from "next";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { getPublicProductCategories, queryMongoProducts, type ProductPage } from "@/lib/repositories/products";
import { catalogueHref, parseCatalogueParams, type CatalogueState } from "@/lib/catalogue-query";
import ShopClientView from "@/components/shop/ShopClientView";
import ProductCardSkeleton from "@/components/ProductCardSkeleton";
import { companyContact } from "@/lib/company-config";

// Published products only, cached for 60s per page/filter combination (the same freshness the
// page had as ISR). Admin product changes call revalidatePath("/shop"), which also clears this.
const getShopPage = unstable_cache(
  async (state: CatalogueState) => {
    const [page, categories] = await Promise.all([queryMongoProducts(state), getPublicProductCategories()]);
    return { page, categories };
  },
  ["shop-catalogue-page-v1"],
  { revalidate: 60 }
);

const EMPTY_PAGE = (state: CatalogueState): ProductPage => ({
  products: [], currentPage: 1, pageSize: state.pageSize, totalProducts: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
});

export const metadata: Metadata = {
  title: "Product Catalog | Electronics & Home Appliances",
  description:
    "Explore air conditioners, refrigerators, washing machines, kitchen appliances and electronics from trusted global brands in Abu Dhabi & UAE.",
  alternates: {
    canonical: `${companyContact.siteUrl}/shop`,
  },
  openGraph: {
    title: "Product Catalog | Halima Trading L.L.C.",
    description: "Browse premium home appliances and cooling solutions available across the UAE.",
    url: `${companyContact.siteUrl}/shop`,
  },
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const state = parseCatalogueParams(await searchParams);
  let result: { page: ProductPage; categories: string[] };
  try {
    result = await getShopPage(state);
  } catch (error) {
    console.error("Error loading shop catalogue page:", error);
    result = { page: EMPTY_PAGE(state), categories: [] };
  }
  // A page number past the end (e.g. after products were unpublished) goes to the last real page.
  if (result.page.currentPage !== state.page) redirect(catalogueHref("/shop", { ...state, page: result.page.currentPage }));

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
        <ShopClientView page={result.page} state={state} categoryOptions={result.categories} />
      </Suspense>
    </>
  );
}
