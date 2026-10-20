/**
 * Product-image pipeline: audit → discover → verify → dry-run → upload → apply → report.
 *
 *   node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/product-images/pipeline.mjs <command> [options]
 *
 *   audit     read every product, check every current image (read-only)
 *   discover  look up products without a usable image on their brand's official site + earlier reviewed manifests
 *   verify    download candidates, validate files, apply confidence rules and manual review decisions
 *   targets   freeze the audited target set into target-manifest.json (later audits are diffed; changes need --accept-changes)
 *   quota     SerpApi remaining monthly searches (free account check) and the local request ledger — no search
 *   catalogue extract a brand catalogue PDF (--pdf=… --brand=…), match exact models, crop photos, write previews and
 *             catalogue-candidates.json (read-only for products and storage; feeds discover as the "catalogue-pdf" source)
 *   pilot     pick a small, varied set of pending products (--size=15) for a trial run; later stages take --pilot
 *   review-import  write candidates into the admin review queue (product_image_reviews) — preview unless --execute
 *   review-rollback  remove the records one import inserted (--run=<id>), if nobody acted on them — preview unless --execute
 *   dry-run   exactly which products would change, with the optimised image and storage key (no writes)
 *   upload    upload planned images to Supabase Storage          — requires --execute
 *   apply     conditionally set the product images in MongoDB    — requires --execute
 *   rollback  restore product images from the apply backups      — preview unless --execute
 *   cleanup   list (or with --execute delete) uploaded objects that no product references
 *   report    summary of every stage and what is left
 *
 * Discovery sources (--source=local,brand,icecat,search): reviewed manifests, official-site adapters, Open Icecat
 * and a configurable image search provider (IMAGE_SEARCH_PROVIDER / SERPAPI_API_KEY). Search results are leads only.
 * An image is uploaded only after an admin approved it in the review queue (exact model + recorded authorization)
 * or its rights holder has a confirmed written grant in permissions.json. AI vision scores are advisory only.
 *
 * State lives in work/product-image-pipeline/ (git-ignored). Upload and apply record progress after every
 * product, so an interrupted run resumes without duplicate uploads or writes. Only the `images` field (and
 * `updatedAt`) is ever written, only when the product still has exactly the images seen in the plan.
 * Nothing is published, deleted or overwritten; secrets are never logged.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { get, pool } from "./http.mjs";
import { deterministicUuid, inspect, optimise, sha256 } from "./images.mjs";
import { ADAPTERS, ICECAT, NO_ADAPTER_REASON, localManifestCandidates, norm, withContentToken } from "./sources.mjs";
import { automatedAccessProhibited, filenameModelConflict, resolvePermission } from "./policy.mjs";
import { classifyRefs, IMAGE_CLASSES, TARGET_CLASSES } from "./audit-classes.mjs";
import { findSearchCandidates, searchConfig, SOURCE_PRIORITY } from "./search.mjs";
import { assessmentFlags, createVisionProvider } from "./vision.mjs";
import { budgetDecision, checkAccount, openCache, openLedger, requestLimit } from "./serpapi-budget.mjs";
import { matchCatalogue } from "./catalogue-match.mjs";
import { execFileSync } from "node:child_process";
import { robotsAllowed } from "./http.mjs";

const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");
const { getImageStorage } = await import("@/lib/image-storage");
const { verifyUploadedImage, productKeySegment, isValidImageKey } = await import("@/lib/r2");
const { getSupabaseStorageConfig, listSupabaseObjects } = await import("@/lib/supabase-storage");
const { customerModel } = await import("@/lib/product-model");
const { safeFetchImage } = await import("@/lib/safe-image-fetch");
const { approvalProblem, initialState } = await import("@/lib/product-image-review");
const { REVIEW_COLLECTION, importDiscoveredReviews, removeImportRun, markReviewUploaded, markReviewRolledBack, ensureReviewIndexes } = await import("@/lib/repositories/product-image-reviews");

const ROOT = process.cwd();
// PIPELINE_STATE_DIR lets a rehearsal (local database + fake storage) run on a copy of the state, never the real manifests.
const STATE = process.env.PIPELINE_STATE_DIR ? path.resolve(process.env.PIPELINE_STATE_DIR) : path.join(ROOT, "work/product-image-pipeline");
const CACHE = path.join(STATE, "cache");
mkdirSync(CACHE, { recursive: true });
const PLACEHOLDER = "/featured/hisense-window-ac.png";
const [cmd, ...argv] = process.argv.slice(2);
const EXECUTE = argv.includes("--execute");
const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const ONLY = (arg("only") ?? "").split(",").filter(Boolean);
// --pilot limits every stage to the products chosen by the `pilot` command.
if (argv.includes("--pilot") && cmd !== "pilot") {
  const pilotFile = path.join(STATE, "pilot.json");
  if (!existsSync(pilotFile)) throw new Error("run `pilot` first");
  ONLY.push(...JSON.parse(readFileSync(pilotFile, "utf8")).ids);
}
// --source=local,brand,icecat,search (comma-separated) limits discovery to those sources; default: all.
const ALL_SOURCES = ["local", "brand", "icecat", "search"];
const SOURCES = new Set((arg("source") || ALL_SOURCES.join(",")).split(","));
const now = () => new Date().toISOString();

const file = (n) => path.join(STATE, n);
const load = (n, fallback) => (existsSync(file(n)) ? JSON.parse(readFileSync(file(n), "utf8")) : fallback);
function save(n, data) { // atomic: a crash never leaves a half-written state file
  writeFileSync(file(n) + ".tmp", JSON.stringify(data, null, 1));
  renameSync(file(n) + ".tmp", file(n));
}
const csvCell = (v) => { const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const writeCsv = (n, rows) => rows.length && writeFileSync(file(n), [Object.keys(rows[0]).join(","), ...rows.map((r) => Object.values(r).map(csvCell).join(","))].join("\n") + "\n");

async function withDb(fn) {
  const client = await new MongoClient(process.env.MONGODB_URI).connect();
  try { const db = client.db(process.env.MONGODB_DB || "halima"); return await fn(db.collection("products"), db); } finally { await client.close(); }
}
const stamp = () => now().replace(/[:.]/g, "-").slice(0, 19);
const supabaseConfig = () => { const c = getSupabaseStorageConfig(); if (!c.ok) throw new Error(`Supabase not configured (missing: ${c.missing}, invalid: ${c.invalid})`); return c.config; };
async function storageUsage() {
  const objects = await listSupabaseObjects(supabaseConfig());
  return { objects: objects.length, bytes: objects.reduce((s, o) => s + o.size, 0), measuredAt: now() };
}

/* ============================================================================ audit */
function uploadProvenance() {
  const prov = new Map(); // object key -> { productId, source }
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/^upload-results-\d+\.json$/.test(f)) for (const r of JSON.parse(readFileSync(p, "utf8"))) for (const k of r.keys ?? []) prov.set(k, { productId: r.id, source: `${r.source ?? ""}${r.page ? ` p.${r.page}` : ""}`, log: path.relative(ROOT, p) }); } };
  if (existsSync(path.join(ROOT, "work/catalogue-images"))) walk(path.join(ROOT, "work/catalogue-images"));
  for (const f of readdirSync(path.join(ROOT, "work/image-pilot")).filter((x) => x.startsWith("pilot-log-"))) for (const k of readFileSync(path.join(ROOT, "work/image-pilot", f), "utf8").match(/products\/[a-z0-9-]+\/[0-9a-f-]{36}\.(?:jpg|png|webp)/g) ?? []) prov.set(k, { productId: "black-decker-bd-hx230t-b5", source: "BD-HX230T-B5 supplier image (pilot)", log: `work/image-pilot/${f}` });
  for (const [, p] of Object.entries(load("progress.json", {}))) if (p.upload?.key) prov.set(p.upload.key, { productId: p.productId, source: p.upload.sourcePage, log: "work/product-image-pipeline/progress.json" });
  return prov;
}
function changePlanVerdicts() {
  const p = path.join(ROOT, "work/catalogue-images/audit/external-images/change-plan.json");
  return existsSync(p) ? new Map(JSON.parse(readFileSync(p, "utf8")).plan.map((r) => [r.productId, r])) : new Map();
}

async function audit() {
  const config = supabaseConfig();
  const base = `${config.publicBaseUrl}/`;
  const prov = uploadProvenance();
  const verdicts = changePlanVerdicts();
  const products = await withDb((P) => P.find({}, { projection: { _id: 0, id: 1, slug: 1, name: 1, brand: 1, model: 1, sku: 1, category: 1, status: 1, images: 1, updatedAt: 1, "specifications.Barcode": 1 } }).toArray());
  const refs = [...new Set(products.flatMap((p) => (p.images ?? []).filter((i) => typeof i === "string" && !i.startsWith("data:") && i !== PLACEHOLDER)))];
  console.log(`audit: ${products.length} products, ${refs.length} distinct image URLs to check`);
  const checks = new Map();
  await pool(refs, 6, async (u) => {
    const url = u.startsWith("/") ? `https://halimatrading.com${u}` : u;
    const r = await get(url, { checkRobots: false, accept: "image/avif,image/webp,image/*,*/*;q=0.8" });
    const info = r.ok ? await inspect(r.body, (r.headers["content-type"] || "").toLowerCase()) : null;
    checks.set(u, { http: r.status, error: r.error ?? null, contentType: r.headers["content-type"] ?? null, valid: !!(r.ok && info && info.kind && info.kind !== "markup"), kind: info?.kind ?? null, width: info?.width ?? null, height: info?.height ?? null, bytes: r.body.length, sha256: r.body.length ? sha256(r.body) : null, tooSmall: info?.reason?.startsWith("too small") ?? false, servedTypeMatches: info?.servedTypeMatches ?? null });
  });
  const shaOwners = new Map();
  const rows = [];
  for (const p of products) {
    const images = (p.images ?? []).filter((i) => typeof i === "string" && i.trim());
    const refsOut = [];
    for (const i of images) {
      if (i === PLACEHOLDER) { refsOut.push({ ref: i, type: "placeholder", valid: false }); continue; }
      if (i.startsWith("data:")) {
        const m = /^data:([^;,]+);base64,(.*)$/s.exec(i);
        const buf = m ? Buffer.from(m[2], "base64") : Buffer.alloc(0);
        const info = buf.length ? await inspect(buf) : { ok: false };
        const sha = buf.length ? sha256(buf) : null;
        refsOut.push({ ref: `data:${m?.[1]} (${buf.length} B)`, type: "embedded", valid: !!info.kind && info.kind !== "markup", sha256: sha, width: info.width, height: info.height });
        continue;
      }
      const c = checks.get(i);
      const type = i.startsWith(base) ? "supabase" : i.startsWith("/") ? "local" : "external";
      const pv = type === "supabase" ? prov.get(i.slice(base.length)) : null;
      refsOut.push({ ref: i, type, ...c, provenance: pv ? `${pv.source} (${pv.log})` : null, provenanceProduct: pv?.productId ?? null });
    }
    for (const r of refsOut) if (r.sha256) (shaOwners.get(r.sha256) ?? shaOwners.set(r.sha256, new Set()).get(r.sha256)).add(p.id);
    rows.push({ p, refsOut });
  }
  const out = [];
  for (const { p, refsOut } of rows) {
    const valid = refsOut.filter((r) => r.type !== "placeholder" && r.valid);
    const verifiedSb = valid.filter((r) => r.type === "supabase" && r.provenance);
    const verdict = verdicts.get(p.id);
    const status = classifyRefs(refsOut);
    let action = "find an image", matchEvidence = "";
    if (status === "VALID_VERIFIED") {
      action = "keep";
      matchEvidence = verifiedSb[0].provenanceProduct === p.id ? `model matched at upload — ${verifiedSb[0].provenance}` : `shared family image uploaded for ${verifiedSb[0].provenanceProduct} — ${verifiedSb[0].provenance}`;
    } else if (status === "SUPABASE_UNREVIEWED") {
      action = "keep; confirm the model match (uploaded outside the reviewed batches)"; matchEvidence = "no upload record";
    } else if (status === "EMBEDDED_PRESERVED") {
      action = "keep (embedded O General images; migrate only under the separate approved plan)"; matchEvidence = "set by admin; not independently verified";
    } else if (status === "EXTERNAL_NEEDS_VERIFICATION") {
      action = verdict ? `see external-images change plan: ${verdict.planStatus}` : "keep for now; verify model and reuse permission, then copy to Supabase or replace";
      matchEvidence = verdict ? `${verdict.currentTechnicalVerdict}: ${verdict.currentDepicts}` : "not verified (an accessible URL is not proof of the right product)";
    } else if (status === "BROKEN" || status === "PLACEHOLDER") {
      action = "find a replacement image";
    }
    const dupWith = [...new Set(valid.flatMap((r) => [...(shaOwners.get(r.sha256) ?? [])]).filter((x) => x !== p.id))];
    out.push({
      id: p.id, slug: p.slug, name: p.name, brand: p.brand, model: p.model, sku: p.sku, category: p.category ?? null, barcode: p.specifications?.Barcode ?? null, status: p.status ?? null, updatedAt: p.updatedAt,
      images: p.images ?? [], imageCount: (p.images ?? []).length, imageClass: status, sources: [...new Set(refsOut.map((r) => r.type))],
      accessible: valid.length > 0, matchEvidence, duplicateOf: dupWith, singleModel: customerModel(p) !== null, recommendedAction: action, refs: refsOut,
    });
  }
  const usage = await storageUsage();
  save("audit.json", { auditedAt: now(), storage: usage, products: out });
  writeCsv("audit.csv", out.map((r) => ({ id: r.id, brand: r.brand, model: r.model, sku: r.sku, status: r.status, imageClass: r.imageClass, imageCount: r.imageCount, sources: r.sources, accessible: r.accessible, matchEvidence: r.matchEvidence, duplicateOf: r.duplicateOf, recommendedAction: r.recommendedAction, firstImage: r.refs[0]?.ref ?? "" })));
  const byBrand = {};
  for (const r of out) { const b = byBrand[r.brand.toUpperCase()] ??= { brand: r.brand, total: 0, published: 0 }; b.total++; if (r.status === "active") b.published++; b[r.imageClass] = (b[r.imageClass] ?? 0) + 1; }
  const classes = IMAGE_CLASSES;
  writeCsv("audit-by-brand.csv", Object.values(byBrand).sort((a, b) => b.total - a.total).map((b) => ({ brand: b.brand, total: b.total, published: b.published, ...Object.fromEntries(classes.map((c) => [c, b[c] ?? 0])) })));
  const tally = Object.fromEntries(classes.map((c) => [c, out.filter((r) => r.imageClass === c).length]));
  console.log(JSON.stringify({ products: out.length, ...tally, crossProductDuplicates: out.filter((r) => r.duplicateOf.length).length, storage: usage }, null, 1));
}

