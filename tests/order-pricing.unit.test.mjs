// Order pricing (fixed AED 75 delivery per order) and the customer-facing product shape (no stock quantities).
// Pure functions only — no network or database.
import assert from "node:assert/strict";
import test from "node:test";

const { DELIVERY_FEE_AED, calculateOrderTotals } = await import("@/lib/order-pricing");
const { toPublicProduct } = await import("@/lib/repositories/products");

test("delivery is a fixed AED 75 per order", () => {
  assert.equal(DELIVERY_FEE_AED, 75);
  assert.deepEqual(calculateOrderTotals(1000), { subtotal: 1000, delivery: 75, vat: 50, total: 1125 });
});

test("delivery is charged once per order, not per item or per unit", () => {
  // 3 units of AED 1,490 and 2 units of AED 899, as one order.
  const subtotal = 3 * 1490 + 2 * 899;
  const t = calculateOrderTotals(subtotal);
  assert.equal(t.delivery, 75);
  assert.equal(t.total, Math.round((subtotal + 75 + subtotal * 0.05) * 100) / 100);
});

test("VAT stays 5% of the item subtotal and totals are rounded to fils", () => {
  assert.deepEqual(calculateOrderTotals(99.99), { subtotal: 99.99, delivery: 75, vat: 5, total: 179.99 });
  assert.deepEqual(calculateOrderTotals(10.1), { subtotal: 10.1, delivery: 75, vat: 0.51, total: 85.61 });
});

test("an empty or invalid order has no delivery charge and no total", () => {
  for (const bad of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(calculateOrderTotals(bad), { subtotal: 0, delivery: 0, vat: 0, total: 0 }, String(bad));
  }
});

test("customers get availability as yes/no, never the stock quantity or the retired delivery rate", () => {
  const base = { id: "p1", slug: "p1", sku: "S1", name: "Fridge", brand: "LG", model: "M1", category: "Refrigeration", subcategory: "General",
    description: "", features: [], specifications: {}, price: 1000, priceLabel: "1000 AED", images: ["https://cdn.example.com/a.jpg"], featured: false };
  const inStock = toPublicProduct({ ...base, inStock: true, stockCount: 1, deliveryRate: 0 });
  assert.equal(inStock.inStock, true);
  assert.equal("stockCount" in inStock, false);
  assert.equal("deliveryRate" in inStock, false);
  assert.equal(JSON.stringify(inStock).includes("stockCount"), false);
  // Stock used up: shown as not in stock, still without revealing the number.
  const soldOut = toPublicProduct({ ...base, inStock: true, stockCount: 0 });
  assert.equal(soldOut.inStock, false);
  assert.equal("stockCount" in soldOut, false);
  // Everything else is unchanged.
  assert.equal(inStock.price, 1000);
  assert.deepEqual(inStock.images, base.images);
});
