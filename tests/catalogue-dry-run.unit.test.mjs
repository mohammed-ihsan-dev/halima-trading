// Unit tests for the JSON catalogue dry run. No database: the products collection is a
// strict mock that only allows read methods and records every call.
// Run: pnpm test:catalogue
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  classifyCatalogue,
  buildKnownBrands,
  parseCatalogueJson,
  runCatalogueDryRun,
  DryRunDatabaseError,
  CatalogueFileError,
} = await import("@/lib/catalogue-dry-run");

const brands = buildKnownBrands([]);

const record = (overrides = {}) => ({
  id: "lg-test-1",
  slug: "lg-test-split-ac",
  sku: "LG-TEST-1",
  name: "LG Test Split AC",
  brand: "LG",
  model: "LGTS12A",
  category: "Air Conditioning",
  description: "Test",
  price: 1999,
  currency: "AED",
  images: ["/featured/hisense-window-ac.png"],
  inStock: true,
  stockCount: 3,
  featured: false,
  deliveryRate: 75,
  status: "active",
  ...overrides,
});

const existingA = { id: "p-1", sku: "HT-AI-113", slug: "o-general-window-ac", name: "O General Window AC", status: "active" };
const existingB = { id: "p-2", sku: "HT-CO-336", slug: "bosch-cooker", name: "Bosch Cooker", status: "active" };

const classifyOne = (rec, existing = [existingA, existingB]) => classifyCatalogue([rec], existing, brands).rows[0];

/* 1–6: classification against existing products */

test("1. new SKU and slug → SAFE_TO_IMPORT", () => {
  const row = classifyOne(record());
  assert.equal(row.group, "SAFE_TO_IMPORT", row.reasons.join("; "));
  assert.deepEqual(row.conflicts, []);
});

test("2. existing SKU → SKIP_SKU_EXISTS, names the existing product", () => {
  const row = classifyOne(record({ sku: "HT-AI-113" }));
  assert.equal(row.group, "SKIP_SKU_EXISTS");
  assert.equal(row.conflicts[0].existing.id, "p-1");
  assert.match(row.reasons[0], /O General Window AC/);
});

test("3. existing slug → SKIP_SLUG_EXISTS", () => {
  const row = classifyOne(record({ slug: "bosch-cooker" }));
  assert.equal(row.group, "SKIP_SLUG_EXISTS");
  assert.equal(row.conflicts[0].existing.sku, "HT-CO-336");
});

test("4. existing SKU and slug (same product) → SKIP_SKU_AND_SLUG_EXIST", () => {
  const row = classifyOne(record({ sku: "HT-AI-113", slug: "o-general-window-ac" }));
  assert.equal(row.group, "SKIP_SKU_AND_SLUG_EXIST");
  assert.ok(!row.reasons.some((r) => /two different/.test(r)));
});

test("5. SKU matches one product, slug matches another → skipped and explained", () => {
  const row = classifyOne(record({ sku: "HT-AI-113", slug: "bosch-cooker" }));
  assert.equal(row.group, "SKIP_SKU_AND_SLUG_EXIST");
  assert.ok(row.reasons.some((r) => /two different existing products/.test(r)));
  assert.deepEqual(new Set(row.conflicts.map((c) => c.existing.id)), new Set(["p-1", "p-2"]));
});

test("6. conflicts are case-insensitive and whitespace-insensitive, without rewriting values", () => {
  const row = classifyOne(record({ sku: "ht-ai-113" }));
  assert.equal(row.group, "SKIP_SKU_EXISTS");
  assert.equal(row.sku, "ht-ai-113", "original SKU is reported unchanged");
  const slugRow = classifyOne(record(), [{ ...existingA, slug: "LG-TEST-SPLIT-AC " }]);
  assert.equal(slugRow.group, "SKIP_SLUG_EXISTS");
});

/* 7–8: duplicates inside the file */

test("7. duplicate SKUs inside the file → every copy SKIP_DUPLICATE_IN_FILE", () => {
  const { rows, summary } = classifyCatalogue(
    [record(), record({ slug: "other-slug", id: "other-id", sku: "Lg-Test-1" }), record({ sku: "UNIQUE-1", slug: "unique-1", id: "u1" })],
    [], brands
  );
  assert.equal(rows[0].group, "SKIP_DUPLICATE_IN_FILE");
  assert.equal(rows[1].group, "SKIP_DUPLICATE_IN_FILE");
  assert.deepEqual(rows[0].duplicateOfRecords, [2]);
  assert.equal(rows[2].group, "SAFE_TO_IMPORT");
  assert.equal(summary.duplicatesInFile, 2);
});

test("8. duplicate slugs inside the file → SKIP_DUPLICATE_IN_FILE", () => {
  const { rows } = classifyCatalogue([record(), record({ sku: "OTHER-SKU", id: "other" })], [], brands);
  assert.deepEqual(rows.map((r) => r.group), ["SKIP_DUPLICATE_IN_FILE", "SKIP_DUPLICATE_IN_FILE"]);
  assert.match(rows[0].reasons[0], /SLUG/);
});

