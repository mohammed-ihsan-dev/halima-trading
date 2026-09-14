"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, Check, X, ImageIcon, Upload, Trash2 } from "lucide-react";
import { Product } from "@/data/products";
import { categories } from "@/data/categories";
import { brands } from "@/data/brands";

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [uploadMethod, setUploadMethod] = useState<"file" | "url">("file");

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
    description: "",
    specifications: "",
    imageUrl: "",
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setFormData((prev) => ({ ...prev, imageUrl: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!productId) return;
    fetch(`/api/products?slug=${encodeURIComponent(productId)}`, { cache: "no-store" })
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
            description: existing.description || "",
            specifications: existing.specifications
              ? Object.entries(existing.specifications)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")
              : "",
            imageUrl: existing.images && existing.images.length > 0 ? existing.images[0] : "",
          });
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

    const imageList = formData.imageUrl.trim()
      ? [formData.imageUrl.trim()]
      : ["/featured/hisense-window-ac.png"];

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
          images: imageList,
        }),
      });


      const data = await res.json();
      setSaving(false);

      if (data.success) {
        setNotification(`Product "${formData.name}" updated successfully in MongoDB!`);
        setTimeout(() => {
          router.push("/admin/products");
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
      <div className="p-12 text-center text-sm font-bold text-slate-400">
        Loading product details...
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4 p-8 text-center bg-white rounded-2xl border border-slate-200">
        <h2 className="text-xl font-black text-slate-900">Product Not Found</h2>
        <p className="text-sm text-slate-500">The product you are trying to edit could not be found.</p>
        <Link
          href="/admin/products"
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
            href="/admin/products"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Edit Product</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">
              Update inventory specifications, pricing, stock count, and catalog details.
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
        {/* Left Column: Product Image Upload / Preview Box (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">
                Product Image
              </h2>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setUploadMethod("file")}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    uploadMethod === "file" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMethod("url")}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    uploadMethod === "url" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"
                  }`}
                >
                  URL Path
                </button>
              </div>
            </div>

            {/* Square Aspect Ratio Preview Box */}
            <div className="w-full aspect-square max-h-[340px] rounded-xl bg-slate-50/80 border border-slate-200/80 overflow-hidden flex items-center justify-center p-3 relative group mx-auto">
              {formData.imageUrl ? (
                <>
                  <img
                    src={formData.imageUrl}
                    alt="Product Preview"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/featured/hisense-window-ac.png";
                    }}
                    className="w-full h-full object-contain object-center transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, imageUrl: "" })}
                    className="absolute top-3 right-3 p-2 bg-rose-600 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-rose-700 cursor-pointer"
                    title="Remove Photo"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              ) : (
                <div className="text-center text-slate-400 space-y-2 p-4">
                  <ImageIcon size={44} className="mx-auto text-slate-300" />
                  <span className="text-xs font-semibold block">No image selected</span>
                  <span className="text-[10px] text-slate-400 block font-normal">Preview fits in 1:1 square ratio</span>
                </div>
              )}
            </div>

            {/* Upload Method Input Controls */}
            {uploadMethod === "file" ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Select Image File from Computer
                </label>
                <label
                  htmlFor="photo-file-input-edit"
                  className="w-full flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-red-500 bg-slate-50 hover:bg-red-50/20 text-slate-600 hover:text-red-600 transition-all cursor-pointer text-center"
                >
                  <Upload size={22} className="text-slate-400" />
                  <span className="text-xs font-bold">Click to Browse & Upload Photo</span>
                  <span className="text-[10px] text-slate-400 font-medium">Supports PNG, JPG, WEBP, SVG</span>
                </label>
                <input
                  id="photo-file-input-edit"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Image URL / Asset Path</label>
                <input
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="e.g. /featured/hisense-window-ac.png"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: General Information & Pricing (8 Cols) */}
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
              <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Model Number</label>
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

        {/* Pricing & Stock */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 md:p-7 shadow-2xs space-y-5">
          <h2 className="text-sm md:text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3 uppercase tracking-wider">
            Pricing & Inventory
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/admin/products"
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs md:text-sm rounded-xl transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm rounded-xl shadow-md shadow-red-600/30 transition-all disabled:opacity-50"
          >
            <Save size={18} />
            {saving ? "Saving Changes..." : "Save Product Changes"}
          </button>
        </div>
      </div>
    </form>
  </div>
);

}

