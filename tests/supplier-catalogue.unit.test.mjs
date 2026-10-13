// Offline tests for scripts/prepare-supplier-catalogue.mjs and the supplier category alias. No database.
import assert from "node:assert/strict";
import test from "node:test";

const { prepareSupplierProducts, skuFromModel } = await import("../scripts/prepare-supplier-catalogue.mjs");
const { classifyCatalogue, buildKnownBrands } = await import("@/lib/catalogue-dry-run");
const { resolveStoreCategory } = await import("@/lib/categories");

const record = (model, extra = {}) => ({
  id: `super-general-${model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  slug: `super-general-${model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  name: "S.G. REFRIGERATOR", brand: "Super General", model, category: "Refrigerators", subcategory: "Refrigerators",
  description: "S.G. REFRIGERATOR", features: [], specifications: {}, price: 0, priceLabel: "Contact for Price",
  images: [], inStock: false, featured: false, sku: "0", stockCount: 0, ...extra,
});

test("placeholder SKUs become the compact model number; everything else is kept as supplied", () => {
  const source = [record("SGW 1056N"), record("SG AA 110T5"), record("SGR186E", { sku: "REAL-CODE-1" })];
  const { products, generatedSkus, problems } = prepareSupplierProducts(source);
  assert.deepEqual(problems, []);
  assert.deepEqual(products.map((p) => p.sku), ["SGW1056N", "SGAA110T5", "REAL-CODE-1"]);
  assert.deepEqual(products.map((p) => p.model), ["SGW 1056N", "SG AA 110T5", "SGR186E"], "model numbers are never rewritten");
  assert.equal(generatedSkus.length, 2, "a genuine SKU is left alone and not reported as generated");
  assert.deepEqual({ ...products[0], sku: "0" }, source[0], "only the SKU changed");
  assert.equal(skuFromModel("  sgct n90h "), "SGCTN90H");
});

test("models that compact to the same SKU, or a placeholder with no model, block the file", () => {
  assert.equal(prepareSupplierProducts([record("SGW 755"), record("SGW755")]).problems.length, 1);
  assert.match(prepareSupplierProducts([record("", { model: "" })]).problems[0], /no model number/);
  assert.match(prepareSupplierProducts({ products: [] }).problems[0], /JSON array/);
});

test("the raw file (26 × SKU \"0\") would be held back as in-file duplicates", () => {
  const raw = [record("SGR186E"), record("SGR255E")];
  const { summary } = classifyCatalogue(raw, [], buildKnownBrands([]));
  assert.equal(summary.safeToImport, 0);
  assert.equal(summary.duplicatesInFile, 2);
});

test("\"Refrigerators\" resolves to the store category Refrigeration, reported as a mapping", () => {
  const res = resolveStoreCategory("Refrigerators");
  assert.equal(res.ok, true);
  assert.equal(res.category, "Refrigeration");
  assert.equal(res.via, "alias");
});

test("prepared records pass validation and clash with existing SKUs, slugs or ids are detected", () => {
  const { products } = prepareSupplierProducts([record("SGR186E"), record("SGR255E")]);
  const existing = [{ id: "x1", sku: "sgr186e", slug: "other", name: "Existing", status: "active" }];
  const { rows } = classifyCatalogue(products, existing, buildKnownBrands([]));
  assert.equal(rows[0].group, "SKIP_SKU_EXISTS", "case-insensitive SKU match with an existing product");
  assert.equal(rows[1].group, "SAFE_TO_IMPORT");
  assert.equal(rows[1].storeCategory, "Refrigeration");
});

test("number and true/false specification values become text and are reported; nothing else changes", () => {
  const src = [record("OG3010GC", { sku: "OG3010GC", specifications: { Burners: 2, "Auto Ignition": true, "Hob Material": "Glass" } })];
  const { products, normalizedValues, problems } = prepareSupplierProducts(src);
  assert.deepEqual(problems, []);
  assert.deepEqual(products[0].specifications, { Burners: "2", "Auto Ignition": "true", "Hob Material": "Glass" });
  assert.deepEqual(normalizedValues.map((n) => [n.field, n.from, n.to]), [["specifications.Burners", 2, "2"], ["specifications.Auto Ignition", true, "true"]]);
  assert.equal(src[0].specifications.Burners, 2, "the source record is not mutated");
  const { rows } = classifyCatalogue(products, [], buildKnownBrands([]));
  assert.equal(rows[0].group, "SAFE_TO_IMPORT");
});

test("a record with no SKU and no model blocks the file, or is held back for review when asked — never given an invented SKU", () => {
  const src = [record("SGR186E"), record("", { id: "clivet-x", sku: "", model: "" })];
  assert.equal(prepareSupplierProducts(src).problems.length, 1);
  const held = prepareSupplierProducts(src, { holdBackUnresolved: true });
  assert.deepEqual(held.problems, []);
  assert.deepEqual(held.products.map((p) => p.sku), ["SGR186E"]);
  assert.deepEqual(held.heldBack.map((h) => [h.record, h.id]), [[2, "clivet-x"]]);
});
