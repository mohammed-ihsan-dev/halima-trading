// Read-only: compares the current baseline with the 2026-10-26 audit and summarises the import log.
import { readFileSync, writeFileSync } from "node:fs";
const R = "reports/product-image-acquisition-2026-10-29";
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");
const now = JSON.parse(readFileSync(`${R}/tools/baseline/product-image-inventory.json`, "utf8")).products;
const prev = new Map(JSON.parse(readFileSync("reports/product-image-audit/product-image-inventory.json", "utf8")).products.map((p) => [p.productId, p]));
const db = await getMongoDb();
const cols = (await db.listCollections().toArray()).map((c) => c.name);
const log = cols.includes("product_image_imports") ? await db.collection("product_image_imports").find({}, { projection: { _id: 0 } }).toArray() : [];
await (await getMongoClient()).close();
const changed = [];
for (const p of now) {
  const o = prev.get(p.productId);
  const a = (o?.images ?? []).map((i) => i.ref).join("|"), b = p.images.map((i) => i.ref).join("|");
  if (!o) changed.push({ productId: p.productId, id: p.id, brand: p.brand, model: p.model, change: "new product", before: "", after: b, statusBefore: "", statusNow: p.imageStatus });
  else if (a !== b) changed.push({ productId: p.productId, id: p.id, brand: p.brand, model: p.model, change: "images changed", before: a, after: b, statusBefore: o.imageStatus, statusNow: p.imageStatus });
}
const supaKeys = new Set(log.map((l) => l.publicUrl));
for (const c of changed) c.viaImporter = c.after.split("|").some((u) => supaKeys.has(u));
const by = (f) => changed.reduce((m, c) => ((m[f(c)] = (m[f(c)] ?? 0) + 1), m), {});
const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols2 = ["productId", "id", "brand", "model", "change", "statusBefore", "statusNow", "viaImporter", "before", "after"];
writeFileSync(`${R}/tools/baseline/changes-since-2026-10-26.csv`, [cols2.join(","), ...changed.map((c) => cols2.map((k) => cell(c[k])).join(","))].join("\n") + "\n");
const imported = log.filter((l) => !l.reused);
const dupBytes = log.reduce((m, l) => (l.sha256 && (m[l.sha256] = new Set([...(m[l.sha256] ?? []), l.productRef])), m), {});
console.log(JSON.stringify({
  productsChanged: changed.length, byTransition: by((c) => `${c.statusBefore} -> ${c.statusNow}`), byBrand: by((c) => c.brand), viaImporter: changed.filter((c) => c.viaImporter).length,
  importLog: { records: log.length, newObjects: imported.length, reused: log.length - imported.length, admins: [...new Set(log.map((l) => l.importedBy))], converted: log.filter((l) => l.converted).length,
    bytes: imported.reduce((s, l) => s + (l.bytes ?? 0), 0), firstAt: log.map((l) => l.importedAt).sort()[0], lastAt: log.map((l) => l.importedAt).sort().at(-1),
    sourceHosts: log.reduce((m, l) => { const h = new URL(l.sourceUrl).host; m[h] = (m[h] ?? 0) + 1; return m; }, {}),
    sameImageForSeveralProductFolders: Object.values(dupBytes).filter((s) => s.size > 1).length },
}, null, 1));
