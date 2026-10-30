// Batch 1 import — verified exact-model official images (owner-authorised, 2026-10-29).
// Reuses the project's importer (lib/external-image-import: SSRF-safe download, full decode with sharp, content-addressed
// key, upload verification, audit log) and the conditional gallery save (setProductImagesIfUnchanged). Per product:
//   fresh read → skip if changed since the audit → import → check ≥400 px → backup → conditional images update → verify.
// Resumable: products already "imported" in state.json are skipped. Without --execute it only plans (no writes).
// Run: node --env-file=.env.local --import ./tests/support/register-ts.mjs [--import <dns preload>] <this file> [--execute]
import { Resolver } from "node:dns";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Papa = require("papaparse");
const R = "reports/product-image-acquisition-2026-10-29";
const OUT = `${R}/import-batch-01`;
const EXECUTE = process.argv.includes("--execute");
mkdirSync(`${OUT}/backups`, { recursive: true });

const { getImageStorage } = await import("@/lib/image-storage");
const { importExternalImage, loadSharp } = await import("@/lib/external-image-import");
const { safeFetchImage } = await import("@/lib/safe-image-fetch");
const { findPreviousImageImport, recordImageImport } = await import("@/lib/repositories/product-image-imports");
const { setProductImagesIfUnchanged } = await import("@/lib/repositories/products");
const { realImages, replaceImageInPlace } = await import("@/lib/admin-gallery");
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");

// This machine's resolver fails some hosts; resolve via public DNS. safe-image-fetch still filters every answer to
// public unicast addresses at connect time, so the SSRF protection is unchanged.
const pub = new Resolver(); pub.setServers(["1.1.1.1", "8.8.8.8"]);
const publicResolve = (host, _opts, cb) => pub.resolve4(host, (err, addrs) => (err ? cb(err) : cb(null, addrs.map((address) => ({ address, family: 4 })))));

const csv = (p) => Papa.parse(readFileSync(p, "utf8"), { header: true, skipEmptyLines: true }).data;
const status = csv(`${R}/PRODUCT-IMAGE-STATUS.csv`);
const cands = csv(`${R}/IMAGE-CANDIDATE-MATCHES.csv`);
const audit = new Map(JSON.parse(readFileSync(`${R}/tools/baseline/product-image-inventory.json`, "utf8")).products.map((p) => [p.productId, p]));
const flags = new Map(JSON.parse(readFileSync(`${R}/tools/cache/import-flags.json`, "utf8")).rows.map((r) => [r.productId, r]));
const SAMSUNG_LOGO = /logo-square-letter|\/logo[-_.]/i; // Samsung pages expose their logo as og:image — never a product photo

// Batch: verified exact matches from the audit, official manufacturer pages only, excluding logo images.
const batch = status.filter((r) => r.classification === "verified exact match").map((r) => {
  const c = cands.find((x) => x.productId === r.productId && x.rank === "1");
  return { ...r, imageUrl: c.image, sourcePage: c.sourceUrl, source: c.source, evidence: c.evidence };
});
const STATE = `${OUT}/state.json`;
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));

const storage = getImageStorage();
if (!storage.ok) throw new Error("image storage not configured");
const sharp = await loadSharp();
if (!sharp) throw new Error("sharp is not loadable here — full decoding is required for this batch");
const db = await getMongoDb();
const products = db.collection("products");
const strip = (d) => { const { _id, images, updatedAt, ...rest } = d; return JSON.stringify(rest); };