/* ============================================================================ discover */
const TARGET = TARGET_CLASSES;
async function discover() {
  const a = load("audit.json", null);
  if (!a) throw new Error("run audit first");
  const local = localManifestCandidates(ROOT);
  const register = load("permissions.json", { holders: {} });
  if (argv.includes("--requested")) { // products an admin sent back with "request more candidates" (read-only query)
    const ids = await withDb((_, db) => db.collection(REVIEW_COLLECTION).distinct("productId", { moreCandidatesRequestedAt: { $type: "string" } }));
    ONLY.push(...(ids.length ? ids : ["(none requested)"]));
  }
  const targets = a.products.filter((p) => TARGET.has(p.imageClass) && (!ONLY.length || ONLY.includes(p.id)));
  // A full run starts fresh so products that gained an image since the last run drop out; --only keeps the rest.
  const partial = !ALL_SOURCES.every((x) => SOURCES.has(x));
  const old = load("candidates.json", {});
  const prev = ONLY.length || partial ? old : {};
  const sourceOf = (c) => (c.adapter === "icecat" ? "icecat" : c.adapter === "serpapi" ? "search" : c.adapter === "reviewed-manifest" || c.adapter === "supplier-catalogue" ? "local" : "brand");
  const noteSource = (n) => (n.startsWith("icecat") ? "icecat" : n.startsWith("search") ? "search" : "brand");
  const search = searchConfig();
  if (SOURCES.has("search") && search.provider === "none") {
    console.log(`search disabled: ${search.disabledReason}`);
    if (SOURCES.size === 1) return; // search was the only source requested: nothing to do
  }
  const plan = SOURCES.has("search") && search.provider !== "none" ? await planSearch(a, targets, register) : null;
  if (plan?.stop) return; // quota or scope check failed: report written, nothing searched
  console.log(`discover: ${targets.length} products without a usable image${plan ? ` · search: ${plan.searchSet.size} product(s) in this batch, ${plan.needed} new request(s) allowed` : ""}`);
  await pool(targets, plan ? 1 : 3, async (p) => {
    const brand = p.brand.trim().toLowerCase();
    const rec = { id: p.id, brand: p.brand, model: p.model, discoveredAt: now(), candidates: [], searched: [], notes: [] };
    // Search is refreshed only for products in this batch; everyone else keeps earlier search results untouched.
    const refresh = new Set([...SOURCES].filter((x) => x !== "search" || plan?.searchSet.has(p.id)));
    if ((partial || refresh.size !== SOURCES.size) && old[p.id]) { // keep what other sources found earlier; refresh only the requested sources
      rec.candidates = old[p.id].candidates.filter((c) => !refresh.has(sourceOf(c)));
      rec.notes = old[p.id].notes.filter((n) => !refresh.has(noteSource(n)));
      if (!refresh.has("icecat") && old[p.id].icecat) rec.icecat = old[p.id].icecat;
      if (!refresh.has("search") && old[p.id].search) rec.search = old[p.id].search;
    }
    if (SOURCES.has("local")) { // refreshed with the local source; a human-reviewed candidate may cover a combined record exactly
      rec.candidates = rec.candidates.filter((c) => sourceOf(c) !== "local");
      for (const c of local.get(p.id) ?? []) rec.candidates.push(c);
    }
    const COMBINED = "record combines several models — no single model to search for (see UI audit)";
    if (!p.singleModel) { rec.notes = [...rec.notes.filter((n) => n !== COMBINED), COMBINED]; rec.needsManualSource = !rec.candidates.length; prev[p.id] = rec; return; } // no automated search
    if (SOURCES.has("icecat")) {
      const r = await ICECAT.find(p);
      rec.icecat = { attempts: r.attempts ?? [], found: !!(r.candidates ?? []).length, reason: r.error ?? r.notFoundReason ?? null };
      rec.candidates.push(...(r.candidates ?? []));
      rec.searched.push(...(r.searched ?? []));
      if (r.error) rec.notes.push(`icecat: ${r.error}`); else if (!(r.candidates ?? []).length) rec.notes.push(`icecat: ${r.notFoundReason}`);
    }
    const adapter = SOURCES.has("brand") ? ADAPTERS[brand] : null;
    if (adapter) {
      let r = await adapter.find(p);
      // SKU fallback: only when the model finds nothing and the SKU is a different code. A hit must still carry the
      // product's exact MODEL in the source record (adapters match on the model passed to them), so the SKU only widens the search.
      if (!r.error && !(r.candidates ?? []).length && p.sku && norm(p.sku) !== norm(p.model) && !/^HT-/i.test(p.sku)) {
        const bySku = await adapter.find({ ...p, model: p.sku });
        if ((bySku.candidates ?? []).length) {
          r = { ...bySku, candidates: bySku.candidates.map((c) => ({ ...c, matchEvidence: `${c.matchEvidence} (found by SKU ${p.sku}; model ${p.model} must be confirmed)`, official: c.official, skuOnly: true })) };
        } else r.searched = [...(r.searched ?? []), ...(bySku.searched ?? [])];
      }
      if (r.error) rec.notes.push(`${adapter.name}: ${r.error}`);
      rec.candidates.push(...(r.candidates ?? []));
      rec.searched.push(...(r.searched ?? []));
      if (!r.error && !(r.candidates ?? []).length) rec.notes.push(`${adapter.name}: exact model not found`);
    } else if (SOURCES.has("brand")) {
      rec.notes.push(`no automated official source for ${p.brand}${NO_ADAPTER_REASON[brand] ? ` — ${NO_ADAPTER_REASON[brand]}` : ""}`);
    }
    if (plan?.searchSet.has(p.id)) {
      if (!plan.manifestIds.has(p.id)) throw new Error(`refusing to search ${p.id}: not in the target manifest`); // defence in depth
      const r = await findSearchCandidates(p, { register, ledger: plan.ledger, cache: plan.cache, pass: plan.pass, retryFailed: plan.retryFailed });
      plan.stats.requests += r.requests; plan.stats.cacheHits += r.cacheHits;
      plan.stats.products.push({ id: p.id, brand: p.brand, model: p.model, requests: r.requests, cacheHits: r.cacheHits, results: r.totalResults ?? r.candidates.length, kept: r.candidates.length, exactModel: r.candidates.filter((c) => c.exactModel).length, error: r.error ?? null });
      rec.searched.push(...r.searched);
      rec.candidates.push(...r.candidates);
      rec.search = { provider: search.provider, pass: plan.pass, results: r.candidates.length, at: now() };
      if (r.error) rec.notes.push(`search: ${r.error}`);
      else if (!r.candidates.length) rec.notes.push("search: no results for the exact model");
      else if (!r.candidates.some((c) => c.exactModel)) rec.notes.push("search: results found, none shows the exact model");
    }
    rec.needsManualSource = !rec.candidates.length;
    prev[p.id] = rec;
  });
  if (!ONLY.length) { const keep = new Set(targets.map((t) => t.id)); for (const k of Object.keys(prev)) if (!keep.has(k)) delete prev[k]; } // products no longer pending
  save("candidates.json", prev);
  if (plan) await finishSearchRun(plan);
  const withCand = Object.values(prev).filter((r) => r.candidates.length).length;
  console.log(JSON.stringify({ targets: targets.length, productsWithCandidates: withCand, candidates: Object.values(prev).reduce((s, r) => s + r.candidates.length, 0) }));
}

/* ============================================================================ targets / quota / search scope */
const targetRows = (a) => a.products.filter((p) => TARGET.has(p.imageClass)).map((p) => ({ id: p.id, brand: p.brand, model: p.model, sku: p.sku ?? null, category: p.category ?? null, imageClass: p.imageClass, status: p.status ?? null }));

export function diffManifest(manifest, rows) {
  const before = new Map(manifest.products.map((p) => [p.id, p])), after = new Map(rows.map((p) => [p.id, p]));
  return {
    added: rows.filter((p) => !before.has(p.id)),
    removed: manifest.products.filter((p) => !after.has(p.id)),
    reclassified: rows.filter((p) => before.has(p.id) && before.get(p.id).imageClass !== p.imageClass).map((p) => ({ id: p.id, model: p.model, from: before.get(p.id).imageClass, to: p.imageClass })),
  };
}

/** Freezes the target set. Once a manifest exists, a different audit result is shown and refused until --accept-changes. */
async function targetsCmd() {
  const a = load("audit.json", null);
  if (!a) throw new Error("run audit first");
  const rows = targetRows(a), existing = load("target-manifest.json", null);
  const summary = (r) => Object.fromEntries(["NO_IMAGE", "PLACEHOLDER", "BROKEN"].map((k) => [k, r.filter((p) => p.imageClass === k).length]));
  if (existing) {
    const d = diffManifest(existing, rows);
    const changed = d.added.length + d.removed.length + d.reclassified.length;
    save("target-manifest-diff.json", { checkedAt: now(), auditedAt: a.auditedAt, manifestCreatedAt: existing.createdAt, ...d });
    if (!changed) { console.log(JSON.stringify({ manifest: existing.count, audit: rows.length, differences: 0, note: "audit matches the fixed manifest" })); return; }
    console.log(JSON.stringify({ manifest: existing.count, audit: rows.length, added: d.added.map((p) => `${p.id} (${p.brand} ${p.model}, ${p.imageClass})`), removed: d.removed.map((p) => `${p.id} (${p.brand} ${p.model})`), reclassified: d.reclassified }, null, 1));
    if (!argv.includes("--accept-changes")) { console.log("manifest NOT changed — review the differences above, then re-run `targets --accept-changes` to adopt them"); process.exitCode = 3; return; }
    save(`target-manifest.superseded-${stamp()}.json`, existing);
  }
  const manifest = { createdAt: now(), auditedAt: a.auditedAt, count: rows.length, byClass: summary(rows), note: "Only these products may be searched with the image search provider.", products: rows };
  save("target-manifest.json", manifest);
  console.log(JSON.stringify({ created: "target-manifest.json", count: rows.length, byClass: manifest.byClass }));
}

async function quota() {
  const ledger = openLedger(file("serpapi-ledger.json"), requestLimit());
  const account = await checkAccount();
  const failed = ledger.entries().filter((e) => e.status !== "ok").length;
  console.log(JSON.stringify({ account, ledger: { used: ledger.used, failed, limit: ledger.limit, remaining: ledger.remaining } }, null, 1));
}

/**
 * Search scope and budget for one discover run. Only products in the fixed target manifest are eligible; the
 * batch (--batch=N, products needing a new request) must fit both the SerpApi quota and the local request limit,
 * otherwise nothing is searched and a quota report is written.
 */
