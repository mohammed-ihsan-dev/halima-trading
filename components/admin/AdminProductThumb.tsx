"use client";

import React, { useState } from "react";
import { AlertCircle, ImageIcon } from "lucide-react";
import { primaryProductImage, hasRealImage, reportImageFailure } from "@/lib/product-image-display";

/**
 * Product thumbnail for admin lists. Shows the same primary image as the gallery and the shop. A product with no
 * image shows a neutral "No image" state, and an image that fails to load is shown as failed (with its URL in the
 * tooltip) instead of being silently replaced by the placeholder, so broken image URLs are visible to admins.
 */
export default function AdminProductThumb({ images, alt, className = "" }: { images: unknown; alt: string; className?: string }) {
  const src = primaryProductImage(images);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!hasRealImage(images)) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 text-slate-400" data-thumb-state="none">
        <ImageIcon size={28} />
        <span className="text-[10px] font-bold uppercase tracking-wider">No image</span>
      </div>
    );
  }
  if (failedSrc === src) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 text-rose-600 text-center px-2" title={src} data-thumb-state="failed">
        <AlertCircle size={26} />
        <span className="text-[10px] font-bold leading-tight">Image URL failed to load</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} data-thumb-state="image"
    onError={() => { reportImageFailure(src, "admin product list"); setFailedSrc(src); }} />;
}
