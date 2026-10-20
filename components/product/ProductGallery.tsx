"use client";

import { catchFailedBeforeHydration, fallbackToPlaceholder, PLACEHOLDER_IMAGE_PATH, productImageList } from "@/lib/product-image-display";
import React, { useState } from "react";

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

export default function ProductGallery({ images, productName }: ProductGalleryProps) {
  const real = productImageList(images);
  const safeImages = real.length > 0 ? real : [PLACEHOLDER_IMAGE_PATH];
  const onImageError = fallbackToPlaceholder("product page gallery");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const currentImage = safeImages[selectedIndex] || safeImages[0];

  return (
    <div className="gallery flex flex-col gap-3 min-w-0 w-full max-w-full">
      {/* Main Feature Image Container */}
      <div className="gallery-main aspect-square w-full rounded-2xl bg-white border border-slate-200/80 p-4 flex items-center justify-center overflow-hidden relative group">
        <img
          src={currentImage}
          alt={productName}
          loading="eager"
          className="w-full h-full object-contain object-center transition-all duration-300"
          onError={onImageError}
          ref={catchFailedBeforeHydration(onImageError)}
        />
      </div>

      {/* Gallery Thumbnails Strip */}
      {safeImages.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {safeImages.map((img, idx) => (
            <button
              key={`${img.slice(0, 30)}-${idx}`}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              className={`relative aspect-square w-16 h-16 rounded-xl border-2 p-1 bg-white overflow-hidden shrink-0 cursor-pointer transition-all ${
                selectedIndex === idx
                  ? "border-red-600 ring-2 ring-red-500/20 shadow-xs"
                  : "border-slate-200 hover:border-slate-400"
              }`}
              aria-label={`View photo ${idx + 1}`}
            >
              <img
                src={img}
                alt={`${productName} thumbnail ${idx + 1}`}
                loading="lazy"
                className="w-full h-full object-contain"
                onError={onImageError}
                ref={catchFailedBeforeHydration(onImageError)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