async function planSearch(a, targets, register) {
  const manifest = load("target-manifest.json", null);
  const stopWith = (reason, extra = {}) => { save("quota-report.json", { at: now(), stopped: true, reason, ...extra }); console.log(`search NOT run: ${reason} (quota-report.json)`); return { stop: true }; };
  if (!manifest) return stopWith("no target manifest — run `targets` first");
  const d = diffManifest(manifest, targetRows(a));
  if (d.added.length || d.removed.length || d.reclassified.length) return stopWith("the current audit differs from the target manifest — run `targets` to review", { differences: d });
  const manifestIds = new Set(manifest.products.map((p) => p.id));
  const outside = ONLY.filter((id) => !manifestIds.has(id));
  if (outside.length) return stopWith(`--only names products outside the manifest: ${outside.join(", ")}`);
  const pass = Number(arg("search-pass")) === 2 ? 2 : 1;
  const retryFailed = argv.includes("--retry-failed");
  const ledger = openLedger(file("serpapi-ledger.json"), requestLimit());
  const cache = openCache(file("serpapi-cache.json"));
  const { firstPassQuery, buildQueries } = await import("./search.mjs");
  const queriesFor = (p) => (pass === 1 ? [firstPassQuery(p)].filter(Boolean) : buildQueries(p, register).filter((q) => q.tier !== "other").map((q) => q.query));
  const peek = openCache(file("serpapi-cache.json")); // separate instance: counting here is not a reuse
  const eligible = targets.filter((p) => manifestIds.has(p.id) && p.singleModel);
  const needsRequest = (p) => queriesFor(p).filter((q) => !peek.get(q) && (retryFailed || !ledger.lastFor(q) || ledger.lastFor(q).status === "ok")).length;
  const cached = eligible.filter((p) => needsRequest(p) === 0);
  const batchSize = arg("batch") != null ? Math.max(0, Number(arg("batch")) || 0) : Infinity;
  const fresh = eligible.filter((p) => needsRequest(p) > 0).slice(0, batchSize);
  const needed = fresh.reduce((n, p) => n + needsRequest(p), 0);
  const accountBefore = await checkAccount();
  const decision = budgetDecision({ account: accountBefore, ledger, needed });
  if (!decision.allowed) return stopWith(decision.reason, { accountBefore, ledger: { used: ledger.used, limit: ledger.limit }, needed, manifest: manifest.count });
  console.log(`quota: ${decision.apiLeft} SerpApi searches left this month · ledger ${ledger.used}/${ledger.limit} · this batch needs ${needed}`);
  return { pass, retryFailed, ledger, cache, manifestIds, needed, accountBefore, searchSet: new Set([...cached, ...fresh].map((p) => p.id)),
    stats: { requests: 0, cacheHits: 0, products: [] }, manifestCount: manifest.count, eligible: eligible.length };
}

async function finishSearchRun(plan) {
  const accountAfter = await checkAccount();
  const outsideManifest = plan.stats.products.filter((p) => !plan.manifestIds.has(p.id)).length;
  const run = { at: now(), pass: plan.pass, manifest: plan.manifestCount, eligible: plan.eligible, searchedProducts: plan.stats.products.length,
    requestsMade: plan.stats.requests, cachedResultsReused: plan.stats.cacheHits, ledgerUsed: plan.ledger.used, ledgerLimit: plan.ledger.limit,
    accountBefore: plan.accountBefore, accountAfter, outsideManifestSearched: outsideManifest, products: plan.stats.products };
  const runs = load("search-runs.json", []);
  runs.push(run);
  save("search-runs.json", runs);
  console.log(JSON.stringify({ ...run, products: undefined }));
}

/* ============================================================================ verify */
/** Cached copies from earlier verify runs: image URL → cache file. Re-verification reuses them instead of downloading again. */
function cachedImages() {
  const m = new Map();
  for (const v of Object.values(load("verify.json", {}))) for (const r of v.results ?? []) if (r.image?.url && r.cacheFile && existsSync(path.join(ROOT, r.cacheFile))) m.set(r.image.url, path.join(ROOT, r.cacheFile));
  return m;
}
let CACHED;

async function fetchCandidateImage(img, c = {}, register = {}) {
  CACHED ??= cachedImages();
  if (img.url && CACHED.has(img.url)) return { buf: readFileSync(CACHED.get(img.url)), servedType: "", fromCache: true };
  if (c.adapter === "serpapi") { // arbitrary third-party hosts: SSRF-safe download, terms and robots.txt respected
    const prohibited = automatedAccessProhibited(register, [c.sourcePage, img.url]);
    if (prohibited) return { error: `not downloaded: ${prohibited} terms prohibit automated access`, notDownloaded: true };
    // No copy of a third-party image is made without documented commercial-use authorization: judged from metadata only.
    const perm = resolvePermission(register, { sourcePage: c.sourcePage, imageUrl: img.url, root: ROOT });
    if (perm.status !== "confirmed") return { error: `not downloaded: no documented commercial-use authorization (${perm.status})`, notDownloaded: true };
    if (argv.includes("--no-download")) return { error: "not downloaded: --no-download", notDownloaded: true };
    if (!(await robotsAllowed(img.url).catch(() => false))) return { error: "not downloaded: disallowed by robots.txt", notDownloaded: true };
    let r;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await safeFetchImage(img.url, { timeoutMs: Number(process.env.IMAGE_DOWNLOAD_TIMEOUT_MS) || 20_000, maxBytes: Number(process.env.IMAGE_MAX_DOWNLOAD_BYTES) || 15 * 1024 * 1024 });
      if (r.ok || !r.retryable) break;
      await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt));
    }
    return r.ok ? { buf: r.buffer, servedType: r.contentType } : { error: r.reason };
  }
  if (img.file) {
    if (!existsSync(img.file)) return { error: `local file missing: ${path.relative(ROOT, img.file)}` };
    return { buf: readFileSync(img.file), servedType: "" };
  }
  if (argv.includes("--no-download") && c.adapter !== "serpapi") return { error: "not downloaded: --no-download", notDownloaded: true };
  const r = await get(img.requiresContentToken ? withContentToken(img.url) : img.url, { accept: "image/avif,image/webp,image/*;q=0.9,*/*;q=0.5", checkRobots: !img.requiresContentToken }); // token added in memory only
  if (!r.ok) return { error: r.error ?? `HTTP ${r.status}` };
  return { buf: r.body, servedType: (r.headers["content-type"] || "").toLowerCase() };
}

async function verify() {
  const cands = load("candidates.json", null);
  if (!cands) throw new Error("run discover first");
  const decisions = load("review-decisions.json", {}); // manual visual review: { productId: { decision: "approve"|"reject", image?, note } }
  // A targeted run (--only) keeps the other products' results; a full run starts fresh so stale entries disappear.
  const out = ONLY.length ? load("verify.json", {}) : {};
  const usedBy = new Map(); // image sha -> product ids (a source image chosen for several different models is suspicious)
  const entries = Object.values(cands).filter((r) => r.candidates.length && (!ONLY.length || ONLY.includes(r.id)));
  const register = load("permissions.json", { holders: {} });
  const facts = new Map((load("audit.json", { products: [] }).products).map((p) => [p.id, p]));
  const vision = argv.includes("--no-vision") ? { unavailable: "--no-vision" } : await createVisionProvider();
  console.log(`verify: ${entries.length} products with candidates · AI ranking: ${vision.unavailable ? `off (${vision.unavailable})` : `${vision.name} (advisory only)`}`);
  await pool(entries, 3, async (rec) => {
    const results = [];
    for (const c of rec.candidates) {
      const img = c.images[0]; // the source's primary (first) gallery image
      if (!img) { results.push({ ...c, confidence: "REJECT", reasons: ["source record has no image"] }); continue; }
      const got = await fetchCandidateImage(img, c, register);
      if (got.error && got.notDownloaded && c.adapter === "serpapi") { // metadata-only: exact model from the source record, file not checked
        const conflict = filenameModelConflict(rec.model, img.url) ?? filenameModelConflict(rec.model, c.sourcePage);
        const reasons = [`${String(c.sourceType).replace(/_/g, " ")} source (via search): ${c.matchEvidence}`, got.error];
        let confidence = "UNCERTAIN";
        if (!c.exactModel) { confidence = "REJECT"; reasons.push("exact model not established"); }
        else if (conflict) { confidence = "REJECT"; reasons.push(`file or page is named after a different model (${conflict})`); }
        results.push({ ...c, image: img, inspection: null, metadataOnly: true, confidence, reasons });
        continue;
      }
      if (got.error && argv.includes("--no-download") && !img.file) { results.push({ ...c, image: img, inspection: null, metadataOnly: true, confidence: "UNCERTAIN", reasons: ["not re-checked: --no-download"] }); continue; }
      if (got.error) { results.push({ ...c, image: img, confidence: "REJECT", reasons: [got.error] }); continue; }
      const info = await inspect(got.buf, got.servedType);
      const cacheFile = info.sha256 ? path.join(CACHE, `${info.sha256}.${info.kind}`) : null;
      if (cacheFile && !existsSync(cacheFile)) writeFileSync(cacheFile, got.buf);
      const reasons = [];
      let confidence;
      if (!info.ok) { confidence = "REJECT"; reasons.push(info.reason); }
      else if (c.decision === "REJECTED") { confidence = "REJECT"; reasons.push(`visual review: ${c.reviewNote}`); }
      else if (c.adapter === "serpapi") {
        if (c.sourceType === "manufacturer" && c.exactModel) { confidence = "HIGH"; reasons.push(`manufacturer site (via search): ${c.matchEvidence}`); }
        else if (c.exactModel) { confidence = "UNCERTAIN"; reasons.push(`${c.sourceType.replace(/_/g, " ")} source (via search): ${c.matchEvidence} — confirm the exact model and commercial authorization`); }
        else { confidence = "UNCERTAIN"; reasons.push(`search result: ${c.matchEvidence}`); }
      }
      else if (c.adapter === "icecat") {
        if (c.exactModel) { confidence = "HIGH"; reasons.push(`Open Icecat: ${c.matchEvidence} (Icecat id ${c.icecatId})`); }
        else { confidence = "UNCERTAIN"; reasons.push(`Open Icecat: ${c.matchEvidence} (Icecat id ${c.icecatId})`); }
      }
      else if (c.decision === "FAMILY_IMAGE") { confidence = "REJECT"; reasons.push(`series photo shared by several capacities: ${c.reviewNote}`); }
      else if (c.adapter === "catalogue-pdf") {
        confidence = "UNCERTAIN"; // a person must still compare the photo with the product; the catalogue is not permission
        reasons.push(c.exactModel ? `exact model, unambiguous catalogue layout (p.${c.catalogue.page}) — awaiting admin visual review` : `catalogue match needs review: ${c.reviewNote}`);
      }
      else if (c.adapter === "supplier-catalogue") {
        if (c.decision === "VERIFIED") { confidence = "HIGH"; reasons.push(`exact model on its own catalogue page; visual review: ${c.reviewNote}`); }
        else { confidence = "UNCERTAIN"; reasons.push("supplier catalogue image awaiting visual review"); }
      } else if (c.adapter === "reviewed-manifest") {
        if (c.decision === "VERIFIED") { confidence = "HIGH"; reasons.push(`approved in earlier manual review (${c.sourceType})`); }
        else { confidence = "UNCERTAIN"; reasons.push(`earlier review left this as ${c.decision}`); }
      } else if (c.skuOnly) { confidence = "UNCERTAIN"; reasons.push(`found by SKU only — the source record does not show the model ${rec.model}`); }
      else if (c.official && c.matchEvidence?.startsWith("exact model")) { confidence = "HIGH"; reasons.push(`official ${c.adapter}: ${c.matchEvidence}`); }
      else { confidence = "UNCERTAIN"; reasons.push("source not official or model not exact"); }
      if (info.ok && info.servedTypeMatches === false) reasons.push(`served as ${got.servedType}, bytes are ${info.kind}`);
      const conflict = img.url ? filenameModelConflict(rec.model, img.url) : null;
      if (conflict && confidence === "HIGH") { confidence = "UNCERTAIN"; reasons.push(`image file is named after a different model (${conflict}) — confirm it shows ${rec.model}`); }
      let aiAssessment = null;
      if (info.ok && !vision.unavailable && confidence !== "REJECT") { // advisory: adds notes for the reviewer, never raises confidence
        const f = facts.get(rec.id) ?? {};
        aiAssessment = await vision.assess(got.buf, { brand: rec.brand, model: rec.model, name: f.name, category: f.category });
        for (const flag of assessmentFlags(aiAssessment)) reasons.push(flag);
        if (aiAssessment?.score != null) reasons.push(`AI score ${aiAssessment.score}/100 (advisory)`);
      }
      results.push({ ...c, image: img, inspection: info, cacheFile: cacheFile ? path.relative(ROOT, cacheFile) : null, confidence, reasons, aiAssessment });
      if (info.sha256) (usedBy.get(info.sha256) ?? usedBy.set(info.sha256, new Set()).get(info.sha256)).add(rec.id);
    }
    out[rec.id] = { id: rec.id, brand: rec.brand, model: rec.model, verifiedAt: now(), results };
  });
  for (const v of Object.values(out)) for (const r of v.results) if (r.inspection?.sha256) (usedBy.get(r.inspection.sha256) ?? usedBy.set(r.inspection.sha256, new Set()).get(r.inspection.sha256)).add(v.id);
  // Without a download, the same image URL offered for different models identifies a generic series image.
  const byUrl = new Map();
  for (const v of Object.values(out)) for (const r of v.results) if (r.metadataOnly && r.image?.url) (byUrl.get(norm(r.image.url)) ?? byUrl.set(norm(r.image.url), new Set()).get(norm(r.image.url))).add(v.id);
  for (const v of Object.values(out)) for (const r of v.results) {
    if (!r.metadataOnly || !r.image?.url || r.confidence === "REJECT") continue;
    const others = [...(byUrl.get(norm(r.image.url)) ?? [])].filter((o) => o !== v.id && norm(out[o]?.model) !== norm(v.model));
    if (others.length) { r.confidence = "REJECT"; r.reasons.push(`series image: the same image is offered for ${others.map((o) => out[o]?.model).join(", ")}`); }
  }
  for (const v of Object.values(out)) {
    for (const r of v.results) {
      const owners = r.inspection?.sha256 ? [...(usedBy.get(r.inspection.sha256) ?? [])].filter((x) => x !== v.id) : [];
      // Series photo: the same image bytes are the candidate for other products with a different model → ambiguous, rejected.
      const otherModels = owners.filter((o) => norm(out[o]?.model) !== norm(v.model));
      if (otherModels.length && r.confidence !== "REJECT") { r.confidence = "REJECT"; r.reasons.push(`series photo: the same image is the candidate for ${otherModels.length} other model(s) (${otherModels.map((o) => out[o]?.model).join(", ")})`); }
      else if (owners.length && r.confidence === "HIGH" && r.adapter !== "reviewed-manifest") { r.confidence = "UNCERTAIN"; r.reasons.push(`same image is the candidate for other products: ${owners.join(", ")}`); }
    }
    const d = decisions[v.id];
    const ranked = rankResults(v.results);
    let chosen = ranked[0] ?? null;
    if (d?.decision === "reject") { v.results.forEach((r) => { if (!d.image || r.image?.url === d.image || r.image?.file === d.image) { r.confidence = "REJECT"; r.reasons.push(`manual review: ${d.note}`); } }); chosen = ranked.find((r) => r.confidence !== "REJECT") ?? ranked[0]; }
    v.decision = d ?? null;
    v.chosen = chosen;
    v.confidence = chosen?.confidence ?? "REJECT";
    // HIGH candidates still need a person to look at the picture: until approved they are "HIGH (awaiting visual review)".
    v.visuallyReviewed = d?.decision === "approve";
  }
  save("verify.json", out);
  const t = (c) => Object.values(out).filter((v) => v.confidence === c).length;
  console.log(JSON.stringify({ HIGH: t("HIGH"), UNCERTAIN: t("UNCERTAIN"), REJECT: t("REJECT"), highVisuallyApproved: Object.values(out).filter((v) => v.confidence === "HIGH" && v.visuallyReviewed).length }));
  await contactSheet(out);
}