/* 9: validation */

test("9. invalid records are rejected with exact reasons and never marked safe", () => {
  const cases = [
    [record({ sku: undefined }), /SKU is required/],
    [record({ sku: " LG-1" }), /leading or trailing spaces/],
    [record({ slug: "Has Spaces" }), /not URL-safe/],
    [record({ name: "" }), /Name is required/],
    [record({ brand: 42 }), /Brand must be a string/],
    [record({ category: "Fans" }), /not a store category and has no approved mapping/],
    [record({ category: "Commercial Refrigeration" }), /not a store category and has no approved mapping/],
    [record({ category: "Gadgets" }), /not a store category/],
    [record({ model: "46 dB" }), /does not look like a model number/],
    [record({ model: "CATALOGUE 2025" }), /does not look like a model number/],
    [record({ model: "MAZAYA CATALOGUE 2025" }), /does not look like a model number/],
    [record({ model: "4-Way Swing" }), /does not look like a model number/],
    [record({ model: "3-Star ESMA" }), /does not look like a model number/],
    [record({ brand: "LG", model: "GR-I2 Pro-12C3-IND Gree" }), /Brand is "LG" but the model or name refers to Gree/],
    [record({ price: "1999" }), /Price must be a number/],
    [record({ price: -1 }), /cannot be negative/],
    [record({ price: undefined }), /Price is required/],
    [record({ stockCount: 1.5 }), /whole number/],
    [record({ deliveryRate: -5 }), /deliveryRate must be a number/],
    [record({ currency: "USD" }), /Currency must be "AED"/],
    [record({ status: "deleted" }), /status must be "active", "draft" or "inactive"/],
    [record({ images: "x.png" }), /images must be an array/],
    [record({ images: ["http://insecure.example/a.jpg"] }), /https:\/\/ URL/],
    [record({ createdAt: "yesterday" }), /ISO date/],
    ["not an object", /not a JSON object/],
  ];
  for (const [rec, expected] of cases) {
    const row = classifyOne(rec, []);
    assert.equal(row.group, "INVALID", `expected INVALID for ${JSON.stringify(rec).slice(0, 80)}`);
    assert.ok(row.errors.some((e) => expected.test(e)), `${expected} not in ${JSON.stringify(row.errors)}`);
  }
});

test("9b. price 0 and empty images are allowed (as the project allows them) but warned", () => {
  const row = classifyOne(record({ price: 0, images: [] }), []);
  assert.equal(row.group, "SAFE_TO_IMPORT");
  assert.ok(row.warnings.some((w) => /Price is 0/.test(w)));
  assert.ok(row.warnings.some((w) => /No images/.test(w)));
});

test("9c. cross-field identifier collisions (incoming slug == existing id) block the record", () => {
  const row = classifyOne(record({ slug: "p-1" }), [existingA]);
  assert.equal(row.group, "INVALID");
  assert.ok(row.errors.some((e) => /Identifier collision/.test(e)));
});

test("file parsing accepts {products: [...]} and arrays, rejects anything else", () => {
  assert.equal(parseCatalogueJson('{"database":"halima","products":[{"a":1}]}').records.length, 1);
  assert.equal(parseCatalogueJson("[1,2]").records.length, 2);
  assert.throws(() => parseCatalogueJson("{nope"), CatalogueFileError);
  assert.throws(() => parseCatalogueJson('{"items":[]}'), CatalogueFileError);
});

/* 10, 12, 13: database behaviour through a strict read-only mock */

const READ_METHODS = new Set(["find", "aggregate", "countDocuments"]);

function strictMock(existing, { fail = false, mutateBetweenReads = false } = {}) {
  const calls = [];
  let aggregateCalls = 0;
  const target = {
    find: () => ({ toArray: async () => { if (fail) throw new Error("connection refused"); return existing.map((p) => ({ ...p })); } }),
    aggregate: () => ({
      toArray: async () => {
        if (fail) throw new Error("connection refused");
        aggregateCalls++;
        const docs = existing.map((p, i) => ({ _id: i, ...p }));
        if (mutateBetweenReads && aggregateCalls > 1) docs[0] = { ...docs[0], stockCount: 999 };
        return docs;
      },
    }),
    countDocuments: async () => existing.length,
  };
  const products = new Proxy(target, {
    get(t, prop) {
      if (typeof prop === "string") calls.push(prop);
      if (!READ_METHODS.has(prop)) throw new Error(`Non-read method "${String(prop)}" was called during a dry run`);
      return t[prop];
    },
  });
  return { products, calls };
}

test("10. MongoDB unavailable → fails with DryRunDatabaseError, never a report", async () => {
  const { products } = strictMock([], { fail: true });
  await assert.rejects(() => runCatalogueDryRun([record()], { fileName: "x.json", products, databaseName: "halima" }), DryRunDatabaseError);
});

