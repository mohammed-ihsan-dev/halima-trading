"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, Filter, Edit2, Trash2, Check, X, AlertTriangle, Package } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminModal from "@/components/admin/AdminModal";
import AdminPagination from "@/components/admin/AdminPagination";
import { AnimatedStaggerGroup, AnimatedStaggerItem } from "@/components/admin/AnimatedFadeIn";
import { Product } from "@/data/products";
import { categories } from "@/data/categories";

const ITEMS_PER_PAGE = 12;

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [notification, setNotification] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const refreshProducts = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/admin/products", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        setProducts(data.data);
      } else if (Array.isArray(data.data)) {
        setProducts(data.data);
      } else {
        setErrorMessage(data.error || "Failed to load products from MongoDB server.");
      }
    } catch (err) {
      console.error("Failed to load admin products:", err);
      setErrorMessage("Network error while connecting to MongoDB product API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshProducts();
  }, []);

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory]);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
      (p.model && p.model.toLowerCase().includes(search.toLowerCase())) ||
      p.brand.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || p.category.toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  // Calculate Pagination slice
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1;
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

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
        <div className="flex items-center gap-3">
          <Link
            href="/admin/products/out-of-stock"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs md:text-sm rounded-xl transition-all"
          >
            <AlertTriangle size={16} /> Out of Stock
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
        <div className="flex items-center gap-3 w-full md:w-auto flex-1">
          {/* Category Dropdown Filter */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm font-bold text-slate-800 focus:outline-hidden focus:border-red-500 cursor-pointer pr-8"
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
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by SKU, name, model..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-slate-800 font-medium focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
            />
          </div>
        </div>

        <button className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs md:text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors w-full md:w-auto justify-center">
          <Filter size={16} /> Filter
        </button>
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
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-500 space-y-3">
          <Package size={48} className="mx-auto text-slate-300" />
          <h3 className="font-extrabold text-slate-900 text-lg">No products match your search or filter</h3>
          <p className="text-xs md:text-sm text-slate-500">Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <AnimatedStaggerGroup key={currentPage} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {paginatedProducts.map((p) => (
            <AnimatedStaggerItem key={p.id}>
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-all group h-full">
                {/* Product Image Area */}
                <div className="relative w-full h-48 bg-slate-50 border-b border-slate-100 p-4 flex items-center justify-center overflow-hidden">
                  <img
                    src={p.images?.[0] || "/featured/hisense-window-ac.png"}
                    alt={p.name}
                    className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 right-3">
                    {p.inStock ? (
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
                    <h3 className="font-extrabold text-slate-900 text-sm md:text-base leading-snug line-clamp-2">{p.name}</h3>
                    <span className="text-xs font-semibold text-slate-500 block mt-1">Brand: {p.brand}</span>
                  </div>

                  {/* Price & Stock info */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Price</span>
                      <span className="text-base md:text-lg font-black text-slate-900">
                        {p.price !== null ? `AED ${p.price.toLocaleString()}` : "AED 1,899"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Qty</span>
                      <span className="text-xs md:text-sm font-extrabold text-slate-800">
                        {p.inStock ? `${p.stockCount || 12} units` : "0 units"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons Footer */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/products/${p.id}/edit`}
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
        onPageChange={(page) => setCurrentPage(page)}
        totalItems={filteredProducts.length}
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
