// 29-product image pilot — review-ready manifest. READ-ONLY for MongoDB (find only), storage and source files.
// Reuses the existing pipeline's validation (images.mjs inspect/optimise), permission rules (policy.mjs resolvePermission),
// audit classes (audit-classes.mjs) and storage-key scheme, so the manifest shows exactly what a later upload would produce.
// Writes only under reports/product-image-pilot/.
// Run from the project root:
//   node --env-file=.env.local --import ./tests/support/register-ts.mjs reports/product-image-pilot/tools/build-pilot.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inspect, optimise, sha256, deterministicUuid } from "../../../scripts/product-images/images.mjs";
import { resolvePermission } from "../../../scripts/product-images/policy.mjs";
import { classifyRefs, refType } from "../../../scripts/product-images/audit-classes.mjs";

const require = createRequire(import.meta.url);
// The audit machine's DNS sometimes fails SRV lookups (ESERVFAIL); PILOT_PUBLIC_DNS=1 resolves them via public resolvers.
const dnsMod = await import("node:dns");
const publicDns = process.env.PILOT_PUBLIC_DNS === "1";
if (publicDns) dnsMod.setServers(["1.1.1.1", "8.8.8.8"]);
const publicLookup = (host, opts, cb) => dnsMod.promises.resolve4(host).then((a) => (opts?.all ? cb(null, a.map((address) => ({ address, family: 4 }))) : cb(null, a[0], 4)), cb);
const sharp = require("sharp");
const Papa = require("papaparse");
const { MongoClient, ObjectId } = require("mongodb");
const { productKeySegment } = await import("@/lib/r2");
const { getSupabaseStorageConfig } = await import("@/lib/supabase-storage");
const { isCombinedModel } = await import("@/lib/product-model");

const ROOT = process.cwd();
const OUT = "reports/product-image-pilot";
const AUDIT = "reports/product-image-audit";
const STATE = "work/product-image-pipeline";
const NOW = new Date().toISOString();
mkdirSync(`${OUT}/previews`, { recursive: true });
mkdirSync(`${OUT}/tools/cache`, { recursive: true });
const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const readJson = (p, d = null) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const readCsv = (p) => Papa.parse(readFileSync(p, "utf8"), { header: true, skipEmptyLines: true }).data;
const rel = (p) => path.relative(ROOT, path.resolve(ROOT, p));

// ---------- 1. Pilot list: the audit's next-steps.md table is the source of truth ----------
const pilotRows = readFileSync(`${AUDIT}/next-steps.md`, "utf8").split("\n").filter((l) => /^\| \d+ \| (high|medium) \|/.test(l))
  .map((l) => { const c = l.split("|").map((x) => x.trim()); return { n: Number(c[1]), auditConfidence: c[2], productId: c[3], brand: c[4], model: c[5], auditCandidate: c[6] }; });
if (pilotRows.length !== 29) throw new Error(`expected 29 pilot rows in next-steps.md, found ${pilotRows.length}`);
const inventory = new Map(readJson(`${AUDIT}/product-image-inventory.json`).products.map((p) => [p.productId, p]));
const auditCands = readCsv(`${AUDIT}/candidate-image-matches.csv`);
const pdfAudit = readJson(`${AUDIT}/tools/cache/pdf-audit.json`);

