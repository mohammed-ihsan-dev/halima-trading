"use client";

import AdminProductThumb from "@/components/admin/AdminProductThumb";
import React, { Suspense, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp, ImagePlus, Plus, ShieldCheck, Search, Edit2, Trash2, Check, X, AlertTriangle, Package } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminModal from "@/components/admin/AdminModal";
import AdminPagination from "@/components/admin/AdminPagination";
import { AnimatedStaggerGroup, AnimatedStaggerItem } from "@/components/admin/AnimatedFadeIn";
import { Product } from "@/data/products";
import { adminPriceLabel, hasSellingPrice, isInStock } from "@/lib/pricing";
import { categories } from "@/data/categories";
import { catalogueHref, catalogueQueryString, parseCatalogueParams, withReturnPath, type CatalogueState } from "@/lib/catalogue-query";

const ITEMS_PER_PAGE = 12;
const LIST_PATH = "/admin/products";
const SEARCH_DEBOUNCE_MS = 350;

interface ListResult {
  key: string;
  products: Product[];
  totalProducts: number;
  totalPages: number;
  currentPage: number;
}

// useSearchParams needs a Suspense boundary so the page can still be prerendered.
export default function AdminProductsPage() {
  return (
    <Suspense fallback={null}>
      <AdminProductsList />
    </Suspense>
  );
}

function AdminProductsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL (?page=7&q=…&category=…) is the source of truth, so returning from Edit restores it.
  const state: CatalogueState = { ...parseCatalogueParams(searchParams), pageSize: ITEMS_PER_PAGE, sort: "newest" };
  const listHref = catalogueHref(LIST_PATH, state);
  const queryKey = catalogueQueryString(state);

  const [result, setResult] = useState<ListResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [notification, setNotification] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(state.q);
  const [syncedQ, setSyncedQ] = useState(state.q);
  const [lastSubmittedQ, setLastSubmittedQ] = useState(state.q);
  if (state.q !== syncedQ) {
    setSyncedQ(state.q);
    if (state.q !== lastSubmittedQ) setSearch(state.q);
  }

  const navigate = (next: Partial<CatalogueState>, mode: "push" | "replace" = "push") => {
    const href = catalogueHref(LIST_PATH, { ...state, ...next });
    startTransition(() => (mode === "push" ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })));
  };

  // One request per page/filter combination; MongoDB returns only that page.
  const fetchKey = `${queryKey}#${reloadToken}`;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(queryKey.slice(1));
    params.set("page", String(state.page));
    params.set("limit", String(ITEMS_PER_PAGE));
    fetch(`/api/admin/products?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.data)) {
          setErrorMessage(data.error || "Failed to load products from MongoDB server.");
          return;
        }
        setErrorMessage("");
        setResult({ key: fetchKey, products: data.data, ...data.pagination });
        // Past the last page (e.g. after deleting its only product): show the last real page.
        if (data.pagination.currentPage !== state.page) {
          router.replace(catalogueHref(LIST_PATH, { ...state, page: data.pagination.currentPage }), { scroll: false });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load admin products:", err);
        setErrorMessage("Network error while connecting to MongoDB product API.");
      });
    return () => controller.abort();
    // fetchKey captures everything the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  useEffect(() => {
    const q = search.trim();
    if (q === state.q) return;
    const timer = setTimeout(() => {
      setLastSubmittedQ(q);
      // A new search starts at page 1; replace so each keystroke is not a history entry.
      navigate({ q, page: 1 }, "replace");
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, queryKey]);

  const refreshProducts = () => setReloadToken((n) => n + 1);
  const loading = result === null || (result.key !== fetchKey && !errorMessage);
  const products = result?.products ?? [];
  const currentPage = result?.currentPage ?? state.page;
  const totalPages = result?.totalPages ?? 1;

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      const res = await fetch(`/api/admin/products?id=${encodeURIComponent(productToDelete.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setNotification(`Product "${productToDelete.name}" deleted.`);
        refreshProducts();
      } else {
        setNotification(`Error deleting product: ${data.error || "Failed"}`);
      }
    } catch (err) {
      console.error("Failed to delete product:", err);
      setNotification("Failed to delete product.");
    }
    setProductToDelete(null);
    setTimeout(() => setNotification(""), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Add Product Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Products</h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Manage catalog products, inventory SKUs, stock levels, and listings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/products/out-of-stock"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs md:text-sm rounded-xl transition-all"
          >
            <AlertTriangle size={16} /> Out of Stock
          </Link>
          <Link
            href="/admin/products/import"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-extrabold text-xs md:text-sm rounded-xl transition-all"
          >
            <FileUp size={16} /> Bulk Import
          </Link>
          <Link
            href="/admin/products/images"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-extrabold text-xs md:text-sm rounded-xl transition-all"
          >
            <ImagePlus size={16} /> Bulk Images
          </Link>
          <Link
            href="/admin/products/image-review"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-extrabold text-xs md:text-sm rounded-xl transition-all"
          >
            <ShieldCheck size={16} /> Image Review
          </Link>
          <Link
            href="/admin/products/add"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm rounded-xl shadow-md shadow-red-600/30 transition-all"
          >
            <Plus size={18} /> Add Product
          </Link>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs md:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification("")} className="text-emerald-600 hover:text-emerald-900">
            <X size={16} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs md:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage("")} className="text-rose-600 hover:text-rose-900">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 md:p-5 shadow-2xs flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto flex-1 min-w-0">
          {/* Category Dropdown Filter */}
          <div className="relative w-full sm:w-auto">
            <select
              aria-label="Filter by category"
              value={categories.find((c) => c.name.toLowerCase() === state.category.toLowerCase())?.name ?? (state.category || "all")}
              onChange={(e) => navigate({ category: e.target.value === "all" ? "" : e.target.value, page: 1 })}
              className="w-full sm:w-auto bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm font-bold text-slate-800 focus:outline-hidden focus:border-red-500 cursor-pointer pr-8"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-0 w-full sm:max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by SKU, name, model..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-slate-800 font-medium focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Product Cards Grid (12 Items Per Page Max) */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200/80 h-72 p-4 flex flex-col justify-between">
              <div className="w-full h-36 bg-slate-100 rounded-xl" />
              <div className="space-y-2 pt-2">
                <div className="h-3 w-1/3 bg-slate-200 rounded-md" />
                <div className="h-4 w-3/4 bg-slate-200 rounded-md" />
                <div className="h-3 w-1/2 bg-slate-100 rounded-md" />
              </div>
              <div className="h-8 bg-slate-100 rounded-xl w-full mt-2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-500 space-y-3">
          <Package size={48} className="mx-auto text-slate-300" />
          <h3 className="font-extrabold text-slate-900 text-lg">No products match your search or filter</h3>
          <p className="text-xs md:text-sm text-slate-500">Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <AnimatedStaggerGroup key={fetchKey} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((p) => (
            <AnimatedStaggerItem key={p.id}>
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-all group h-full">
                {/* Product Image Area */}
                <div className="relative w-full h-48 bg-slate-50 border-b border-slate-100 p-4 flex items-center justify-center overflow-hidden">
                  <AdminProductThumb images={p.images} alt={p.name} className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute top-3 right-3">
                    {isInStock(p) ? (
                      <AdminBadge variant="success">In Stock</AdminBadge>
                    ) : (
                      <AdminBadge variant="danger">Out of Stock</AdminBadge>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500 mb-1">
                      <span className="uppercase tracking-wider truncate">{p.category}</span>
                      <span className="font-mono text-red-600 font-extrabold shrink-0">{p.sku || "HT-001"}</span>
                    </div>
                    {(p.status === "draft" || p.status === "inactive") && (
                      <AdminBadge variant="warning" className="mb-1">
                        {p.status === "draft" ? "Draft — hidden from shop" : "Inactive — hidden from shop"}
                      </AdminBadge>
                    )}
                    <h3 className="font-extrabold text-slate-900 text-sm md:text-base leading-snug line-clamp-2">{p.name}</h3>
                    <div className="flex items-center justify-between mt-1 text-xs">
                      <span className="font-semibold text-slate-500">Brand: {p.brand}</span>
                    </div>
                  </div>

                  {/* Price & Stock info */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Price</span>
                      <span
                        className={hasSellingPrice(p) ? "text-base md:text-lg font-black text-slate-900" : "text-sm font-bold text-slate-500"}
                      >
                        {/* Never an invented amount: no real price means the quotation state. */}
                        {adminPriceLabel(p)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Qty</span>
                      <span className="text-xs md:text-sm font-extrabold text-slate-800">
                        {isInStock(p) ? `${p.stockCount ?? 0} units` : "0 units"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Footer */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link
                    href={withReturnPath(`/admin/products/${encodeURIComponent(p.id)}/edit`, listHref, LIST_PATH)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs md:text-sm font-bold rounded-xl transition-colors"
                  >
                    <Edit2 size={15} /> Edit
                  </Link>
                  <button
                    onClick={() => setProductToDelete(p)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs md:text-sm font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </div>
            </AnimatedStaggerItem>
          ))}
        </AnimatedStaggerGroup>
      )}

      {/* Global Reusable Pagination (12 Items Max Per Page) */}
      <AdminPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => navigate({ page })}
        totalItems={result?.totalProducts ?? 0}
        itemsPerPage={ITEMS_PER_PAGE}
        itemLabel="products"
      />

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <AdminModal
          isOpen={Boolean(productToDelete)}
          onClose={() => setProductToDelete(null)}
          title="Confirm Delete Product"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs md:text-sm font-semibold flex items-center gap-3">
              <AlertTriangle size={22} className="shrink-0 text-rose-600" />
              <span>Are you sure you want to delete <strong>{productToDelete.name}</strong>?</span>
            </div>
            <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
              This action will remove the product listing from your catalog.
            </p>
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 text-xs md:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProduct}
                className="px-5 py-2 text-xs md:text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
              >
                Delete Product
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