test("12. dry run calls only read methods and reports the database unchanged", async () => {
  const { products, calls } = strictMock([existingA, existingB]);
  const report = await runCatalogueDryRun([record(), record({ sku: "HT-AI-113", slug: "x-1", id: "x1" })],
    { fileName: "x.json", products, databaseName: "halima" });
  assert.ok(calls.length > 0 && calls.every((c) => READ_METHODS.has(c)), `calls: ${calls}`);
  assert.equal(report.dryRun, true);
  assert.equal(report.database.unchanged, true);
  assert.equal(report.database.existingCountBefore, 2);
  assert.equal(report.summary.safeToImport, 1);
  assert.equal(report.summary.skipSkuExists, 1);
});

test("12b. the dry-run source and its API route contain no write operations", async () => {
  const forbidden = /\b(insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|bulkWrite|findOneAndUpdate|findOneAndReplace|findOneAndDelete|createIndex|dropIndex|drop|upsert|\$set|\$inc)\b/;
  for (const file of ["lib/catalogue-dry-run.ts", "app/api/admin/products/import/catalogue-dry-run/route.ts"]) {
    const source = (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(source, forbidden, `${file} contains a write operation`);
  }
});

test("13. existing products passed in are never modified", async () => {
  const existing = [structuredClone(existingA), structuredClone(existingB)];
  const snapshot = structuredClone(existing);
  const { products } = strictMock(existing);
  await runCatalogueDryRun([record({ sku: "HT-AI-113" })], { fileName: "x.json", products, databaseName: "halima" });
  assert.deepEqual(existing, snapshot);
});

test("a catalogue that changes mid-check is reported as not unchanged", async () => {
  const { products } = strictMock([{ ...existingA, stockCount: 1 }], { mutateBetweenReads: true });
  const report = await runCatalogueDryRun([record()], { fileName: "x.json", products, databaseName: "halima" });
  assert.equal(report.database.unchanged, false);
});

test("file-level warnings when the file targets a different database or miscounts", async () => {
  const { products } = strictMock([]);
  const report = await runCatalogueDryRun([record()], {
    fileName: "x.json", products, databaseName: "halima",
    meta: { database: "other", collection: "items", productCount: 5 },
  });
  assert.equal(report.fileWarnings.length, 4, "3 file problems + the drafts policy note");
});

/* Category taxonomy */

test("approved category aliases resolve to the store category and are shown, not silent", () => {
  for (const [input, expected] of [
    ["Air Conditioners", "Air Conditioning"], ["Refrigerators & Freezers", "Refrigeration"],
    ["Washing Machines", "Laundry Appliances"], ["Washer Dryers", "Laundry Appliances"], ["Dryers", "Laundry Appliances"],
    ["Cookers & Ovens", "Cooking Appliances"], ["Microwave Ovens", "Cooking Appliances"], ["Dishwashers", "Kitchen Appliances"],
    ["Water Coolers & Chillers", "Commercial Cooling"], ["Air Coolers", "Air Coolers & Fans"],
  ]) {
    const row = classifyOne(record({ category: input }), []);
    assert.equal(row.group, "SAFE_TO_IMPORT", `${input}: ${row.errors}`);
    assert.equal(row.storeCategory, expected);
    assert.equal(row.category, input, "the file's own value is still reported");
    assert.ok(row.warnings.some((w) => w.includes(`maps to the store category "${expected}"`)));
  }
});

test("capitalisation variants of a store category are accepted with a visible note", () => {
  const row = classifyOne(record({ category: "air conditioning" }), []);
  assert.equal(row.group, "SAFE_TO_IMPORT");
  assert.equal(row.storeCategory, "Air Conditioning");
  assert.ok(row.warnings.some((w) => /will be saved as "Air Conditioning"/.test(w)));
});

test("every alias points at a real store category, and the new category is in the store list", async () => {
  const { categoryAliases } = await import("@/data/categoryAliases");
  const { categories } = await import("@/data/categories");
  const names = new Set(categories.map((c) => c.name));
  for (const [from, to] of Object.entries(categoryAliases)) assert.ok(names.has(to), `${from} → ${to} is not a store category`);
  assert.ok(names.has("Air Coolers & Fans"));
  assert.ok(!("Fans" in categoryAliases) && !("Commercial Refrigeration" in categoryAliases), "unreliable groups must stay unmapped");
});

test("real model numbers with spaces or slashes pass the model check", () => {
  for (const model of ["AR12BRHQKWK / GU", "TSB 1CF-13", "G4 MATIC-R20C3", "i-20D3 DIET", "AXG18 AE", "AF-W-1269B/C-INV", "DP-2GSIX", "FOP3CYVDT", "BSWC 30 2T", "PN - 165 4T", "XL-WINTER", "XXL-MOVICOOL"]) {
    const row = classifyOne(record({ model }), []);
    assert.ok(!row.errors.some((e) => /model number/.test(e)), `${model}: ${row.errors}`);
  }
});
