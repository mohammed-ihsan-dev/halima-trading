"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Check, ImageIcon, Upload, Trash2, RefreshCw } from "lucide-react";
import { categories } from "@/data/categories";

export default function AdminAddProductPage() {
  const router = useRouter();
  const [notification, setNotification] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    category: "",
    subcategory: "",
    brand: "",
    model: "",
    price: "",
    currency: "AED",
    stockQuantity: "",
    description: "",
    specifications: "",
    imageUrl: "",
  });

  const [uploadMethod, setUploadMethod] = useState<"file" | "url">("file");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const stockNum = formData.stockQuantity ? parseInt(formData.stockQuantity, 10) : 0;

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
          currency: formData.currency || "AED",
          inStock: stockNum > 0,
          stockCount: stockNum,
          description: formData.description,
          images: [formData.imageUrl.trim() || "/featured/hisense-window-ac.png"],
        }),
      });

      const data = await res.json();
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
          <Check size={18} className="text-emerald-600" />
          <span>{notification}</span>
        </div>
      )}

      {/* Main 2-Column Form Layout */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Images with File Upload Options (4 Cols) */}
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

            {/* Main Preview Box - Fixed Square Aspect Ratio Container */}
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
                  htmlFor="photo-file-input"
                  className="w-full flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-red-500 bg-slate-50 hover:bg-red-50/20 text-slate-600 hover:text-red-600 transition-all cursor-pointer text-center"
                >
                  <Upload size={22} className="text-slate-400" />
                  <span className="text-xs font-bold">Click to Browse & Upload Photo</span>
                  <span className="text-[10px] text-slate-400 font-medium">Supports PNG, JPG, WEBP, SVG</span>
                </label>
                <input
                  id="photo-file-input"
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

        {/* Right Column: Product Fields (8 Cols) */}
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
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Category *</label>
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
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Subcategory</label>
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
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Brand *</label>
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
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Model</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g. AR18TYHYEWKN"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 font-bold focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors font-mono"
                />
              </div>
            </div>

            {/* Price | Stock Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Price (AED) *</label>
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
                <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Stock Quantity *</label>
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
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs md:text-sm font-extrabold text-slate-800 mb-1.5">Description</label>
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
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs md:text-sm shadow-md shadow-red-600/30 transition-all cursor-pointer"
            >
              Save Product
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
