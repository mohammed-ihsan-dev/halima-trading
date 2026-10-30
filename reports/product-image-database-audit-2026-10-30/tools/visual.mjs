// Visual material for the 2026-10-30 audit — READ-ONLY. Downloads every product image (bounded, 15 MB cap, 20 s timeout),
// measures simple content statistics (colour count, dominant-colour share, near-white share) to HIGHLIGHT likely logos /
// placeholders, and renders brand-grouped contact sheets with a code per cell for visual review. The statistics only order
// and highlight cells; classification is done by looking at the sheets.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const A = "reports/product-image-database-audit-2026-10-30";
const IMG = process.env.AUDIT_IMAGE_CACHE; // outside the repo (scratchpad)
if (!IMG) throw new Error("set AUDIT_IMAGE_CACHE");
mkdirSync(IMG, { recursive: true });
const SHEETS = `${A}/IMAGE-AUDIT-CONTACT-SHEETS`;
mkdirSync(SHEETS, { recursive: true });
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");
const db = await getMongoDb();
const log = await db.collection("product_image_imports").find({}, { projection: { _id: 0, publicUrl: 1, sourceUrl: 1, importedAt: 1 } }).toArray();
await (await getMongoClient()).close();
const importedFrom = new Map(log.map((l) => [l.publicUrl, new URL(l.sourceUrl).host]));

const inv = JSON.parse(readFileSync(`${A}/tools/baseline/product-image-inventory.json`, "utf8")).products;
const raw = JSON.parse(readFileSync(`${A}/tools/baseline/product-image-inventory.json`, "utf8")); // same file; refs truncated for data URIs
const { MongoClient } = require("mongodb");
// data: URIs are truncated in the inventory — read the 12 originals directly (read-only)
const c2 = await new MongoClient(process.env.MONGODB_URI).connect();
const dataImgs = new Map((await c2.db(process.env.MONGODB_DB || "halima").collection("products").find({ images: { $elemMatch: { $regex: "^data:" } } }, { projection: { id: 1, images: 1 } }).toArray()).map((d) => [d.id, d.images]));
await c2.close();

const key = (s) => createHash("sha256").update(s).digest("hex").slice(0, 32);
async function bytesFor(ref, productId) {
  if (ref.startsWith("data:")) {
    const full = (dataImgs.get(productId) ?? []).find((x) => x.startsWith(ref.slice(0, 30).replace(/….*$/, ""))) ?? (dataImgs.get(productId) ?? []).find((x) => x.startsWith("data:"));
    return full ? Buffer.from(full.split(",")[1], "base64") : null;
  }
  const f = `${IMG}/${key(ref)}`;
  if (existsSync(f)) return readFileSync(f);
  try {
    const r = await fetch(ref, { headers: { "User-Agent": "Mozilla/5.0 (HalimaTrading image audit; read-only)" }, signal: AbortSignal.timeout(20000), redirect: "follow" });
    if (!r.ok) return null;
    const chunks = []; let size = 0;
    for await (const c of r.body) { size += c.length; if (size > 15 * 1024 * 1024) return null; chunks.push(c); }
    const b = Buffer.concat(chunks); writeFileSync(f, b); return b;
  } catch { return null; }
}
async function features(buf) {
  try {
    const m = await sharp(buf).metadata();
    const { data, info } = await sharp(buf).rotate().flatten({ background: "#ffffff" }).resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    const counts = new Map(); let white = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 235 && g > 235 && b > 235) white++;
      const q = `${r >> 4},${g >> 4},${b >> 4}`; counts.set(q, (counts.get(q) ?? 0) + 1);
    }
    const n = data.length / info.channels, sorted = [...counts.values()].sort((a, b) => b - a);
    const nonWhite = [...counts.entries()].filter(([q]) => !q.split(",").every((v) => Number(v) >= 14)).map(([, v]) => v).sort((a, b) => b - a);
    return { width: m.width, height: m.height, format: m.format, colors: counts.size, top: sorted[0] / n, white: white / n,
      // share of the non-white area covered by its single most common colour: high for flat logos / wordmarks
      flat: nonWhite.length ? nonWhite[0] / nonWhite.reduce((a, b) => a + b, 0) : 1 };
  } catch { return null; }
}

