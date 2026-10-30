// Read-only: products whose stored (Supabase) image was imported from a Google search thumbnail or a logo site.
import { readFileSync, writeFileSync } from "node:fs";
const R = "reports/product-image-acquisition-2026-10-29";
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");
const db = await getMongoDb();
const log = await db.collection("product_image_imports").find({}, { projection: { _id: 0 } }).toArray();
await (await getMongoClient()).close();
const inv = JSON.parse(readFileSync(`${R}/tools/baseline/product-image-inventory.json`, "utf8")).products;
const bad = /encrypted-tbn\d*\.gstatic\.com|seeklogo|logos-world|play-lh\.googleusercontent/i;
const flaggedUrls = new Map(log.filter((l) => bad.test(new URL(l.sourceUrl).host)).map((l) => [l.publicUrl, l]));
const flagged = inv.filter((p) => p.images.some((i) => flaggedUrls.has(i.ref)));
const rows = flagged.map((p) => { const l = p.images.map((i) => flaggedUrls.get(i.ref)).find(Boolean); return { productId: p.productId, id: p.id, brand: p.brand, model: p.model, imageStatus: p.imageStatus, sourceHost: new URL(l.sourceUrl).host, width: l.width, height: l.height, storageKey: l.storageKey }; });
writeFileSync(`${R}/tools/cache/import-flags.json`, JSON.stringify({ flaggedProductIds: rows.map((r) => r.productId), rows, importLog: log }, null, 1));
console.log(JSON.stringify({ flaggedProducts: rows.length, byHost: rows.reduce((m, r) => ((m[r.sourceHost] = (m[r.sourceHost] ?? 0) + 1), m), {}), stillCountedValid: rows.filter((r) => r.imageStatus === "valid-image").length,
  sizes: rows.reduce((m, r) => { const k = Math.max(r.width ?? 0, r.height ?? 0) < 400 ? "<400px" : ">=400px"; m[k] = (m[k] ?? 0) + 1; return m; }, {}) }));
