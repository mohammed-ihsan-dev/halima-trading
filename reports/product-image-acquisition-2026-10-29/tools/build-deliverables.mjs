// Builds the deliverables of the 2026-10-29 image-acquisition run from this run's own data (no network, no database):
// tools/baseline/* (fresh audit), tools/cache/import-flags.json, pipeline-state/catalogue-runs/*.candidates.json,
// tools/cache/official-candidates.json. Writes only under reports/product-image-acquisition-2026-10-29/.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");

const R = "reports/product-image-acquisition-2026-10-29";
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const csv = (p) => Papa.parse(readFileSync(p, "utf8"), { header: true, skipEmptyLines: true }).data;
const cell = (v) => { const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const writeCsv = (name, rows, cols) => writeFileSync(`${R}/${name}`, [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n", "utf8");
const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});

const inv = J(`${R}/tools/baseline/product-image-inventory.json`).products;
const summary = J(`${R}/tools/baseline/image-summary.json`);
const flags = J(`${R}/tools/cache/import-flags.json`);
const flagged = new Map(flags.rows.map((r) => [r.productId, r]));
const official = new Map(J(`${R}/tools/cache/official-candidates.json`).results.map((r) => [r.productId, r]));
const localMatches = csv(`${R}/tools/baseline/candidate-image-matches.csv`);
const catRuns = readdirSync(`${R}/pipeline-state/catalogue-runs`).filter((f) => f.endsWith(".candidates.json")).map((f) => J(`${R}/pipeline-state/catalogue-runs/${f}`));
const catByProduct = new Map();
for (const run of catRuns) for (const [id, list] of Object.entries(run.products ?? {})) for (const c of list) catByProduct.set(id, [...(catByProduct.get(id) ?? []), { ...c, pdf: run.pdf }]);
const byPid = new Map(inv.map((p) => [p.productId, p]));
/** Same folder rule as lib/r2.ts productKeySegment (the importer uses SKU, falling back to the product id). */
const keySegment = (ref) => { if (typeof ref !== "string") return ""; const seg = ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, ""); return /^\d{4}$/.test(seg) ? `p-${seg}` : seg; };
const AVG_IMPORT_BYTES = Math.round(flags.importLog.filter((l) => !l.reused).reduce((s, l) => s + (l.bytes ?? 0), 0) / Math.max(1, flags.importLog.filter((l) => !l.reused).length));