// ---------- 2. Read-only reconciliation with MongoDB ----------
const client = await new MongoClient(process.env.MONGODB_URI, publicDns ? { lookup: publicLookup } : {}).connect();
let live, related;
try {
  const P = client.db(process.env.MONGODB_DB || "halima").collection("products");
  live = new Map((await P.find({ _id: { $in: pilotRows.map((r) => new ObjectId(r.productId)) } }, { projection: { id: 1, slug: 1, sku: 1, name: 1, brand: 1, model: 1, status: 1, images: 1, updatedAt: 1, category: 1 } }).toArray()).map((d) => [String(d._id), d]));
  // Possible duplicate records: same brand, model equal to the pilot model without its region suffix (".UUAE", "-IND", "(BS)").
  const bases = pilotRows.map((r) => norm(String(r.model).replace(/[.(].*$/, "").replace(/-IND$/i, ""))).filter((b) => b.length >= 5);
  related = (await P.find({ brand: { $in: [...new Set(pilotRows.map((r) => r.brand))] } }, { projection: { id: 1, sku: 1, model: 1, brand: 1, images: 1, status: 1 } }).toArray())
    .filter((d) => bases.includes(norm(String(d.model).replace(/[.(].*$/, "").replace(/-IND$/i, ""))));
} finally { await client.close(); }

// ---------- 3. Earlier pipeline state and manual-review history (read only) ----------
const register = readJson(`${STATE}/permissions.json`, { holders: {} });
const pipeCands = readJson(`${STATE}/candidates.json`, {});
const pipeVerify = readJson(`${STATE}/verify.json`, {});
const assistantDecisions = readJson(`${STATE}/review-decisions.json`, {});
const supplierCands = readJson(`${STATE}/supplier-candidates.json`, {});
const supplierReview = readJson(`${STATE}/supplier-review.json`, {});
const history = new Map(); // file path or product id -> notes
const addHist = (k, note) => k && history.set(k, [...(history.get(k) ?? []), note]);
for (const r of readJson("work/catalogue-images/manifest.json", [])) { if (r.prepared) addHist(r.prepared, `catalogue manifest (${r.source}${r.page ? ` p.${r.page}` : ""}): ${r.decision}${r.note ? ` — ${r.note}` : ""}`); addHist(r.id, `catalogue manifest: ${r.decision}${r.note ? ` — ${r.note}` : ""}`); }
for (const r of readJson("work/catalogue-images/audit/pdf-extraction/gree-symphony-review.json", [])) { const n = `Gree/Symphony PDF review: ${r.matchDecision} (${r.matchConfidence}) — ${r.reviewReason || r.matchEvidence || ""}`.slice(0, 400); addHist(r.extractedFile, n); addHist(r.productId, n); }
for (const r of readJson("work/catalogue-images/batch4/manifest-akai.json", [])) { addHist(r.prepared, `AKAI datasheet review (${r.source} p.${r.page}): ${r.decision}`); addHist(r.id, `AKAI datasheet review: ${r.decision} (${r.prepared})`); }
for (const r of readCsv("work/product-image-matching-2026-10-20/MANUAL-REVIEW.csv")) addHist(`catalogues-source/${r.source_filename}`, `2026-10-20 matching run held for manual review: ${r.issue}`);
const lgMatches = readJson("work/catalogue-images/lg/matches.json", []);
for (const r of Array.isArray(lgMatches) ? lgMatches : []) addHist(r.id, `LG catalogue match: ${r.status} — ${r.method}${r.note ? ` (${r.note})` : ""}`);

// ---------- 4. Candidates per product ----------
const supa = getSupabaseStorageConfig();
const publicBase = supa.ok ? supa.config.publicBaseUrl : null; // public bucket URL (not a secret); used only to show the planned URL
const pageModelCodes = (pdf, page, model) => { // model-like codes on that page from the same family (letters before the first digit)
  const doc = pdfAudit.find((d) => d.path.replace(/^\.\//, "") === pdf); const pg = doc?.pages?.[page - 1];
  const prefix = (norm(model).match(/^[A-Z]+/) ?? [""])[0].slice(0, 2);
  return pg ? [...new Set(pg.tokens.filter((t) => prefix && t.startsWith(prefix) && /\d/.test(t) && t.length >= 5))] : [];
};
const renderReqs = [];
const products = [];
for (const row of pilotRows) {
  const inv = inventory.get(row.productId);
  const doc = live.get(row.productId);
  const pid = doc?.id ?? inv?.id;
  const issues = [];
  if (!doc) issues.push("product not found in MongoDB");
  const imagesNow = doc?.images ?? [];
  const auditImages = (inv?.images ?? []).map((i) => i.ref);
  const unchangedSinceAudit = JSON.stringify(imagesNow) === JSON.stringify(auditImages);
  if (doc && !unchangedSinceAudit) issues.push("images changed since the audit — re-audit before review");
  // How the EXISTING pipeline classifies this product (its own classifyRefs on the audited reference checks).
  const pipelineClass = classifyRefs((inv?.images ?? []).map((i) => ({ type: refType(i.ref, publicBase ? `${publicBase}/` : null), valid: i.result === "accessible" })));
  const cands = [];
  const seen = new Set();
  const push = (c) => { const key = c.file ?? `${c.pdf}#${c.page}` ?? c.url; if (seen.has(key)) return; seen.add(key); cands.push(c); };
  for (const c of auditCands.filter((x) => x.productId === row.productId && x.alreadyOnProduct !== "true")) {
    if (c.candidateType === "local-file") push({ origin: "audit filename match", file: c.candidate, evidence: c.evidence, auditConfidence: c.confidence });
    else if (/^(work\/product-database-report|public\/brochres)/.test(c.source)) continue; // Halima's own generated documents are not image sources
    else push({ origin: "audit catalogue text match", pdf: c.source, page: Number(c.page), evidence: c.evidence, auditConfidence: c.confidence });
  }
  for (const c of pipeCands[pid]?.candidates ?? []) for (const img of c.images ?? []) {
    const f = img.file ? path.relative(ROOT, img.file) : null;
    const v = (pipeVerify[pid]?.results ?? []).find((r) => (r.image?.file && f && path.relative(ROOT, r.image.file) === f) || (r.image?.url && r.image.url === img.url));
    if (f) push({ origin: `pipeline candidates.json (${c.adapter})`, file: f, evidence: c.matchEvidence, sourcePage: c.sourcePage, priorPipelineConfidence: v?.confidence ?? null, priorPipelineReasons: v?.reasons ?? [] });
    else if (v?.cacheFile) push({ origin: `pipeline candidates.json (${c.adapter})`, file: v.cacheFile, url: img.url, evidence: c.matchEvidence, sourcePage: c.sourcePage, priorPipelineConfidence: v.confidence, priorPipelineReasons: v.reasons ?? [], cachedCopyOf: img.url });
    else push({ origin: `pipeline candidates.json (${c.adapter})`, url: img.url, evidence: c.matchEvidence, sourcePage: c.sourcePage, priorPipelineConfidence: v?.confidence ?? null, priorPipelineReasons: v?.reasons ?? [], notDownloaded: true });
  }
  if (supplierCands[pid]?.file) push({ origin: "pipeline supplier-candidates.json (catalogue extract)", file: supplierCands[pid].file, pdf: `catalogues-source/${supplierCands[pid].pdf}`, page: supplierCands[pid].page, evidence: `exact model printed on catalogue page ${supplierCands[pid].page}`, sourcePage: `${supplierCands[pid].pdf} p.${supplierCands[pid].page}` });

  for (const c of cands) {
    c.candidateId = `${pid}:${sha256(c.file ?? `${c.pdf}#${c.page}` ?? c.url).slice(0, 12)}`;
    c.notes = [...(history.get(c.file) ?? [])];
    if (c.file && /^work\/product-image-pipeline\/supplier-candidates\//.test(c.file) && supplierReview[pid]) c.notes.push(`supplier contact-sheet check by ${supplierReview[pid].reviewer}: ${supplierReview[pid].decision} — ${supplierReview[pid].note}`);
    if (c.file && /current-/.test(c.file)) c.notes.push("file is a copy of the product's CURRENT external image, not a new source");
    const sc = supplierCands[pid];
    if (c.pdf && sc && !sc.file && Number(sc.page) === Number(c.page)) c.notes.push(`earlier supplier-catalogue extraction of p.${sc.page}: ${sc.note}`);
    // Validation
    if (c.file) {
      const abs = path.resolve(ROOT, c.file);
      c.kind = "local-file";
      if (!existsSync(abs)) { c.validation = "missing-file"; continue; }
      const buf = readFileSync(abs);
      const info = await inspect(buf);
      Object.assign(c, { bytes: buf.length, sha256: sha256(buf), format: info.kind ?? null, width: info.width ?? null, height: info.height ?? null });
      c.validation = info.ok ? "valid" : info.reason?.startsWith("too small") ? "too-small" : "invalid";
      if (info.reason) c.validationReason = info.reason;
      if (info.ok || info.reason?.startsWith("too small")) {
        const thumb = await sharp(buf).rotate().resize(520, 520, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
        c.preview = `previews/${c.candidateId.replace(/[^a-z0-9]+/gi, "_")}.jpg`; writeFileSync(`${OUT}/${c.preview}`, thumb);
      }
      if (info.ok && doc) { // exactly what `upload` would store (same optimise + key scheme as the pipeline)
        const opt = await optimise(buf);
        const key = `products/${productKeySegment(doc.sku) || productKeySegment(doc.id)}/${deterministicUuid(doc.id, opt.sha256)}.${opt.ext}`;
        c.plannedUpload = { key, url: publicBase ? `${publicBase}/${key}` : null, contentType: opt.contentType, width: opt.width, height: opt.height, bytes: opt.bytes, fitted: `${opt.fittedWidth}x${opt.fittedHeight}` };
      }
    } else if (c.pdf) {
      c.kind = "catalogue-page";
      c.modelCodesOnPage = pageModelCodes(c.pdf, c.page, row.model);
      c.previewId = c.candidateId.replace(/[^a-z0-9]+/gi, "_");
      renderReqs.push({ id: c.previewId, pdf: c.pdf, page: c.page, texts: [...new Set([doc?.model ?? row.model, String(doc?.model ?? row.model).replace(/\s+/g, ""), String(doc?.model ?? row.model).replace(/-/g, "")])] });
      c.validation = "needs-crop"; // a whole page is not an uploadable product image
    } else { c.kind = "remote-url"; c.validation = "not-downloaded"; }
    // Permission (existing register rules; nothing is recorded here)
    const perm = resolvePermission(register, { productId: pid, sourcePage: c.sourcePage ?? (c.pdf ? `${path.basename(c.pdf)} p.${c.page}` : c.file), imageUrl: c.url, root: ROOT });
    c.permission = { status: perm.status, holder: perm.holder, reason: perm.reason };
  }
  products.push({ row, inv, doc, pid, issues, imagesNow, unchangedSinceAudit, pipelineClass, cands });
}

// ---------- 5. Catalogue page previews (read-only render with the model text outlined) ----------
if (renderReqs.length) {
  writeFileSync(`${OUT}/tools/cache/render-requests.json`, JSON.stringify(renderReqs));
  const res = JSON.parse(execFileSync("python3", [`${OUT}/tools/render_pages.py`, `${OUT}/tools/cache/render-requests.json`, `${OUT}/previews`], { maxBuffer: 1 << 26 }).toString());
  for (const r of res) {
    for (const p of products) for (const c of p.cands) if (c.previewId === r.id) {
      if (!r.ok) { c.validation = "page-unreadable"; c.validationReason = r.error; continue; }
      c.textHits = r.textHits.length; c.pageEmbeddedImages = r.embeddedImages.length; c.largestEmbeddedImage = r.embeddedImages.reduce((m, i) => (i.width * i.height > m[0] * m[1] ? [i.width, i.height] : m), [0, 0]).join("x");
      const k = r.dpi / 72; const png = `${OUT}/previews/${r.id}.png`; const meta = await sharp(png).metadata();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${r.textHits.map((h) => `<rect x="${h.box[0] * k - 4}" y="${h.box[1] * k - 4}" width="${(h.box[2] - h.box[0]) * k + 8}" height="${(h.box[3] - h.box[1]) * k + 8}" fill="none" stroke="#16a34a" stroke-width="5"/>`).join("")}</svg>`;
      await sharp(png).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 78 }).toFile(`${OUT}/previews/${r.id}.jpg`);
      c.preview = `previews/${r.id}.jpg`;
      execFileSync("rm", ["-f", png]);
    }
  }
}

// ---------- 6. Match assessment, buckets ----------
const shaOwners = new Map(); // identical bytes offered for different pilot models → series photo
for (const p of products) for (const c of p.cands) if (c.sha256) shaOwners.set(c.sha256, new Set([...(shaOwners.get(c.sha256) ?? []), norm(p.row.model)]));
const AMBIGUOUS_NOTE = /series|every size|byte-identical|shared by|group|contradicts|DUCTED|combines|two capacities|FAMILY|likely duplicate|base model|never appears in the catalogue/i;
const REJECT_NOTE = /DUCTED unit but the product is a high-wall|REJECT|lifestyle scene/i;
for (const p of products) {
  const model = p.doc?.model ?? p.row.model;
  const combined = isCombinedModel(model);
  // A record whose model is exactly the pilot model without its suffix (LG "I23TCP" vs "I23TCP.UUAE2"); colour variants such as
  // GRA820U-X(S) / X(W) carry their own suffix and are separate products, not duplicates.
  const base = norm(String(model).replace(/[.(].*$/, "").replace(/-IND$/i, ""));
  const dupRecords = base !== norm(model) ? related.filter((d) => d.id !== p.pid && d.brand === p.doc?.brand && norm(d.model) === base) : [];
  if (dupRecords.length) p.issues.push(`possible duplicate product record(s): ${dupRecords.map((d) => `${d.id} (${d.model}, ${d.status}, ${(d.images ?? []).length} image(s))`).join("; ")}`);
  if (combined) p.issues.push("product record combines two models (customer sees 'Model on request')");
  const sameModelFiles = p.cands.filter((c) => c.kind === "local-file" && c.validation === "valid" && !/current-/.test(c.file));
  if (new Set(sameModelFiles.filter((c) => /^catalogues-source\//.test(c.file)).map((c) => c.sha256)).size > 1 && /contradicts/i.test(sameModelFiles.flatMap((c) => c.notes).join(" ")))
    p.issues.push("two different supplied photos for this model contradict each other");
  for (const c of p.cands) {
    const reasons = [];
    const stem = c.file ? norm(path.basename(c.file).replace(/\.[a-z0-9]+$/i, "")) : "";
    const exactName = c.file && (stem === norm(model) || stem === norm(p.doc?.sku));
    if (c.file && c.sha256 && (shaOwners.get(c.sha256)?.size ?? 0) > 1) reasons.push(`identical file offered for other models (${[...shaOwners.get(c.sha256)].filter((m) => m !== norm(model)).join(", ")})`);
    for (const n of c.notes) if (AMBIGUOUS_NOTE.test(n)) reasons.push(n);
    if (combined) reasons.push("combined two-model product record");
    if (dupRecords.length) reasons.push("a separate product record for the base model exists");
    if (c.kind === "catalogue-page") {
      const others = (c.modelCodesOnPage ?? []).filter((t) => t !== norm(model) && !norm(model).startsWith(t) && !t.startsWith(norm(model)));
      if (others.length) reasons.push(`page also lists ${others.length} other model code(s) of the same family: ${others.slice(0, 8).join(", ")}`);
      if (!c.textHits) reasons.push("model text not located on the rendered page");
    }
    c.matchAssessment = reasons.length ? "ambiguous" : exactName || c.kind === "catalogue-page" ? "exact model" : "probable";
    c.matchReasons = reasons;
    const rejected = c.notes.some((n) => REJECT_NOTE.test(n)) || /current-/.test(c.file ?? "");
    c.reviewBucket =
      c.validation === "missing-file" ? "missing-candidate-file"
      : c.validation === "invalid" || c.validation === "page-unreadable" ? "invalid-image"
      : rejected ? "no-suitable-candidate"
      : c.validation === "not-downloaded" ? "no-suitable-candidate"
      : c.matchAssessment === "ambiguous" ? "ambiguous-model-match"
      : c.validation === "too-small" ? "invalid-image"
      : "ready-for-human-visual-review";
    c.permissionConfirmed = c.permission.status === "confirmed";
    c.reviewStatus = "not reviewed"; // only an authorized human reviewer changes this
    c.approved = false;
  }
  const order = ["ready-for-human-visual-review", "ambiguous-model-match", "invalid-image", "missing-candidate-file", "no-suitable-candidate"];
  p.cands.sort((a, b) => order.indexOf(a.reviewBucket) - order.indexOf(b.reviewBucket) || (b.width ?? 0) - (a.width ?? 0));
  p.best = p.cands[0] ?? null;
  p.bucket = p.best ? p.best.reviewBucket : "no-suitable-candidate";
  p.permissionConfirmed = p.cands.some((c) => c.permissionConfirmed);
}

// ---------- 7. Write manifest ----------
const out = products.map((p) => ({
  pilotNumber: p.row.n, productId: p.row.productId, pipelineProductId: p.pid, sku: p.doc?.sku, brand: p.doc?.brand, model: p.doc?.model, name: p.doc?.name, status: p.doc?.status, category: p.doc?.category,
  currentImages: p.imagesNow, auditImageStatus: p.inv?.imageStatus, auditNotes: p.inv?.notes, unchangedSinceAudit: p.unchangedSinceAudit, existingPipelineClass: p.pipelineClass,
  existingPipelineWouldTarget: ["NO_IMAGE", "PLACEHOLDER", "BROKEN"].includes(p.pipelineClass),
  pilotBucket: p.bucket, permissionConfirmed: p.permissionConfirmed, productIssues: p.issues, productHistory: history.get(p.pid) ?? [], assistantCheck: assistantDecisions[p.pid] ?? null,
  auditPilotCandidate: p.row.auditCandidate, auditConfidence: p.row.auditConfidence,
  bestCandidateId: p.best?.candidateId ?? null,
  candidates: p.cands.map((c) => ({ candidateId: c.candidateId, kind: c.kind, path: c.file ?? null, url: c.url ?? null, catalogue: c.pdf ? { pdf: c.pdf, page: c.page, embeddedImagesOnPage: c.pageEmbeddedImages ?? null, largestEmbeddedImage: c.largestEmbeddedImage ?? null, modelCodesOnPage: c.modelCodesOnPage ?? [], modelTextFound: c.textHits ?? 0 } : null,
    provenance: c.origin, sourcePage: c.sourcePage ?? null, evidence: c.evidence, matchAssessment: c.matchAssessment, matchReasons: c.matchReasons, priorNotes: c.notes,
    priorPipelineConfidence: c.priorPipelineConfidence ?? null, validation: c.validation, validationReason: c.validationReason ?? null, format: c.format ?? null, width: c.width ?? null, height: c.height ?? null, bytes: c.bytes ?? null, sha256: c.sha256 ?? null,
    plannedUpload: c.plannedUpload ?? null, permission: c.permission, permissionConfirmed: c.permissionConfirmed, reviewBucket: c.reviewBucket, reviewStatus: c.reviewStatus, approved: c.approved, preview: c.preview ?? null })),
}));
writeFileSync(`${OUT}/pilot-manifest.json`, JSON.stringify({ generatedAt: NOW, source: `${AUDIT}/next-steps.md + candidate-image-matches.csv`, reconciledWithMongoDB: "read-only find by _id", products: out }, null, 1) + "\n");
const cell = (v) => { const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ["pilotNumber", "productId", "pipelineProductId", "sku", "brand", "model", "status", "auditImageStatus", "existingPipelineClass", "currentImage", "candidateId", "isBestCandidate", "kind", "candidatePath", "cataloguePdf", "cataloguePage", "provenance", "evidence", "matchAssessment", "matchReasons", "priorNotes", "validation", "validationReason", "dimensions", "bytes", "plannedUploadKey", "plannedUploadSize", "permissionStatus", "permissionReason", "reviewBucket", "pilotBucket", "productIssues", "reviewStatus", "approved", "preview"];
const rows = out.flatMap((p) => (p.candidates.length ? p.candidates : [null]).map((c) => ({
  pilotNumber: p.pilotNumber, productId: p.productId, pipelineProductId: p.pipelineProductId, sku: p.sku, brand: p.brand, model: p.model, status: p.status, auditImageStatus: p.auditImageStatus, existingPipelineClass: p.existingPipelineClass,
  currentImage: p.currentImages[0] ?? "", candidateId: c?.candidateId, isBestCandidate: c?.candidateId === p.bestCandidateId, kind: c?.kind, candidatePath: c?.path ?? c?.url, cataloguePdf: c?.catalogue?.pdf, cataloguePage: c?.catalogue?.page,
  provenance: c?.provenance, evidence: c?.evidence, matchAssessment: c?.matchAssessment, matchReasons: c?.matchReasons, priorNotes: c?.priorNotes, validation: c?.validation, validationReason: c?.validationReason,
  dimensions: c?.width ? `${c.width}x${c.height}` : "", bytes: c?.bytes, plannedUploadKey: c?.plannedUpload?.key, plannedUploadSize: c?.plannedUpload ? `${c.plannedUpload.width}x${c.plannedUpload.height} ${c.plannedUpload.contentType} ${c.plannedUpload.bytes} B` : "",
  permissionStatus: c?.permission?.status, permissionReason: c?.permission?.reason, reviewBucket: c?.reviewBucket ?? "no-suitable-candidate", pilotBucket: p.pilotBucket, productIssues: p.productIssues, reviewStatus: c?.reviewStatus ?? "not reviewed", approved: false, preview: c?.preview })));
writeFileSync(`${OUT}/pilot-manifest.csv`, [cols.join(","), ...rows.map((r) => cols.map((k) => cell(r[k])).join(","))].join("\n") + "\n", "utf8");

// ---------- 8. Contact sheet (PNG pages + HTML) ----------
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]);
const sheetItems = out.flatMap((p) => p.candidates.filter((c) => c.preview).map((c) => ({ p, c })));
const cellW = 260, labelH = 74, colsN = 5;
const COLOR = { "ready-for-human-visual-review": "#0a7d2c", "ambiguous-model-match": "#b25b00", "invalid-image": "#b91c1c", "missing-candidate-file": "#b91c1c", "no-suitable-candidate": "#6b7280" };
for (let page = 0; page * 30 < sheetItems.length; page++) {
  const slice = sheetItems.slice(page * 30, page * 30 + 30); const comps = [];
  for (const [i, { p, c }] of slice.entries()) {
    const x = (i % colsN) * cellW, y = Math.floor(i / colsN) * (cellW + labelH);
    comps.push({ input: await sharp(`${OUT}/${c.preview}`).resize(cellW - 12, cellW - 12, { fit: "contain", background: "#ffffff" }).toBuffer(), left: x + 6, top: y + 6 });
    const svg = `<svg width="${cellW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><text x="5" y="15" font-size="12" font-family="Arial" font-weight="bold">${esc(`#${p.pilotNumber} ${p.brand}`.slice(0, 34))}</text><text x="5" y="30" font-size="12" font-family="Arial">${esc(String(p.model).slice(0, 36))}</text><text x="5" y="45" font-size="10" font-family="Arial">${esc((c.catalogue ? `${path.basename(c.catalogue.pdf)} p.${c.catalogue.page}` : path.basename(c.path ?? "")).slice(0, 44))}</text><text x="5" y="60" font-size="10" font-family="Arial" fill="${COLOR[c.reviewBucket]}">${esc(`${c.reviewBucket} · ${c.width ? `${c.width}x${c.height}` : c.validation}`.slice(0, 46))}</text><text x="5" y="72" font-size="9" font-family="Arial" fill="#555">${esc(c.candidateId.slice(-12))} · permission: ${esc(c.permission.status)}</text></svg>`;
    comps.push({ input: Buffer.from(svg), left: x, top: y + cellW });
  }
  await sharp({ create: { width: colsN * cellW, height: Math.ceil(slice.length / colsN) * (cellW + labelH), channels: 3, background: "#ffffff" } }).composite(comps).png().toFile(`${OUT}/candidate-contact-sheet-${page + 1}.png`);
}
const html = `<!doctype html><meta charset="utf-8"><title>Image pilot review</title><style>body{font:14px system-ui;margin:20px;background:#f8fafc;color:#111}section{background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 18px;padding:14px}h2{margin:0 0 4px;font-size:17px}.meta{color:#475569;font-size:13px}.cands{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px}figure{margin:0;width:300px;border:3px solid #e2e8f0;border-radius:8px;padding:6px}figure img{width:100%;height:auto;background:#fff}figcaption{font-size:12px;line-height:1.35}.b-ready-for-human-visual-review{border-color:#16a34a}.b-ambiguous-model-match{border-color:#f59e0b}.b-invalid-image,.b-missing-candidate-file{border-color:#dc2626}.b-no-suitable-candidate{border-color:#9ca3af}.cur{width:120px}.tag{font-weight:600}.warn{color:#b45309}</style>
<h1>Product image pilot — ${out.length} products (review copy, nothing approved)</h1><p>Generated ${NOW}. Green = ready for human visual review · amber = ambiguous model match · red = invalid/missing · grey = not suitable. Permission is <b>not confirmed</b> for any candidate.</p>
${out.map((p) => `<section><h2>#${p.pilotNumber} ${esc(p.brand)} ${esc(p.model)} <span class="meta">(${esc(p.pipelineProductId)} · SKU ${esc(p.sku)} · ${esc(p.status)})</span></h2>
<div class="meta">Pilot bucket: <span class="tag">${esc(p.pilotBucket)}</span> · audit: ${esc(p.auditImageStatus)} (${esc(p.auditNotes)}) · existing pipeline class: ${esc(p.existingPipelineClass)}</div>
${p.productIssues.length ? `<div class="warn">${p.productIssues.map(esc).join("<br>")}</div>` : ""}
<div class="meta">Current image: ${p.currentImages[0] ? `<img class="cur" src="${esc(p.currentImages[0])}" referrerpolicy="no-referrer"> ` : "none"}</div>
<div class="cands">${p.candidates.map((c) => `<figure class="b-${c.reviewBucket}">${c.preview ? `<a href="${esc(c.preview)}"><img src="${esc(c.preview)}"></a>` : "<p>(no preview)</p>"}<figcaption><b>${esc(c.reviewBucket)}</b><br>${esc(c.candidateId)}<br>${esc(c.catalogue ? `${c.catalogue.pdf} p.${c.catalogue.page} (${c.catalogue.embeddedImagesOnPage} embedded image(s); model text found ${c.catalogue.modelTextFound}×)` : c.path ?? c.url)}<br>${c.width ? `${c.width}×${c.height} ${esc(c.format)} · ${Math.round(c.bytes / 1024)} KB` : esc(c.validation)}<br>Match: ${esc(c.matchAssessment)} — ${esc(c.evidence)}${c.matchReasons.length ? `<br><span class="warn">${c.matchReasons.map(esc).join("<br>")}</span>` : ""}${c.priorNotes.length ? `<br><i>${c.priorNotes.map(esc).join("<br>")}</i>` : ""}<br>Permission: ${esc(c.permission.status)} — ${esc(c.permission.reason)}</figcaption></figure>`).join("")}</div></section>`).join("\n")}`;
writeFileSync(`${OUT}/candidate-contact-sheet.html`, html);

// ---------- summary ----------
const count = (f) => out.filter(f).length;
const summary = { generatedAt: NOW, products: out.length, foundInMongo: count((p) => p.sku), unchangedSinceAudit: count((p) => p.unchangedSinceAudit), byPilotBucket: out.reduce((m, p) => ((m[p.pilotBucket] = (m[p.pilotBucket] ?? 0) + 1), m), {}),
  permissionConfirmed: count((p) => p.permissionConfirmed), existingPipelineClasses: out.reduce((m, p) => ((m[p.existingPipelineClass] = (m[p.existingPipelineClass] ?? 0) + 1), m), {}),
  candidates: out.reduce((s, p) => s + p.candidates.length, 0), candidatesByBucket: out.flatMap((p) => p.candidates).reduce((m, c) => ((m[c.reviewBucket] = (m[c.reviewBucket] ?? 0) + 1), m), {}),
  candidatesByValidation: out.flatMap((p) => p.candidates).reduce((m, c) => ((m[c.validation] = (m[c.validation] ?? 0) + 1), m), {}), contactSheetPages: Math.ceil(sheetItems.length / 30), databaseWrites: 0, storageWrites: 0 };
writeFileSync(`${OUT}/tools/cache/summary.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
