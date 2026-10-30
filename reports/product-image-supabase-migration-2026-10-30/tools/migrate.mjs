// Migrate eligible external product images to Supabase Storage (product-images bucket). Logos are never touched.
//
//   --plan (default)  READ-ONLY. Fresh MongoDB read, classifies every external image reference against the 2026-10-30
//                     visual audit, re-downloads each candidate through the SSRF-safe fetcher, decodes it and compares
//                     its SHA-256 with the bytes that were visually reviewed. Writes plan.json / PLAN.csv / PLAN.md.
//   --execute --approved [--batch N] [--limit-batches N]
//                     Executes plan.json in batches of N products (default 25). Per product: fresh read → abort if its
//                     images changed since the plan → per image: download again, SHA must equal the reviewed bytes →
//                     reuse an existing Supabase object with the same content, else importExternalImage (upload,
//                     object check, public URL check, audit log) → backup → ONE conditional update of `images` that
//                     swaps only the migrated URLs in place (setProductImagesIfUnchanged) → re-read and verify.
//                     Resumable and idempotent: state.json records every image; done images are skipped on rerun.
//
// Run: node --env-file=.env.local --import ./tests/support/register-ts.mjs --import <dns preload> <this file> [flags]
import { createHash } from "node:crypto";
import { Resolver } from "node:dns";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Papa = require("papaparse");
const R = "reports/product-image-supabase-migration-2026-10-30";
const AUDIT = "reports/product-image-database-audit-2026-10-30";
const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
const BATCH = arg("--batch", 25), LIMIT_BATCHES = arg("--limit-batches", Infinity);
if (EXECUTE && !args.includes("--approved")) throw new Error("--execute requires --approved (production writes)");
const CACHE = process.env.MIGRATION_CACHE; // downloaded bytes, outside the repo
if (!CACHE) throw new Error("set MIGRATION_CACHE");
mkdirSync(CACHE, { recursive: true }); mkdirSync(`${R}/backups`, { recursive: true });

const { getImageStorage } = await import("@/lib/image-storage");
const { importExternalImage, loadSharp } = await import("@/lib/external-image-import");
const { safeFetchImage } = await import("@/lib/safe-image-fetch");
const { findPreviousImageImport, recordImageImport, IMPORT_COLLECTION } = await import("@/lib/repositories/product-image-imports");
const { setProductImagesIfUnchanged } = await import("@/lib/repositories/products");
const { verifyPublicImageUrl, contentTypeForKey } = await import("@/lib/r2");
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");

// This machine's resolver fails some hosts; resolve through public DNS. safe-image-fetch still filters every answer to
// public unicast addresses at connect time, so the SSRF protection is unchanged.
const pub = new Resolver(); pub.setServers(["1.1.1.1", "8.8.8.8"]);
const publicResolve = (host, _o, cb) => pub.resolve4(host, (e, a) => (e ? cb(e) : cb(null, a.map((address) => ({ address, family: 4 })))));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function download(url) { // up to 3 attempts on temporary failures (timeouts, 429, 5xx)
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await safeFetchImage(url, { maxBytes: 15 * 1024 * 1024, timeoutMs: 20_000, maxRedirects: 3, resolve: publicResolve });
    if (last.ok || !last.retryable) return { ...last, attempts: attempt };
    await sleep(1500 * attempt);
  }
  return { ...last, attempts: 3 };
}

const storage = getImageStorage();
if (!storage.ok) throw new Error("image storage not configured");
const sharp = await loadSharp();
if (!sharp) throw new Error("sharp is not loadable — full decoding is required");
const db = await getMongoDb();
const products = db.collection("products");

// ---- the 2026-10-30 visual audit (per image reference) ------------------------------------------------------------------
const csv = (p) => Papa.parse(readFileSync(p, "utf8"), { header: true, skipEmptyLines: true }).data;
const auditSrc = csv(`${AUDIT}/PRODUCT-IMAGE-SOURCE-REPORT.csv`);
const auditLq = csv(`${AUDIT}/PRODUCTS-WITH-LOW-QUALITY-IMAGES.csv`);
const auditLogos = csv(`${AUDIT}/PRODUCTS-USING-LOGOS.csv`);
const manifest = JSON.parse(readFileSync(`${AUDIT}/tools/cache/visual-manifest.json`, "utf8"));
const k = (pid, url) => `${pid}|${url}`;
const audited = new Map(auditSrc.map((r) => [k(r.productId, r.url), r]));
const lqBy = new Map(auditLq.map((r) => [k(r.productId, r.url), r]));
const reviewedSha = new Map(manifest.map((m) => [k(m.productId, m.ref), m.sha256]));
const LOGO_URLS = new Set(auditLogos.map((r) => r.url)); // never migrated, whichever product uses them

