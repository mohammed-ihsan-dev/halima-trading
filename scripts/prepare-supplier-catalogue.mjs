/**
 * Turns a supplier product list (a JSON array) into an import-ready catalogue file for
 * scripts/import-approved-catalogue.mjs. It only writes a local JSON file — it never
 * connects to a database or imports anything.
 *
 *   node scripts/prepare-supplier-catalogue.mjs <supplier.json> <out.json> [--hold-back-unresolved]
 *
 * Every source value is kept as supplied, except a placeholder SKU ("0" or blank). Such a
 * SKU is replaced with the model number in upper case with spaces removed — the convention
 * the approved catalogue uses when no supplier item code exists (e.g. "SGW 1056N" →
 * "SGW1056N"). Generated SKUs are listed in `selection.generatedSkus` so they can be
 * replaced by genuine item codes later. Categories are left as supplied: the dry run
 * resolves them against the store categories and reports any mapping.
 *
 * Specification values must be text: a number or true/false (e.g. "Burners": 2) is written
 * as the same value in text ("2") and listed in `selection.normalizedValues`.
 *
 * A record with a placeholder SKU and no model number blocks the file. With
 * --hold-back-unresolved it is left out instead and listed in `selection.heldBack` for review —
 * no identifier is ever invented for it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const PLACEHOLDER_SKUS = new Set(["", "0"]);

export const skuFromModel = (model) => (typeof model === "string" ? model.trim().toUpperCase().replace(/\s+/g, "") : "");

/** Number and true/false specification values as text; everything else untouched (the dry run reports it). */
function normalizeSpecifications(record, normalizedValues) {
  const specs = record?.specifications;
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return record;
  let changed = false;
  const out = {};
  for (const [key, value] of Object.entries(specs)) {
    if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") {
      out[key] = String(value);
      normalizedValues.push({ id: record.id, field: `specifications.${key}`, from: value, to: String(value) });
      changed = true;
    } else {
      out[key] = value;
    }
  }
  return changed ? { ...record, specifications: out } : record;
}

/** Returns { products, generatedSkus, normalizedValues, heldBack, problems } — problems block the file from being written. */
export function prepareSupplierProducts(source, { holdBackUnresolved = false } = {}) {
  const problems = [];
  const generatedSkus = [];
  const normalizedValues = [];
  const heldBack = [];
  if (!Array.isArray(source)) return { products: [], generatedSkus, normalizedValues, heldBack, problems: ["Expected a JSON array of products"] };

  const products = [];
  source.forEach((original, i) => {
    const record = normalizeSpecifications(original, normalizedValues);
    const sku = typeof record?.sku === "string" ? record.sku.trim() : String(record?.sku ?? "");
    if (!PLACEHOLDER_SKUS.has(sku)) return void products.push(record);
    const generated = skuFromModel(record?.model);
    if (!generated) {
      const reason = "placeholder SKU and no model number to derive one from";
      if (holdBackUnresolved) heldBack.push({ record: i + 1, id: record?.id ?? null, name: record?.name ?? null, reason });
      else problems.push(`record ${i + 1} (${record?.id ?? "no id"}): ${reason}`);
      return;
    }
    generatedSkus.push({ id: record.id, model: record.model, sku: generated });
    products.push({ ...record, sku: generated });
  });

  // Two different models must never compact to the same SKU.
  const bySku = new Map();
  for (const p of products) {
    const key = String(p?.sku ?? "").toLowerCase();
    if (bySku.has(key)) problems.push(`SKU "${p.sku}" is shared by ${bySku.get(key)} and ${p.id}`);
    else bySku.set(key, p.id);
  }
  return { products, generatedSkus, normalizedValues, heldBack, problems };
}

function main() {
  const [sourcePath, outPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!sourcePath || !outPath) throw new Error("usage: node scripts/prepare-supplier-catalogue.mjs <supplier.json> <out.json> [--hold-back-unresolved]");
  const holdBackUnresolved = process.argv.includes("--hold-back-unresolved");
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const { products, generatedSkus, normalizedValues, heldBack, problems } = prepareSupplierProducts(source, { holdBackUnresolved });
  if (problems.length) throw new Error(`Not written:\n${problems.map((p) => `  ${p}`).join("\n")}`);

  writeFileSync(outPath, JSON.stringify({
    database: "halima",
    collection: "products",
    selection: {
      basis: "supplier product list, values as supplied",
      derivedFrom: basename(sourcePath),
      received: Array.isArray(source) ? source.length : 0,
      selected: products.length,
      generatedSkus,
      normalizedValues,
      heldBack,
      note: "Prepared for a separately authorised, create-only import as drafts. Not imported.",
    },
    productCount: products.length,
    products,
  }, null, 2));
  console.log(JSON.stringify({ received: source.length, products: products.length, generatedSkus: generatedSkus.length, normalizedValues: normalizedValues.length, heldBack: heldBack.length, out: outPath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
