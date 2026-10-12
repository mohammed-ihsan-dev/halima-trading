/**
 * Builds the approved import selection from the corrected catalogue.
 *
 * A product is selected ONLY when the correction data explicitly classifies it as
 * "source-verified". Products marked "needs-review" — or with no classification at
 * all — are excluded. Passing schema validation is never enough on its own.
 *
 *   node scripts/build-approved-catalogue.mjs <corrected.json> <correction-data.json> <out.json>
 *
 * This only writes a local JSON file. It never connects to a database or imports anything.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/** Returns { approved, excluded } — excluded items carry the reason. */
export function selectSourceVerified(products, statusById) {
  const approved = [];
  const excluded = [];
  for (const p of products) {
    const status = statusById?.[p.id]?.status;
    if (status === "source-verified") approved.push(p);
    else excluded.push({ id: p.id, sku: p.sku, reason: status ? `classified "${status}"` : "no verification classification" });
  }
  return { approved, excluded };
}

/** Case- and whitespace-insensitive duplicates across id, sku and slug (including across fields). */
export function findIdentifierCollisions(products) {
  const seen = new Map();
  const collisions = [];
  for (const p of products) {
    for (const field of ["id", "sku", "slug"]) {
      const key = norm(p[field]);
      if (!key) {
        collisions.push({ id: p.id, issue: `missing ${field}` });
        continue;
      }
      const prev = seen.get(key);
      if (prev && !(prev.id === p.id)) collisions.push({ id: p.id, issue: `${field} "${p[field]}" collides with ${prev.field} of ${prev.id}` });
      else if (!prev) seen.set(key, { id: p.id, field });
    }
  }
  return collisions;
}

function main() {
  const [correctedPath, dataPath, outPath] = process.argv.slice(2);
  if (!correctedPath || !dataPath || !outPath) {
    throw new Error("usage: node scripts/build-approved-catalogue.mjs <corrected.json> <correction-data.json> <out.json>");
  }
  const corrected = JSON.parse(readFileSync(correctedPath, "utf8"));
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  const products = corrected.products;
  const { approved, excluded } = selectSourceVerified(products, data.status);

  const verifiedInData = Object.values(data.status).filter((s) => s.status === "source-verified").length;
  const reviewInData = Object.values(data.status).filter((s) => s.status === "needs-review").length;
  if (approved.length !== verifiedInData) throw new Error(`selected ${approved.length} but the correction data lists ${verifiedInData} verified products`);
  if (approved.length + excluded.length !== products.length) throw new Error("selection does not account for every product");

  const collisions = findIdentifierCollisions(approved);
  if (collisions.length) throw new Error(`identifier collisions:\n${collisions.map((c) => `  ${c.id}: ${c.issue}`).join("\n")}`);

  const { products: _ignored, ...meta } = corrected;
  void _ignored;
  const out = {
    ...meta,
    selection: {
      basis: "status === \"source-verified\" in correction-data.json",
      derivedFrom: basename(correctedPath),
      selected: approved.length,
      excludedForReview: reviewInData,
      excludedOther: excluded.length - reviewInData,
      missingPdfProductsIncluded: 0,
      note: "Approved for a separately authorised, create-only import as drafts. Not imported.",
    },
    productCount: approved.length,
    products: approved,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ selected: approved.length, excluded: excluded.length, excludedForReview: reviewInData, collisions: 0, out: outPath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
