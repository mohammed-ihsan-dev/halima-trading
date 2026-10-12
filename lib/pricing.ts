import { formatCurrency } from "@/lib/currency";

export const CONTACT_FOR_PRICE = "Contact for Price";

/**
 * A product can be bought online only with a real selling price. A price of 0 (or a
 * missing price) means "Contact for Price" — a quotation state, never "free".
 * The server enforces the same rule at checkout (lib/repositories/orders.ts).
 */
export function hasSellingPrice(product: { price?: number | null }): boolean {
  return typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0;
}

/** Customer-facing price text: the formatted price, or "Contact for Price". */
export function displayPrice(product: { price?: number | null }): string {
  return hasSellingPrice(product) ? formatCurrency(product.price as number) : CONTACT_FOR_PRICE;
}
