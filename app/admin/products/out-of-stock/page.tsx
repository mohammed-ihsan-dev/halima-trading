"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Trash2, Edit2, RefreshCw, CheckCircle2 } from "lucide-react";
import AdminBadge from "@/components/admin/AdminBadge";
import AdminModal from "@/components/admin/AdminModal";
import AdminPagination from "@/components/admin/AdminPagination";
import { Product } from "@/data/products";

const ITEMS_PER_PAGE = 12;

export default function AdminOutOfStockProductsPage() {
  const [outOfStockProducts, setOutOfStockProducts] = useState<Product[]>([]);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [notification, setNotification] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const refreshList = () => {
    fetch("/api/admin/products", { cache: "no-store" })
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          const list: Product[] = res.data;
          setOutOfStockProducts(
            list.filter((p) => !p.inStock || (p.stockCount !== undefined && p.stockCount <= 0))
          );
        }
      })
      .catch((err) => console.error("Failed to fetch out of stock products:", err));
  };

  useEffect(() => {
    refreshList();
  }, []);

  const totalPages = Math.ceil(outOfStockProducts.length / ITEMS_PER_PAGE) || 1;
  const paginatedProducts = outOfStockProducts.slice(
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
        refreshList();
      } else {
        setNotification(`Error: ${data.error || "Failed to delete"}`);
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
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-slate-500 mb-1">
            <Link href="/admin/products" className="hover:text-red-600 flex items-center gap-1">
              <ArrowLeft size={16} /> Back to All Products
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <AlertTriangle className="text-amber-500" size={28} /> Out-of-Stock Products
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Dedicated view of products requiring restocking attention.
          </p>
        </div>
        <button
          onClick={refreshList}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs md:text-sm rounded-xl border border-slate-300 transition-all self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw size={16} /> Refresh List
        </button>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs md:text-sm font-semibold">
          {notification}
        </div>
      )}

      {/* Out of Stock Card Grid */}
      {outOfStockProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-500 space-y-3">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
          <h3 className="font-extrabold text-slate-900 text-lg">All Products In Stock</h3>
          <p className="text-sm text-slate-500">There are currently no out-of-stock items in inventory.</p>
          <Link
            href="/admin/products"
            className="inline-block mt-4 text-xs md:text-sm font-extrabold text-red-600 hover:text-red-700 uppercase tracking-wider"
          >
            ← Return to Products Catalog
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {paginatedProducts.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-all group"
            >
              {/* Product Image Area */}
              <div className="relative w-full h-48 bg-slate-50 border-b border-slate-100 p-4 flex items-center justify-center overflow-hidden">
                <img
                  src={p.images?.[0] || "/featured/hisense-window-ac.png"}
                  alt={p.name}
                  className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-3 right-3">
                  <AdminBadge variant="danger">Out of Stock</AdminBadge>
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
                    <span className="text-xs md:text-sm font-extrabold text-rose-600">
                      0 units
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
          ))}
        </div>
      )}

      {/* Global Reusable Pagination */}
      <AdminPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => setCurrentPage(page)}
        totalItems={outOfStockProducts.length}
        itemsPerPage={ITEMS_PER_PAGE}
        itemLabel="out-of-stock products"
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
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 text-xs md:text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProduct}
                className="px-5 py-2 text-xs md:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm"
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