/** Rules first (confidence, official source, source priority); the advisory AI score only breaks ties. */
function rankResults(results) {
  const conf = (r) => ["HIGH", "UNCERTAIN", "REJECT"].indexOf(r.confidence);
  return [...results].sort((a, b) => conf(a) - conf(b) || (b.official ? 1 : 0) - (a.official ? 1 : 0)
    || (SOURCE_PRIORITY[a.sourceType] ?? 1) - (SOURCE_PRIORITY[b.sourceType] ?? 1) || (b.aiAssessment?.score ?? -1) - (a.aiAssessment?.score ?? -1));
}

async function contactSheet(out) {
  const sharp = require("sharp");
  const rows = Object.values(out).filter((v) => v.chosen?.cacheFile && v.confidence !== "REJECT").sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));
  const cell = 220, cols = 6, labelH = 46;
  for (let page = 0; page * 48 < rows.length; page++) {
    const slice = rows.slice(page * 48, page * 48 + 48);
    const composites = [];
    for (const [i, v] of slice.entries()) {
      const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + labelH);
      const thumb = await sharp(path.resolve(ROOT, v.chosen.cacheFile)).resize(cell - 10, cell - 10, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer();
      composites.push({ input: thumb, left: x + 5, top: y + 5 });
      const esc = (s) => String(s).replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]);
      const svg = `<svg width="${cell}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><text x="4" y="15" font-size="12" font-family="Arial" font-weight="bold">${esc(`${page * 48 + i + 1}. ${v.brand}`.slice(0, 30))}</text><text x="4" y="30" font-size="12" font-family="Arial">${esc(String(v.model).slice(0, 32))}</text><text x="4" y="43" font-size="11" font-family="Arial" fill="${v.confidence === "HIGH" ? "#0a7d2c" : "#b25b00"}">${esc(`${v.confidence} · ${v.chosen.adapter}`.slice(0, 34))}</text></svg>`;
      composites.push({ input: Buffer.from(svg), left: x, top: y + cell });
    }
    const h = Math.ceil(slice.length / cols) * (cell + labelH);
    await sharp({ create: { width: cols * cell, height: h, channels: 3, background: "#ffffff" } }).composite(composites).png().toFile(file(`review-sheet-${page + 1}.png`));
  }
  writeCsv("review-sheet-index.csv", rows.map((v, i) => ({ n: i + 1, id: v.id, brand: v.brand, model: v.model, confidence: v.confidence, adapter: v.chosen.adapter, sourcePage: v.chosen.sourcePage, image: v.chosen.image?.url ?? v.chosen.image?.file ?? "", reasons: v.chosen.reasons })));
}

/* ============================================================================ catalogue */
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]);

/**
 * Catalogue PDF → candidates. Read-only for products, images and storage: everything is written under
 * work/product-image-pipeline/catalogue/<brand>/ and catalogue-candidates.json.
 */
async function catalogue() {
  const pdf = arg("pdf"), brand = arg("brand");
  if (!pdf || !brand) throw new Error('usage: catalogue --pdf=catalogues-source/<file>.pdf --brand="Super General"');
  const pdfPath = path.resolve(ROOT, pdf);
  if (!existsSync(pdfPath)) throw new Error(`catalogue PDF not found: ${pdf}`);
  const dir = file(`catalogue/${slugify(brand)}`);
  mkdirSync(dir, { recursive: true });
  const py = path.join(ROOT, "scripts/product-images/catalogue_extract.py");
  console.log(execFileSync("python3", [py, "index", pdfPath, dir, ...(argv.includes("--force") ? ["--force"] : [])], { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 26 }).toString().trim());
  const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8"));
  const a = load("audit.json", null);
  if (!a) throw new Error("run audit first");
  const products = await withDb((P) => P.find({ brand: new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }, { projection: { _id: 0, id: 1, name: 1, brand: 1, model: 1, sku: 1, category: 1, status: 1, images: 1 } }).toArray()); // read-only
  const targets = new Set(a.products.filter((p) => TARGET.has(p.imageClass)).map((p) => p.id));
  const result = matchCatalogue(index, products, targets);

  // Crops: page renders for every candidate (provenance + fallback); embedded assets used where the photo is one masked image.
  const reqs = result.candidates.map((c) => ({ id: sha256(`${c.page}|${c.cropBox.join(",")}|${c.renderDpi}`).slice(0, 20), page: c.page, box: c.cropBox, dpi: c.renderDpi }));
  result.candidates.forEach((c, i) => { c.cropId = reqs[i].id; });
  const uniq = [...new Map(reqs.map((r) => [r.id, r])).values()];
  writeFileSync(path.join(dir, "crop-requests.json"), JSON.stringify(uniq));
  if (uniq.length) execFileSync("python3", [py, "crop", pdfPath, path.join(dir, "crop-requests.json"), dir], { stdio: ["ignore", "pipe", "inherit"] });
  const sharp = require("sharp");
  mkdirSync(path.join(dir, "previews"), { recursive: true });
  mkdirSync(path.join(dir, "highlights"), { recursive: true });
  for (const c of result.candidates) {
    c.pageRender = `catalogue/${slugify(brand)}/crops/${c.cropId}.png`;
    let src = readFileSync(path.join(dir, "crops", `${c.cropId}.png`));
    if (c.cropSource === "embedded-asset") src = await sharp(readFileSync(path.join(dir, c.asset))).trim({ threshold: 8 }).flatten({ background: "#ffffff" }).png().toBuffer();
    c.sourceSha256 = sha256(src);
    const extracted = path.join(dir, "previews", `${c.sourceSha256.slice(0, 24)}.source.png`);
    if (!existsSync(extracted)) writeFileSync(extracted, src); // full-resolution extracted image (verify + upload use this)
    c.extracted = path.relative(STATE, extracted);
    const opt = await optimise(src);
    const prev = path.join(dir, "previews", `${opt.sha256.slice(0, 24)}.webp`);
    if (!existsSync(prev)) writeFileSync(prev, opt.buffer);
    c.preview = path.relative(STATE, prev); c.previewSha256 = opt.sha256; c.previewSize = [opt.width, opt.height]; c.fittedSize = [opt.fittedWidth, opt.fittedHeight];
    // Page preview with the crop (orange) and the model evidence (green) outlined.
    const pg = index.pages[c.page - 1], k = pg.previewDpi / 72;
    const meta = await sharp(path.join(dir, pg.preview)).metadata();
    const rect = (b, color) => `<rect x="${b[0] * k}" y="${b[1] * k}" width="${(b[2] - b[0]) * k}" height="${(b[3] - b[1]) * k}" fill="none" stroke="${color}" stroke-width="4"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${rect(c.cropBox, "#f97316")}${rect(c.evidence.box, "#16a34a")}</svg>`;
    const hl = path.join(dir, "highlights", `${sha256(`${c.cropId}|${c.evidence.box.join(",")}`).slice(0, 20)}.jpg`);
    if (!existsSync(hl)) await sharp(path.join(dir, pg.preview)).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 80 }).toFile(hl);
    c.highlight = path.relative(STATE, hl);
  }
  const register = load("permissions.json", { holders: {} });
  const perm = resolvePermission(register, { sourcePage: `${index.pdf} p.1`, root: ROOT });
  const byProduct = {};
  for (const c of result.candidates) (byProduct[c.productId] ??= []).push({ ...c, permission: { status: perm.status, holder: perm.holder, reason: perm.reason } });
  save("catalogue-candidates.json", { generatedAt: now(), pdf: index.pdf, pdfSha256: index.pdfSha256, brand, pages: index.pageCount, ocr: index.ocr, permission: perm, products: byProduct });
  const summary = writeCatalogueReport({ index, products, targets, result, perm, brand });
  console.log(JSON.stringify(summary, null, 1));
}

function writeCatalogueReport({ index, products, targets, result, perm, brand }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const tgt = products.filter((p) => targets.has(p.id));
  const exactTargets = tgt.filter((p) => (result.occurrences[p.id] ?? []).some((o) => o.level === "IDENTICAL" || o.level === "CASE_SPACE"));
  const nativePages = index.pages.filter((p) => p.nativeChars > 200).length;
  const summary = {
    pdf: index.pdf, pagesProcessed: index.pages.length, pagesWithNativeText: nativePages, pagesNeedingOcr: index.pages.length - nativePages,
    catalogueModelsIdentified: Object.keys(result.inventory).length, brandProducts: products.length, targetProducts: tgt.length,
    targetsWithExactModelMatch: exactTargets.length, candidates: result.candidates.length,
    exactUnambiguousIdentity: result.candidates.filter((c) => c.identity === "EXACT_UNAMBIGUOUS").length, lowResolution: result.candidates.filter((c) => c.quality === "LOW_RESOLUTION").length,
    eligible: result.candidates.filter((c) => c.eligible).length, sharedImage: result.candidates.filter((c) => c.identity === "SHARED_IMAGE").length,
    needsReview: result.candidates.filter((c) => c.identity === "NEEDS_REVIEW").length, embeddedAssets: result.candidates.filter((c) => c.cropSource === "embedded-asset").length,
    pageRenders: result.candidates.filter((c) => c.cropSource === "page-render").length, flags: result.flags.length,
    targetsNotInCatalogue: result.missingTargets.length, catalogueModelsNotInDatabase: result.unmatchedCatalogueModels.length,
    authorization: `${perm.status}${perm.holder ? ` (${perm.holder})` : ""}`, databaseWrites: 0, storageWrites: 0,
  };
  const rel = (f) => path.relative(STATE, path.join(STATE, f));
  const L = [`# ${brand} catalogue image extraction`, ``, `Generated ${now()} · \`${index.pdf}\` (sha256 ${index.pdfSha256.slice(0, 12)}…) · OCR: ${index.ocr ?? "none"}`, ``, `| Measure | Value |`, `|---|---|`, ...Object.entries(summary).map(([k, v]) => `| ${k} | ${v} |`), ``,
    `Commercial-use authorization: **${perm.status}** — ${perm.reason}. An official catalogue is not a licence to reuse its images; no candidate can be uploaded until documented authorization is recorded and an admin approves it.`, ``,
    `## Candidates (target products)`, ``, `| Product | Model | Page | Evidence | Status | Issues | Crop | Preview | Page with crop |`, `|---|---|---|---|---|---|---|---|---|`];
  for (const c of result.candidates) L.push(`| ${esc(byId.get(c.productId)?.name)} | ${c.model} | ${c.page} | "${esc(c.evidence.text)}" (${c.evidence.source}, conf ${c.evidence.ocrConfidence}, ${c.evidence.level}) | **${c.status}** | ${esc(c.issues.join("; ")) || "—"} | ${c.cropSource} [${c.cropBox.join(", ")}] | \`${c.preview}\` | \`${c.highlight}\` |`);
  L.push(``, `## Target products not found in the catalogue (${result.missingTargets.length})`, ``);
  for (const n of result.nearMisses) L.push(`- ${byId.get(n.productId)?.name} — \`${n.model}\`${n.similar.length ? ` · similar catalogue codes (NOT matched): ${n.similar.join(", ")}` : ""}`);
  L.push(``, `## Flags`, ``, ...(result.flags.length ? result.flags.map((f) => `- ${f.type}: ${f.model} (catalogue "${f.found ?? ""}", p.${f.page})`) : ["None."]));
  L.push(``, `## Non-target products also found in the catalogue (information only, no candidates)`, ``);
  for (const p of products.filter((x) => !targets.has(x.id) && (result.occurrences[x.id] ?? []).some((o) => o.level === "IDENTICAL" || o.level === "CASE_SPACE"))) L.push(`- ${p.model} — pages ${[...new Set(result.occurrences[p.id].map((o) => o.page))].join(", ")} (${(p.images ?? []).length} image(s) on record)`);
  L.push(``, `## Catalogue models not in the database (${result.unmatchedCatalogueModels.length})`, ``, result.unmatchedCatalogueModels.sort().join(", "), ``);
  writeFileSync(file("catalogue-report.md"), L.join("\n") + "\n");
  // HTML contact sheet for visual review (local file; images referenced relative to the state directory).
  const cards = result.candidates.map((c) => `<div class="card ${c.eligible ? "ok" : "hold"}"><h3>${esc(byId.get(c.productId)?.name)}</h3><p><b>${esc(c.model)}</b> · ${esc(index.pdf)} p.${c.page} · <b>${c.status}</b></p>
<p>Evidence: “${esc(c.evidence.text)}” (${c.evidence.source}, conf ${c.evidence.ocrConfidence}, ${c.evidence.level}) · row: ${esc(c.rowModels.join(", "))}</p>${c.issues.length ? `<p class="iss">${esc(c.issues.join(" · "))}</p>` : ""}
<p>Authorization: ${esc(perm.status)} (${esc(perm.holder ?? "no holder")})</p><div class="imgs"><figure><img src="${esc(rel(c.preview))}"><figcaption>extracted (${c.cropSource}) 800×800, fitted ${c.fittedSize.join("×")}</figcaption></figure><figure><img src="${esc(rel(c.highlight))}"><figcaption>page ${c.page}: crop (orange), model (green)</figcaption></figure></div></div>`).join("\n");
  writeFileSync(file("catalogue-report.html"), `<!doctype html><meta charset="utf-8"><title>${esc(brand)} catalogue candidates</title><style>body{font:14px system-ui;margin:24px;background:#f8fafc}.card{background:#fff;border:2px solid #e2e8f0;border-radius:12px;padding:12px;margin:12px 0}.ok{border-color:#16a34a}.hold{border-color:#f59e0b}.imgs{display:flex;gap:12px;flex-wrap:wrap}img{max-width:420px;max-height:560px;border:1px solid #cbd5e1;background:#fff}.iss{color:#b45309}h3{margin:0 0 4px}</style><h1>${esc(brand)} catalogue candidates</h1><p>${esc(JSON.stringify(summary))}</p>${cards}`);
  return summary;
}

