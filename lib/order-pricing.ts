/**
 * Order pricing rules shared by the server (authoritative) and the browser (display only).
 *
 * Delivery is one fixed charge per order — not per item or per unit — and applies whenever the
 * order contains something payable. Products' old per-product `deliveryRate` field is no longer
 * used for pricing. VAT is 5% of the item subtotal, as before.
 */
export const DELIVERY_FEE_AED = 75;
export const VAT_RATE = 0.05;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface OrderTotals {
  subtotal: number;
  delivery: number;
  vat: number;
  total: number;
}

/** Totals for an order whose payable items add up to `subtotal`. An empty order has no delivery charge. */
export function calculateOrderTotals(subtotal: number): OrderTotals {
  const items = Number.isFinite(subtotal) && subtotal > 0 ? round2(subtotal) : 0;
  const delivery = items > 0 ? DELIVERY_FEE_AED : 0;
  const vat = round2(items * VAT_RATE);
  return { subtotal: items, delivery, vat, total: round2(items + delivery + vat) };
}
