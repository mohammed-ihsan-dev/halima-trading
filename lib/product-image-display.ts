/**
 * One image resolver for every view of a product (admin lists, shop cards, product pages, cart, checkout).
 *
 * Products store `images: string[]` (the first entry is the primary image). The generic placeholder is only
 * shown when a product has no real image; it is never treated as one. When a real image fails to load in the
 * browser, public views fall back to the placeholder so customers never see a broken image, but the failure is
 * reported (console warning in development) instead of being hidden.
 */
import type React from "react";
import { PLACEHOLDER_IMAGE_PATH, realImages } from "@/lib/admin-gallery";

export { PLACEHOLDER_IMAGE_PATH };

/** The product's real images in order (placeholder and empty entries removed). */
export const productImageList = (images: unknown): string[] => realImages(images);

/** The primary image to display: the first real image, or the placeholder when there is none. */
export const primaryProductImage = (images: unknown): string => realImages(images)[0] ?? PLACEHOLDER_IMAGE_PATH;

export const hasRealImage = (images: unknown): boolean => realImages(images).length > 0;

/** Reports a real image that failed to load (development only — nothing is logged for customers in production). */
export function reportImageFailure(src: string, where: string): void {
  if (process.env.NODE_ENV !== "production") console.warn(`[product image] failed to load in ${where}: ${src}`);
}

/** onError for public views: report once, then show the placeholder (never loops on the placeholder itself). */
export function fallbackToPlaceholder(where: string) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const src = img.getAttribute("src") ?? "";
    if (src === PLACEHOLDER_IMAGE_PATH || img.dataset.failed) return;
    img.dataset.failed = src;
    reportImageFailure(src, where);
    img.src = PLACEHOLDER_IMAGE_PATH;
  };
}

/**
 * Ref for server-rendered <img> elements: an image whose request failed before React hydrated never fires the
 * React onError handler, so the browser would keep showing a broken image. This catches that case on mount and
 * runs the same handler. Images still loading are left to onError.
 */
export function catchFailedBeforeHydration(onError: (e: React.SyntheticEvent<HTMLImageElement>) => void) {
  return (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0 && (img.getAttribute("src") ?? "") !== "") {
      onError({ currentTarget: img } as unknown as React.SyntheticEvent<HTMLImageElement>);
    }
  };
}
