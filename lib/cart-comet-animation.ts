"use client";

import type { Product } from "@/data/products";

/**
 * Halima Trading Premium "Fly To Cart" Micro-Interaction Utility
 *
 * Implements the 5-step physical product flight interaction:
 * 1. User clicks "Add to Cart" -> Button state transforms to RED "✓ Added to Cart"
 * 2. Instant subtle button press feedback
 * 3. Small product thumbnail lifts off from the button
 * 4. Smooth, short curved flight path toward top navbar Cart icon
 * 5. Thumbnail merges into Cart icon, cart performs special CATCH animation (compress -> expand -> settle),
 *    subtle red accent ring pulses, and badge count pops.
 *
 * Pure GPU-accelerated (transform & opacity), responsive across viewports,
 * with NO glow, NO neon, NO long comet lines, NO flash effects.
 */

let activeFlyCount = 0;
const MAX_CONCURRENT_FLIGHTS = 5;

export function triggerFlyToCartAnimation(
  sourceInput?: HTMLElement | EventTarget | React.SyntheticEvent | Element | null,
  product?: Product | null
) {
  if (typeof window === "undefined") return;

  // Respect user prefers-reduced-motion setting
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Locate target cart icon button in top navbar
  const targetBtn =
    document.getElementById("navbar-cart-btn") ||
    document.querySelector(".navbar-cart-btn") ||
    document.querySelector('header button[aria-label*="Cart"]') ||
    document.querySelector('button[aria-label*="Cart"]');

  // Trigger special cart catch animation + red accent ring + badge pop
  const triggerCartIconReaction = () => {
    if (!targetBtn) return;

    // 1. Cart catch animation: compress (0.94) -> expand (1.10) -> settle (1.0)
    targetBtn.classList.remove("cart-catch-anim", "cart-bounce-subtle");
    void targetBtn.offsetWidth; // Force reflow for rapid re-triggering
    targetBtn.classList.add("cart-catch-anim");

    // 2. Badge pop animation
    const badgeEl = targetBtn.querySelector("i");
    if (badgeEl) {
      badgeEl.classList.remove("badge-pop-anim");
      void badgeEl.offsetWidth;
      badgeEl.classList.add("badge-pop-anim");
    }

    // 3. Subtle red Catch Ring accent around cart button
    let ring = targetBtn.querySelector<HTMLElement>(".cart-catch-ring");
    if (!ring) {
      ring = document.createElement("span");
      ring.className = "cart-catch-ring";
      targetBtn.appendChild(ring);
    } else {
      ring.classList.remove("cart-catch-ring");
      void ring.offsetWidth;
      ring.classList.add("cart-catch-ring");
    }

    setTimeout(() => {
      targetBtn.classList.remove("cart-catch-anim");
      if (badgeEl) badgeEl.classList.remove("badge-pop-anim");
      if (ring && ring.parentNode) {
        ring.parentNode.removeChild(ring);
      }
    }, 420);
  };

  if (prefersReducedMotion || !targetBtn) {
    triggerCartIconReaction();
    return;
  }

  // Determine source position element with multi-level fallbacks
  let sourceEl: HTMLElement | null = null;
  if (sourceInput) {
    let rawEl: Element | null = null;
    if ("currentTarget" in sourceInput && sourceInput.currentTarget) {
      rawEl = sourceInput.currentTarget as Element;
    } else if ("target" in sourceInput && sourceInput.target) {
      rawEl = sourceInput.target as Element;
    } else if (sourceInput instanceof Element) {
      rawEl = sourceInput;
    }

    if (rawEl) {
      const closestBtn = rawEl.closest("button, a, .btn, [role='button']");
      sourceEl = (closestBtn || rawEl) as HTMLElement;
    }
  }

  // Fallback 1: document.activeElement if user clicked via keyboard/mouse
  if (!sourceEl && typeof document !== "undefined" && document.activeElement) {
    const active = document.activeElement;
    if (active && active !== document.body && active.tagName !== "BODY") {
      const closestBtn = active.closest("button, a, .btn, [role='button']");
      sourceEl = (closestBtn || active) as HTMLElement;
    }
  }

  // Fallback 2: locate product image or card on page matching product
  if (!sourceEl && product && typeof document !== "undefined") {
    if (product.images?.[0]) {
      const filename = product.images[0].split("/").pop();
      if (filename) {
        const imgEl = document.querySelector(`img[src*="${filename}"]`);
        if (imgEl) {
          sourceEl = (imgEl.closest("article, .product-card, .feature-product-card, .product-detail") || imgEl) as HTMLElement;
        }
      }
    }
  }

  // Instant button press feedback if source element exists
  if (sourceEl) {
    sourceEl.classList.remove("btn-cart-press");
    void sourceEl.offsetWidth;
    sourceEl.classList.add("btn-cart-press");
    setTimeout(() => {
      sourceEl?.classList.remove("btn-cart-press");
    }, 200);
  } else {
    // Fallback to body
    sourceEl = document.body;
  }

  // Limit concurrent flying items to prevent DOM buildup
  if (activeFlyCount >= MAX_CONCURRENT_FLIGHTS) {
    triggerCartIconReaction();
    return;
  }

  const sourceRect = sourceEl === document.body
    ? { left: window.innerWidth / 2 - 50, top: window.innerHeight - 100, width: 100, height: 40 }
    : sourceEl.getBoundingClientRect();
  const targetRect = targetBtn.getBoundingClientRect();

  // Calculate center points
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;

  // Skip flight if start and end coordinates are practically identical
  const distance = Math.hypot(endX - startX, endY - startY);
  if (distance < 20) {
    triggerCartIconReaction();
    return;
  }

  activeFlyCount++;

  // Flying thumbnail size (~32px x 32px within 24px–40px requirement)
  const SIZE = 32;

  // Create temporary floating container element
  const flyEl = document.createElement("div");
  flyEl.className = "fly-to-cart-item";
  flyEl.style.position = "fixed";
  flyEl.style.top = "0";
  flyEl.style.left = "0";
  flyEl.style.width = `${SIZE}px`;
  flyEl.style.height = `${SIZE}px`;
  flyEl.style.borderRadius = "8px";
  flyEl.style.zIndex = "999999";
  flyEl.style.pointerEvents = "none";
  flyEl.style.willChange = "transform, opacity";
  flyEl.style.boxShadow = "0 4px 14px rgba(0, 0, 0, 0.18)";
  flyEl.style.background = "#ffffff";
  flyEl.style.border = "1.5px solid rgba(215, 25, 32, 0.4)";
  flyEl.style.overflow = "hidden";
  flyEl.style.display = "flex";
  flyEl.style.alignItems = "center";
  flyEl.style.justifyContent = "center";

  // Product Image or Fallback Red Product Shape
  const imageUrl = product?.images?.[0];
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.pointerEvents = "none";
    img.onerror = () => {
      // Fallback to solid red tile if image fails to load
      flyEl.style.background = "#d71920";
      flyEl.style.border = "none";
      flyEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <path d="M16 10a4 4 0 0 1-8 0"></path>
        </svg>
      `;
    };
    flyEl.appendChild(img);
  } else {
    // Red Product Tile Fallback
    flyEl.style.background = "#d71920"; // Halima Red
    flyEl.style.border = "none";
    flyEl.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <path d="M16 10a4 4 0 0 1-8 0"></path>
      </svg>
    `;
  }

  document.body.appendChild(flyEl);

  // Subtle dynamic curved flight path (arcs gently upward toward top navbar)
  const dx = endX - startX;
  const controlX = startX + dx * 0.45;
  const arcHeight = Math.min(85, Math.max(30, Math.abs(dx) * 0.18));
  const controlY = Math.min(startY, endY) - arcHeight;

  const duration = 580; // ms (within 500–700ms requirement)
  const startTime = performance.now();
  let animationFrameId: number;
  let hasReacted = false;

  // Cubic easing out function for smooth flight & settling
  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function animate(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const easedT = easeOutCubic(progress);

    // Quadratic Bezier interpolation along dynamic curve
    const invT = 1 - easedT;
    const curX = invT * invT * startX + 2 * invT * easedT * controlX + easedT * easedT * endX;
    const curY = invT * invT * startY + 2 * invT * easedT * controlY + easedT * easedT * endY;

    // Sequence: 0-100ms Lift Off -> 100-500ms Smooth Flight -> 500-650ms Settle into Cart
    let scale = 1.0;
    let opacity = 1.0;

    if (progress < 0.15) {
      // Lift Off (pop out from button with slight scale boost)
      const liftProgress = progress / 0.15;
      scale = 0.5 + liftProgress * 0.58; // 0.5 -> 1.08
      opacity = liftProgress;
    } else if (progress > 0.75) {
      // Approach & Settle into Cart (scale down to 0.25 as it enters cart icon)
      const mergeProgress = (progress - 0.75) / 0.25;
      scale = 1.08 - mergeProgress * 0.83; // 1.08 -> 0.25
      opacity = 1.0 - mergeProgress;
    }

    // Apply GPU transform
    const transformX = curX - SIZE / 2;
    const transformY = curY - SIZE / 2;
    flyEl.style.transform = `translate3d(${transformX}px, ${transformY}px, 0) scale(${scale})`;
    flyEl.style.opacity = `${opacity}`;

    // Cart Icon special CATCH reaction as item arrives (progress >= 0.9)
    if (progress >= 0.9 && !hasReacted) {
      hasReacted = true;
      triggerCartIconReaction();
    }

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      // Clean up DOM element & active counter
      if (flyEl.parentNode) {
        flyEl.parentNode.removeChild(flyEl);
      }
      activeFlyCount = Math.max(0, activeFlyCount - 1);
      if (!hasReacted) {
        triggerCartIconReaction();
      }
    }
  }

  animationFrameId = requestAnimationFrame(animate);
}

// Export legacy alias for backwards compatibility
export const triggerCartCometAnimation = triggerFlyToCartAnimation;
