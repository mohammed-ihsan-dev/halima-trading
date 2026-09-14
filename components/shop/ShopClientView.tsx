"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Grid3X3, List, Search, SlidersHorizontal } from "lucide-react";
import type { Product } from "@/data/products";
import ProductCard from "@/components/ProductCard";

interface ShopClientViewProps {
  initialProducts: Product[];
}

export default function ShopClientView({ initialProducts }: ShopClientViewProps) {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");

  const [productList, setProductList] = useState<Product[]>(initialProducts);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    if (categoryParam) {
      setCat(categoryParam);
    }
  }, [categoryParam]);

  // Keep synced if initialProducts prop updates
  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setProductList(initialProducts);
    }
  }, [initialProducts]);

  const filtered = useMemo(() => {
    let p = productList.filter(
      (x) =>
        (cat === "All" || x.category.toLowerCase() === cat.toLowerCase()) &&
        `${x.name} ${x.brand} ${x.model} ${x.sku || ""}`.toLowerCase().includes(q.toLowerCase())
    );
    return [...p].sort((a, b) =>
      sort === "az"
        ? a.name.localeCompare(b.name)
        : sort === "low"
        ? (a.price ?? 999999) - (b.price ?? 999999)
        : 0
    );
  }, [productList, q, cat, sort]);

  const categoryOptions = useMemo(() => {
    return [...new Set(productList.map((x) => x.category))];
  }, [productList]);

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
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, brand, model or SKU"
            />
          </div>
        </label>
        <label>
          Category
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="All">All Categories</option>
            {categoryOptions.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          Availability
          <select>
            <option>All products</option>
            <option>In stock</option>
            <option>On request</option>
          </select>
        </label>
        <label>
          Price range
          <select>
            <option>Any price</option>
            <option>Under AED 1,000</option>
            <option>AED 1,000–3,000</option>
            <option>Above AED 3,000</option>
          </select>
        </label>
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setQ("");
            setCat("All");
          }}
        >
          Clear filters
        </button>
      </aside>
      <div className="shop-results">
        <div className="results-bar">
          <span>
            <b>{filtered.length}</b> products
          </span>
          <div>
            <Grid3X3 size={18} />
            <List size={18} />
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Sort: Newest</option>
              <option value="low">Price: Low to high</option>
              <option value="az">Alphabetical</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 rounded-2xl space-y-2 my-4 bg-slate-50 border border-slate-200/80">
            <h3 className="font-extrabold text-slate-800 text-base">No products found</h3>
            <p className="text-xs text-slate-500">Try clearing filters or searching for a different keyword.</p>
            <button
              type="button"
              onClick={() => {
                setQ("");
                setCat("All");
              }}
              className="text-xs font-bold text-red-600 underline mt-2"
            >
              Reset all filters
            </button>
          </div>
        ) : (
          <div className="product-grid">
            {filtered.map((p) => (
              <ProductCard product={p} key={p.id} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