// ---------- Manufacturer source matrix (this run's checks + earlier pipeline findings) ----------
const M = (official, status, evidence, access, terms, rights) => ({ official, status, evidence, access, terms, rights });
const MATRIX = {
  Haier: M("haier.com/ae", "usable — exact model pages", "probe: 15 exact model pages with og:image (e.g. /ae/washing-machines/hwd110-bd14397su1.shtml); sitemap 711 URLs", "allowed by robots.txt (/ae/); local DNS needed public resolver", "legal page not reachable this run", "unresolved — no licence found; needs distributor permission"),
  LG: M("lg.com/ae", "usable — model pages (regional suffix differs)", "probe: 9 exact + 4 base-model pages; sitemap 3,349 URLs; og:image on page", "allowed (robots disallows only search URLs)", "lg.com/ae/terms-of-use returned 404 — terms not located", "unresolved — no licence found; needs LG Gulf permission"),
  Samsung: M("samsung.com/ae", "usable — model pages", "probe: 4 exact model pages; b2c sitemap 4,783 URLs", "allowed for product pages", "legal page: 'grants you no license…'; 'unauthorized use or reproduction … strictly prohibited'", "unresolved — explicit: no licence granted; needs Samsung Gulf permission"),
  Midea: M("midea.com/ae (sitemap returns HTML, no product locs)", "no model pages found", "search: Sharaf DG, Carrefour, Jumbo list WQP83802FS; no official UAE page found; local catalogue is small appliances (0/64 matched)", "n/a", "n/a", "retailer images only — not licensed"),
  Westpoint: M("none (westpointuae.com is an unrelated software company)", "no official source", "search: WST-30122.LTYH only on Desertcart/Carrefour/Sharaf DG; model strings vary", "n/a", "n/a", "retailer images only — not licensed"),
  Clivet: M("clivet.com (EU) / Clivet UAE PDF (info@clivet.ae)", "no exact models", "products in our DB have no manufacturer model numbers (e.g. '3-ton-rt-duct-ac'); UAE PDF lists no model codes", "n/a", "n/a", "request images + model codes from Clivet UAE"),
  TCL: M("tcl.com/ae (sitemap 404)", "no machine-readable source", "search: Sharaf DG, Lulu list TAC-24CSD/ZGI; catalogue covers 2 of 20", "n/a", "n/a", "retailer images only — not licensed"),
  Mazaya: M("mazayauae.com (pipeline adapter exists)", "adapter exists; catalogue crops are series photos", "catalogue: 34 crops, 0 exact-unambiguous", "allowed (earlier pipeline check)", "register: permission_pending", "unresolved"),
  Indesit: M("indesit.com (search HTTP 500; indesit.ae sitemap HTML)", "no addressable UAE models", "search: IGGSM-533G3 only at Sharaf DG/B.TECH", "n/a", "n/a", "retailer images only"),
  Panasonic: M("panasonic.com/mea", "blocked", "HTTP 403 to automated requests (not bypassed); search: retailers only", "blocked", "n/a", "unresolved"),
  Daewoo: M("daewooelectronics.com (UK range)", "no source", "search: DW-DGC-665BSF not found anywhere", "n/a", "n/a", "ask supplier for images"),
  Gree: M("gree.com / NIA Gree catalogue PDF", "catalogue only; -IND suffix never printed", "catalogue: 0 matches (model suffix)", "n/a", "n/a", "unresolved"),
  "General Line": M("genralline.com", "blocked / logo only", "current links are a logo that now returns HTTP 403", "HTTP 403", "n/a", "ask supplier"),
  "Blue Star": M("bluestarindia.com (India range)", "no matching models", "search: HW18CYRFA3 not found; Indian site uses different codes", "n/a", "n/a", "ask supplier"),
  "Mitsubishi Electric": M("mitsubishielectric.com/ae (sitemap 404)", "no machine-readable source", "search: MS-GS18 at Carrefour/Sharaf DG/FAJ Trading only", "n/a", "n/a", "retailer images only"),
  Geepas: M("geepas.com", "excluded", "terms prohibit automated access (scripts/crawlers) — earlier pipeline check", "prohibited", "terms quoted in pipeline", "do not automate; ask Geepas"),
  "Super General": M("supergeneral.com (pipeline adapter exists)", "adapter + catalogue", "catalogue: 3 exact-unambiguous crops, all < 400 px", "allowed", "register: permission_pending", "unresolved"),
  Toshiba: M("toshiba-lifestyle.com/ae", "unavailable", "returns 404 (earlier pipeline check)", "n/a", "n/a", "ask supplier"),
  Aftron: M("aftron.com", "not researched this run", "4 products need images", "", "", "ask supplier"),
  Krome: M("none found", "catalogue only", "catalogue: 1 exact-unambiguous crop (low-res) of 7", "n/a", "register: permission_pending", "unresolved"),
  Simfer: M("simfer.com.tr", "site reachable; models not in sitemap", "probe: 289 product URLs, none contain our SMF… codes (Turkish range)", "allowed", "not checked", "ask Simfer UAE distributor"),
  "O General": M("ogeneralac.com", "site reachable; models not in sitemap", "probe: 164 product URLs, none contain our 8 target models", "allowed", "not checked", "ask distributor"),
  Kenwood: M("kenwoodworld.com", "not researched this run", "2 products need images", "", "", "ask supplier"),
  Phoenix: M("phoenix-uae.com", "blocked", "HTTP 403 (earlier pipeline check)", "blocked", "", "ask supplier"),
  Nikai: M("nikai.com", "no product search; catalogue", "catalogue: 0 matches for the 2 targets", "n/a", "register: permission_pending", "unresolved"),
  Whirlpool: M("whirlpool.ae", "blocked", "sitemap HTTP 403", "blocked", "", "unresolved"),
  Symphony: M("symphonylimited.com", "excluded", "terms prohibit crawling (earlier pipeline check); 0 products need images", "prohibited", "register: permission_denied", "denied"),
};

// ---------- Per-product classification ----------
const catalogueCls = (c) => c.identity === "EXACT_UNAMBIGUOUS" && c.quality !== "LOW_RESOLUTION" ? "verified exact match"
  : c.identity === "EXACT_UNAMBIGUOUS" ? "uncertain (exact model but image < 400 px)" : c.identity === "SHARED_IMAGE" ? "uncertain (series photo shared by several models)" : "likely match (needs review)";
