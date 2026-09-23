"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Check,
  X,
  ImageIcon,
  Upload,
  Trash2,
  Star,
  AlertCircle,
  Loader2,
} from "lucide-react";
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
  const [uploadError, setUploadError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [uploadMethod, setUploadMethod] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    brand: "",
    model: "",
    category: "",
    subcategory: "",
    price: "",
    deliveryRate: "0",
    stockCount: "",
    inStock: true,
    description: "",
    specifications: "",
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError("");
    setIsUploading(true);

    const fileList = Array.from(files);
    const loadedImages: string[] = [];

    for (const file of fileList) {
      if (file.size > 15 * 1024 * 1024) {
        setUploadError(`File ${file.name} exceeds 15MB size limit.`);
        continue;
      }

      try {
        const compressedUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const rawUrl = event.target?.result as string;
            if (!rawUrl || file.type === "image/svg+xml") {
              resolve(rawUrl || "");
              return;
            }
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              let width = img.width;
              let height = img.height;
              const maxDim = 1200;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
              } else {
                resolve(rawUrl);
              }
            };
            img.onerror = () => resolve(rawUrl);
            img.src = rawUrl;
          };
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        });

        if (compressedUrl) {
          loadedImages.push(compressedUrl);
        }
      } catch (err) {
        setUploadError(`Failed to process file ${file.name}`);
      }
    }

    if (loadedImages.length > 0) {
      setImages((prev) => {
        const combined = [...prev];
        loadedImages.forEach((img) => {
          if (!combined.includes(img)) combined.push(img);
        });
        return combined;
      });
    }

    setIsUploading(false);
    e.target.value = "";
  };

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (images.includes(trimmed)) {
      setUploadError("Image URL is already added.");
      return;
    }
    setImages((prev) => [...prev, trimmed]);
    setUrlInput("");
    setUploadError("");
  };

  const handleSetPrimary = (index: number) => {
    if (index === 0 || index >= images.length) return;
    setImages((prev) => {
      const copy = [...prev];
      const [promoted] = copy.splice(index, 1);
      return [promoted, ...copy];
    });
    setSelectedPreviewIndex(0);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const copy = prev.filter((_, i) => i !== index);
      return copy;
    });
    if (selectedPreviewIndex >= images.length - 1) {
      setSelectedPreviewIndex(Math.max(0, images.length - 2));
    }
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
            deliveryRate: existing.deliveryRate !== undefined && existing.deliveryRate !== null ? String(existing.deliveryRate) : "0",
            stockCount: existing.stockCount !== undefined ? String(existing.stockCount) : "12",
            inStock: existing.inStock !== undefined ? existing.inStock : true,
            description: existing.description || "",
            specifications: existing.specifications
              ? Object.entries(existing.specifications)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")
              : "",
          });
          if (Array.isArray(existing.images) && existing.images.length > 0) {
            setImages(existing.images);
          } else {
            setImages(["/featured/hisense-window-ac.png"]);
          }
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

    const deliveryRateNum = parseFloat(formData.deliveryRate);
    if (isNaN(deliveryRateNum) || deliveryRateNum < 0) {
      setNotification("Error: Delivery rate must be a valid non-negative number.");
      setSaving(false);
      return;
    }

    const specsObject: Record<string, string> = {};
    if (formData.specifications.trim()) {
      formData.specifications.split("\n").forEach((line) => {
        const parts = line.split(":");
        if (parts.length >= 2) {
          specsObject[parts[0].trim()] = parts.slice(1).join(":").trim();
        }
      });
    }

    const finalImages = images.length > 0 ? images : ["/featured/hisense-window-ac.png"];

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
          deliveryRate: deliveryRateNum,
          stockCount: stockNum,
          inStock: stockNum > 0,
          description: formData.description,
          specifications: Object.keys(specsObject).length > 0 ? specsObject : undefined,
          images: finalImages,
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
          href="/admin/products"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs md:text-sm font-bold"
        >
          <ArrowLeft size={16} /> Back to Products
        </Link>
      </div>
    );
  }

  const currentPreviewImage = images[selectedPreviewIndex] || images[0] || null;

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
              Update catalog details, gallery images, pricing, and product-specific delivery rates.
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
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-slate-700">
                  Product Gallery
                </h2>
                <p className="text-[11px] text-slate-400 font-medium">
                  {images.length} {images.length === 1 ? "image" : "images"} uploaded
                </p>
              </div>

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

            {/* Main Preview Box - 1:1 Aspect Ratio Container */}
            <div className="w-full aspect-square max-h-[320px] rounded-xl bg-slate-50/80 border border-slate-200/80 overflow-hidden flex items-center justify-center p-3 relative group mx-auto">
              {currentPreviewImage ? (
                <>
                  <img
                    src={currentPreviewImage}
                    alt="Product Preview"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/featured/hisense-window-ac.png";
                    }}
                    className="w-full h-full object-contain object-center transition-all duration-200"
                  />

                  {/* Primary Badge */}
                  {selectedPreviewIndex === 0 ? (
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-500 text-white rounded-lg text-[10px] font-extrabold tracking-wider uppercase flex items-center gap-1 shadow-md">
                      <Star size={12} fill="white" />
                      <span>Primary Image</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(selectedPreviewIndex)}
                      className="absolute top-3 left-3 px-2.5 py-1 bg-slate-900/90 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-md transition-all cursor-pointer"
                    >
                      <Star size={12} /> Set as Primary
                    </button>
                  )}

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(selectedPreviewIndex)}
                    className="absolute top-3 right-3 p-2 bg-rose-600 text-white rounded-xl opacity-90 hover:opacity-100 transition-opacity shadow-md hover:bg-rose-700 cursor-pointer"
                    title="Remove Image"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              ) : (
                <div className="text-center text-slate-400 space-y-2 p-4">
                  <ImageIcon size={44} className="mx-auto text-slate-300" />
                  <span className="text-xs font-semibold block">No images added yet</span>
                  <span className="text-[10px] text-slate-400 block font-normal">
                    The first image will automatically become the primary image.
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnail Strip Grid */}
            {images.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Thumbnails ({images.length})
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, idx) => (
                    <div
                      key={`${img.slice(0, 30)}-${idx}`}
                      onClick={() => setSelectedPreviewIndex(idx)}
                      className={`relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer bg-slate-50 transition-all p-1 group ${
                        selectedPreviewIndex === idx
                          ? "border-red-600 shadow-xs ring-2 ring-red-500/20"
                          : "border-slate-200/80 hover:border-slate-400"
                      }`}
                    >
                      <img
                        src={img}
                        alt={`Thumbnail ${idx + 1}`}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/featured/hisense-window-ac.png";
                        }}
                        className="w-full h-full object-contain"
                      />
                      {idx === 0 && (
                        <div className="absolute top-0.5 left-0.5 bg-amber-500 text-white p-0.5 rounded-full shadow-xs">
                          <Star size={10} fill="white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Errors / Feedback */}
            {uploadError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-rose-600" />
                <span>{uploadError}</span>
              </div>
            )}

            {isUploading && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-red-600 shrink-0" />
                <span>Uploading product image(s)...</span>
              </div>
            )}

            {/* Upload Method Input Controls */}
            {uploadMethod === "file" ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Add Images from Computer
                </label>
                <label
                  htmlFor="photo-file-input-edit"
                  className="w-full flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-red-500 bg-slate-50 hover:bg-red-50/20 text-slate-600 hover:text-red-600 transition-all cursor-pointer text-center"
                >
                  <Upload size={22} className="text-slate-400" />
                  <span className="text-xs font-bold">Click to Browse & Select Photos</span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Supports PNG, JPG, WEBP, SVG · Select 1 or multiple files
                  </span>
                </label>
                <input
                  id="photo-file-input-edit"
                  type="file"
                  multiple
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">Image URL / Asset Path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="e.g. /featured/hisense-window-ac.png"
                    className="flex-1 bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-hidden focus:border-red-500 focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleAddUrl}
                    className="px-3 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}
          </div>
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
                <span className="text-[10px] text-slate-400 block font-medium mt-1">
                  Enter 0 for FREE DELIVERY on customer site.
                </span>
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
              href="/admin/products"
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
