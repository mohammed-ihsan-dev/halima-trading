// Product image & catalogue audit — READ-ONLY. Reads MongoDB (find only), checks image URLs with bounded requests,
// scans local files, reads tools/cache/pdf-audit.json (from pdf_audit.py) and writes the report files next to tools/.
// Nothing in MongoDB, storage, public/ or catalogues-source/ is modified.
// Run from the project root:
//   node --env-file=.env.local --import ./tests/support/register-ts.mjs reports/product-image-audit/tools/audit.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { imageSize } from "image-size";
import { Resolver } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");
const { PLACEHOLDER_IMAGE_PATH } = await import("@/lib/admin-gallery");
const { unsuitableReason } = await import("../../../scripts/product-images/replacement.mjs");
const { isCombinedModel } = await import("@/lib/product-model");

const ROOT = process.cwd();
const OUT = "reports/product-image-database-audit-2026-10-30/tools/baseline";
const CACHE = "reports/product-image-database-audit-2026-10-30/tools/cache";
const NOW = new Date().toISOString();
const hostOf = (u) => { try { return new URL(u).host; } catch { return ""; } };
const SUPABASE_HOST = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const R2_HOST = hostOf(process.env.R2_PUBLIC_BASE_URL ?? "");
const norm = (s) => (typeof s === "string" ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") : "");
const isCode = (k) => k.length >= 5 && /[A-Z]/.test(k) && /\d/.test(k);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const dims = (buf) => { try { const d = imageSize(buf); return d?.width ? { width: d.width, height: d.height, imageType: d.type } : null; } catch { return null; } };

// ---------- CSV / JSON helpers ----------
const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(" | ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (file, rows, cols) => {
  writeFileSync(`${OUT}/${file}`, [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n", "utf8");
};
const writeJson = (file, data) => writeFileSync(`${OUT}/${file}`, JSON.stringify(data, null, 1) + "\n", "utf8");
const loadCache = (f) => (existsSync(`${CACHE}/${f}`) ? JSON.parse(readFileSync(`${CACHE}/${f}`, "utf8")) : {});

// ---------- 1. Products (read-only) ----------
const db = await getMongoDb();
const products = await db.collection("products").find({}).toArray();
const categoriesConfigured = (await db.collection("categories").find({}, { projection: { _id: 0, slug: 1 } }).toArray()).map((c) => c.slug);
await (await getMongoClient()).close();

const fieldCounts = {};
const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { const kp = p ? `${p}.${k}` : k; fieldCounts[kp] = (fieldCounts[kp] || 0) + 1;
  if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && k !== "_id" && k !== "specifications") walk(v, kp); } };
products.forEach((p) => walk(p, ""));
const imageFields = Object.keys(fieldCounts).filter((k) => /image|img|photo|picture|thumb|gallery|media|logo|asset/i.test(k));

// Keys that identify a product: sku, model and each part of a combined model ("A / B").
const productKeys = (p) => {
  const keys = new Set();
  for (const v of [p.sku, p.model]) {
    if (typeof v !== "string") continue;
    const k = norm(v); if (isCode(k)) keys.add(k);
    for (const part of v.split(/\s*\/\s*|\s*,\s*/)) { const kp = norm(part); if (isCode(kp) && kp.length >= 6) keys.add(kp); }
  }
  return [...keys];
};
const keyIndex = new Map(); // key -> product _ids
for (const p of products) for (const k of productKeys(p)) keyIndex.set(k, [...(keyIndex.get(k) ?? []), String(p._id)]);
const byId = new Map(products.map((p) => [String(p._id), p]));

// ---------- 2. Image references + validation ----------
const LOGO_OR_STOCK = /(seeklogo|logos-world|vectorstock|freepik|shutterstock|istockphoto|play-lh\.googleusercontent)/i;
const GOOGLE_THUMB = /encrypted-tbn\d\.gstatic\.com/i;
const storageTypeOf = (ref) => {
  if (typeof ref !== "string") return "unknown-invalid";
  if (!ref.trim()) return "unknown-invalid";
  if (ref === PLACEHOLDER_IMAGE_PATH) return "placeholder";
  if (ref.startsWith("data:")) return "mongodb-base64";
  if (ref.startsWith("/") && !ref.startsWith("//")) return "relative-public-path";
  if (/^[a-z]:[\\/]|^file:|^blob:/i.test(ref)) return "local-project-path";
  let u; try { u = new URL(ref); } catch { return "unknown-invalid"; }
  if (!/^https?:$/.test(u.protocol)) return "other";
  if (SUPABASE_HOST && u.host === SUPABASE_HOST) return "supabase";
  if ((R2_HOST && u.host === R2_HOST) || /\.r2\.dev$/.test(u.host)) return "other-r2";
  return "external-url";
};

const urlCache = loadCache("url-checks.json");
const refs = new Set();
for (const p of products) for (const r of Array.isArray(p.images) ? p.images : []) if (typeof r === "string") refs.add(r);
const httpRefs = [...refs].filter((r) => ["supabase", "external-url", "other-r2"].includes(storageTypeOf(r)));

// The audit machine's own DNS filters some hosts (ENOTFOUND for live CDNs). Those URLs are re-fetched with the
// address from a public resolver (1.1.1.1 / 8.8.8.8), which is what a customer's browser would normally get.
const publicDns = new Resolver(); publicDns.setServers(["1.1.1.1", "8.8.8.8"]);
const publicLookup = (host, opts, cb) => publicDns.resolve4(host).then((a) => (opts?.all ? cb(null, [{ address: a[0], family: 4 }]) : cb(null, a[0], 4)), (e) => cb(e));
function getViaPublicDns(url, headers, cap, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { headers, lookup: publicLookup, timeout: 12000 }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects < 4) { r.resume(); resolve(getViaPublicDns(new URL(r.headers.location, url).href, headers, cap, redirects + 1)); return; }
      const chunks = []; let size = 0;
      r.on("data", (c) => { chunks.push(c); size += c.length; if (size >= cap) r.destroy(); });
      const done = () => resolve({ status: r.statusCode, headers: r.headers, buf: Buffer.concat(chunks), redirected: redirects > 0, url });
      r.on("end", done); r.on("close", done); r.on("error", done);
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { name: "AbortError" })));
    req.on("error", reject); req.end();
  });
}
async function fetchBounded(url, full, useRange) {
  const headers = { "User-Agent": "Mozilla/5.0 (HalimaTrading image audit; read-only)", ...(useRange ? { Range: "bytes=0-65535" } : {}) };
  const cap = full ? 15 * 1024 * 1024 : 65536;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers });
    const chunks = []; let size = 0;
    if (r.body) { const reader = r.body.getReader(); while (size < cap) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; } await reader.cancel().catch(() => {}); }
    return { status: r.status, headers: Object.fromEntries(r.headers), buf: Buffer.concat(chunks), redirected: r.redirected, url: r.url, via: "system-dns" };
  } catch (e) {
    const code = String(e.cause?.code ?? "");
    if (/ENOTFOUND|EAI_AGAIN/.test(code)) {
      try { return { ...(await getViaPublicDns(url, headers, cap)), via: "public-dns" }; }
      catch (e2) { throw Object.assign(e2, { viaPublicDns: true }); }
    }
    throw e;
  } finally { clearTimeout(timer); }
}
async function checkUrl(url) {
  const full = storageTypeOf(url) === "supabase"; // our own storage: download fully (≤15 MB) to hash and size it
  const res = { url, checkedAt: NOW, method: "GET", ok: false };
  try {
    let r = await fetchBounded(url, full, !full);
    if (r.status === 416) { r = await fetchBounded(url, full, false); res.note = "range request refused (416); re-fetched without Range"; }
    res.status = r.status; res.via = r.via; res.contentType = String(r.headers["content-type"] ?? ""); res.redirected = r.redirected; if (r.redirected) res.finalUrl = r.url;
    res.contentLength = Number(String(r.headers["content-range"] ?? "").split("/")[1] ?? 0) || Number(r.headers["content-length"] ?? 0) || null;
    const d = dims(r.buf); if (d) Object.assign(res, d);
    if (full && r.buf.length) { res.sha256 = sha256(r.buf); res.bytes = r.buf.length; }
    const isImage = /^image\//i.test(res.contentType) || !!d;
    res.ok = r.status >= 200 && r.status < 300 && isImage;
    res.result = res.ok ? "accessible" : r.status >= 400 ? `http-${r.status}` : !isImage ? "not-an-image" : `http-${r.status}`;
  } catch (e) {
    const code = String(e.cause?.code ?? e.code ?? e.message);
    res.error = code.slice(0, 120);
    res.result = /CERT|SSL|TLS/i.test(code) ? "tls-certificate-invalid" : e.name === "AbortError" || /TIMEOUT/i.test(code) ? "timeout" : /ENOTFOUND/.test(code) && e.viaPublicDns ? "dns-not-found" : "network-error";
  }
  return res;
}
const pending = httpRefs.filter((u) => !urlCache[u]);
console.log(`URL checks: ${httpRefs.length} unique http(s) refs, ${pending.length} to check`);
for (let i = 0; i < pending.length; i += 8) {
  const batch = await Promise.all(pending.slice(i, i + 8).map(checkUrl));
  for (const r of batch) urlCache[r.url] = r;
  writeFileSync(`${CACHE}/url-checks.json`, JSON.stringify(urlCache));
}
// Second chance for inconclusive results (timeouts / network errors), once.
for (const u of httpRefs.filter((u) => ["timeout", "network-error"].includes(urlCache[u]?.result) && !urlCache[u].retried)) {
  urlCache[u] = { ...(await checkUrl(u)), retried: true };
}
writeFileSync(`${CACHE}/url-checks.json`, JSON.stringify(urlCache));