const rows = [], cands = [];
const RANK = { "verified exact match": 1, "likely match": 2, uncertain: 3 };
const rank = (cls) => RANK[Object.keys(RANK).find((k) => cls.startsWith(k))] ?? 9;
for (const p of inv) {
  const flag = flagged.get(p.productId);
  const needs = !p.hasValidImage || !!flag;
  const list = [];
  const o = official.get(p.productId);
  for (const c of o?.candidates ?? []) list.push({ source: "official manufacturer page", sourceUrl: c.pageUrl, image: c.imageUrl, page: "", evidence: c.evidence, dims: c.width ? `${c.width}x${c.height}` : "", classification: c.classification === "verified exact match" ? "verified exact match" : c.classification.startsWith("likely") ? "likely match (regional suffix)" : `uncertain (${c.classification})`, rights: MATRIX[p.brand]?.rights ?? "unresolved", downloadable: c.imageStatus === 200 || c.imageStatus === 206 });
  for (const c of catByProduct.get(p.id) ?? []) list.push({ source: "brand catalogue PDF (pipeline crop)", sourceUrl: `catalogues-source/${c.pdf}`, image: `pipeline-state/${c.preview}`, page: c.page, evidence: `"${c.evidence?.text}" ${c.evidence?.level} on p.${c.page}; row: ${(c.rowModels ?? []).join(", ")}; ${c.issues?.join("; ") ?? ""}`, dims: c.nativeLongestPx ? `~${c.nativeLongestPx}px longest` : "", classification: catalogueCls(c), rights: c.permission?.status === "permission_pending" ? `unresolved (${c.permission.holder}: catalogue has no reuse terms)` : "unresolved", downloadable: true, sha256: c.sourceSha256, method: c.cropSource });
  for (const m of localMatches.filter((x) => x.productId === p.productId && x.alreadyOnProduct !== "true" && x.candidateType === "local-file" && x.confidence !== "low"))
    list.push({ source: "local file", sourceUrl: m.candidate, image: m.candidate, page: "", evidence: m.evidence, dims: m.width ? `${m.width}x${m.height}` : "", classification: m.confidence === "high" ? "likely match (exact filename; earlier reviews found series/duplicate issues for several)" : "uncertain (filename contains model)", rights: "unresolved (supplied file, no documented licence)", downloadable: true });
  list.sort((a, b) => rank(a.classification) - rank(b.classification));
  const best = list[0];
  const cls = !needs ? "already has a suitable image" : best ? best.classification.replace(/ \(.*$/, "") : "no candidate found";
  rows.push({ productId: p.productId, id: p.id, brand: p.brand, model: p.model, name: p.name, category: p.category, subcategory: p.subcategory, status: p.status, imageStatus: p.imageStatus,
    storageTypes: p.storageTypes, currentImage: p.images[0]?.ref?.slice(0, 200) ?? "", importedFrom: flag ? `${flag.sourceHost} (stored in Supabase)` : "", needsImage: needs,
    needReason: !needs ? "" : flag ? "stored image was imported from a Google search thumbnail / logo site" : p.imageStatus, classification: cls, candidates: list.length,
    bestSource: best?.source ?? "", bestCandidate: best?.image ?? "", bestEvidence: best?.evidence ?? "", rightsStatus: needs ? (best ? best.rights : "n/a — no candidate") : "existing image (rights not re-reviewed)" });
  list.forEach((c, i) => cands.push({ productId: p.productId, id: p.id, brand: p.brand, model: p.model, rank: i + 1, ...c }));
}
const need = rows.filter((r) => r.needsImage);

// ---------- Write CSVs ----------
mkdirSync(R, { recursive: true });
writeCsv("PRODUCT-IMAGE-STATUS.csv", rows, ["productId", "id", "brand", "model", "name", "category", "subcategory", "status", "imageStatus", "storageTypes", "currentImage", "importedFrom", "needsImage", "needReason", "classification", "candidates", "bestSource", "bestCandidate", "bestEvidence", "rightsStatus"]);
writeCsv("IMAGE-CANDIDATE-MATCHES.csv", cands.filter((c) => need.some((n) => n.productId === c.productId)), ["productId", "id", "brand", "model", "rank", "classification", "source", "sourceUrl", "page", "image", "dims", "evidence", "rights", "downloadable", "method", "sha256"]);
const brands = [...new Set(inv.map((p) => p.brand))].sort();
const brandRows = brands.map((b) => {
  const r = rows.filter((x) => x.brand === b), n = r.filter((x) => x.needsImage);
  return { brand: b, products: r.length, active: r.filter((x) => x.status === "active").length, suitableImage: r.length - n.length, needsImage: n.length, noImageAtAll: r.filter((x) => x.imageStatus === "no-image-reference").length,
    brokenOrUnsuitable: r.filter((x) => ["broken-image", "accessible-but-questionable"].includes(x.imageStatus)).length, thumbnailImports: r.filter((x) => x.importedFrom).length,
    supabaseHosted: r.filter((x) => String(x.storageTypes).includes("supabase")).length, externalHosted: r.filter((x) => String(x.storageTypes).includes("external")).length,
    verifiedExactCandidates: n.filter((x) => x.classification === "verified exact match").length, likelyCandidates: n.filter((x) => x.classification === "likely match").length,
    noCandidate: n.filter((x) => x.classification === "no candidate found").length, officialSource: MATRIX[b]?.official ?? "not researched", officialStatus: MATRIX[b]?.status ?? "" };
});
writeCsv("BRAND-INVENTORY.csv", brandRows, Object.keys(brandRows[0]));
const catInv = csv(`${R}/tools/baseline/catalogue-inventory.csv`).map((c) => {
  const run = catRuns.find((x) => x.pdf === c.filename);
  const list = run ? Object.values(run.products ?? {}).flat() : [];
  return { ...c, extractionRun: run ? `pipeline catalogue (${run.brand})` : c.isProductCatalogue === "yes" ? "not run — no target products of this brand" : c.appearsScanned === "likely" ? "not run — scanned; OCR (tesseract) not installed" : "not run",
    cropsProduced: list.length, exactUnambiguous: list.filter((x) => x.identity === "EXACT_UNAMBIGUOUS").length, exactUsable: list.filter((x) => x.identity === "EXACT_UNAMBIGUOUS" && x.quality !== "LOW_RESOLUTION").length,
    sharedSeriesPhotos: list.filter((x) => x.identity === "SHARED_IMAGE").length, lowResolution: list.filter((x) => x.quality === "LOW_RESOLUTION").length };
});
writeCsv("CATALOGUE-INVENTORY.csv", catInv, [...Object.keys(catInv[0])]);
const extracted = [];
for (const run of catRuns) for (const [id, list] of Object.entries(run.products ?? {})) for (const c of list) {
  const p = inv.find((x) => x.id === id);
  extracted.push({ origin: "this run (pipeline catalogue crop)", sourceCatalogue: run.pdf, page: c.page, extractedPath: `${R}/pipeline-state/${c.extracted}`, preview: `${R}/pipeline-state/${c.preview}`, sha256: c.sourceSha256, brand: p?.brand ?? run.brand, model: c.model, productId: p?.productId ?? "",
    method: c.cropSource, nativeLongestPx: c.nativeLongestPx, format: "png (lossless crop)", identity: c.identity, quality: c.quality, matchConfidence: catalogueCls(c), suitableForProductPage: c.eligible ? "yes" : `no — ${(c.issues ?? []).join("; ")}`, rights: c.permission?.status ?? "unresolved" });
}
for (const a of csv(`${R}/tools/baseline/local-image-assets.csv`).filter((a) => a.kind === "product-image-candidate"))
  extracted.push({ origin: `existing local file (${a.area})`, sourceCatalogue: "", page: "", extractedPath: a.path, preview: "", sha256: a.sha256, brand: "", model: a.filenameProductCodes, productId: a.candidateProductIds, method: "existing file", nativeLongestPx: Math.max(Number(a.width) || 0, Number(a.height) || 0) || "", format: a.extension, identity: "", quality: "", matchConfidence: "filename match only", suitableForProductPage: a.referencedByProducts ? "already uploaded (byte-identical)" : "needs review", rights: "unresolved" });
writeCsv("EXTRACTED-IMAGE-INVENTORY.csv", extracted, Object.keys(extracted[0]));
const matrixRows = brands.map((b) => ({ brand: b, productsNeedingImage: need.filter((n) => n.brand === b).length, ...(MATRIX[b] ?? { official: "not researched (no products need images)", status: "", evidence: "", access: "", terms: "", rights: "" }) }));
writeCsv("MANUFACTURER-SOURCE-MATRIX.csv", matrixRows, ["brand", "productsNeedingImage", "official", "status", "evidence", "access", "terms", "rights"]);
const hostCounts = count(flags.importLog, (l) => new URL(l.sourceUrl).host);
const lic = [
  ...["Haier", "LG", "Samsung"].map((b) => ({ sourceType: "official manufacturer website", source: MATRIX[b].official, products: need.filter((n) => n.brand === b && n.bestSource === "official manufacturer page").length, evidence: MATRIX[b].terms, status: "rights unresolved", requiredAction: `written image-use permission from ${b} UAE / authorised distributor` })),
  ...catInv.filter((c) => c.cropsProduced > 0).map((c) => ({ sourceType: "brand catalogue PDF", source: c.filename, products: c.exactUnambiguous, evidence: "catalogue contains no reuse terms; supplier-provided ≠ licence (pipeline register)", status: "rights unresolved", requiredAction: "supplier confirmation that catalogue images may be used online" })),
  { sourceType: "supplied local files (catalogues-source/)", source: "catalogues-source/*", products: need.filter((n) => n.bestSource === "local file").length, evidence: "no provenance recorded", status: "rights unresolved", requiredAction: "record who supplied each file" },
  ...Object.entries(hostCounts).sort((a, b) => b[1] - a[1]).map(([h, n]) => ({ sourceType: "already imported to Supabase (product_image_imports)", source: h, products: n,
    evidence: /gstatic|seeklogo/.test(h) ? "Google search thumbnail / logo site — origin unknown" : /amazon|flixcart|akinon|dsmcdn|cartlow|bzaaarz|icecube|kitchenking|nidadanish|barajeelac|supercool|coolersonline|mannaihome|applinz|taqsac|tafani|microless|jomla|mycoolcare|cloudfront|i0\.wp|gumlet/.test(h) ? "retailer / marketplace image" : "manufacturer or distributor site",
    status: /gstatic|seeklogo/.test(h) ? "replace" : "rights unresolved", requiredAction: /gstatic|seeklogo/.test(h) ? "replace with a licensed manufacturer image" : "confirm permission or replace" })),
];
writeCsv("LICENSING-AND-RIGHTS-REVIEW.csv", lic, ["sourceType", "source", "products", "evidence", "status", "requiredAction"]);
// Proposed first production batch (awaiting approval) — nothing imported in this run.
const batch1 = need.filter((n) => n.classification === "verified exact match" && n.bestSource === "official manufacturer page");
writeCsv("IMAGE-IMPORT-RESULTS.csv", batch1.map((n) => ({ productId: n.productId, id: n.id, brand: n.brand, model: n.model, candidateImage: n.bestCandidate, sourcePage: cands.find((c) => c.productId === n.productId)?.sourceUrl, plannedStorageFolder: `products/${keySegment(byPid.get(n.productId)?.sku) || keySegment(n.id)}/<content-hash uuid>.<ext>`,
  estimatedBytes: AVG_IMPORT_BYTES, result: "NOT IMPORTED — awaiting approval (rights unresolved)", importedAt: "" })), ["productId", "id", "brand", "model", "candidateImage", "sourcePage", "plannedStorageFolder", "estimatedBytes", "result", "importedAt"]);

// ---------- Batch review pages ----------
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]);
const reviewable = need.filter((n) => n.candidates > 0).sort((a, b) => rank(a.classification) - rank(b.classification) || a.brand.localeCompare(b.brand));
mkdirSync(`${R}/review`, { recursive: true });
const BATCH = 25; const batchFiles = [];
for (let i = 0; i < reviewable.length; i += BATCH) {
  const slice = reviewable.slice(i, i + BATCH), n = i / BATCH + 1, file = `review/batch-${String(n).padStart(2, "0")}.html`; batchFiles.push({ file, size: slice.length, verified: slice.filter((s) => s.classification === "verified exact match").length });
  const cards = slice.map((p) => {
    const cs = cands.filter((c) => c.productId === p.productId).slice(0, 4);
    return `<section data-pid="${esc(p.productId)}"><h2>${esc(p.brand)} ${esc(p.model)} <small>${esc(p.name)}</small></h2>
<p class="meta">Status: <b>${esc(p.needReason)}</b> · current: ${p.currentImage ? `<img class="cur" src="${esc(p.currentImage)}" referrerpolicy="no-referrer">` : "none"}</p>
<div class="cands">${cs.map((c, k) => `<label class="cand ${c.classification.startsWith("verified") ? "v" : c.classification.startsWith("likely") ? "l" : "u"}"><input type="radio" name="c-${esc(p.productId)}" value="${k}" ${k === 0 ? "checked" : ""}>
<img src="${esc(c.image.startsWith("http") ? c.image : `../${c.image}`)}" referrerpolicy="no-referrer"><span><b>${esc(c.classification)}</b><br>${esc(c.source)} ${c.dims ? `· ${esc(c.dims)}` : ""}<br><a href="${esc(c.sourceUrl.startsWith("http") ? c.sourceUrl : `../../../${c.sourceUrl}`)}" target="_blank">source</a>${c.page ? ` p.${esc(c.page)}` : ""}<br><i>${esc(c.evidence)}</i><br>Rights: ${esc(c.rights)}</span></label>`).join("")}</div>
<div class="act">${["approve", "reject", "search-again", "skip"].map((a) => `<label><input type="radio" name="d-${esc(p.productId)}" value="${a}" ${a === "skip" ? "checked" : ""}> ${a}</label>`).join(" ")}</div></section>`;
  }).join("\n");
  writeFileSync(`${R}/${file}`, `<!doctype html><meta charset="utf-8"><title>Image review batch ${n}</title><style>body{font:14px system-ui;margin:20px;background:#f8fafc}section{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px}h2{font-size:16px;margin:0}small{color:#64748b;font-weight:400}.cands{display:flex;flex-wrap:wrap;gap:10px}.cand{width:260px;border:3px solid #e2e8f0;border-radius:8px;padding:6px;font-size:12px}.cand img{width:100%;height:200px;object-fit:contain;background:#fff}.v{border-color:#16a34a}.l{border-color:#f59e0b}.u{border-color:#9ca3af}.cur{height:60px;vertical-align:middle}.act{margin-top:8px}.bar{position:sticky;top:0;background:#0f172a;color:#fff;padding:10px;border-radius:8px;margin-bottom:12px}</style>
<div class="bar">Batch ${n} · ${slice.length} products · Nothing here writes anywhere. <button id="bulk">Approve all verified exact matches</button> <button id="exp">Export decisions (JSON)</button></div>
<p>Approving here only records your decision. Imports run separately after you confirm rights (all candidates are currently <b>rights unresolved</b>).</p>${cards}
<script>document.getElementById("bulk").onclick=()=>document.querySelectorAll("section").forEach(s=>{if(s.querySelector(".cand.v input:checked"))s.querySelector('input[value="approve"]').checked=true});
document.getElementById("exp").onclick=()=>{const out=[...document.querySelectorAll("section")].map(s=>({productId:s.dataset.pid,decision:s.querySelector('[name^="d-"]:checked').value,candidate:Number(s.querySelector('[name^="c-"]:checked')?.value??0)}));const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({batch:${n},exportedAt:new Date().toISOString(),decisions:out},null,1)],{type:"application/json"}));a.download="review-decisions-batch-${n}.json";a.click()};</script>`);
}