const ABBR = (b) => b.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
const byBrand = {};
for (const p of inv) (byBrand[p.brand] ??= []).push(p);
const manifest = [];
let pool = [];
const work = [];
for (const [brand, list] of Object.entries(byBrand).sort((a, b) => a[0].localeCompare(b[0]))) {
  list.sort((a, b) => String(a.model).localeCompare(String(b.model)));
  list.forEach((p, i) => p.images.forEach((im, j) => work.push({ brand, p, im, code: `${ABBR(brand)}-${String(i + 1).padStart(3, "0")}${p.images.length > 1 ? String.fromCharCode(97 + j) : ""}` })));
}
// download with limited concurrency
for (let i = 0; i < work.length; i += 8) {
  await Promise.all(work.slice(i, i + 8).map(async (w) => {
    const buf = w.im.storageType === "placeholder" ? null : await bytesFor(w.im.ref, w.p.id);
    w.buf = buf; w.f = buf ? await features(buf) : null;
  }));
  if (i % 160 === 0) console.log(`images ${i}/${work.length}`);
}
for (const w of work) {
  const f = w.f;
  const hints = [];
  if (!w.buf) hints.push("NOT DOWNLOADED");
  if (f && Math.max(f.width, f.height) < 400) hints.push(`small ${f.width}x${f.height}`);
  if (f && f.colors <= 40 && f.flat > 0.55) hints.push("flat graphic (logo?)");
  if (importedFrom.get(w.im.ref) && /gstatic|seeklogo/.test(importedFrom.get(w.im.ref))) hints.push(`imported from ${importedFrom.get(w.im.ref)}`);
  if ((w.im.flags ?? []).includes("google-search-thumbnail")) hints.push("google thumbnail");
  if ((w.im.flags ?? []).some((x) => /logo/.test(x))) hints.push("logo host");
  manifest.push({ code: w.code, productId: w.p.productId, id: w.p.id, brand: w.brand, model: w.p.model, name: w.p.name, imageIndex: w.p.images.indexOf(w.im), ref: w.im.ref, storageType: w.im.storageType,
    result: w.im.result, importedFrom: importedFrom.get(w.im.ref) ?? "", width: f?.width ?? null, height: f?.height ?? null, format: f?.format ?? null, colors: f?.colors ?? null, flat: f ? Math.round(f.flat * 100) / 100 : null,
    white: f ? Math.round(f.white * 100) / 100 : null, hints, sha256: w.buf ? createHash("sha256").update(w.buf).digest("hex") : null });
}
writeFileSync(`${A}/tools/cache/visual-manifest.json`, JSON.stringify(manifest, null, 1));

// contact sheets: brand-grouped, 8 x 6 per page
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]);
const CW = 200, CH = 170, LH = 44, COLS = 8, PER = 48;
const pages = [];
const brands = [...new Set(work.map((w) => w.brand))];
for (const brand of brands) {
  const ws = work.filter((w) => w.brand === brand);
  for (let s = 0; s < ws.length; s += PER) {
    const slice = ws.slice(s, s + PER), comps = [];
    for (const [i, w] of slice.entries()) {
      const x = (i % COLS) * CW, y = Math.floor(i / COLS) * (CH + LH);
      const m = manifest.find((r) => r.code === w.code);
      let tile;
      try { tile = w.buf ? await sharp(w.buf).rotate().resize(CW - 8, CH - 8, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer() : null; } catch { tile = null; }
      if (!tile) tile = await sharp({ create: { width: CW - 8, height: CH - 8, channels: 3, background: "#fde2e2" } }).png().toBuffer();
      comps.push({ input: tile, left: x + 4, top: y + 4 });
      const warn = m.hints.length ? "#b91c1c" : "#334155";
      comps.push({ input: Buffer.from(`<svg width="${CW}" height="${LH}" xmlns="http://www.w3.org/2000/svg"><text x="3" y="13" font-size="12" font-family="Arial" font-weight="bold">${esc(w.code)}</text><text x="70" y="13" font-size="11" font-family="Arial">${esc(String(w.p.model).slice(0, 18))}</text><text x="3" y="27" font-size="10" font-family="Arial" fill="${warn}">${esc((m.hints.join(" · ") || `${m.width ?? "?"}x${m.height ?? "?"} ${m.storageType}`).slice(0, 38))}</text><text x="3" y="40" font-size="9" font-family="Arial" fill="#64748b">${esc((m.importedFrom ? `from ${m.importedFrom}` : m.storageType === "supabase" ? "supabase" : (() => { try { return new URL(m.ref).host; } catch { return m.storageType; } })()).slice(0, 40))}</text></svg>`), left: x, top: y + CH });
    }
    const file = `${String(pages.length + 1).padStart(2, "0")}-${brand.replace(/[^A-Za-z0-9]+/g, "-")}${ws.length > PER ? `-${s / PER + 1}` : ""}.png`;
    await sharp({ create: { width: COLS * CW, height: Math.ceil(slice.length / COLS) * (CH + LH), channels: 3, background: "#e2e8f0" } }).composite(comps).png().toFile(`${SHEETS}/${file}`);
    pages.push({ file, brand, codes: slice.map((w) => w.code) });
  }
}
writeFileSync(`${A}/tools/cache/sheets.json`, JSON.stringify(pages, null, 1));
console.log(JSON.stringify({ images: work.length, downloaded: work.filter((w) => w.buf).length, sheets: pages.length, hinted: manifest.filter((m) => m.hints.length).length }));