function checkRef(ref) {
  const type = storageTypeOf(ref);
  const flags = [];
  if (type === "mongodb-base64") {
    const m = /^data:(image\/[a-z+.-]+);base64,(.*)$/is.exec(ref);
    if (!m) return { type, result: "invalid-data-uri", ok: false, flags };
    const buf = Buffer.from(m[2], "base64"); const d = dims(buf);
    return { type, result: d ? "accessible" : "invalid-data-uri", ok: !!d, bytes: buf.length, sha256: sha256(buf), ...(d ?? {}), contentType: m[1], flags: ["inline-base64-in-mongodb"] };
  }
  if (type === "relative-public-path") {
    const f = join(ROOT, "public", decodeURIComponent(ref)); const exists = existsSync(f);
    if (!exists) return { type, result: "missing-local-file", ok: false, flags };
    const buf = readFileSync(f); const d = dims(buf);
    return { type, result: d ? "accessible" : "not-an-image", ok: !!d, bytes: buf.length, sha256: sha256(buf), ...(d ?? {}), flags };
  }
  if (["supabase", "external-url", "other-r2"].includes(type)) {
    const c = urlCache[ref] ?? { result: "not-checked" };
    if (LOGO_OR_STOCK.test(hostOf(ref))) flags.push("logo-or-stock-image-site");
    if (GOOGLE_THUMB.test(hostOf(ref))) flags.push("google-search-thumbnail");
    if (ref.startsWith("http:")) flags.push("not-https");
    if (c.ok && c.width && Math.max(c.width, c.height) < 400) flags.push("low-resolution");
    const why = c.ok ? unsuitableReason({ ref, type: type === "supabase" ? "supabase" : "external", valid: true, width: c.width, height: c.height }) : null;
    if (why && /logo|app store icon|placeholder/.test(why)) flags.push("logo-icon-or-placeholder");
    return { ...c, type, flags };
  }
  return { type, result: type === "placeholder" ? "placeholder" : "invalid-format", ok: false, flags };
}