/* ============================================================================ pilot */
/** A small, varied trial set: round-robin across brands, preferring categories not yet picked. */
export function pickPilot(products, size) {
  const byBrand = new Map();
  for (const p of [...products].sort((a, b) => a.id.localeCompare(b.id))) (byBrand.get(p.brand.trim().toUpperCase()) ?? byBrand.set(p.brand.trim().toUpperCase(), []).get(p.brand.trim().toUpperCase())).push(p);
  const brands = [...byBrand.keys()].sort((a, b) => byBrand.get(b).length - byBrand.get(a).length || a.localeCompare(b));
  const picked = [], cats = new Set();
  while (picked.length < size && brands.some((b) => byBrand.get(b).length)) {
    for (const b of brands) {
      const list = byBrand.get(b);
      if (!list.length || picked.length >= size) continue;
      const i = Math.max(0, list.findIndex((p) => !cats.has(p.category ?? "")));
      const [p] = list.splice(i, 1);
      picked.push(p);
      cats.add(p.category ?? "");
    }
  }
  return picked;
}

async function pilot() {
  const a = load("audit.json", null);
  if (!a) throw new Error("run audit first");
  const size = Math.min(20, Math.max(10, Number(arg("size")) || 15));
  const pool_ = a.products.filter((p) => TARGET.has(p.imageClass) && p.singleModel && (!ONLY.length || ONLY.includes(p.id)));
  const picked = pickPilot(pool_, size);
  save("pilot.json", { createdAt: now(), auditedAt: a.auditedAt, size: picked.length, ids: picked.map((p) => p.id), products: picked.map((p) => ({ id: p.id, brand: p.brand, model: p.model, category: p.category, status: p.status, imageClass: p.imageClass })) });
  console.log(JSON.stringify({ pilot: picked.length, brands: new Set(picked.map((p) => p.brand)).size, categories: new Set(picked.map((p) => p.category)).size, products: picked.map((p) => `${p.brand} ${p.model} [${p.category}] ${p.imageClass}`) }, null, 1));
}

/* ============================================================================ review-import */
/** Builds review-queue records from discovery + verification. Never "approved": that is a human decision. */
export function buildReviewRecords({ targets, candidates, verified, register, perProduct, root = ROOT, at = now() }) {
  const records = [];
  for (const p of targets) {
    const product = { name: p.name, brand: p.brand, model: p.model, sku: p.sku, category: p.category ?? undefined, status: p.status ?? null, images: p.images ?? [] };
    const base = { productId: p.id, product, version: 1, history: [] };
    const found = candidates[p.id]?.candidates ?? [];
    const v = verified[p.id];
    if (found.length && !v) {
      records.push({ ...base, reviewId: `${p.id}:source`, state: "discovered", rank: 0, candidate: { checks: [`${found.length} candidate(s) found, not verified yet — run verify`] } });
      continue;
    }
    const results = rankResults(v?.results ?? []).filter((r) => r.confidence !== "REJECT").slice(0, perProduct);
    if (!results.length) {
      const rejected = (v?.results ?? []).length;
      const why = [...(candidates[p.id]?.notes ?? []), ...(rejected ? [`${rejected} candidate(s) rejected in verification`] : [])].join("; ") || "no source searched yet";
      records.push({ ...base, reviewId: `${p.id}:source`, state: "needs_manual_source", rank: 0, candidate: { checks: [why] },
        history: [{ at, by: "pipeline", from: "discovered", to: "needs_manual_source", note: why.slice(0, 300) }] });
      continue;
    }
    results.forEach((r, i) => {
      const url = r.image?.url ?? undefined;
      const perm = resolvePermission(register, { productId: p.id, sourcePage: r.sourcePage, sourceImageUrl: r.sourceImageUrl, imageUrl: url, root });
      const exact = r.exactModel === true || /^exact model/.test(r.matchEvidence ?? "") || r.decision === "VERIFIED";
      const candidate = {
        url, sourcePage: r.sourcePage, sourceType: r.sourceType ?? (r.official ? "manufacturer" : r.adapter), title: r.title, searchQuery: r.searchQuery,
        discoveredAt: r.discoveredAt ?? candidates[p.id]?.discoveredAt, width: r.inspection?.width ?? r.reportedWidth ?? undefined, height: r.inspection?.height ?? r.reportedHeight ?? undefined, format: r.inspection?.kind,
        sha256: r.inspection?.sha256, technicallyValid: r.inspection ? !!r.inspection.ok : undefined, technicalIssue: r.inspection ? r.inspection.reason ?? null : "file not downloaded (no documented authorization yet)",
        modelEvidence: exact ? r.matchEvidence : null, aiAssessment: r.aiAssessment ?? null,
        permissionStatus: perm.status, permissionReason: perm.reason,
        licenceEvidence: (perm.evidence ?? []).slice(0, 5).map((e) => ({ url: e.url, document: e.document, quote: e.quote?.slice(0, 300), finding: e.finding })),
        cacheFile: r.cacheFile ?? null, checks: [...(r.reasons ?? []), ...(!url && !r.catalogue ? [`local file only (${r.image?.file ? path.relative(root, r.image.file) : "unknown"}) — cannot be shown or approved in the admin queue`] : [])],
        ...(r.catalogue ? { catalogue: r.catalogue, localPreview: r.catalogue.preview, pagePreview: r.catalogue.highlight } : {}),
      };
      records.push({ ...base, reviewId: `${p.id}:${sha256(url ?? r.cacheFile ?? r.sourcePage ?? String(i)).slice(0, 24)}`, state: initialState(candidate), rank: i, candidate,
        history: [{ at, by: "pipeline", from: "discovered", to: initialState(candidate), note: r.confidence }] });
    });
  }
  return records;
}

async function reviewImport() {
  const a = load("audit.json", null);
  if (!a) throw new Error("run audit first");
  const targets = a.products.filter((p) => TARGET.has(p.imageClass) && (!ONLY.length || ONLY.includes(p.id)));
  const records = buildReviewRecords({ targets, candidates: load("candidates.json", {}), verified: load("verify.json", {}), register: load("permissions.json", { holders: {} }), perProduct: searchConfig().perProduct });
  const byState = {};
  for (const r of records) byState[r.state] = (byState[r.state] ?? 0) + 1;
  save("reviews-preview.json", { generatedAt: now(), products: targets.length, byState, records });
  writeCsv("reviews-preview.csv", records.map((r) => ({ productId: r.productId, brand: r.product.brand, model: r.product.model, state: r.state, rank: r.rank, sourceType: r.candidate.sourceType ?? "", sourcePage: r.candidate.sourcePage ?? "", image: r.candidate.url ?? "", dims: r.candidate.width ? `${r.candidate.width}x${r.candidate.height}` : "", valid: r.candidate.technicallyValid ?? "", modelEvidence: r.candidate.modelEvidence ?? "", permission: r.candidate.permissionStatus ?? "", aiScore: r.candidate.aiAssessment?.score ?? "", checks: r.candidate.checks ?? [] })));
  const ageHours = (Date.now() - new Date(a.auditedAt).getTime()) / 36e5;
  if (!EXECUTE) { console.log(JSON.stringify({ preview: "reviews-preview.json", products: targets.length, records: records.length, byState, auditAgeHours: Math.round(ageHours), databaseWrites: 0 })); return; }
  if (ageHours > 24 && !argv.includes("--allow-stale-audit")) throw new Error(`audit is ${Math.round(ageHours)}h old — re-run audit, discover, verify first (or pass --allow-stale-audit)`);
  const run = `import-${stamp()}-${randomBytes(4).toString("hex")}`; // unique even for two runs in one second
  const result = await withDb(async (P, db) => {
    const col = db.collection(REVIEW_COLLECTION);
    // Snapshot the queue as it is now (empty on first initialisation) and the product fields we promise not to touch.
    mkdirSync(file("backups"), { recursive: true });
    const existing = await col.find({}, { projection: { _id: 0 } }).toArray();
    const productFacts = await P.find({ id: { $in: targets.map((t) => t.id) } }, { projection: { _id: 0, id: 1, status: 1, price: 1, stockCount: 1, inStock: 1, images: 1, updatedAt: 1 } }).toArray();
    writeFileSync(file(`backups/review-${run}.json`), JSON.stringify({ run, takenAt: now(), reviewsBefore: existing, productFactsBefore: productFacts, records }, null, 1));
    await ensureReviewIndexes(col);
    const imported = await importDiscoveredReviews(col, records, now(), run);
    const after = await P.find({ id: { $in: targets.map((t) => t.id) } }, { projection: { _id: 0, id: 1, status: 1, price: 1, stockCount: 1, inStock: 1, images: 1, updatedAt: 1 } }).toArray();
    return { ...imported, productsUnchanged: JSON.stringify(after) === JSON.stringify(productFacts) };
  });
  console.log(JSON.stringify({ run, imported: result, byState, undo: `review-rollback --run=${run} --execute` }));
}

async function reviewRollback() {
  const run = arg("run");
  if (!run) throw new Error("pass --run=<import id> (printed by review-import --execute, also in backups/review-import-*.json)");
  const r = await withDb((_, db) => removeImportRun(db.collection(REVIEW_COLLECTION), run, EXECUTE));
  console.log(JSON.stringify({ run, ...r, note: EXECUTE ? "records nobody acted on were deleted; products are never touched" : "preview only — re-run with --execute" }));
}