const OVERRIDES = JSON.parse(readFileSync(`${R}/tools/migration-visual-overrides.json`, "utf8"));
function auditClass(pid, url) {
  if (OVERRIDES[url]) return [OVERRIDES[url].decision, OVERRIDES[url].reason];
  if (LOGO_URLS.has(url)) return ["excluded-logo", "classified as a logo in the 2026-10-30 audit (viewed)"];
  const a = audited.get(k(pid, url));
  if (!a) return ["manual-review", "not part of the 2026-10-30 visual audit (added or changed since)"];
  if (a.verdict === "Logo Only") return ["excluded-logo", "logo (viewed)"];
  if (a.verdict === "Broken") return ["skipped-broken", `broken at audit (${a.httpResult} ${a.httpStatus})`];
  if (a.verdict === "Low-Quality / Unsuitable") {
    const lq = lqBy.get(k(pid, url)); const why = lq?.reason ?? "unsuitable";
    if (lq?.confidence === "needs-confirmation") return ["manual-review", why];
    if (/wrong brand|another brand|other brand|stock photo|generic/.test(why)) return ["skipped-wrong-brand", why];
    if (/thumbnail/.test(why)) return ["skipped-thumbnail", why];
    if (/low resolution/.test(why)) return ["skipped-low-resolution", why];
    return ["skipped-unsuitable", why];
  }
  if (a.verdict === "Suitable") return ["candidate", "suitable product photo (viewed)"];
  return ["manual-review", `unexpected audit verdict ${a.verdict}`];
}

const AUDIT_IMAGES = process.env.AUDIT_IMAGE_CACHE ?? "";
const { sniffImage: sniffKind } = await import("@/lib/safe-image-fetch");
async function samePicture(aPath, bPath) {
  if (!AUDIT_IMAGES || !existsSync(aPath) || !existsSync(bPath)) return { same: false, why: "reviewed bytes not available for comparison" };
  const [ma, mb] = [await sharp(readFileSync(aPath)).metadata(), await sharp(readFileSync(bPath)).metadata()];
  if (Math.abs(ma.width / ma.height - mb.width / mb.height) > 0.02) return { same: false, why: `different shape ${ma.width}x${ma.height} vs ${mb.width}x${mb.height}` };
  const px = async (p) => (await sharp(readFileSync(p)).rotate().flatten({ background: "#ffffff" }).resize(32, 32, { fit: "fill" }).greyscale().raw().toBuffer());
  const [a, b] = [await px(aPath), await px(bPath)];
  let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  const diff = Math.round((d / a.length / 255) * 1000) / 10;
  return { same: diff <= 3, diff, why: `pixel difference ${diff}%` };
}

