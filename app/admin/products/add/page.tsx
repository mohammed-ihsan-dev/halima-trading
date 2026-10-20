"use client";

import React, { useState, useCallback } from "react";
import ProductGalleryEditor, { type CommitResult } from "@/components/admin/ProductGalleryEditor";
import { realImages } from "@/lib/admin-gallery";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Plus,
  Check,
  Loader2,
} from "lucide-react";
import { categories } from "@/data/categories";

export default function AdminAddProductPage() {
  const router = useRouter();
  const [notification, setNotification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    category: "",
    subcategory: "",
    brand: "",
    model: "",
    price: "",
    deliveryRate: "0",
    currency: "AED",
    stockQuantity: "",
    description: "",
    specifications: "",
  });

  // Images for the new product (real images only). Uploaded files are already in image storage;
  // the list is saved with the product when it is created.
  const [images, setImages] = useState<string[]>([]);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const keepImages = useCallback(async (next: string[]): Promise<CommitResult> => {
    const list = realImages(next);
    setImages(list);
    return { ok: true, images: list };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const deliveryRateNum = parseFloat(formData.deliveryRate);
    if (isNaN(deliveryRateNum) || deliveryRateNum < 0) {
      setNotification("Error: Delivery rate must be a valid non-negative number.");
      return;
    }

    const stockNum = formData.stockQuantity ? parseInt(formData.stockQuantity, 10) : 0;
    if (galleryBusy) {
      setNotification("Error: Wait until the gallery has finished uploading images.");
      return;
    }

    setIsSubmitting(true);
    setNotification("");

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          category: formData.category || "Air Conditioning",
          subcategory: formData.subcategory || "General",
          brand: formData.brand.trim() || "Halima Trading",
          model: formData.model.trim() || "N/A",
          price: formData.price ? parseFloat(formData.price) : 0,
          deliveryRate: deliveryRateNum,
          currency: formData.currency || "AED",
          inStock: stockNum > 0,
          stockCount: stockNum,
          description: formData.description,
          images: realImages(images), // never the placeholder: no images is stored as an empty list
        }),
      });

      const data = await res.json();
      setIsSubmitting(false);

      if (data.success) {
        setNotification("Product created successfully in MongoDB Atlas!");
        setTimeout(() => {
          router.push("/admin/products");
        }, 800);
      } else {
        setNotification(`Error: ${data.error || "Failed to create product"}`);
      }
    } catch (err) {
      console.error("Failed to add product via MongoDB API:", err);
      setIsSubmitting(false);
      setNotification("Failed to create product.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div>
        <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-400 mb-1">
          <Link href="/admin/products" className="hover:text-slate-600">
            Products
          </Link>
          <ChevronRight size={14} className="text-slate-300" />
          <span className="text-slate-900 font-bold">Add Product</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Add Product</h1>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs md:text-sm font-semibold flex items-center gap-2">
          <Check size={18} className="text-emerald-600 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Main 2-Column Form Layout */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Multi-Image Uploader (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <ProductGalleryEditor
            images={images}
            onCommit={keepImages}
            productRef={formData.model || undefined}
            inputId="photo-file-input"
            autoSave={false}
            onBusyChange={setGalleryBusy}
          />
        </div>

        {/* Right Column: Product Fields & Pricing (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200/80 shadow-2xs space-y-5">
            {/* Product Name */}
            <div>
              <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                Product Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Samsung 1.5 Ton Split Air Conditioner"
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
              />
            </div>

            {/* Category | Subcategory */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Category *
                </label>
                <select
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 cursor-pointer"
                >
                  <option value="">Select Category</option>
                  {categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Subcategory
                </label>
                <select
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 cursor-pointer"
                >
                  <option value="">Select Subcategory (Optional)</option>
                  <option value="Split Air Conditioners">Split Air Conditioners</option>
                  <option value="Window Air Conditioners">Window Air Conditioners</option>
                  <option value="Washing Machines">Washing Machines</option>
                  <option value="Water Coolers">Water Coolers</option>
                  <option value="General">General</option>
                </select>
              </div>
            </div>

            {/* Brand | Model */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Brand *
                </label>
                <input
                  type="text"
                  required
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  placeholder="e.g. Samsung, Super General, Hisense"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Model
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g. AR18TYHYEWKN"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors font-mono"
                />
              </div>
            </div>

            {/* Price | Stock Quantity | Delivery Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Price (AED) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="e.g. 1899"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-black focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Stock Quantity *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                  placeholder="e.g. 12"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-extrabold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>

              {/* FEATURE 2 — PRODUCT-SPECIFIC DELIVERY RATE */}
              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5 flex items-center justify-between">
                  <span>Delivery Rate (AED) *</span>
                  {parseFloat(formData.deliveryRate) === 0 && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      FREE
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.deliveryRate}
                    onChange={(e) => setFormData({ ...formData, deliveryRate: e.target.value })}
                    placeholder="0 for Free Delivery"
                    className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-black focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                  />
                </div>
                <span className="text-[10px] text-slate-400 block font-medium mt-1">
                  Enter 0 for FREE DELIVERY on customer site.
                </span>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                Description
              </label>
              <textarea
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter detailed product description and key features..."
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs md:text-sm text-slate-800 font-medium focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/admin/products"
              className="px-6 py-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs md:text-sm transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm shadow-md shadow-red-600/30 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              <span>{isSubmitting ? "Saving Product..." : "Save Product"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