// ---------- 3. Local image assets ----------
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif", ".bmp", ".tif", ".tiff", ".heic", ".ico"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".pnpm-store", "reports"]);
const ASSET_ROOTS = ["public", "catalogues-source", "work", "data", "examples"];
const sniff = (buf) => { const d = dims(buf); return d ? `.${d.imageType}` : null; };
const files = [];
const scan = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name);
  if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) scan(p); } else if (e.isFile()) files.push(p); } };
ASSET_ROOTS.forEach((r) => existsSync(r) && scan(r));

const codeText = ["app", "components", "lib", "data", "context"].flatMap((d) => { const out = []; const s = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name);
  if (e.isDirectory()) s(p); else if (/\.(tsx?|jsx?|mjs|json|css)$/.test(e.name)) out.push(readFileSync(p, "utf8")); } }; s(d); return out; }).join("\n");

const supabaseByHash = new Map(); // sha256 -> [{productId, url}]
for (const p of products) for (const r of Array.isArray(p.images) ? p.images : []) { const c = urlCache[r]; if (c?.sha256) supabaseByHash.set(c.sha256, [...(supabaseByHash.get(c.sha256) ?? []), { productId: String(p._id), url: r }]); }

const sortedKeys = [...keyIndex.keys()].sort((a, b) => b.length - a.length);
function filenameMatches(name) {
  const stemRaw = name.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/\s*\(\d{1,2}\)$/, "");
  const stem = norm(stemRaw);
  const hits = []; let rest = stem;
  for (const k of sortedKeys) {
    if (k.length < 6 && stem !== k) continue;
    if (stem === k) { hits.push({ key: k, kind: "exact-filename" }); break; }
    if (rest.includes(k)) { hits.push({ key: k, kind: "filename-contains" }); rest = rest.replace(k, "#"); }
  }
  return hits;
}
const assets = [];
for (const f of files) {
  const rel = relative(ROOT, f); const name = basename(f); let ext = extname(name).toLowerCase();
  const inCatalogue = rel.startsWith("catalogues-source/");
  if (!IMAGE_EXT.has(ext)) {
    if (!(inCatalogue && !ext) && !(inCatalogue && ext && ext.length > 5)) continue; // extensionless files in catalogues-source may be images
    const sn = sniff(readFileSync(f)); if (!sn) continue; ext = `${sn} (no extension)`;
  }
  const buf = readFileSync(f); const st = statSync(f);
  const d = ext === ".svg" ? null : dims(buf);
  const hits = filenameMatches(name);
  const areaParts = rel.split("/"); const area = areaParts.slice(0, Math.min(areaParts.length - 1, rel.startsWith("work/") ? 2 : 3)).join("/");
  let kind;
  if (/logo/i.test(name) || rel.startsWith("public/brands/")) kind = "logo";
  else if (/^public\/(images|icons|videos|featured)\//.test(rel) || rel.startsWith("public/") && areaParts.length === 2) kind = "website-ui";
  else if (hits.length) kind = "product-image-candidate";
  else if (rel.startsWith("work/")) kind = "pipeline-working-file";
  else kind = "unclassified";
  const hash = sha256(buf);
  const uploaded = supabaseByHash.get(hash) ?? [];
  assets.push({
    path: rel, filename: name, extension: ext, bytes: st.size, width: d?.width ?? "", height: d?.height ?? "", sha256: hash, area, kind,
    filenameProductCodes: hits.map((h) => `${h.key} (${h.kind})`),
    candidateProductIds: [...new Set(hits.flatMap((h) => keyIndex.get(h.key) ?? []))],
    referencedByCode: codeText.includes(name) || (rel.startsWith("public/") && codeText.includes(rel.slice(6))),
    referencedByProducts: uploaded.length ? uploaded.map((u) => u.productId) : [],
    referenceEvidence: uploaded.length ? "byte-identical to Supabase image(s) on these products" : "",
  });
}
const hashGroups = new Map(); for (const a of assets) hashGroups.set(a.sha256, [...(hashGroups.get(a.sha256) ?? []), a.path]);
for (const a of assets) { const g = hashGroups.get(a.sha256); a.duplicateFiles = g.length > 1 ? g.filter((p) => p !== a.path) : []; }

// ---------- 4. Catalogues / PDFs ----------
const pdfAudit = JSON.parse(readFileSync(`${CACHE}/pdf-audit.json`, "utf8"));
const brandNames = [...new Set(products.map((p) => p.brand).filter(Boolean))];
const catalogues = []; const pdfHits = []; // {productId, key, pdf, page, kind, pageImages}
for (const doc of pdfAudit) {
  const rel = doc.path.replace(/^\.\//, ""); const st = statSync(rel);
  const row = { path: rel, filename: basename(rel), bytes: st.size, pageCount: doc.pageCount ?? "", readable: doc.ok, error: doc.error ?? "" };
  if (doc.ok) {
    const firstText = doc.pages.slice(0, 3).map((p) => p.head).join(" ");
    const hay = `${rel} ${JSON.stringify(doc.metadata)} ${firstText}`;
    row.brand = brandNames.filter((b) => b.length > 2 && new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay)).join(" | ");
    row.year = (hay.match(/20[12]\d/g) ?? []).filter((y, i, a) => a.indexOf(y) === i).join(" | ");
    row.title = doc.metadata?.title ?? ""; row.producer = doc.metadata?.producer ?? doc.metadata?.creator ?? "";
    const textPages = doc.pages.filter((p) => p.textChars >= 80).length;
    const imagePages = doc.pages.filter((p) => p.images > 0).length;
    row.pagesWithText = textPages; row.pagesWithImages = imagePages;
    row.embeddedImages = doc.pages.reduce((s, p) => s + Math.max(p.images, 0), 0);
    row.selectableText = textPages === 0 ? "no" : textPages < doc.pageCount * 0.5 ? "partial" : "yes";
    row.appearsScanned = textPages < doc.pageCount * 0.2 && imagePages >= doc.pageCount * 0.5 ? "likely" : "no";
    row.specPages = doc.pages.filter((p) => p.specWords >= 4).length;
    const matched = new Set(); let matchPages = new Set();
    for (const pg of doc.pages) for (const t of pg.tokens) {
      for (const [k, ids] of [[t, keyIndex.get(t)]]) if (ids) { ids.forEach((id) => { matched.add(id); pdfHits.push({ productId: id, key: k, pdf: rel, page: pg.page, kind: "exact-model-in-text", pageImages: pg.images }); }); matchPages.add(pg.page); }
      // variant: token = key + up to 3 extra characters (colour / region suffix)
      for (let cut = 1; cut <= 3; cut++) { const k = t.slice(0, -cut); const ids = k.length >= 6 ? keyIndex.get(k) : null;
        if (ids) ids.forEach((id) => { if (!matched.has(id)) pdfHits.push({ productId: id, key: k, pdf: rel, page: pg.page, kind: `variant-suffix(${t})`, pageImages: pg.images }); }); }
    }
    row.dbProductsMatchedExact = matched.size; row.pagesWithDbModels = matchPages.size;
    row.modelNumbersExtractable = doc.pages.some((p) => p.tokens.length) ? "yes" : "no";
    row.isProductCatalogue = rel.startsWith("work/") || rel.startsWith("public/brochres") ? "no (Halima-generated document)" : row.specPages || row.dbProductsMatchedExact ? "yes" : "unclear";
  }
  catalogues.push(row);
}

// ---------- 5. Per-product inventory ----------
const urlUse = new Map(); for (const p of products) for (const r of new Set(Array.isArray(p.images) ? p.images : [])) urlUse.set(r, [...(urlUse.get(r) ?? []), String(p._id)]);
const inventory = products.map((p) => {
  const id = String(p._id); const imgs = Array.isArray(p.images) ? p.images : [];
  const checks = imgs.map((r) => ({ ref: r, ...checkRef(r) }));
  const real = checks.filter((c) => c.type !== "placeholder");
  const accessible = real.filter((c) => c.ok);
  const good = accessible.filter((c) => !c.flags.some((f) => ["logo-or-stock-image-site", "google-search-thumbnail", "low-resolution", "logo-icon-or-placeholder"].includes(f)));
  const definitive = (c) => /^http-(4|5)\d\d$|invalid|missing-local-file|not-an-image|tls-certificate-invalid|dns-not-found/.test(c.result);
  let status, reasons = [];
  if (!Array.isArray(p.images)) { status = "invalid-image-field"; reasons.push(`images is ${typeof p.images}`); }
  else if (!real.length) status = "no-image-reference";
  else if (good.length) status = "valid-image";
  else if (accessible.length) { status = "accessible-but-questionable"; reasons.push(...new Set(accessible.flatMap((c) => c.flags))); }
  else if (real.every(definitive)) status = real.some((c) => /^invalid/.test(c.result)) ? "invalid-format" : "broken-image";
  else { status = "unverified-needs-review"; reasons.push(...new Set(real.map((c) => c.result))); }
  const sharedWith = [...new Set(real.flatMap((c) => (urlUse.get(c.ref) ?? []).filter((x) => x !== id)))];
  const hashShared = [...new Set(real.flatMap((c) => (c.sha256 ? (supabaseByHash.get(c.sha256) ?? []).map((u) => u.productId) : [])).filter((x) => x !== id))];
  const intraDup = real.length !== new Set(real.map((c) => c.sha256 ?? c.ref)).size;
  // Image filename names a different product's model and not this product's own.
  const own = new Set(productKeys(p)); const conflicts = [];
  for (const c of real) if (["supabase", "external-url"].includes(c.type)) {
    const fname = decodeURIComponent(c.ref.split("?")[0].split("/").pop() ?? "");
    const hits = filenameMatches(fname).map((h) => h.key);
    if (hits.length && !hits.some((k) => own.has(k) || [...own].some((o) => o.includes(k) || k.includes(o)))) conflicts.push(`${fname} → ${hits.join("/")}`);
  }
  if (sharedWith.length || hashShared.length) reasons.push("image shared with other product(s)");
  if (conflicts.length) reasons.push("image filename names another model");
  const needsReview = ["accessible-but-questionable", "unverified-needs-review", "invalid-format", "invalid-image-field"].includes(status) || conflicts.length > 0;
  return {
    productId: id, id: p.id, slug: p.slug, sku: p.sku, name: p.name, brand: p.brand, brandSlug: p.brandSlug ?? "", model: p.model, category: p.category, categorySlug: p.categorySlug, subcategory: p.subcategory,
    status: p.status, imageFields: imageFields.join(" | "), imageCount: real.length, placeholderRefs: checks.length - real.length,
    storageTypes: [...new Set(real.map((c) => c.type))], imageStatus: status, hasValidImage: status === "valid-image", missingImage: status === "no-image-reference",
    brokenImage: status === "broken-image", needsManualReview: needsReview, multipleImages: real.length > 1, duplicateImage: sharedWith.length > 0 || hashShared.length > 0 || intraDup,
    sharedImageWithProductIds: [...new Set([...sharedWith, ...hashShared])], filenameConflicts: conflicts, notes: [...new Set(reasons)].join("; "),
    images: checks.map((c) => ({ ref: c.type === "mongodb-base64" ? `data:${c.contentType ?? "?"};base64,… (${c.bytes ?? "?"} bytes)` : c.ref, storageType: c.type, result: c.result, httpStatus: c.status ?? null,
      contentType: c.contentType ?? null, width: c.width ?? null, height: c.height ?? null, redirected: !!c.redirected, error: c.error ?? null, flags: c.flags ?? [], sha256: c.sha256 ?? null })),
  };
});
const invById = new Map(inventory.map((r) => [r.productId, r]));

// ---------- 6. Candidate matches ----------
const candidates = [];
for (const a of assets) if (a.kind === "product-image-candidate" || (a.candidateProductIds.length && a.kind !== "logo")) {
  for (const code of a.filenameProductCodes) {
    const [key, kindRaw] = code.split(" ("); const kind = kindRaw.replace(")", "");
    for (const pid of keyIndex.get(key) ?? []) {
      const inv = invById.get(pid); const keyIsSku = norm(byId.get(pid).sku) === key; const shared = (keyIndex.get(key) ?? []).length > 1;
      const conf = kind === "exact-filename" && !shared ? "high" : (key.length >= 8 && !shared) ? "medium" : "low";
      candidates.push({ productId: pid, sku: inv.sku, model: inv.model, brand: inv.brand, productImageStatus: inv.imageStatus, candidate: a.path, candidateType: "local-file", source: a.area, page: "",
        evidence: `${kind === "exact-filename" ? "filename equals" : "filename contains"} ${keyIsSku ? "SKU" : "model"} ${key}${shared ? ` (key shared by ${(keyIndex.get(key) ?? []).length} products)` : ""}${a.referencedByProducts.includes(pid) ? "; already uploaded to this product (byte-identical)" : ""}`,
        confidence: conf, alreadyOnProduct: a.referencedByProducts.includes(pid), manualVerificationRequired: true, width: a.width, height: a.height });
    }
  }
}
const pdfByProduct = new Map(); for (const h of pdfHits) pdfByProduct.set(h.productId, [...(pdfByProduct.get(h.productId) ?? []), h]);
for (const [pid, hits] of pdfByProduct) {
  const inv = invById.get(pid); const seen = new Set();
  for (const h of hits) { const k = `${h.pdf}#${h.page}`; if (seen.has(k)) continue; seen.add(k);
    const exact = h.kind === "exact-model-in-text"; const shared = (keyIndex.get(h.key) ?? []).length > 1;
    candidates.push({ productId: pid, sku: inv.sku, model: inv.model, brand: inv.brand, productImageStatus: inv.imageStatus, candidate: `${h.pdf} p.${h.page}`, candidateType: "catalogue-page", source: h.pdf, page: h.page,
      evidence: `${exact ? "exact model text" : h.kind} ${h.key} on page; ${h.pageImages > 0 ? `${h.pageImages} embedded image(s) on page` : "no embedded raster images on page (vector or text only)"}${shared ? "; key shared by several products" : ""}`,
      confidence: exact && h.pageImages > 0 && !shared ? "medium" : "low", alreadyOnProduct: false, manualVerificationRequired: true, width: "", height: "" });
  }
}
// A key that is only part of the model ("TAC30CSA" of "TAC-30CSA/ZGT") or a combined two-model record lowers confidence one step.
const LOWER = { high: "medium", medium: "low", low: "low" };
for (const c of candidates) {
  const p = byId.get(c.productId); const key = (c.evidence.match(/(?:SKU|model|text|\)) ([A-Z0-9]{5,})/) ?? [])[1];
  const full = key && (key === norm(p.sku) || key === norm(p.model));
  const notes = [];
  if (key && !full) { c.confidence = LOWER[c.confidence]; notes.push("matched only part of the model field"); }
  if (isCombinedModel(p.model)) { c.confidence = LOWER[c.confidence]; notes.push("product record combines two models (shown as 'Model on request')"); }
  if (notes.length) c.evidence += `; ${notes.join("; ")}`;
}
const conf = { high: 3, medium: 2, low: 1 };
candidates.sort((a, b) => a.productId.localeCompare(b.productId) || conf[b.confidence] - conf[a.confidence]);
for (const inv of inventory) {
  const c = candidates.filter((x) => x.productId === inv.productId && !x.alreadyOnProduct);
  inv.bestLocalCandidate = c.find((x) => x.candidateType === "local-file")?.candidate ?? "";
  inv.bestCatalogueCandidate = c.find((x) => x.candidateType === "catalogue-page")?.candidate ?? "";
  inv.bestCandidateConfidence = c[0]?.confidence ?? "";
}