/* ============================================================================ dry-run */
async function dryRun() {
  const v = load("verify.json", null);
  if (!v) throw new Error("run verify first");
  const config = supabaseConfig();
  const register = load("permissions.json", { holders: {} });
  const pendingNow = new Set(load("audit.json").products.filter((p) => TARGET.has(p.imageClass)).map((p) => p.id));
  // Admin-approved reviews (exact model + recorded authorization) — one per product per run, best rank first. Read-only.
  const approvedAll = await withDb((_, db) => db.collection(REVIEW_COLLECTION).find({ state: "approved", ...(ONLY.length ? { productId: { $in: ONLY } } : {}) }, { projection: { _id: 0 } }).sort({ productId: 1, rank: 1 }).toArray());
  const approvedFirst = new Map(); for (const r of approvedAll) if (!approvedFirst.has(r.productId)) approvedFirst.set(r.productId, r);
  const high = Object.values(v).filter((x) => x.confidence === "HIGH" && x.chosen?.cacheFile && pendingNow.has(x.id) && !approvedFirst.has(x.id) && (!ONLY.length || ONLY.includes(x.id)));
  const live = await withDb((P) => P.find({ id: { $in: [...high.map((x) => x.id), ...approvedFirst.keys()] } }, { projection: { _id: 0, id: 1, sku: 1, status: 1, images: 1, updatedAt: 1 } }).toArray()); // read-only
  const audit = new Map(load("audit.json").products.map((p) => [p.id, p]));
  const plan = [];
  for (const x of high) {
    const p = live.find((d) => d.id === x.id);
    const a = audit.get(x.id);
    const sourceImageUrl = x.chosen.image?.url ?? x.chosen.sourceImageUrl ?? null;
    const permission = resolvePermission(register, { productId: x.id, sourcePage: x.chosen.sourcePage, sourceImageUrl, imageUrl: x.chosen.image?.url, root: ROOT });
    const item = { id: x.id, brand: x.brand, model: x.model, sourcePage: x.chosen.sourcePage, sourceImage: sourceImageUrl ?? path.relative(ROOT, x.chosen.image?.file ?? ""), localSourceFile: x.chosen.image?.file ? path.relative(ROOT, x.chosen.image.file) : null,
      matchEvidence: x.chosen.matchEvidence, reasons: x.chosen.reasons, visuallyReviewed: x.visuallyReviewed, visualReviewNote: x.decision?.note ?? null,
      permission: { status: permission.status, holder: permission.holder, reason: permission.reason, evidence: permission.evidence } };
    if (!p) { plan.push({ ...item, action: "SKIP", why: "product no longer exists" }); continue; }
    const before = p.images ?? [];
    if (JSON.stringify(before) !== JSON.stringify(a.images)) { plan.push({ ...item, action: "SKIP", why: "images changed since the audit — re-run audit" }); continue; }
    const opt = await optimise(readFileSync(path.resolve(ROOT, x.chosen.cacheFile)));
    const key = `products/${productKeySegment(p.sku) || productKeySegment(p.id)}/${deterministicUuid(p.id, opt.sha256)}.${opt.ext}`;
    const url = `${config.publicBaseUrl}/${key}`;
    const broken = before.filter((i) => i !== PLACEHOLDER); // kept (never removed): broken references stay after the new image
    const after = [url, ...broken];
    const action = !x.visuallyReviewed ? "AWAITING_VISUAL_REVIEW"
      : permission.status === "confirmed" ? "UPLOAD_AND_SET"
      : permission.status === "permission_denied" ? "EXCLUDED_PERMISSION_DENIED" : "HELD_PERMISSION_PENDING";
    plan.push({ ...item, action, status: p.status, updatedAt: p.updatedAt, before, after, key, url,
      source: { width: x.chosen.inspection.width, height: x.chosen.inspection.height, bytes: x.chosen.inspection.bytes, kind: x.chosen.inspection.kind, sha256: x.chosen.inspection.sha256, cacheFile: x.chosen.cacheFile },
      optimised: { width: opt.width, height: opt.height, bytes: opt.bytes, contentType: opt.contentType, sha256: opt.sha256 } });
  }
  for (const r of approvedFirst.values()) plan.push(await planApprovedReview(r, live.find((d) => d.id === r.productId), config, register, approvedAll.filter((x) => x.productId === r.productId).length - 1));
  const usage = await storageUsage();
  const adding = plan.filter((p) => p.action === "UPLOAD_AND_SET").reduce((s, p) => s + p.optimised.bytes, 0);
  const auditNow = load("audit.json");
  const targets = auditNow.products.filter((p) => TARGET.has(p.imageClass));
  const vAll = Object.values(v);
  const summary = {
    eligibleForUpload: plan.filter((p) => p.action === "UPLOAD_AND_SET" || p.action === "LINK_EXISTING").map((p) => p.id),
    fromApprovedReviews: plan.filter((p) => p.origin === "review" && (p.action === "UPLOAD_AND_SET" || p.action === "LINK_EXISTING")).map((p) => p.id),
    approvalNoLongerValid: plan.filter((p) => p.action === "APPROVAL_INVALID").map((p) => p.id),
    heldForPermission: plan.filter((p) => p.action === "HELD_PERMISSION_PENDING").map((p) => p.id),
    excludedPermissionDenied: plan.filter((p) => p.action === "EXCLUDED_PERMISSION_DENIED").map((p) => p.id),
    heldForModelVerification: vAll.filter((x) => x.confidence === "UNCERTAIN").map((x) => x.id),
    awaitingVisualReview: plan.filter((p) => p.action === "AWAITING_VISUAL_REVIEW").map((p) => p.id),
    rejected: vAll.filter((x) => x.confidence === "REJECT").map((x) => x.id),
    alreadyHandledOrNoLongerNeeded: vAll.filter((x) => !targets.some((t) => t.id === x.id)).map((x) => x.id).concat(plan.filter((p) => p.action === "SKIP").map((p) => p.id)),
    noCandidate: targets.filter((t) => !vAll.some((x) => x.id === t.id)).length,
  };
  save("plan.json", { plannedAt: now(), storageBefore: usage, bytesToAdd: adding, summary, items: plan });
  writeCsv("plan.csv", plan.map((p) => ({ action: p.action, id: p.id, brand: p.brand, model: p.model, status: p.status ?? "", permissionStatus: p.permission.status, permissionHolder: p.permission.holder ?? "", permissionReason: p.permission.reason, permissionEvidence: p.permission.evidence.map((e) => `${e.url ?? e.document ?? ""}${e.quote ? ` — "${e.quote.slice(0, 160)}"` : e.finding ? ` — ${e.finding}` : ""}`), sourcePage: p.sourcePage, sourceImage: p.sourceImage, matchEvidence: p.matchEvidence, sourceFormat: p.source?.kind ?? "", sourceDims: p.source ? `${p.source.width}x${p.source.height}` : "", optimisedFormat: p.optimised?.contentType ?? "", optimisedDims: p.optimised ? `${p.optimised.width}x${p.optimised.height}` : "", optimisedBytes: p.optimised?.bytes ?? "", key: p.key ?? "", before: p.before ?? "", after: p.after ?? "", why: p.why ?? "" })));
  console.log(JSON.stringify({ planned: plan.length, uploadAndSet: plan.filter((p) => p.action === "UPLOAD_AND_SET").length, awaitingVisualReview: plan.filter((p) => p.action === "AWAITING_VISUAL_REVIEW").length, heldPermissionPending: summary.heldForPermission.length, excludedPermissionDenied: summary.excludedPermissionDenied.length, heldModelVerification: summary.heldForModelVerification.length, skipped: plan.filter((p) => p.action === "SKIP").length, bytesToAdd: adding, storageBefore: usage, databaseWrites: 0, storageWrites: 0 }));
}

/** Plan entry for an admin-approved review. The approval is re-validated with the same rules the admin API used. */
async function planApprovedReview(r, p, config, register, waiting) {
  const c = r.candidate ?? {};
  const item = { id: r.productId, origin: "review", reviewId: r.reviewId, reviewVersion: r.version, brand: r.product?.brand, model: r.product?.model,
    sourcePage: c.sourcePage ?? null, sourceImage: c.url ?? c.storageUrl ?? null, matchEvidence: c.modelEvidence ?? null, reasons: c.checks ?? [],
    visuallyReviewed: true, visualReviewNote: `approved by ${r.decidedBy} at ${r.decidedAt}`,
    authorization: r.authorization, waitingApprovedForSameProduct: waiting };
  const fresh = c.url ? resolvePermission(register, { productId: r.productId, sourcePage: c.sourcePage, imageUrl: c.url, root: ROOT }) : null;
  item.permission = fresh ? { status: fresh.status, holder: fresh.holder, reason: `admin authorization: ${r.authorization?.type} from ${r.authorization?.grantedBy} (${r.authorization?.reference}); register: ${fresh.reason}`, evidence: fresh.evidence }
    : { status: "client_supplied", holder: r.authorization?.grantedBy ?? null, reason: `admin authorization: ${r.authorization?.type} from ${r.authorization?.grantedBy} (${r.authorization?.reference})`, evidence: [] };
  const problem = approvalProblem({ state: "pending_review", candidate: { ...c, permissionStatus: fresh?.status ?? c.permissionStatus } }, { type: "approve", exactModelConfirmed: r.exactModelConfirmed === true, authorization: r.authorization });
  if (problem) return { ...item, action: "APPROVAL_INVALID", why: problem };
  if (!p) return { ...item, action: "SKIP", why: "product no longer exists" };
  const before = p.images ?? [];
  const keep = before.filter((i) => i !== PLACEHOLDER); // existing images are never removed
  if (c.storageUrl) {
    const key = c.storageUrl.startsWith(`${config.publicBaseUrl}/`) ? c.storageUrl.slice(config.publicBaseUrl.length + 1) : null;
    if (!key || !isValidImageKey(key)) return { ...item, action: "SKIP", why: "client image is not an object of the configured storage" };
    if (before.includes(c.storageUrl)) return { ...item, action: "SKIP", why: "image already linked" };
    return { ...item, action: "LINK_EXISTING", status: p.status, updatedAt: p.updatedAt, before, after: [c.storageUrl, ...keep], key, url: c.storageUrl, source: null, optimised: { bytes: 0 } };
  }
  if (!c.cacheFile || !existsSync(path.resolve(ROOT, c.cacheFile))) return { ...item, action: "SKIP", why: "verified source file missing from the cache — re-run verify" };
  const buf = readFileSync(path.resolve(ROOT, c.cacheFile));
  if (c.sha256 && sha256(buf) !== c.sha256) return { ...item, action: "SKIP", why: "cached source file differs from the reviewed image" };
  const opt = await optimise(buf);
  const key = `products/${productKeySegment(p.sku) || productKeySegment(p.id)}/${deterministicUuid(p.id, opt.sha256)}.${opt.ext}`;
  const url = `${config.publicBaseUrl}/${key}`;
  if (before.includes(url)) return { ...item, action: "SKIP", why: "image already linked" };
  return { ...item, action: "UPLOAD_AND_SET", status: p.status, updatedAt: p.updatedAt, before, after: [url, ...keep], key, url,
    source: { width: c.width, height: c.height, kind: c.format, sha256: c.sha256, cacheFile: c.cacheFile },
    optimised: { width: opt.width, height: opt.height, bytes: opt.bytes, contentType: opt.contentType, sha256: opt.sha256 } };
}

/* ============================================================================ upload */
async function upload() {
  if (!EXECUTE) throw new Error("upload writes to Supabase Storage: re-run with --execute after reviewing plan.json");
  const plan = load("plan.json", null);
  if (!plan) throw new Error("run dry-run first");
  const configured = getImageStorage();
  if (!configured.ok || configured.storage.provider !== "supabase") throw new Error("Supabase storage is not the configured provider");
  const store = configured.storage.store;
  const progress = load("progress.json", {});
  const register = load("permissions.json", { holders: {} });
  const items = plan.items.filter((i) => (i.action === "UPLOAD_AND_SET" || i.action === "LINK_EXISTING") && (!ONLY.length || ONLY.includes(i.id)));
  const { liveNow, reviewsNow } = await withDb(async (P, db) => ({
    liveNow: new Map((await P.find({ id: { $in: items.map((i) => i.id) } }, { projection: { _id: 0, id: 1, images: 1, updatedAt: 1 } }).toArray()).map((d) => [d.id, d])),
    reviewsNow: new Map((await db.collection(REVIEW_COLLECTION).find({ reviewId: { $in: items.filter((i) => i.reviewId).map((i) => i.reviewId) } }, { projection: { _id: 0 } }).toArray()).map((r) => [r.reviewId, r])),
  }));
  for (const item of items) {
    const st = progress[item.id] ??= { productId: item.id };
    const cur = liveNow.get(item.id);
    const msU = (d) => (d ? new Date(d).getTime() : null);
    if (!cur || JSON.stringify(cur.images ?? []) !== JSON.stringify(item.before) || msU(cur.updatedAt) !== msU(item.updatedAt)) {
      if (!st.upload?.verified) { console.log(`skip ${item.id}: product changed since the plan — not uploading`); st.uploadSkipped = { reason: "product changed since the plan", at: now() }; save("progress.json", progress); continue; }
    }
    if (item.origin === "review") { // the approval must still stand, unchanged since the plan
      const r = reviewsNow.get(item.reviewId);
      if (!r || r.state !== "approved" || r.version !== item.reviewVersion) { console.log(`skip ${item.id}: review ${item.reviewId} is no longer the approved version in the plan`); continue; }
      st.origin = "review"; st.reviewId = item.reviewId;
    } else {
      const perm = resolvePermission(register, { productId: item.id, sourcePage: item.sourcePage, sourceImageUrl: item.sourceImage, root: ROOT });
      if (perm.status !== "confirmed") { console.log(`skip ${item.id}: permission ${perm.status} (${perm.reason})`); continue; }
    }
    if (st.upload?.verified && st.upload.url === item.url) { console.log("skip (already uploaded)", item.id); continue; }
    if (item.action === "LINK_EXISTING") { // client-supplied image already in storage: verify it, nothing is uploaded
      const v = await verifyUploadedImage(store, item.key);
      if (v.ok) { st.upload = { key: item.key, url: item.url, verified: true, linkedExisting: true, sourcePage: item.sourcePage, uploadedAt: now() }; delete st.uploadError; console.log("verified existing", item.id, item.key); }
      else { st.uploadError = { message: `stored client image failed verification: ${v.reason}`, at: now() }; console.log("FAILED", item.id, v.reason); }
      save("progress.json", progress);
      continue;
    }
    try {
      const opt = await optimise(readFileSync(path.resolve(ROOT, item.source.cacheFile)));
      if (opt.sha256 !== item.optimised.sha256) throw new Error("optimised bytes differ from the plan — re-run dry-run");
      const existing = await store.head(item.key);
      if (!existing) {
        const signed = await store.presignPut(item.key, opt.contentType, opt.bytes);
        const put = await fetch(signed, { method: "PUT", headers: store.uploadHeaders(opt.contentType), body: opt.buffer, signal: AbortSignal.timeout(60_000) });
        if (!put.ok) throw new Error(`upload failed (HTTP ${put.status})`);
      }
      const v = await verifyUploadedImage(store, item.key); // deletes only the object it just checked if that object is not a valid image
      if (!v.ok) throw new Error(`stored object failed verification: ${v.reason}`);
      const pub = await get(item.url, { checkRobots: false });
      if (!pub.ok || sha256(pub.body) !== opt.sha256) throw new Error(`public URL check failed (HTTP ${pub.status})`);
      st.upload = { key: item.key, url: item.url, sha256: opt.sha256, bytes: opt.bytes, sourcePage: item.sourcePage, uploadedAt: now(), verified: true, reusedExisting: !!existing };
      delete st.uploadError;
      console.log("uploaded", item.id, item.key);
    } catch (e) {
      st.uploadError = { message: e.message, at: now() };
      console.log("FAILED upload", item.id, e.message);
    }
    save("progress.json", progress); // after every product
  }
}

