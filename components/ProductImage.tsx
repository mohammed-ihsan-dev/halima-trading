"use client";

import React, { useState, useEffect } from "react";

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallbackSrc?: string;
}

export default function ProductImage({
  src,
  alt,
  className = "",
  containerClassName = "",
  fallbackSrc = "/featured/hisense-window-ac.png",
}: ProductImageProps) {
  const [imgSrc, setImgSrc] = useState<string>(src || fallbackSrc);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setImgSrc(src || fallbackSrc);
    setLoading(true);
  }, [src, fallbackSrc]);

  return (
    <div
      className={`relative w-full aspect-square bg-slate-50/80 border border-slate-100/80 overflow-hidden flex items-center justify-center ${containerClassName}`}
    >
      {loading && (
        <div className="absolute inset-0 bg-slate-100/80 animate-pulse flex items-center justify-center text-slate-300 text-xs font-medium">
          <span className="w-6 h-6 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
        </div>
      )}
      <img
        src={imgSrc || fallbackSrc}
        alt={alt}
        onLoad={() => setLoading(false)}
        onError={() => {
          setImgSrc(fallbackSrc);
          setLoading(false);
        }}
        className={`w-full h-full object-contain object-center p-3 transition-opacity duration-300 ${
          loading ? "opacity-0" : "opacity-100"
        } ${className}`}
      />
    </div>
  );
}
