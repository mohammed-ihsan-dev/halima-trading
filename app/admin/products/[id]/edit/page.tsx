"use client";

import { formatCurrency } from "@/lib/currency";
import { DELIVERY_FEE_AED } from "@/lib/order-pricing";
import React, { useState, useEffect, useRef, useCallback } from "react";
import ProductGalleryEditor, { type CommitResult } from "@/components/admin/ProductGalleryEditor";
import { realImages } from "@/lib/admin-gallery";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { safeCatalogueReturnPath } from "@/lib/catalogue-query";
import {
  ArrowLeft,
  Save,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { Product } from "@/data/products";
import { categories } from "@/data/categories";
import { brands } from "@/data/brands";

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  // The product list page this was opened from (validated internal path), so Back/Save return to it.
  const listHref = safeCatalogueReturnPath(useSearchParams().get("from"), "/admin/products") ?? "/admin/products";
  const productId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState("");
  const [notFound, setNotFound] = useState(false);

  // The product's saved images (real images only — the display placeholder is never a gallery item).
  // Gallery changes are saved immediately and conditionally: only the images field is written.
  const [images, setImages] = useState<string[]>([]);
  const savedImages = useRef<string[]>([]);
  const [galleryBusy, setGalleryBusy] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    brand: "",
    model: "",
    category: "",
    subcategory: "",
    price: "",
    stockCount: "",
    inStock: true,
    status: "active",
    description: "",
    specifications: "",
  });

  const reloadImages = useCallback(async () => {
    const res = await fetch(`/api/admin/products?id=${encodeURIComponent(productId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (data.success && data.product) {
      savedImages.current = realImages(data.product.images);
      setImages(savedImages.current);
    }
  }, [productId]);

  /** Saves the gallery to the product (only if nobody changed its images meanwhile), then shows the saved list. */
  const persistImages = useCallback(async (next: string[]): Promise<CommitResult> => {
    try {
      const res = await fetch("/api/admin/products/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: productId, expectedImages: savedImages.current, images: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.images)) {
        savedImages.current = realImages(data.images);
        setImages(savedImages.current);
        return { ok: true, images: savedImages.current };
      }
      if (res.status === 409) {
        await reloadImages();
        return { ok: false, error: "The images of this product were changed elsewhere. The gallery has been reloaded — please try again." };
      }
      return { ok: false, error: data.error || `Could not save the gallery (HTTP ${res.status}). Nothing was lost — try again.` };
    } catch {
      return { ok: false, error: "Could not reach the server to save the gallery. Check your connection and try again." };
    }
  }, [productId, reloadImages]);

  useEffect(() => {
    if (!productId) return;
    // Admin endpoint: also returns draft products, which the public API hides.
    fetch(`/api/admin/products?id=${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.product) {
          const existing = res.product;
          setFormData({
            name: existing.name || "",
            sku: existing.sku || "",
            brand: existing.brand || "",
            model: existing.model || "",
            category: existing.category || "",
            subcategory: existing.subcategory || "",
            price: existing.price !== null ? String(existing.price) : "",
            stockCount: existing.stockCount !== undefined ? String(existing.stockCount) : "12",
            inStock: existing.inStock !== undefined ? existing.inStock : true,
            status: existing.status === "draft" || existing.status === "inactive" ? existing.status : "active",
            description: existing.description || "",
            specifications: existing.specifications
              ? Object.entries(existing.specifications)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")
              : "",
          });
          savedImages.current = realImages(existing.images);
          setImages(savedImages.current);
          setLoading(false);
        } else {
          setNotFound(true);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch product for editing:", err);
        setNotFound(true);
        setLoading(false);
      });
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotification("");

    const priceNum = formData.price ? parseFloat(formData.price) : null;
    const stockNum = formData.stockCount ? parseInt(formData.stockCount, 10) : 0;


    const specsObject: Record<string, string> = {};
    if (formData.specifications.trim()) {
      formData.specifications.split("\n").forEach((line) => {
        const parts = line.split(":");
        if (parts.length >= 2) {
          specsObject[parts[0].trim()] = parts.slice(1).join(":").trim();
        }
      });
    }

    if (galleryBusy) {
      setNotification("Error: Wait until the gallery has finished uploading and saving images.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: productId,
          name: formData.name,
          sku: formData.sku,
          brand: formData.brand,
          model: formData.model,
          category: formData.category,
          subcategory: formData.subcategory,
          price: priceNum,
          stockCount: stockNum,
          inStock: stockNum > 0,
          description: formData.description,
          specifications: Object.keys(specsObject).length > 0 ? specsObject : undefined,
          // images are not sent: the gallery saves them itself, so this form can never overwrite them.
          status: formData.status,
        }),
      });

      const data = await res.json();
      setSaving(false);

      if (data.success) {
        setNotification(`Product "${formData.name}" updated successfully in MongoDB!`);
        setTimeout(() => {
          router.push(listHref);
        }, 1200);
      } else {
        setNotification(`Error: ${data.error || "Failed to update product"}`);
      }
    } catch (err) {
      console.error("Failed to update product via MongoDB API:", err);
      setSaving(false);
      setNotification("Failed to update product.");
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-sm font-bold text-slate-400 flex items-center justify-center gap-2">
        <Loader2 className="animate-spin text-red-600" size={20} />
        <span>Loading product details...</span>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4 p-8 text-center bg-white rounded-2xl border border-slate-200">
        <h2 className="text-xl font-black text-slate-900">Product Not Found</h2>
        <p className="text-sm text-slate-500">The product you are trying to edit could not be found.</p>
        <Link
          href={listHref}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs md:text-sm font-bold"
        >
          <ArrowLeft size={16} /> Back to Products
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={listHref}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Edit Product</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">
              Update catalog details, gallery images, pricing and stock.
            </p>
          </div>
        </div>
      </div>

      {notification && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs md:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification("")} className="text-emerald-600">
            <X size={16} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Multi-Image Gallery Uploader (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <ProductGalleryEditor
            images={images}
            onCommit={persistImages}
            productRef={formData.sku || productId}
            inputId="photo-file-input-edit"
            autoSave
            onBusyChange={setGalleryBusy}
          />
        </div>

        {/* Right Column: General Information, Pricing & Delivery (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-5">
            <h2 className="text-sm md:text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3 uppercase tracking-wider">
              General Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Product Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  SKU (Stock Keeping Unit) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-mono font-extrabold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Model Number
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Category <span className="text-red-600">*</span>
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
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Brand</label>
                <select
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 cursor-pointer"
                >
                  <option value="">Select Brand</option>
                  {/* Keep brands that exist on the product but not in the preset list (manual or imported) selectable. */}
                  {formData.brand && !brands.includes(formData.brand) && (
                    <option value={formData.brand}>{formData.brand}</option>
                  )}
                  {brands.map((b) => {
                    const brandName = typeof b === "string" ? b : (b as any).name || String(b);
                    return (
                      <option key={brandName} value={brandName}>
                        {brandName}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Publication */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-3">
            <h2 className="text-sm md:text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3 uppercase tracking-wider">
              Publication
            </h2>
            <label className="block text-xs md:text-sm font-extrabold text-slate-800" htmlFor="product-status">Status</label>
            <select
              id="product-status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full md:w-72 bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 cursor-pointer"
            >
              <option value="active">Active — visible in the shop</option>
              <option value="draft">Draft — hidden from the shop</option>
              <option value="inactive">Inactive — hidden from the shop</option>
            </select>
            <p className="text-[11px] md:text-xs text-slate-500 font-medium">
              Draft and inactive products cannot be seen or bought by customers. Publishing a draft requires at least one
              product image; without a price it is shown as &ldquo;Contact for Price&rdquo;.
            </p>
          </div>

          {/* Pricing, Stock & Delivery */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-5">
            <h2 className="text-sm md:text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3 uppercase tracking-wider">
              Pricing & Inventory
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Price (AED)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-black focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">
                  Stock Quantity <span className="text-red-600">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={formData.stockCount}
                  onChange={(e) => setFormData({ ...formData, stockCount: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-extrabold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <span className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Delivery</span>
                <p className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-700 font-bold">
                  Fixed {formatCurrency(DELIVERY_FEE_AED)} per order, added at checkout
                </p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-5">
            <h2 className="text-sm md:text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3 uppercase tracking-wider">
              Product Description
            </h2>
            <textarea
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter detailed product description..."
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs md:text-sm text-slate-800 font-medium focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href={listHref}
              className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs md:text-sm rounded-xl transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm rounded-xl shadow-md shadow-red-600/30 transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              <span>{saving ? "Saving Changes..." : "Save Product Changes"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