/* ============================================================================ apply */
async function apply() {
  if (!EXECUTE) throw new Error("apply writes to MongoDB: re-run with --execute after reviewing plan.json");
  const plan = load("plan.json", null);
  const progress = load("progress.json", {});
  const items = plan.items.filter((i) => (i.action === "UPLOAD_AND_SET" || i.action === "LINK_EXISTING") && progress[i.id]?.upload?.verified && progress[i.id].upload.url === i.url && (!ONLY.length || ONLY.includes(i.id)));
  await withDb(async (P, db) => {
    // Run manifest: every document this run may touch, saved in full before the first write.
    mkdirSync(file("backups"), { recursive: true });
    const manifest = `backups/apply-${stamp()}.json`;
    const docs = await P.find({ id: { $in: items.map((i) => i.id) } }).toArray();
    writeFileSync(file(manifest), JSON.stringify({ takenAt: now(), plannedAt: plan.plannedAt, items: items.map((i) => ({ id: i.id, origin: i.origin ?? "register", reviewId: i.reviewId ?? null, before: i.before, after: i.after, url: i.url })), documents: docs.map(({ _id, ...d }) => ({ _id: String(_id), ...d })) }, null, 1));
    console.log(`backup manifest: ${manifest} (${docs.length} documents)`);
    for (const item of items) {
      const st = progress[item.id];
      if (st.rollback?.done && st.rollback.at > plan.plannedAt) { console.log("skip (rolled back after this plan — re-approve and re-plan first)", item.id); continue; }
      if (st.apply?.applied && !(st.rollback?.done) && (st.apply.images ?? []).includes(item.url)) { console.log("skip (already applied)", item.id); continue; }
      if (st.rollback?.done) delete st.rollback; // a newer plan after a rollback: this is a fresh apply
      const cur = await P.findOne({ id: item.id }); // full document: backup + post-write integrity check
      const ms = (d) => (d ? new Date(d).getTime() : null);
      if (!cur || JSON.stringify(cur.images ?? []) !== JSON.stringify(item.before) || ms(cur.updatedAt) !== ms(item.updatedAt)) {
        st.apply = { applied: false, reason: "product changed since the plan — not overwritten", at: now() };
        st.orphanForReview = st.upload.key; // uploaded but not linked: listed for review, never deleted automatically
        console.log("SKIPPED (changed)", item.id);
        save("progress.json", progress);
        continue;
      }
      // Never append a URL that is already present; never write if nothing would change.
      const newImages = [...new Set(item.after)].filter((u, i, arr) => arr.indexOf(u) === i);
      if ((cur.images ?? []).includes(item.url)) { st.apply = { applied: false, reason: "image URL already present — nothing to do", at: now() }; save("progress.json", progress); console.log("skip (already has this image)", item.id); continue; }
      const { _id, ...docWithoutId } = cur;
      st.backup = { images: cur.images ?? [], updatedAt: cur.updatedAt, takenAt: now(), document: JSON.parse(JSON.stringify(docWithoutId)) };
      save("progress.json", progress); // backup is on disk before the write
      // Only the images field is written. updatedAt is part of the condition (unchanged since the plan) but is not modified.
      const r = await P.updateOne({ _id, id: item.id, images: { $eq: item.before }, updatedAt: cur.updatedAt }, { $set: { images: newImages } });
      if (r.matchedCount === 1) {
        const after = await P.findOne({ _id });
        const withoutImages = (d) => { const o = { ...d }; delete o.images; return JSON.stringify(o); };
        const intact = withoutImages(after) === withoutImages(cur);
        st.apply = { applied: true, at: now(), images: newImages, otherFieldsUnchanged: intact, manifest };
        delete st.orphanForReview;
        if (item.origin === "review") {
          const m = await markReviewUploaded(db.collection(REVIEW_COLLECTION), item.reviewId, item.reviewVersion, item.url, "pipeline:apply");
          st.review = "error" in m ? { marked: false, reason: m.error } : { marked: true, state: m.record.state };
        }
        console.log(intact ? "applied" : "APPLIED BUT OTHER FIELDS DIFFER — review", item.id);
      }
      else { st.apply = { applied: false, reason: "conditional update matched nothing", at: now() }; st.orphanForReview = st.upload.key; console.log("NOT applied", item.id); }
      save("progress.json", progress);
    }
  });
}

/* ============================================================================ rollback */
/** Restores `images` from the per-product backup, only where the field still holds exactly what apply wrote. */
async function rollback() {
  const progress = load("progress.json", {});
  const entries = Object.values(progress).filter((st) => st.apply?.applied && !st.rollback?.done && (!ONLY.length || ONLY.includes(st.productId)));
  console.log(`rollback: ${entries.length} applied product(s)${EXECUTE ? "" : " — preview only, re-run with --execute"}`);
  await withDb(async (P, db) => {
    for (const st of entries) {
      const cur = await P.findOne({ id: st.productId }, { projection: { images: 1 } });
      const unchanged = cur && JSON.stringify(cur.images ?? []) === JSON.stringify(st.apply.images);
      if (!EXECUTE) { console.log(unchanged ? `would restore ${st.productId}: ${JSON.stringify(st.apply.images)} → ${JSON.stringify(st.backup.images)}` : `would skip ${st.productId}: images changed since apply`); continue; }
      if (!unchanged) { st.rollback = { done: false, reason: "images changed since apply — not overwritten", at: now() }; save("progress.json", progress); console.log("SKIPPED (changed)", st.productId); continue; }
      const r = await P.updateOne({ _id: cur._id, images: { $eq: st.apply.images } }, { $set: { images: st.backup.images } });
      if (r.matchedCount === 1) {
        st.rollback = { done: true, at: now(), restored: st.backup.images };
        st.orphanForReview = st.upload?.linkedExisting ? undefined : st.upload?.key; // object kept; `cleanup` lists it
        if (st.reviewId) st.rollback.reviewReturnedToQueue = await markReviewRolledBack(db.collection(REVIEW_COLLECTION), st.reviewId, "pipeline:rollback");
        console.log("restored", st.productId);
      } else { st.rollback = { done: false, reason: "conditional restore matched nothing", at: now() }; console.log("NOT restored", st.productId); }
      save("progress.json", progress);
    }
  });
}

/* ============================================================================ cleanup */
/** Objects this pipeline uploaded that no product references (failed apply, rollback). Deleted only with --execute. */
async function cleanup() {
  const progress = load("progress.json", {});
  const configured = getImageStorage();
  if (!configured.ok) throw new Error("image storage is not configured");
  const store = configured.storage.store;
  const entries = Object.values(progress).filter((st) => st.upload?.verified && !st.upload.linkedExisting && !st.cleanup?.deleted && (!st.apply?.applied || st.rollback?.done));
  await withDb(async (P) => {
    for (const st of entries) {
      const refs = await P.countDocuments({ images: st.upload.url });
      if (refs) { console.log(`keep ${st.upload.key}: used by ${refs} product(s)`); continue; }
      if (!isValidImageKey(st.upload.key)) { console.log(`keep ${st.upload.key}: not a pipeline key`); continue; }
      if (!EXECUTE) { console.log(`would delete ${st.upload.key} (unreferenced)`); continue; }
      await store.delete(st.upload.key);
      st.cleanup = { deleted: true, at: now() };
      delete st.orphanForReview;
      save("progress.json", progress);
      console.log("deleted", st.upload.key);
    }
  });
  if (!entries.length) console.log("cleanup: no unreferenced pipeline uploads");
}

