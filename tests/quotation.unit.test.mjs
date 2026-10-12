// Approved-catalogue selection, pricing display and WhatsApp quotation links.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const { selectSourceVerified, findIdentifierCollisions } = await import("../scripts/build-approved-catalogue.mjs");
const { hasSellingPrice, displayPrice, CONTACT_FOR_PRICE } = await import("@/lib/pricing");
const wa = await import("@/lib/whatsapp");

/* Import selection */

const products = [
  { id: "a", sku: "A-1", slug: "a-1", name: "Verified A" },
  { id: "b", sku: "B-1", slug: "b-1", name: "Needs review B" },
  { id: "c", sku: "C-1", slug: "c-1", name: "Unclassified C" },
  { id: "d", sku: "D-1", slug: "d-1", name: "Verified D" },
];
const status = { a: { status: "source-verified" }, b: { status: "needs-review" }, d: { status: "source-verified" } };

test("selection keeps only products explicitly classified source-verified", () => {
  const { approved, excluded } = selectSourceVerified(products, status);
  assert.deepEqual(approved.map((p) => p.id), ["a", "d"]);
  assert.deepEqual(excluded.map((e) => [e.id, e.reason]), [["b", 'classified "needs-review"'], ["c", "no verification classification"]]);
});

test("selection never adds products that are not in the corrected file (e.g. missing PDF products)", () => {
  const { approved } = selectSourceVerified(products, { ...status, "pdf-only": { status: "source-verified" } });
  assert.ok(!approved.some((p) => p.id === "pdf-only"));
});

test("identifier collisions are found case- and whitespace-insensitively, including across fields", () => {
  assert.deepEqual(findIdentifierCollisions(products), []);
  const clash = findIdentifierCollisions([...products, { id: "e", sku: " a-1 ", slug: "e-1" }, { id: "f", sku: "F-1", slug: "B" }]);
  assert.equal(clash.length, 2);
});

const DIR = process.env.CATALOGUE_DIR || "/Users/ihsan/Downloads/halima-catalogue-corrected";
const approvedFile = `${DIR}/halima-products-import.approved.json`;
test("the generated approved file has exactly the 308 verified products and no review or missing ones", { skip: !existsSync(approvedFile) && "approved file not present" }, () => {
  const approved = JSON.parse(readFileSync(approvedFile, "utf8")).products;
  const data = JSON.parse(readFileSync(`${DIR}/correction-data.json`, "utf8"));
  const review = Object.entries(data.status).filter(([, s]) => s.status === "needs-review").map(([id]) => id);
  assert.equal(approved.length, 308);
  assert.equal(review.length, 31);
  assert.ok(!approved.some((p) => review.includes(p.id)), "a review record was selected");
  assert.ok(!approved.some((p) => data.missingFromJson.some((m) => m.model === p.model)), "a missing PDF product was selected");
  assert.ok(approved.every((p) => p.price === 0 && Array.isArray(p.images) && p.images.length === 0), "no invented prices or images");
  assert.deepEqual(findIdentifierCollisions(approved), []);
});

/* Price display */

test("zero, missing or invalid prices display Contact for Price, never AED 0", () => {
  for (const price of [0, null, undefined, -5, Number.NaN]) {
    assert.equal(hasSellingPrice({ price }), false, String(price));
    assert.equal(displayPrice({ price }), CONTACT_FOR_PRICE);
  }
  assert.equal(hasSellingPrice({ price: 1899 }), true);
  assert.match(displayPrice({ price: 1899 }), /AED\s*1,899/);
});

/* WhatsApp */

test("business numbers are normalised to wa.me digits; invalid ones are rejected", () => {
  assert.equal(wa.normalizeWhatsAppNumber("+971 56 568 5090"), "971565685090");
  assert.equal(wa.normalizeWhatsAppNumber("00971565685090"), "971565685090");
  assert.equal(wa.normalizeWhatsAppNumber("971565685090"), "971565685090");
  for (const bad of ["", "0565685090", "abc", "+971", "1234567890123456", undefined, null]) {
    assert.equal(wa.normalizeWhatsAppNumber(bad), null, String(bad));
  }
});

test("the configured company number is used; an invalid override disables links instead of guessing", () => {
  assert.equal(wa.getBusinessWhatsAppNumber({}), "971565685090");
  assert.equal(wa.getBusinessWhatsAppNumber({ NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER: "+971 50 000 0001" }), "971500000001");
  assert.equal(wa.getBusinessWhatsAppNumber({ NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER: "not-a-number" }), null);
});

test("product quotation message carries the product details and is safely URL-encoded", () => {
  const product = { name: "Samsung Side by Side Refrigerator – 647 L & more", brand: "Samsung", model: "RS62R5001B4", sku: "RS62R5001B4", url: "https://example.com/shop/rs62r5001b4?x=1&y=2" };
  const message = wa.buildProductQuoteMessage(product);
  for (const line of ["Product: Samsung Side by Side Refrigerator – 647 L & more", "Brand: Samsung", "Model: RS62R5001B4", "SKU: RS62R5001B4", "Product link: https://example.com/shop/rs62r5001b4?x=1&y=2"]) {
    assert.ok(message.includes(line), line);
  }
  assert.match(message, /^Hello Halima Trading, I would like to know the price and availability of this product\./);
  const url = wa.buildWhatsAppUrl("971565685090", message);
  assert.match(url, /^https:\/\/wa\.me\/971565685090\?text=/);
  const encoded = url.split("?text=")[1];
  assert.doesNotMatch(encoded, /[\s&#?]/, "spaces, &, # and ? must be percent-encoded");
  assert.equal(decodeURIComponent(encoded), message);
});

test("control characters and N/A placeholders never reach the message", () => {
  const message = wa.buildProductQuoteMessage({ name: "Fridge\u0000\nX", brand: "LG", model: "N/A", sku: "" });
  assert.ok(message.includes("Product: Fridge X"));
  assert.ok(!message.includes("Model:"));
  assert.ok(!message.includes("SKU:"));
});

test("multi-product quotation lists each product with its quantity", () => {
  const message = wa.buildMultiProductQuoteMessage([
    { name: "A", brand: "LG", model: "M1", sku: "S1", quantity: 2 },
    { name: "B", brand: "Gree", model: "M2", sku: "S2", quantity: 1 },
  ]);
  assert.match(message, /these products/);
  assert.match(message, /1\. A\n {3}Brand: LG\n {3}Model: M1\n {3}SKU: S1\n {3}Quantity: 2/);
  assert.match(message, /2\. B[\s\S]*Quantity: 1/);
});
