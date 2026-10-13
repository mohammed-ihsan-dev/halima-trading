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

/**
 * In stock = can be bought now, the same rule checkout applies: not marked out of stock and no
 * stock count of 0 or less. Anything else is "On request". (A missing stock count is not a limit,
 * as at checkout.) The shop's Availability filter uses the same rule in MongoDB.
 */
export function isInStock(product: { inStock?: boolean; stockCount?: number | null }): boolean {
  if (product.inStock === false) return false;
  return !(typeof product.stockCount === "number" && product.stockCount <= 0);
}

/** Admin price text: the real price, or the quotation state — never an invented amount. */
export function adminPriceLabel(product: { price?: number | null }): string {
  return hasSellingPrice(product) ? `AED ${(product.price as number).toLocaleString("en-US")}` : CONTACT_FOR_PRICE;
}