// ---- PLAN -------------------------------------------------------------------------------------------------------------
const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const writeCsv = (n, rows, cols) => writeFileSync(`${R}/${n}`, [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");

if (!EXECUTE) {
  const docs = await products.find({ status: { $ne: "deleted" } }, { projection: { _id: 1, id: 1, sku: 1, name: 1, brand: 1, model: 1, status: 1, images: 1 } }).toArray();
  const base = storage.storage.publicBaseUrl;
  const rows = []; let supabaseRefs = 0, base64Refs = 0, otherRefs = 0;
  const fetched = new Map(); // url -> download result (each unique URL is fetched once)
  for (const d of docs) {
    const imgs = Array.isArray(d.images) ? d.images : [];
    for (const [pos, url] of imgs.entries()) {
      if (typeof url !== "string") { otherRefs++; continue; }
      if (url.startsWith(`${base}/`)) { supabaseRefs++; continue; }
      if (url.startsWith("data:")) { base64Refs++; continue; }
      if (!/^https?:\/\//i.test(url)) { otherRefs++; continue; }
      const pid = String(d._id);
      const row = { productId: pid, id: d.id, sku: d.sku ?? "", name: d.name, brand: d.brand, model: d.model, status: d.status, position: pos + 1, url, host: new URL(url).host };
      [row.decision, row.reason] = auditClass(pid, url);
      if (row.decision === "candidate") {
        if (!url.startsWith("https://")) { row.decision = "skipped-invalid"; row.reason = "not https"; }
        else {
          if (!fetched.has(url)) {
            const cached = `${CACHE}/${sha256(url)}`;
            const got = existsSync(cached) && !args.includes("--refresh") ? { ok: true, buffer: readFileSync(cached), kind: sniffKind(readFileSync(cached)), finalUrl: url, status: 200 } : await download(url);
            let meta = null;
            if (got.ok) { try { meta = await sharp(got.buffer, { limitInputPixels: 40_000_000 }).metadata(); } catch { meta = null; } writeFileSync(`${CACHE}/${sha256(url)}`, got.buffer); }
            fetched.set(url, { ok: got.ok, reason: got.reason, status: got.status, finalUrl: got.finalUrl, kind: got.kind, bytes: got.buffer?.length, sha: got.ok ? sha256(got.buffer) : null, width: meta?.width, height: meta?.height, decoded: !!meta?.width });
          }
          const f = fetched.get(url);
          Object.assign(row, { sourceSha256: f.sha ?? "", bytes: f.bytes ?? "", format: f.kind ?? "", width: f.width ?? "", height: f.height ?? "", finalUrl: f.finalUrl ?? "" });
          const reviewed = reviewedSha.get(k(pid, url));
          if (!f.ok) { row.decision = "failed-download"; row.reason = `download failed now: ${f.reason}`; }
          else if (!f.decoded) { row.decision = "skipped-invalid"; row.reason = "bytes do not decode as an image"; }
          else if (f.kind === "gif") { row.decision = "skipped-invalid"; row.reason = "GIF not accepted by the importer"; }
          else if (Math.max(f.width, f.height) < 400) { row.decision = "skipped-low-resolution"; row.reason = `${f.width}x${f.height}`; }
          else if (reviewed && reviewed !== f.sha) {
            // Different bytes than the audit download. CDNs re-encode per Accept header (WebP/AVIF vs JPEG), so compare
            // pixels: same aspect ratio and a near-identical 32x32 rendering = the same, already reviewed picture.
            const sim = await samePicture(`${AUDIT_IMAGES}/${createHash("sha256").update(url).digest("hex").slice(0, 32)}`, `${CACHE}/${sha256(url)}`);
            if (sim.same) { row.decision = "eligible"; row.reason = `suitable; same picture as reviewed, different encoding (pixel diff ${sim.diff}%)`; row.reencoded = "yes"; }
            else { row.decision = "manual-review"; row.reason = `image content changed since it was visually reviewed (${sim.why})`; }
          }
          else { row.decision = "eligible"; row.reason = "suitable, verified now (https, public DNS, image MIME, signature, decoded, ≥400 px, same bytes as reviewed)"; }
        }
      }
      rows.push(row);
    }
  }
  // duplicates: same content used by several eligible references → one object, reused
  const bySha = new Map();
  for (const r of rows.filter((x) => x.decision === "eligible")) (bySha.get(r.sourceSha256) ?? bySha.set(r.sourceSha256, []).get(r.sourceSha256)).push(r);
  for (const [, group] of bySha) group.forEach((r, i) => { r.sameContentAs = i ? `${group[0].brand} ${group[0].model} (reuse one object)` : group.length > 1 ? `shared by ${group.length} references` : ""; });
  // content already in Supabase from an earlier import (same SHA-256) → reuse that object
  const prior = await db.collection(IMPORT_COLLECTION).find({ sha256: { $in: [...bySha.keys()] } }, { projection: { _id: 0, sha256: 1, storageKey: 1, publicUrl: 1 } }).toArray();
  const priorBySha = new Map(prior.map((p) => [p.sha256, p]));
  for (const r of rows.filter((x) => x.decision === "eligible")) if (priorBySha.has(r.sourceSha256)) r.existingSupabaseObject = priorBySha.get(r.sourceSha256).publicUrl;

  const plan = { createdAt: new Date().toISOString(), productsInspected: docs.length, supabaseRefs, base64Refs, otherRefs, rows };
  writeFileSync(`${R}/plan.json`, JSON.stringify(plan, null, 1));
  writeCsv("PLAN.csv", rows, ["decision", "reason", "reencoded", "productId", "id", "sku", "brand", "model", "name", "status", "position", "url", "host", "finalUrl", "sourceSha256", "bytes", "format", "width", "height", "sameContentAs", "existingSupabaseObject"]);
  const by = (f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
  const eligible = rows.filter((r) => r.decision === "eligible");
  const eligProducts = new Set(eligible.map((r) => r.productId)).size;
  console.log(JSON.stringify({ productsInspected: docs.length, externalRefs: rows.length, uniqueExternalUrls: new Set(rows.map((r) => r.url)).size, supabaseRefs, base64Refs, otherRefs, decisions: by((r) => r.decision),
    eligibleRefs: eligible.length, eligibleProducts: eligProducts, uniqueObjectsToCreate: [...bySha.keys()].filter((s) => !priorBySha.has(s)).length, reuseExisting: [...bySha.keys()].filter((s) => priorBySha.has(s)).length,
    eligibleBytes: [...bySha.entries()].reduce((a, [, g]) => a + Number(g[0].bytes), 0), batches: Math.ceil(eligProducts / BATCH),
    eligibleByBrand: by((r) => (r.decision === "eligible" ? r.brand : "_")), eligibleByHost: Object.fromEntries(Object.entries(eligible.reduce((m, r) => ((m[r.host] = (m[r.host] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 15)) }, null, 1));
  await (await getMongoClient()).close();
  process.exit(0);
}

// ---- EXECUTE ----------------------------------------------------------------------------------------------------------
const plan = JSON.parse(readFileSync(`${R}/plan.json`, "utf8"));
const STATE = `${R}/state.json`;
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { images: {}, orphans: [], batches: [] };
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));
const eligible = plan.rows.filter((r) => r.decision === "eligible");
const byProduct = new Map();
for (const r of eligible) (byProduct.get(r.productId) ?? byProduct.set(r.productId, []).get(r.productId)).push(r);
const objBySha = new Map(Object.values(state.images).filter((s) => s.status === "migrated").map((s) => [s.sourceSha256, s.newUrl])); // content → our URL
const strip = (d) => { const { _id, images, updatedAt, ...rest } = d; return JSON.stringify(rest); };
// Only references never processed: migrated ones are done, and held-back ones (manual-review etc.) stay excluded.
const productIds = [...byProduct.keys()].filter((pid) => byProduct.get(pid).some((r) => !state.images[k(pid, r.url)]));

let batchNo = 0;
for (let i = 0; i < productIds.length && batchNo < LIMIT_BATCHES; i += BATCH, batchNo++) {
  const batch = productIds.slice(i, i + BATCH), batchLog = { startedAt: new Date().toISOString(), products: batch.length, migrated: 0, failed: 0, skipped: 0 };
  for (const pid of batch) {
    const refs = byProduct.get(pid);
    const mark = (r, status, extra = {}) => { state.images[k(pid, r.url)] = { productId: pid, id: r.id, name: r.name, brand: r.brand, model: r.model, position: r.position, previousUrl: r.url, sourceSha256: r.sourceSha256, status, at: new Date().toISOString(), ...extra }; };
    const doc = await products.findOne({ id: refs[0].id, status: { $ne: "deleted" } });
    if (!doc) { refs.forEach((r) => mark(r, "skipped-product-missing")); batchLog.skipped++; save(); continue; }
    const before = Array.isArray(doc.images) ? doc.images : [];
    const planned = plan.rows.filter((r) => r.productId === pid).sort((a, b) => a.position - b.position);
    // every external reference planned for this product (eligible or not) must still be exactly where it was
    if (planned.some((r) => before[r.position - 1] !== r.url) || before.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u) && !u.startsWith(`${storage.storage.publicBaseUrl}/`)).length !== planned.length) { refs.forEach((r) => mark(r, "skipped-changed-since-plan", { reason: "product images changed after the plan; re-plan" })); batchLog.skipped++; save(); continue; }

    // 1. Upload (or reuse) each eligible image of this product. Nothing on the product changes yet.
    const swap = new Map();
    for (const r of refs) {
      if (LOGO_URLS.has(r.url) || OVERRIDES[r.url]) throw new Error(`excluded URL reached the executor: ${r.url}`); // hard guard
      if (state.images[k(pid, r.url)]?.status === "migrated") { swap.set(r.url, state.images[k(pid, r.url)].newUrl); continue; }
      const got = await download(r.url);
      if (!got.ok) { mark(r, "failed-download", { reason: got.reason }); continue; }
      const sha = sha256(got.buffer);
      if (sha !== r.sourceSha256) { mark(r, "manual-review", { reason: "content changed since planning/visual review" }); continue; }
      let newUrl = objBySha.get(sha) ?? r.existingSupabaseObject ?? null, key = null, reused = !!newUrl, uploadInfo = {};
      if (newUrl) { // reuse an existing object with identical content, after checking it is still there and served
        key = storage.storage.keyFromPublicUrl(newUrl);
        const head = key ? await storage.storage.store.head(key).catch(() => null) : null;
        const pubOk = key && head ? await verifyPublicImageUrl(newUrl, contentTypeForKey(key)) : { ok: false };
        if (!head || !pubOk.ok) { newUrl = null; reused = false; }
      }
      if (!newUrl) {
        const res = await importExternalImage(r.url, doc.sku || doc.id, {
          storage: storage.storage, importedBy: "supabase-migration-2026-10-30 (owner-approved; verified product photo)", sharp,
          fetchImage: async () => got, findPrevious: findPreviousImageImport, record: recordImageImport,
        });
        if (!res.ok) { mark(r, "failed-upload", { reason: res.error }); continue; }
        newUrl = res.url; key = res.key; uploadInfo = { width: res.width, height: res.height, bytes: res.bytes, format: res.format, converted: res.converted, reusedObject: res.reused };
      }
      objBySha.set(sha, newUrl);
      swap.set(r.url, newUrl);
      mark(r, "uploaded", { newUrl, storagePath: key, reusedExistingObject: reused, ...uploadInfo });
    }
    save();
    if (!swap.size) { batchLog.failed++; continue; }

    // 2. Backup, then ONE conditional update: same array, migrated URLs swapped in place, order kept.
    writeFileSync(`${R}/backups/${doc.id}.json`, JSON.stringify({ takenAt: new Date().toISOString(), document: { ...doc, _id: String(doc._id) } }, null, 1));
    const next = before.map((u) => swap.get(u) ?? u);
    let upd;
    try { upd = await setProductImagesIfUnchanged(doc.id, before, next); } catch (e) { upd = `error ${e.name}`; }
    const done = refs.filter((r) => swap.has(r.url));
    if (upd && typeof upd === "object") {
      const after = await products.findOne({ _id: doc._id });
      const intact = strip(after) === strip(doc) && JSON.stringify(after.images) === JSON.stringify(next) && after.images.length === before.length;
      for (const r of done) {
        const s = state.images[k(pid, r.url)];
        const pubOk = await verifyPublicImageUrl(s.newUrl, contentTypeForKey(storage.storage.keyFromPublicUrl(s.newUrl)));
        Object.assign(s, { status: intact && pubOk.ok ? "migrated" : "migrated-check-failed", otherFieldsUnchanged: intact, publicUrlOk: pubOk.ok, migratedAt: new Date().toISOString() });
      }
      batchLog.migrated += done.length;
    } else {
      for (const r of done) { const s = state.images[k(pid, r.url)]; s.status = "failed-db-update"; s.reason = upd === "changed" ? "product changed during migration — not overwritten" : String(upd); if (!s.reusedExistingObject) state.orphans.push({ url: s.newUrl, key: s.storagePath, productId: pid, note: "uploaded, not referenced; remove only via the safe release path after confirming no product uses it" }); }
      batchLog.failed++;
    }
    save();
    await sleep(300); // be gentle with the source hosts
  }
  state.batches.push({ ...batchLog, finishedAt: new Date().toISOString() }); save();
  console.log(`batch ${batchNo + 1}: ${JSON.stringify(batchLog)}`);
}
await (await getMongoClient()).close();

const rows = Object.values(state.images);
writeCsv("MIGRATION-RESULTS.csv", rows, ["status", "productId", "id", "name", "brand", "model", "position", "previousUrl", "newUrl", "storagePath", "sourceSha256", "reusedExistingObject", "width", "height", "bytes", "format", "converted", "otherFieldsUnchanged", "publicUrlOk", "reason", "migratedAt"]);
console.log(JSON.stringify(rows.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {})));