/* ============================================================================ report */
async function report() {
  const a = load("audit.json", null), c = load("candidates.json", {}), v = load("verify.json", {}), plan = load("plan.json", { items: [] }), pr = load("progress.json", {});
  if (!a) throw new Error("run audit first");
  const cls = (k) => a.products.filter((p) => p.imageClass === k).length;
  const targets = a.products.filter((p) => TARGET.has(p.imageClass));
  const vv = Object.values(v);
  const L = [];
  L.push(`# Product image pipeline report`, ``, `Generated ${now()} · audit ${a.auditedAt}${plan.plannedAt ? ` · plan ${plan.plannedAt}` : ""}`, ``);
  L.push(`| Measure | Count |`, `|---|---|`);
  for (const [k, n] of [["Products audited", a.products.length], ["Valid, verified images (Supabase, upload provenance on record)", cls("VALID_VERIFIED")], ["Supabase images without upload record", cls("SUPABASE_UNREVIEWED")], ["Embedded O General images (preserved)", cls("EMBEDDED_PRESERVED")], ["External images needing verification", cls("EXTERNAL_NEEDS_VERIFICATION")], ["Broken image references", cls("BROKEN")], ["Placeholder only", cls("PLACEHOLDER")], ["No image", cls("NO_IMAGE")],
    ["Products searched (no usable image)", Object.keys(c).length], ["High-confidence candidates", vv.filter((x) => x.confidence === "HIGH").length], ["… of which visually approved", vv.filter((x) => x.confidence === "HIGH" && x.visuallyReviewed).length], ["Uncertain (manual review)", vv.filter((x) => x.confidence === "UNCERTAIN").length], ["Rejected candidates", vv.filter((x) => x.confidence === "REJECT").length],
    ["No candidate found", targets.filter((p) => !(c[p.id]?.candidates ?? []).length).length], ["Images uploaded to Supabase", Object.values(pr).filter((x) => x.upload?.verified).length], ["Product records updated", Object.values(pr).filter((x) => x.apply?.applied).length], ["Products skipped because an image already exists", a.products.length - targets.length],
    ["Failed uploads", Object.values(pr).filter((x) => x.uploadError).length], ["Failed / skipped database updates", Object.values(pr).filter((x) => x.apply && !x.apply.applied).length], ["Objects uploaded but not linked (review)", Object.values(pr).filter((x) => x.orphanForReview).length]]) L.push(`| ${k} | ${n} |`);
  L.push(``, `Storage before: ${a.storage.objects} objects, ${(a.storage.bytes / 1e6).toFixed(2)} MB${plan.bytesToAdd != null ? ` · planned addition ${(plan.bytesToAdd / 1e6).toFixed(2)} MB` : ""}.`, ``);
  const noCand = {};
  for (const p of targets) if (!(c[p.id]?.candidates ?? []).length) { const why = (c[p.id]?.notes ?? ["not searched"])[0].replace(/ — .*/, ""); (noCand[why] ??= []).push(`${p.brand} ${p.model}`); }
  L.push(`## No candidate found`, ``);
  for (const [why, list] of Object.entries(noCand).sort((x, y) => y[1].length - x[1].length)) L.push(`- **${why}** (${list.length}): ${list.slice(0, 60).join(", ")}${list.length > 60 ? " …" : ""}`);
  // Plan, permission and stale-entry sections
  if (plan.summary) {
    const S = plan.summary, byId = new Map(plan.items.map((i) => [i.id, i])), V = (id) => v[id];
    const line = (id) => { const i = byId.get(id); const x = V(id); return `${(i ?? x).brand} ${(i ?? x).model} (\`${id}\`)`; };
    L.push(``, `## Execution plan (${plan.plannedAt})`, ``, `| Category | Products |`, `|---|---|`);
    for (const [k, label] of [["eligibleForUpload", "Eligible for upload (high-confidence match + confirmed permission)"], ["heldForPermission", "Held — permission_pending"], ["excludedPermissionDenied", "Excluded — permission_denied"], ["heldForModelVerification", "Held — model verification (uncertain match)"], ["awaitingVisualReview", "Awaiting visual review"], ["rejected", "Rejected"], ["alreadyHandledOrNoLongerNeeded", "Already handled / no longer needed"]]) L.push(`| ${label} | ${S[k].length} |`);
    L.push(`| No candidate found | ${S.noCandidate} |`, ``);
    L.push(`### Eligible for upload`, ``, S.eligibleForUpload.length ? S.eligibleForUpload.map((id) => { const i = byId.get(id); return `- ${line(id)} → \`${i.key}\` (${i.optimised.contentType}, ${i.optimised.width}x${i.optimised.height}, ${i.optimised.bytes} B); images ${JSON.stringify(i.before)} → [new URL]; permission: ${i.permission.reason}`; }).join("\n") : "None — no image has confirmed reuse permission.", ``);
    const register = load("permissions.json", { holders: {} });
    L.push(`### Permission status by rights holder`, ``);
    for (const [holder, h] of Object.entries(register.holders ?? {})) {
      const ids = plan.items.filter((i) => i.permission.holder === holder).map((i) => i.id);
      L.push(`- **${holder}** — \`${h.status}\` (${ids.length} planned image${ids.length === 1 ? "" : "s"}): ${h.summary}`);
      for (const e of h.evidence ?? []) L.push(`  - ${e.url}${e.quote ? ` — "${e.quote.length > 260 ? e.quote.slice(0, 260) + "…" : e.quote}"` : e.finding ? ` — ${e.finding}` : ""}`);
    }
    L.push(``, `### Held or excluded, and why`, ``);
    for (const id of [...S.heldForPermission, ...S.excludedPermissionDenied]) { const i = byId.get(id); L.push(`- ${line(id)} — \`${i.permission.status}\`: ${i.permission.reason}`); }
    for (const id of S.heldForModelVerification) { const x = V(id); L.push(`- ${line(id)} — model verification: ${(x.chosen?.reasons ?? []).slice(-1)[0] ?? ""}`); }
    const stale = plan.items.filter((i) => i.action === "SKIP");
    L.push(``, `### Stale plan entries / changed product records`, ``, stale.length ? stale.map((i) => `- ${line(i.id)}: ${i.why}`).join("\n") : "None — every planned product still has exactly the images recorded at the audit.", ``);
  }
  // Per-product results for every product that reached verification
  if (plan.items) {
    const byId = new Map(plan.items.map((i) => [i.id, i]));
    const names = new Map(a.products.map((p) => [p.id, p.name]));
    const status = (id) => { const i = byId.get(id), st = pr[id];
      if (st?.apply?.applied) return "UPDATED"; if (st?.upload?.verified) return st.apply ? `UPLOADED, NOT LINKED (${st.apply.reason})` : "UPLOADED, awaiting apply";
      if (st?.uploadError) return `UPLOAD FAILED (${st.uploadError.message})`; if (i) return i.action; return `HELD_MODEL_VERIFICATION`; };
    L.push(``, `## Per-product results`, ``, `| Product | Brand | Model | Product ID | Source | Supabase image | Status |`, `|---|---|---|---|---|---|---|`);
    for (const x of Object.values(v).sort((m, n) => (m.brand + m.model).localeCompare(n.brand + n.model))) {
      const i = byId.get(x.id), st = pr[x.id];
      const src = i?.sourcePage ?? x.chosen?.sourcePage ?? "";
      const sb = st?.upload?.url ?? (i?.url ? `(planned) ${i.key}` : "");
      L.push(`| ${(names.get(x.id) ?? "").replace(/\|/g, "/")} | ${x.brand} | ${x.model} | \`${x.id}\` | ${src} | ${sb} | ${status(x.id)} |`);
    }
    const keys = plan.items.filter((i) => i.key).map((i) => i.key);
    L.push(``, `## Duplicate prevention`, ``,
      `- Planned storage keys: ${keys.length}, unique: ${new Set(keys).size} (keys are derived from product id + image bytes, so re-runs reuse the same key).`,
      `- Uploads never overwrite: signed upload URLs are create-only (x-upsert false); an existing object at the planned key is verified and reused, not re-uploaded.`,
      `- Images array: a URL already present is never appended; only products whose images still equal the audited value are written.`,
      `- Products created: 0 (the pipeline only updates existing records by id).`, ``,
      `## Supabase storage`, ``, `- Before (audit ${a.auditedAt}): ${a.storage.objects} objects, ${a.storage.bytes.toLocaleString("en-US")} bytes.`,
      `- Planned addition: ${(plan.bytesToAdd ?? 0).toLocaleString("en-US")} bytes in ${plan.items.filter((i) => i.action === "UPLOAD_AND_SET").length} objects.`,
      `- Uploaded so far: ${Object.values(pr).filter((x) => x.upload?.verified).length} objects (${Object.values(pr).filter((x) => x.upload?.verified).reduce((s, x) => s + (x.upload.bytes || 0), 0).toLocaleString("en-US")} bytes).`, ``);
  }
  // Batches grouped by rights holder / blocker (highest yield first)
  if (plan.items?.length) {
    const register = load("permissions.json", { holders: {} });
    const groups = {};
    for (const i of plan.items.filter((x) => x.action !== "SKIP")) (groups[i.permission.holder ?? "no permission record"] ??= []).push(i);
    const unlock = (h) => h?.status === "licensed" ? `implement and deploy the licence conditions on halimatrading.com (${(h.conditions ?? []).length} items), then set conditionsMet: true`
      : h?.status === "permission_denied" ? "express written permission from the rights holder overriding its website terms"
      : "written permission (email/letter) from the brand or its UAE distributor, saved under permission-evidence/ and recorded in permissions.json";
    const rows = Object.entries(groups).sort((x, y) => y[1].length - x[1].length).map(([holder, items], k) => ({ batch: String.fromCharCode(65 + k), holder, products: items.length,
      status: items[0].permission.status, models: items.map((i) => `${i.brand} ${i.model}`).join(", "), bytes: items.reduce((t, i) => t + (i.optimised?.bytes ?? 0), 0), unlock: unlock(register.holders?.[holder]) }));
    writeCsv("batches.csv", rows);
    L.push(``, `## Batches by blocker (exact-model, visually approved, ready to run once unlocked)`, ``, `| Batch | Rights holder / source | Products | Status | Size | What unlocks it |`, `|---|---|---|---|---|---|`);
    for (const r of rows) L.push(`| ${r.batch} | ${r.holder} | ${r.products} | \`${r.status}\` | ${(r.bytes / 1000).toFixed(0)} KB | ${r.unlock} |`);
    L.push(``);
    for (const r of rows) L.push(`- **Batch ${r.batch} — ${r.holder}:** ${r.models}`);
    L.push(``);
  }
  // Open Icecat coverage (from the discovery records)
  const ice = Object.values(c).filter((r) => r.icecat);
  if (ice.length) {
    const register = load("permissions.json", { holders: {} });
    const rows = ice.map((r) => {
      const cand = r.candidates.find((x) => x.adapter === "icecat");
      const vr = v[r.id]?.results?.find((x) => x.adapter === "icecat");
      const perm = cand ? resolvePermission(register, { productId: r.id, sourcePage: cand.sourcePage, imageUrl: cand.images[0]?.url, root: ROOT }) : null;
      const status = !cand ? "UNAVAILABLE" : !cand.images.length ? "NO_IMAGE_IN_ICECAT" : vr?.confidence === "REJECT" ? "REJECTED" : cand.exactModel ? (perm.status === "confirmed" ? "ELIGIBLE" : "EXACT_MATCH_PERMISSION_PENDING") : "MANUAL_REVIEW";
      return { id: r.id, brand: r.brand, model: r.model, status, icecatId: cand?.icecatId ?? "", icecatPartCode: cand?.icecatPartCode ?? "", matchEvidence: cand?.matchEvidence ?? "",
        confidence: vr?.confidence ?? (cand ? "not verified" : ""), images: cand?.images.length ?? 0, imageUrl: cand?.images[0]?.url ?? "", sourceUrl: cand?.sourcePage ?? "",
        licence: perm ? `${perm.status}: ${perm.reason}` : "", reason: cand ? (vr?.reasons ?? []).join("; ") : r.icecat.reason ?? "",
        attempts: r.icecat.attempts.map((x) => `${x.how}: HTTP ${x.http}${x.code ? ` code ${x.code}` : ""}${x.message ? ` (${x.message})` : ""}`) };
    });
    writeCsv("icecat-coverage.csv", rows);
    const n = (k) => rows.filter((x) => x.status === k).length;
    const attempts = ice.flatMap((r) => r.icecat.attempts);
    const codes = {};
    for (const x of attempts) { const k = x.code ? `code ${x.code} (${x.message})` : `HTTP ${x.http}${x.message ? ` (${x.message})` : ""}`; codes[k] = (codes[k] ?? 0) + 1; }
    const byBrand = {};
    for (const x of rows) { const b = byBrand[x.brand] ??= { queried: 0, found: 0, exact: 0 }; b.queried++; if (x.status !== "UNAVAILABLE") b.found++; if (x.status.startsWith("EXACT") || x.status === "ELIGIBLE") b.exact++; }
    L.push(``, `## Open Icecat coverage`, ``, `| Measure | Count |`, `|---|---|`,
      `| Products queried | ${rows.length} |`, `| Found in Icecat | ${rows.length - n("UNAVAILABLE")} |`, `| Exact-model matches | ${n("EXACT_MATCH_PERMISSION_PENDING") + n("ELIGIBLE")} |`,
      `| Exact matches with images | ${rows.filter((x) => (x.status.startsWith("EXACT") || x.status === "ELIGIBLE") && x.images > 0).length} |`, `| With verified commercial reuse rights (licence conditions met) | ${n("ELIGIBLE")} |`,
      `| Requiring manual review (variant code / GTIN-only / brand-ambiguous) | ${n("MANUAL_REVIEW")} |`, `| Found but no image | ${n("NO_IMAGE_IN_ICECAT")} |`, `| Rejected | ${n("REJECTED")} |`, `| Unavailable from Icecat | ${n("UNAVAILABLE")} |`,
      `| API requests | ${attempts.length} |`, `| Rate-limited responses | ${attempts.filter((x) => x.rateLimited).length} |`, ``,
      `API responses: ${Object.entries(codes).map(([k, n2]) => `${k} × ${n2}`).join(" · ")}`, ``,
      `By brand: ${Object.entries(byBrand).sort((x, y) => y[1].queried - x[1].queried).map(([b, x]) => `${b} ${x.found}/${x.queried} found, ${x.exact} exact`).join(" · ")}`, ``,
      `Licence: ${register.holders?.["Open Icecat (Open Content License)"]?.licence ?? "Open Icecat"} — status ${register.holders?.["Open Icecat (Open Content License)"]?.conditionsMet ? "conditions met" : "conditions NOT yet met on the site, so every Icecat image is held as permission_pending"}. Per-product detail: \`icecat-coverage.csv\`.`, ``);
    for (const x of rows.filter((r) => r.status !== "UNAVAILABLE")) L.push(`- ${x.brand} ${x.model} — **${x.status}** · Icecat ${x.icecatId} part code "${x.icecatPartCode}" · ${x.images} image(s) · ${x.matchEvidence}`);
    L.push(``);
  }
  const rp = load("reviews-preview.json", null), pil = load("pilot.json", null);
  if (pil) L.push(`## Pilot set (${pil.createdAt})`, ``, `${pil.size} products, ${new Set(pil.products.map((p) => p.brand)).size} brands, ${new Set(pil.products.map((p) => p.category)).size} categories:`, ``, ...pil.products.map((p) => `- ${p.brand} ${p.model} — ${p.category ?? "?"} (${p.imageClass}, ${p.status ?? "active"})`), ``);
  if (rp) {
    L.push(`## Review queue preview (${rp.generatedAt})`, ``, `| State | Records |`, `|---|---|`, ...Object.entries(rp.byState).map(([k, n]) => `| ${k} | ${n} |`), ``,
      `Products covered: ${rp.products}. Records are written to \`${REVIEW_COLLECTION}\` only by \`review-import --execute\`. None is approved automatically.`, ``);
  }
  const tests = load("tests-run.json", null);
  if (tests) { L.push(`## Tests executed (${tests.at})`, ``); for (const t of tests.runs) L.push(`- \`${t.command}\` — ${t.result}`); L.push(``); }
  L.push(`## Next command after approval`, ``, "Only products with action `UPLOAD_AND_SET` are touched; both steps re-check permission/the product before writing:", "", "```", "node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/product-images/pipeline.mjs upload --execute", "node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/product-images/pipeline.mjs apply --execute", "node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/product-images/pipeline.mjs audit", "```", "", "With 0 eligible products these commands currently do nothing. To make products eligible: record the written permission in `work/product-image-pipeline/permissions.json`, re-run `dry-run`, review `plan.csv`, then run the commands above.");
  writeFileSync(file("report.md"), L.join("\n") + "\n");
  console.log(L.join("\n"));
}

const commands = { audit, targets: targetsCmd, quota, catalogue, discover, verify, pilot, "review-import": reviewImport, "review-rollback": reviewRollback, "dry-run": dryRun, upload, apply, rollback, cleanup, report };
if (process.env.PIPELINE_NO_MAIN !== "1") { // tests import the pure helpers without running a command
  if (!commands[cmd]) { console.error(`usage: pipeline.mjs <${Object.keys(commands).join("|")}> [--only=id,id] [--pilot] [--source=…] [--execute]`); process.exit(2); }
  await commands[cmd]();
}
