import type { CartLine } from "@/context/CartContext";

export const emailUrl = (items: CartLine[]) => {
  const lines = items
    .map((x, i) => `${i + 1}. ${x.name} (Brand: ${x.brand}, Model: ${x.model}) - Qty: ${x.quantity}`)
    .join("\n");
  const body = `Hello Halima Trading,\n\nI would like to enquire about ordering the following items:\n\n${lines}\n\nPlease contact me regarding order confirmation and delivery details.`;
  return `mailto:Halimatradingest@gmail.com?subject=${encodeURIComponent("Product Order Enquiry – Halima Trading Website")}&body=${encodeURIComponent(body)}`;
};