// ---------- Numbers for the markdown files ----------
const stats = {
  products: inv.length, brands: brands.length, statuses: count(inv, (p) => p.status),
  suitable: rows.filter((r) => !r.needsImage).length, needs: need.length, noImage: need.filter((n) => n.imageStatus === "no-image-reference").length, unsuitableLoads: need.filter((n) => n.imageStatus === "accessible-but-questionable" && !n.importedFrom).length,
  broken: need.filter((n) => n.imageStatus === "broken-image").length, thumbnailImports: need.filter((n) => n.importedFrom).length,
  byClass: count(need, (n) => n.classification), byBest: count(need.filter((n) => n.candidates), (n) => `${n.bestSource} → ${n.classification}`),
  officialVerified: need.filter((n) => n.classification === "verified exact match" && n.bestSource === "official manufacturer page").length,
  catalogueVerified: need.filter((n) => n.classification === "verified exact match" && n.bestSource.startsWith("brand catalogue")).length,
  supabaseRefs: summary.imageReferences.supabase, externalRefs: summary.imageReferences.externalUrl, base64Refs: summary.imageReferences.mongodbBase64,
  importLog: { records: flags.importLog.length, newObjects: flags.importLog.filter((l) => !l.reused).length, bytes: flags.importLog.reduce((s, l) => s + (l.bytes ?? 0), 0), avgBytes: AVG_IMPORT_BYTES, decodeSkipped: flags.importLog.filter((l) => l.width == null).length },
  batches: batchFiles, reviewable: reviewable.length, brandRows,
};
writeFileSync(`${R}/tools/cache/stats.json`, JSON.stringify(stats, null, 1));
console.log(JSON.stringify({ ...stats, brandRows: undefined }, null, 1));