for (const item of batch) {
  const st = (state[item.productId] ??= { productId: item.productId, id: item.id, brand: item.brand, model: item.model, sourcePage: item.sourcePage, imageUrl: item.imageUrl });
  if (st.result === "imported") { console.log(`skip ${item.model}: already imported`); continue; }
  const skip = (why) => { st.result = "skipped"; st.reason = why; st.at = new Date().toISOString(); save(); console.log(`SKIP ${item.brand} ${item.model}: ${why}`); };
  if (item.source !== "official manufacturer page") { skip("not an official manufacturer source"); continue; }
  if (SAMSUNG_LOGO.test(item.imageUrl)) { skip("candidate image is the manufacturer logo (og:image), not a product photo"); continue; }

  const doc = await products.findOne({ id: item.id, status: { $ne: "deleted" } });
  if (!doc) { skip("product not found"); continue; }
  const before = Array.isArray(doc.images) ? doc.images : [];
  const auditImages = (audit.get(item.productId)?.images ?? []).map((i) => i.ref);
  if (JSON.stringify(before) !== JSON.stringify(auditImages)) { skip("images changed since the audit — re-review"); continue; }
  const flag = flags.get(item.productId);
  const thumbRef = flag ? before.find((u) => u.includes(flag.storageKey)) : null;
  if (flag && !thumbRef) { skip("flagged thumbnail no longer on the product"); continue; }
  st.before = before; st.mode = thumbRef ? "replace thumbnail import in place" : before.length ? "add as primary (existing images kept after it)" : "first image";
  if (!EXECUTE) { st.result = "planned"; save(); console.log(`plan ${item.brand} ${item.model}: ${st.mode}`); continue; }

  // 1. Import (download, full decode, upload, verify, audit log). Nothing on the product changes yet.
  const res = await importExternalImage(item.imageUrl, doc.sku || doc.id, {
    storage: storage.storage, importedBy: "batch-import-2026-10-29 (owner-authorised; official manufacturer image)",
    fetchImage: (u) => safeFetchImage(u, { maxBytes: 15 * 1024 * 1024, timeoutMs: 20_000, maxRedirects: 3, resolve: publicResolve }),
    findPrevious: findPreviousImageImport, record: recordImageImport, sharp,
  });
  if (!res.ok) { st.result = "failed"; st.reason = `import: ${res.error}`; st.at = new Date().toISOString(); save(); console.log(`FAIL ${item.model}: ${res.error}`); continue; }
  Object.assign(st, { key: res.key, url: res.url, width: res.width, height: res.height, bytes: res.bytes, format: res.format, reusedObject: res.reused, converted: res.converted });
  if (!res.width || Math.max(res.width, res.height) < 400) { st.result = "failed"; st.reason = `decoded image too small (${res.width}x${res.height})`; save(); console.log(`FAIL ${item.model}: too small`); continue; }

  // 2. Backup, then the conditional images update (only if the product is still exactly as read).
  writeFileSync(`${OUT}/backups/${item.id}.json`, JSON.stringify({ takenAt: new Date().toISOString(), document: { ...doc, _id: String(doc._id) } }, null, 1));
  const next = thumbRef ? replaceImageInPlace(before, thumbRef, res.url) : [res.url, ...realImages(before).filter((u) => u !== res.url)];
  st.after = next;
  let upd;
  try { upd = await setProductImagesIfUnchanged(doc.id, before, next); }
  catch (e) { st.result = "failed"; st.reason = `database update failed (${e.name}); product unchanged; stored object kept for retry`; save(); console.log(`FAIL ${item.model}: db`); continue; }
  if (upd !== null && typeof upd === "object") {
    const afterDoc = await products.findOne({ _id: doc._id });
    const intact = strip(afterDoc) === strip(doc) && JSON.stringify(afterDoc.images) === JSON.stringify(next);
    const pubCheck = await fetch(res.url, { method: "GET", headers: { Range: "bytes=0-15" } }).then((r) => r.status).catch(() => 0);
    Object.assign(st, { result: intact ? "imported" : "imported-check-fields", otherFieldsUnchanged: intact, publicUrlStatus: pubCheck, at: new Date().toISOString() });
    console.log(`OK   ${item.brand} ${item.model}: ${st.mode} → ${res.key}${intact ? "" : " (FIELD CHECK FAILED)"}`);
  } else {
    st.result = "failed"; st.reason = upd === "changed" ? "product changed during import — not overwritten; stored object kept for retry" : "product not found at update";
    console.log(`FAIL ${item.model}: ${st.reason}`);
  }
  save();
}
await (await getMongoClient()).close();

// Result CSV
const rows = Object.values(state);
const cell = (v) => { const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ["productId", "id", "brand", "model", "result", "reason", "mode", "sourcePage", "imageUrl", "key", "url", "width", "height", "bytes", "format", "reusedObject", "otherFieldsUnchanged", "publicUrlStatus", "before", "after", "at"];
writeFileSync(`${OUT}/results.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");
console.log(JSON.stringify(rows.reduce((m, r) => ((m[r.result] = (m[r.result] ?? 0) + 1), m), {})));