// ---------- 7. Duplicates & data quality ----------
const dq = [];
const groupBy = (fn) => { const m = new Map(); for (const p of products) { const k = fn(p); if (!k) continue; m.set(k, [...(m.get(k) ?? []), p]); } return [...m.entries()].filter(([, v]) => v.length > 1); };
for (const [k, g] of groupBy((p) => (typeof p.sku === "string" && p.sku.trim() ? p.sku.trim().toUpperCase() : null)))
  dq.push({ type: "duplicate-sku", certainty: "exact", key: k, productIds: g.map((p) => String(p._id)), detail: g.map((p) => `${p.id}: ${p.name}`).join(" || ") });
for (const [k, g] of groupBy((p) => { const n = norm(p.sku); return n.length >= 4 ? n : null; }))
  if (new Set(g.map((p) => p.sku.trim().toUpperCase())).size > 1) dq.push({ type: "sku-same-after-normalising", certainty: "suspected", key: k, productIds: g.map((p) => String(p._id)), detail: g.map((p) => `${p.sku} (${p.id})`).join(" || ") });
for (const [k, g] of groupBy((p) => { const n = norm(p.model); return isCode(n) ? n : null; }))
  dq.push({ type: new Set(g.map((p) => p.model)).size > 1 ? "model-same-after-normalising (naming variants)" : "duplicate-model", certainty: "suspected", key: k,
    productIds: g.map((p) => String(p._id)), detail: g.map((p) => `${p.model} | ${p.brand} | ${p.name} (${p.id}, ${p.status})`).join(" || ") });
