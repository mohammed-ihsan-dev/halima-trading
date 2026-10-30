"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Grid3X3, List, Search, SlidersHorizontal } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import ShopPagination from "@/components/shop/ShopPagination";
import type { ProductPage } from "@/lib/repositories/products";
import { PAGE_SIZES, PRICE_RANGES, catalogueHref, type CatalogueState } from "@/lib/catalogue-query";

interface ShopClientViewProps {
  /** One page of published products, already filtered, sorted and paginated by the server. */
  page: ProductPage;
  /** The catalogue state parsed from the URL — the single source of truth. */
  state: CatalogueState;
  categoryOptions: string[];
}

const SEARCH_DEBOUNCE_MS = 400;
const EAGER_IMAGES = 4; // the first row is above the fold; the rest load lazily
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function ShopClientView({ page, state, categoryOptions }: ShopClientViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // The search box is the only local state: typing is debounced into the URL.
  const [qInput, setQInput] = useState(state.q);
  const [syncedQ, setSyncedQ] = useState(state.q);
  const [lastSubmittedQ, setLastSubmittedQ] = useState(state.q);
  if (state.q !== syncedQ) {
    // The URL changed (Back/Forward, a link, Clear filters). Adopt it — unless it is just our own
    // debounced search arriving while the user keeps typing.
    setSyncedQ(state.q);
    if (state.q !== lastSubmittedQ) setQInput(state.q);
  }

  const go = (next: Partial<CatalogueState>) => {
    const href = catalogueHref("/shop", { ...state, ...next });
    startTransition(() => router.push(href, { scroll: false }));
  };

  const submitSearch = (value: string) => {
    const q = value.trim();
    if (q === state.q) return;
    setLastSubmittedQ(q);
    // A new search starts at page 1; replace, so each keystroke is not a history entry.
    const href = catalogueHref("/shop", { ...state, q, page: 1 });
    startTransition(() => router.replace(href, { scroll: false }));
  };

  useEffect(() => {
    if (qInput.trim() === state.q) return;
    const timer = setTimeout(() => submitSearch(qInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submitSearch only reads the same state and router
  }, [qInput, state, router]);

  // The header's search icon links to /shop#shop-search: put the cursor in the search box.
  useEffect(() => {
    if (window.location.hash === "#shop-search") document.getElementById("shop-search")?.focus();
  }, []);

  const clearFilters = () => {
    setQInput("");
    setLastSubmittedQ("");
    go({ q: "", category: "", availability: "", price: "", page: 1 });
  };

  // The URL may use a category name or a slug ("air-conditioning" from the home page tiles).
  const selectedCategory = state.category
    ? categoryOptions.find((c) => slug(c) === slug(state.category)) ?? state.category
    : "All";
  const returnTo = catalogueHref("/shop", { ...state, page: page.currentPage });

  return (
    <section className="shop-layout">
      <aside className="filters">
        <h3>
          <SlidersHorizontal size={18} /> Filters
        </h3>
        <label>
          Search products
          <div className="search-box">
            <Search size={16} />
            <input
              id="shop-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              // Enter (or the phone keyboard's Search key) searches at once instead of after the pause.
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSearch(qInput); } }}
              placeholder="Name, brand, model or SKU"
              maxLength={100}
            />
          </div>
        </label>
        <label>
          Category
          <select
            value={selectedCategory}
            onChange={(e) => go({ category: e.target.value === "All" ? "" : e.target.value, page: 1 })}
          >
            <option value="All">All Categories</option>
            {selectedCategory !== "All" && !categoryOptions.includes(selectedCategory) && (
              <option value={selectedCategory}>{selectedCategory}</option>
            )}
            {categoryOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          Availability
          <select
            value={state.availability}
            onChange={(e) => go({ availability: e.target.value as CatalogueState["availability"], page: 1 })}
          >
            <option value="">All products</option>
            <option value="in-stock">In stock</option>
            <option value="on-request">On request</option>
          </select>
        </label>
        <label>
          Price range
          <select value={state.price} onChange={(e) => go({ price: e.target.value as CatalogueState["price"], page: 1 })}>
            <option value="">Any price</option>
            {Object.entries(PRICE_RANGES).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="text-link" onClick={clearFilters}>
          Clear filters
        </button>
      </aside>
      <div className="shop-results" aria-busy={isPending}>
        <div className="results-bar">
          <span>
            <b>{page.totalProducts}</b> products
            {page.totalPages > 1 && (
              <> · page {page.currentPage} of {page.totalPages}</>
            )}
          </span>
          <div>
            <Grid3X3 size={18} />
            <List size={18} />
            <select value={state.sort} onChange={(e) => go({ sort: e.target.value as CatalogueState["sort"], page: 1 })}>
              <option value="featured">Sort: Featured</option>
              <option value="newest">Sort: Newest</option>
              <option value="low">Price: Low to high</option>
              <option value="az">Alphabetical</option>
            </select>
            <select
              value={state.pageSize}
              onChange={(e) => go({ pageSize: Number(e.target.value), page: 1 })}
              aria-label="Products per page"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  Show {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {page.products.length === 0 ? (
          <div className="p-12 text-center text-slate-500 rounded-2xl space-y-2 my-4 bg-slate-50 border border-slate-200/80">
            <h3 className="font-extrabold text-slate-800 text-base">No products found</h3>
            <p className="text-xs text-slate-500">Try clearing filters or searching for a different keyword.</p>
            <button type="button" onClick={clearFilters} className="text-xs font-bold text-red-600 underline mt-2">
              Reset all filters
            </button>
          </div>
        ) : (
          <div className={`product-grid transition-opacity ${isPending ? "opacity-60" : ""}`}>
            {page.products.map((p, i) => (
              <ProductCard product={p} key={p.id} returnTo={returnTo} eagerImage={i < EAGER_IMAGES} />
            ))}
          </div>
        )}

        <ShopPagination state={state} currentPage={page.currentPage} totalPages={page.totalPages} />
      </div>
    </section>
  );
}
