"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Product } from "@/data/products";
import { triggerFlyToCartAnimation } from "@/lib/cart-comet-animation";

export type CartLine = Product & { quantity: number };
type CartValue = {
  items: CartLine[];
  count: number;
  total: number;
  open: boolean;
  setOpen: (x: boolean) => void;
  add: (p: Product, q?: number, sourceEl?: HTMLElement | React.SyntheticEvent | EventTarget | null) => void;
  update: (id: string, q: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  isInCart: (id: string) => boolean;
  toast: string;
};

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("halima-cart");
      if (saved) {
        setItems(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Failed to load cart from localStorage:", e);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem("halima-cart", JSON.stringify(items));
    }
  }, [items, loaded]);

  const add = (p: Product, q = 1, sourceInput?: HTMLElement | React.SyntheticEvent | EventTarget | null) => {
    // Synchronously resolve real DOM element before React async state batching
    let targetEl: HTMLElement | Element | null = null;
    if (sourceInput) {
      if ("currentTarget" in sourceInput && sourceInput.currentTarget) {
        targetEl = sourceInput.currentTarget as Element;
      } else if ("target" in sourceInput && sourceInput.target) {
        targetEl = sourceInput.target as Element;
      } else if (sourceInput instanceof Element) {
        targetEl = sourceInput;
      }
    }

    if (!targetEl && typeof document !== "undefined" && document.activeElement) {
      const active = document.activeElement;
      if (active && active !== document.body && active.tagName !== "BODY") {
        targetEl = active;
      }
    }

    // Resolve closest button element if click landed on nested icon/text
    const btnEl = targetEl ? (targetEl.closest("button, a, .btn, [role='button']") || targetEl) : null;

    setItems((v) => {
      const found = v.find((x) => x.id === p.id);
      return found
        ? v.map((x) => (x.id === p.id ? { ...x, quantity: x.quantity + q } : x))
        : [...v, { ...p, quantity: q }];
    });

    triggerFlyToCartAnimation(btnEl as HTMLElement, p);
    setToast("Product added to cart successfully.");
    setTimeout(() => setToast(""), 2200);
  };

  const update = (id: string, q: number) =>
    setItems((v) => v.map((x) => (x.id === id ? { ...x, quantity: Math.max(1, q) } : x)));

  const remove = (id: string) => setItems((v) => v.filter((x) => x.id !== id));

  const isInCart = (id: string) => items.some((x) => x.id === id);

  return (
    <CartContext.Provider
      value={{
        items,
        count: items.reduce((s, x) => s + x.quantity, 0),
        total: items.reduce((s, x) => s + (x.price || 0) * x.quantity, 0),
        open,
        setOpen,
        add,
        update,
        remove,
        clear: () => setItems([]),
        isInCart,
        toast,
      }}
    >
      {children}
      {toast && <div className="toast">✓ {toast}</div>}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const c = useContext(CartContext);
  if (!c) throw Error("CartProvider missing");
  return c;
};