for (const f of ["id", "slug"]) for (const [k, g] of groupBy((p) => p[f])) dq.push({ type: `duplicate-${f}`, certainty: "exact", key: k, productIds: g.map((p) => String(p._id)), detail: "" });
for (const [k, g] of groupBy((p) => (p.name ?? "").trim().toLowerCase() || null)) dq.push({ type: "duplicate-name", certainty: "suspected", key: k, productIds: g.map((p) => String(p._id)), detail: g.map((p) => `${p.model} (${p.id})`).join(" || ") });
const brandVariants = new Map(); for (const p of products) { const k = norm(p.brand); brandVariants.set(k, new Set([...(brandVariants.get(k) ?? []), `${p.brand}|${p.brandSlug ?? "(none)"}`])); }
for (const [k, v] of brandVariants) if (v.size > 1) dq.push({ type: "brand-spelling-or-slug-variants", certainty: "exact", key: k, productIds: products.filter((p) => norm(p.brand) === k).map((p) => String(p._id)), detail: [...v].join(" || ") });
for (const p of products) {
  const pid = String(p._id); const add = (type, detail, certainty = "exact") => dq.push({ type, certainty, key: p.id, productIds: [pid], detail });
  for (const f of ["name", "brand", "sku", "model", "category", "categorySlug"]) if (typeof p[f] !== "string" || !p[f].trim()) add(`missing-${f}`, "");
  if (typeof p.model === "string" && /^(n\/?a|-+|none|tbc|tba)$/i.test(p.model.trim())) add("placeholder-model", p.model);
  if (!p.brandSlug) add("missing-brandSlug", p.brand ?? "");
  if (!p.subcategory || p.subcategory === "General") add("generic-subcategory", p.subcategory ?? "(none)", "suspected");
  if (p.categorySlug && !categoriesConfigured.includes(p.categorySlug)) add("category-not-in-categories-collection", `${p.category} / ${p.categorySlug} (may be configured in code)`, "suspected");
  const inv = invById.get(pid);
  for (const im of inv.images) { if (im.storageType === "mongodb-base64") add("image-stored-as-base64-in-mongodb", im.ref);
    if (im.flags.includes("not-https")) add("image-not-https", im.ref); if (im.storageType === "placeholder") add("placeholder-stored-in-images", im.ref);
    if (im.storageType === "unknown-invalid" || im.storageType === "other") add("malformed-image-reference", im.ref); }
  for (const c of inv.filenameConflicts) add("image-filename-names-another-model", c, "suspected");
}
for (const [url, ids] of urlUse) if (ids.length > 1) dq.push({ type: "same-image-url-on-several-products", certainty: "exact", key: url.startsWith("data:") ? "data-uri" : url, productIds: ids, detail: ids.map((i) => byId.get(i).id).join(" || ") });
for (const [h, list] of supabaseByHash) { const ids = [...new Set(list.map((l) => l.productId))]; const urls = [...new Set(list.map((l) => l.url))];
  if (ids.length > 1 && urls.length > 1) dq.push({ type: "byte-identical-supabase-images-on-several-products", certainty: "exact", key: h, productIds: ids, detail: urls.join(" || ") }); }
for (const [h, paths] of hashGroups) if (paths.length > 1) dq.push({ type: "identical-local-files", certainty: "exact", key: h, productIds: [], detail: paths.join(" || ") });

// ---------- 8. Project structure ----------
const dirStats = (d) => { let files = 0, bytes = 0, pdfs = 0, images = 0; const s = (x) => { for (const e of readdirSync(x, { withFileTypes: true })) { const p = join(x, e.name);
  if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) s(p); } else if (e.isFile()) { files++; bytes += statSync(p).size; const ext = extname(e.name).toLowerCase(); if (ext === ".pdf") pdfs++; if (IMAGE_EXT.has(ext)) images++; } } };
  s(d); return { path: d, type: "directory", files, bytes, sizeMB: Math.round(bytes / 1048576 * 10) / 10, pdfs, imageFiles: images }; };
const PURPOSE = {
  app: "Next.js App Router pages and API routes (app/api/products, app/api/admin/products/images, uploads/presign|complete|discard, product-image-reviews)",
  components: "React UI components (product cards, gallery, admin forms)", lib: "Server/shared logic: MongoDB client, product repository, image storage (Supabase/R2), image rules, bulk image matching, review workflow",
  "lib/repositories": "MongoDB repositories (products, categories, brands, orders, product-image-reviews, …)", data: "Static seed data (categories, brands, legacy products-store.json)",
  scripts: "Maintenance scripts (catalogue import, image restore, storage orphan finder)", "scripts/product-images": "Existing image pipeline: audit → targets → discover (catalogue/SerpAPI) → verify → review-import → upload/apply, with rollback",
  public: "Static website assets served at / (UI images, category/hero images, brand logos, a few product images, brochure PDF)", "catalogues-source": "Supplier catalogues (PDF) and loose product photos supplied for matching — primary local image source",
  work: "Working files from earlier imports, image batches, audits and pipeline runs (extracted/prepared images, manifests, backups)", "work/catalogue-images": "Extracted & prepared catalogue images from earlier batches (Gree, LG, Mazaya, Symphony, Bosch, B+D) with manifests and upload logs",
  "work/catalogue-imports": "Product import batches (JSON + import scripts + results)", tests: "Unit / DB / HTTP tests incl. image pipeline and storage tests",
};
const structure = {
  generatedAt: NOW, root: "(project root)", gitHead: (() => { try { return readFileSync(".git/HEAD", "utf8").trim(); } catch { return null; } })(),
  stack: { next: "16.2.6 (App Router)", react: "19.2.6", node: "engines >=22.13.0 (audit ran on " + process.version + ")", mongodbDriver: "mongodb ^7.6.0", supabase: "@supabase/supabase-js ^2.117.3", s3: "@aws-sdk/client-s3 (Cloudflare R2, legacy/alternative provider)", hosting: "Vercel (vercel.json)", imageLibs: "image-size, sharp (present in node_modules)", pdfTooling: "none in package.json; PyMuPDF 1.26.5 available in local Python (used by scripts/product-images/catalogue_extract.py and this audit)" },
  envVarNames: { mongodb: ["MONGODB_URI", "MONGODB_DB"], supabase: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_STORAGE_BUCKET (default product-images)"], r2: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"], imagePipeline: ["IMAGE_SEARCH_PROVIDER", "SERPAPI_API_KEY", "SERPAPI_REQUEST_LIMIT", "IMAGE_VISION_PROVIDER", "ANTHROPIC_API_KEY", "ICECAT_API_TOKEN", "ICECAT_CONTENT_TOKEN", "IMAGE_* tuning"] },
  directories: ["app", "components", "lib", "lib/repositories", "data", "scripts", "scripts/product-images", "public", ...readdirSync("public", { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `public/${e.name}`),
    "catalogues-source", "work", ...readdirSync("work", { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `work/${e.name}`), "tests"].map((d) => ({ ...dirStats(d), purpose: PURPOSE[d] ?? "" })),
  excludedFromScan: [...SKIP_DIRS],
  codePaths: {
    mongoClient: "lib/mongodb.ts", productRepository: "lib/repositories/products.ts", productApiPublic: "app/api/products/route.ts", productApiAdmin: "app/api/admin/products/route.ts",
    productImagesApi: "app/api/admin/products/images/route.ts", uploads: ["app/api/admin/uploads/presign/route.ts", "app/api/admin/uploads/complete/route.ts", "app/api/admin/uploads/discard/route.ts", "app/api/admin/uploads/config/route.ts"],
    imageReviewApi: ["app/api/admin/product-image-reviews/route.ts", "app/api/admin/product-image-reviews/preview/route.ts"], storage: ["lib/image-storage.ts", "lib/supabase-storage.ts", "lib/r2.ts", "lib/image-storage-cleanup.ts"],
    imageRules: ["lib/product-images.ts", "lib/admin-gallery.ts", "lib/product-image-display.ts", "lib/admin-image-upload.ts", "lib/safe-image-fetch.ts"], bulkMatch: "lib/bulk-image-match.ts", reviewWorkflow: ["lib/product-image-review.ts", "lib/repositories/product-image-reviews.ts"],
    pipeline: "scripts/product-images/ (pipeline.mjs, catalogue-match.mjs, catalogue_extract.py, search.mjs, vision.mjs, policy.mjs)", otherImageScripts: ["scripts/restore-product-images.mjs", "scripts/find-storage-orphans.mjs", "scripts/build-hero-assets.mjs"],
  },
  productSchema: { collection: "products", imageField: "images: string[] (first = primary); generic placeholder /featured/hisense-window-ac.png is display-only", observedFields: fieldCounts, imageRelatedFieldsFound: imageFields },
  catalogueLocations: catalogues.map((c) => c.path), imageAssetLocations: [...new Set(assets.map((a) => a.area))].map((area) => ({ area, files: assets.filter((a) => a.area === area).length })),
};

// ---------- 9. Summary ----------
const N = inventory.length;
const count = (fn) => inventory.filter(fn).length;
const allRefs = inventory.flatMap((r) => r.images.filter((i) => i.storageType !== "placeholder"));
const refBy = (t) => allRefs.filter((i) => i.storageType === t).length;
const noValid = inventory.filter((r) => !r.hasValidImage);
const matchable = (lvl) => noValid.filter((r) => candidates.some((c) => c.productId === r.productId && !c.alreadyOnProduct && lvl.includes(c.confidence))).length;
const summary = {
  generatedAt: NOW, database: "MongoDB (read-only find), collection products", totalProductsAudited: N,
  productStatus: Object.fromEntries([...new Set(products.map((p) => p.status))].map((s) => [s, products.filter((p) => p.status === s).length])),
  products: {
    withValidImage: { count: count((r) => r.hasValidImage), pct: pct(count((r) => r.hasValidImage), N) },
    accessibleButQuestionable: { count: count((r) => r.imageStatus === "accessible-but-questionable"), pct: pct(count((r) => r.imageStatus === "accessible-but-questionable"), N), meaning: "image loads but every accessible image is a Google search thumbnail, logo/stock-site image or under 300 px" },
    noImageReference: { count: count((r) => r.missingImage), pct: pct(count((r) => r.missingImage), N) },
    brokenImage: { count: count((r) => r.brokenImage), pct: pct(count((r) => r.brokenImage), N) },
    unverified: { count: count((r) => r.imageStatus === "unverified-needs-review"), pct: pct(count((r) => r.imageStatus === "unverified-needs-review"), N) },
    invalidFormat: { count: count((r) => ["invalid-format", "invalid-image-field"].includes(r.imageStatus)), pct: pct(count((r) => ["invalid-format", "invalid-image-field"].includes(r.imageStatus)), N) },
    needingManualReview: { count: count((r) => r.needsManualReview), pct: pct(count((r) => r.needsManualReview), N) },
    withMultipleImages: { count: count((r) => r.multipleImages), pct: pct(count((r) => r.multipleImages), N) },
    withDuplicateImageReferences: { count: count((r) => r.duplicateImage), pct: pct(count((r) => r.duplicateImage), N) },
    withoutValidImage: { count: noValid.length, pct: pct(noValid.length, N) },
    byStatusActive: Object.fromEntries(["valid-image", "accessible-but-questionable", "no-image-reference", "broken-image", "unverified-needs-review", "invalid-format"].map((s) => [s, inventory.filter((r) => r.status === "active" && r.imageStatus === s).length])),
    byStorageType: Object.fromEntries(["supabase", "external-url", "mongodb-base64", "relative-public-path", "local-project-path", "other-r2", "other", "unknown-invalid"].map((t) => [t, count((r) => r.storageTypes.includes(t))])),
  },
  imageReferences: {
    total: allRefs.length, supabase: refBy("supabase"), externalUrl: refBy("external-url"), mongodbBase64: refBy("mongodb-base64"), relativePublicPath: refBy("relative-public-path"),
    localProjectPath: refBy("local-project-path"), r2: refBy("other-r2"), otherOrUnknown: refBy("other") + refBy("unknown-invalid"), placeholderStoredInImages: inventory.reduce((s, r) => s + r.placeholderRefs, 0),
    uniqueUrls: refs.size, results: allRefs.reduce((m, i) => ((m[i.result] = (m[i.result] ?? 0) + 1), m), {}),
    flags: allRefs.flatMap((i) => i.flags).reduce((m, f) => ((m[f] = (m[f] ?? 0) + 1), m), {}),
    externalHosts: Object.fromEntries(Object.entries(allRefs.filter((i) => i.storageType === "external-url").reduce((m, i) => { const h = hostOf(i.ref); m[h] = (m[h] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])),
  },
  byBrandWithoutValidImage: Object.fromEntries(Object.entries(noValid.reduce((m, r) => ((m[r.brand] = (m[r.brand] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])),
  byCategoryWithoutValidImage: Object.fromEntries(Object.entries(noValid.reduce((m, r) => ((m[r.category] = (m[r.category] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])),
  localAssets: { total: assets.length, byKind: assets.reduce((m, a) => ((m[a.kind] = (m[a.kind] ?? 0) + 1), m), {}), byArea: assets.reduce((m, a) => ((m[a.area] = (m[a.area] ?? 0) + 1), m), {}), identicalFileGroups: [...hashGroups.values()].filter((g) => g.length > 1).length, alreadyUploadedCopies: assets.filter((a) => a.referencedByProducts.length).length },
  catalogues: { pdfs: catalogues.length, productCatalogues: catalogues.filter((c) => c.isProductCatalogue === "yes").length, totalPages: catalogues.reduce((s, c) => s + (Number(c.pageCount) || 0), 0), unreadable: catalogues.filter((c) => !c.readable).length },
  matchability: {
    productsWithoutValidImage: noValid.length,
    withHighConfidenceLocalOrCatalogueCandidate: matchable(["high"]), withMediumOrBetterCandidate: matchable(["high", "medium"]), withAnyCandidate: matchable(["high", "medium", "low"]),
    likelyNeedingExternalSourcing: noValid.length - matchable(["high", "medium"]),
    note: "Candidates are leads only: none were assigned; each needs visual confirmation and documented usage rights.",
  },
  candidatesTotal: candidates.length, dataQualityIssues: dq.reduce((m, d) => ((m[d.type] = (m[d.type] ?? 0) + 1), m), {}),
  validationLimitations: [
    "External URLs were checked with one ranged GET (first 64 KB, 12 s timeout, one retry for timeouts/network errors); HEAD was not relied on. A failure is a strong signal, not proof — some hosts block automated requests or hot-linking.",
    "Supabase URLs were downloaded in full (≤15 MB) to hash and measure them; external images were not fully downloaded, so cross-host byte duplicates are not detected.",
    "The audit machine's DNS filters some hosts; URLs failing with ENOTFOUND were re-fetched using addresses from public resolvers (1.1.1.1 / 8.8.8.8) and are marked via=public-dns.",
    "An expired / invalid TLS certificate is counted as broken: browsers refuse to load such images.",
    "Image dimensions come from the downloaded bytes; when they could not be read, the content-type header decided whether the response is an image.",
    "'Questionable' is a heuristic (Google search thumbnails, logo/stock/app-icon/placeholder sources, < 400 px); it does not judge whether the picture shows the right model.",
    "Usage rights of existing external images were not assessed.",
  ],
};

// ---------- 10. Write ----------
writeJson("project-structure.json", structure);
writeJson("product-image-inventory.json", { generatedAt: NOW, products: inventory });
writeCsv("product-image-inventory.csv", inventory.map((r) => ({ ...r, imageRefs: r.images.map((i) => i.ref), imageResults: r.images.map((i) => `${i.storageType}:${i.result}${i.flags.length ? `[${i.flags.join("+")}]` : ""}`), imageSizes: r.images.map((i) => (i.width ? `${i.width}x${i.height}` : "")) })),
  ["productId", "id", "sku", "name", "brand", "model", "category", "subcategory", "status", "imageFields", "imageCount", "storageTypes", "imageStatus", "hasValidImage", "missingImage", "brokenImage", "needsManualReview", "multipleImages", "duplicateImage", "sharedImageWithProductIds", "filenameConflicts", "imageRefs", "imageResults", "imageSizes", "bestLocalCandidate", "bestCatalogueCandidate", "bestCandidateConfidence", "notes"]);
writeJson("image-summary.json", summary);
writeCsv("local-image-assets.csv", assets, ["path", "filename", "extension", "bytes", "width", "height", "kind", "area", "filenameProductCodes", "candidateProductIds", "referencedByProducts", "referenceEvidence", "referencedByCode", "duplicateFiles", "sha256"]);
writeCsv("catalogue-inventory.csv", catalogues, ["path", "filename", "bytes", "pageCount", "brand", "year", "title", "producer", "readable", "error", "selectableText", "appearsScanned", "pagesWithText", "pagesWithImages", "embeddedImages", "specPages", "modelNumbersExtractable", "dbProductsMatchedExact", "pagesWithDbModels", "isProductCatalogue"]);
writeCsv("candidate-image-matches.csv", candidates, ["productId", "sku", "model", "brand", "productImageStatus", "candidateType", "candidate", "source", "page", "evidence", "confidence", "alreadyOnProduct", "manualVerificationRequired", "width", "height"]);
writeCsv("duplicate-and-data-quality-report.csv", dq, ["type", "certainty", "key", "productIds", "detail"]);
console.log(JSON.stringify({ products: summary.products, refs: summary.imageReferences.results, matchability: summary.matchability, assets: summary.localAssets, catalogues: summary.catalogues }, null, 1));
