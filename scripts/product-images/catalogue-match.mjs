// Catalogue PDF → exact model matches and photo associations (pure; input is catalogue_extract.py's index.json).
//
// Model matching never guesses:
//   IDENTICAL       catalogue text equals the product model
//   CASE_SPACE      equal after ignoring letter case and whitespace only (e.g. "SGW 1056N" / "SGW1056N")
//   PUNCTUATION     differs in hyphens, slashes or dots            → never accepted; flagged for verification
//   OCR_CONFUSABLE  differs only by O/0, I/1/L, S/5, B/8, Z/2       → never accepted; flagged as a possible OCR variant
// Tokens are compared whole (or as joins of adjacent tokens), so "SGA19" never matches inside "SGA19-42AE".
//
// Photo association follows the catalogue layout: each block is a product photo followed by a row of model headings
// and a specification table. A photo belongs to the first heading row at or below it. A row with several models, an
// "ALSO AVAILABLE" list, or a photo used for several models is a shared series photo and cannot identify one model.

export const MATCH_ACCEPTED = new Set(["IDENTICAL", "CASE_SPACE"]);
const CONFUSABLE = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };
const squash = (s) => String(s ?? "").replace(/\s+/g, "");
const punctFree = (s) => squash(s).replace(/[-/._]/g, "");
const ocrFold = (s) => punctFree(s).toUpperCase().replace(/[OQDILSBZG]/g, (c) => CONFUSABLE[c]);

export function compareModel(found, model) {
  if (!found || !model) return null;
  if (found === model) return "IDENTICAL";
  if (squash(found).toUpperCase() === squash(model).toUpperCase()) return "CASE_SPACE";
  if (punctFree(found).toUpperCase() === punctFree(model).toUpperCase()) return "PUNCTUATION";
  if (ocrFold(found) === ocrFold(model)) return "OCR_CONFUSABLE";
  return null;
}

/** A plausible model code: letters and digits, 5–24 characters, no lowercase-only words. */
export const looksLikeModel = (t) => /^[A-Za-z0-9][A-Za-z0-9\-/.()&]{4,23}$/.test(t) && /[A-Za-z]/.test(t) && /\d/.test(t) && (t.match(/[A-Z]/g) ?? []).length >= 2 && !/^\d+(x\d+)+/i.test(t);

/** Whole tokens of a line, plus the joined line when the whole line is one code split by OCR. */
export function lineTokens(text) {
  const words = String(text).split(/[\s,;]+/).map((w) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, "")).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) out.push({ text: words[i], raw: words[i], whole: words.length === 1 });
  // A line that is nothing but a code OCR split into 2–3 pieces ("SGW 1056N") is joined; never parts of longer lines.
  // Shape of a split code: a short uppercase prefix, then uppercase/digit fragments ("SGW 1056N", "SGCT N90H", "SG AA 110T5").
  const splitCode = words.length >= 2 && words.length <= 3 && /^[A-Z]{2,4}$/.test(words[0]) && words.slice(1).every((w) => /^[A-Z0-9]{1,8}$/.test(w)) && /\d/.test(words.join(""));
  if (splitCode) out.push({ text: words.join(""), raw: words.join(" "), whole: true, joined: true });
  return out;
}

const cy = (b) => (b[1] + b[3]) / 2, h = (b) => b[3] - b[1];
const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const intersects = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** Every occurrence of a catalogue model code on a page (identified independently of our products). */
const NOT_MODEL = /^(R\d{2,3}[A-Z]?|T\d|\d+V|\d+HZ)$/i;
export function pageModels(page) {
  const out = [];
  for (const line of page.lines) {
    const toks = lineTokens(line.text);
    // A heading line holds only model codes: "SGA18AE", or several codes for one photo, "SGSC137 / SGSC138".
    const singles = toks.filter((t) => !t.joined);
    const words = String(line.text).split(/[\s,;/]+/).map((w) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, "")).filter(Boolean);
    const allCodes = words.length > 1 && words.every((w) => looksLikeModel(w) && !NOT_MODEL.test(w));
    for (const t of toks) {
      if (t.joined && (allCodes || !looksLikeModel(t.text) || words.some((w) => looksLikeModel(w) && w.length >= 5))) continue; // join only genuine fragments
      if (looksLikeModel(t.text) && !NOT_MODEL.test(t.text)) out.push({ code: t.text, line, heading: t.whole || (allCodes && singles.includes(t)) });
    }
  }
  return out;
}

const overlapShare = (a, b) => { // intersection as a share of the smaller box
  const i = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return area(i) / Math.max(1e-6, Math.min(area(a), area(b)));
};

/**
 * Product photos: photo-sized embedded images lying fully on the page (backgrounds, lifestyle and decoration images
 * bleed off the edge), with layers of the same photo (cut-out, shadow) merged when they substantially overlap.
 */
export function photoRegions(page) {
  const pageArea = page.width * page.height;
  const imgs = page.images.filter((i) => i.contentBox && i.pageFraction >= 0.01 && i.pageFraction <= 0.6 && i.onPage >= 0.97 && area(i.contentBox) / pageArea >= 0.008);
  const regions = [];
  for (const i of imgs) {
    const r = regions.find((x) => overlapShare(x.box, i.contentBox) >= 0.3);
    if (r) { r.box = union(r.box, i.contentBox); r.images.push(i); } else regions.push({ box: [...i.contentBox], images: [i] });
  }
  for (let merged = true; merged;) { // regions that grew into each other
    merged = false;
    for (let a = 0; a < regions.length && !merged; a++) for (let b = a + 1; b < regions.length && !merged; b++) {
      if (overlapShare(regions[a].box, regions[b].box) >= 0.3) { regions[a].box = union(regions[a].box, regions[b].box); regions[a].images.push(...regions[b].images); regions.splice(b, 1); merged = true; }
    }
  }
  return regions.map((r, k) => ({ ...r, id: `p${page.page}r${k + 1}` }));
}

/** Heading rows: standalone model-code lines whose vertical centres line up. */
export function headingRows(models) {
  const heads = models.filter((m) => m.heading).sort((a, b) => cy(a.line.box) - cy(b.line.box));
  const rows = [];
  for (const m of heads) {
    const row = rows.find((r) => Math.abs(cy(r.box) - cy(m.line.box)) < Math.max(h(r.box), h(m.line.box)) * 0.8);
    if (row) { if (!row.codes.includes(m.code)) row.codes.push(m.code); row.box = union(row.box, m.line.box); row.members.push(m); }
    else rows.push({ codes: [m.code], box: [...m.line.box], members: [m] });
  }
  return rows.sort((a, b) => a.box[1] - b.box[1]);
}

/** Assigns each photo region to the first heading row starting at or below its top (small tolerance; layout rule above). */
export function assignPhotos(rows, regions) {
  const byRow = new Map(rows.map((r) => [r, []]));
  for (const reg of regions) {
    const top = reg.box[1] - h(reg.box) * 0.25;
    const row = rows.find((r) => r.box[1] >= top);
    if (row) byRow.get(row).push(reg);
  }
  return byRow;
}

const TEXT_BLOCKERS = /^(specifications?|key features|also available|rated|capacity|compressor|refrigerant|voltage|dimension|weight|stuffing|qty)/i;

/** Model codes or specification labels inside a crop mean the crop would include text from the layout. */
export function textInCrop(page, box, ownCodes = []) {
  return page.lines.filter((l) => intersects(l.box, box) && area(l.box) > 0 && (TEXT_BLOCKERS.test(l.text.trim()) || pageModels({ lines: [l] }).some((m) => !ownCodes.includes(m.code))))
    .map((l) => l.text.trim()).slice(0, 5);
}

const pad = (b, page, f = 0.03) => {
  const dx = (b[2] - b[0]) * f, dy = (b[3] - b[1]) * f;
  return [Math.max(0, b[0] - dx), Math.max(0, b[1] - dy), Math.min(page.width, b[2] + dx), Math.min(page.height, b[3] + dy)].map((v) => Math.round(v * 100) / 100);
};

/**
 * Matches catalogue pages to products.
 *   products: [{ id, model, brand, ... }]   (all products of the brand, for "unmatched catalogue models")
 *   targets:  Set of product ids that need images (only these get candidates)
 * Returns candidates (one per product × photo), model inventory, and the flags for the report.
 */
export function matchCatalogue(index, products, targets) {
  const inventory = new Map(); // catalogue code → pages
  const candidates = [], flags = [];
  const assetUse = new Map(); // asset sha → Set(model codes)
  const found = new Map(products.map((p) => [p.id, []]));
  for (const page of index.pages) {
    const models = pageModels(page);
    // Inventory = codes printed as product headings (spec-table noise such as "Rotary/T3" or "1400RPM" is not a model).
    for (const m of models) if (m.heading) (inventory.get(m.code) ?? inventory.set(m.code, new Set()).get(m.code)).add(page.page);
    const rows = headingRows(models);
    const regions = photoRegions(page);
    const assigned = assignPhotos(rows, regions);
    const alsoAvail = page.lines.find((l) => /^also available/i.test(l.text.trim()));
    for (const [row, regs] of assigned) for (const reg of regs) for (const i of reg.images) if (i.assetSha256) for (const c of row.codes) (assetUse.get(i.assetSha256) ?? assetUse.set(i.assetSha256, new Set()).get(i.assetSha256)).add(c);
    for (const p of products) {
      for (const m of models) {
        const level = compareModel(m.code, p.model);
        if (!level) continue;
        found.get(p.id).push({ page: page.page, code: m.code, level, text: m.line.text, source: m.line.source, conf: m.line.conf, box: m.line.box, heading: m.heading });
        if (!targets.has(p.id)) continue;
        if (!MATCH_ACCEPTED.has(level)) { flags.push({ type: level === "OCR_CONFUSABLE" ? "possible_ocr_variant" : "punctuation_variant", productId: p.id, model: p.model, found: m.code, page: page.page }); continue; }
        if (!m.heading) { // table/body mentions are evidence; only a heading carries the photo association
          if (!models.some((x) => x.heading && MATCH_ACCEPTED.has(compareModel(x.code, p.model)))) flags.push({ type: "model_only_in_text", productId: p.id, model: p.model, found: m.line.text.slice(0, 60), page: page.page });
          continue;
        }
        const row = rows.find((r) => r.members.includes(m));
        const regs = row ? assigned.get(row) : [];
        const evidence = { page: page.page, text: m.line.text, box: m.line.box, source: m.line.source, ocrConfidence: m.line.conf, level };
        const base = { productId: p.id, model: p.model, pdf: index.pdf, page: page.page, evidence, rowModels: row?.codes ?? [m.code] };
        if (!regs?.length) { flags.push({ type: "no_photo_for_model", productId: p.id, model: p.model, page: page.page }); continue; }
        for (const reg of regs) {
          const crop = pad(reg.box, page);
          // Never extend a crop into the model's own heading row / specification table below the photo.
          if (row.box[1] > reg.box[1] && crop[3] > row.box[1] - 2 && row.box[0] < crop[2] && crop[0] < row.box[2]) crop[3] = Math.round((row.box[1] - 2) * 100) / 100;
          const issues = [];
          if (m.line.source === "ocr" && m.line.conf < 0.9) issues.push(`low OCR confidence (${m.line.conf})`);
          if (row.codes.length > 1) issues.push(`shared series photo: one photo for ${row.codes.join(", ")}`);
          if (alsoAvail && cy(alsoAvail.box) > reg.box[1]) issues.push("page lists ALSO AVAILABLE variants under the same photo");
          if (regs.length > 1) issues.push(`${regs.length} photos in this block — confirm which shows the product`);
          const inCrop = textInCrop(page, crop, row.codes);
          if (inCrop.length) issues.push(`crop contains layout text: ${inCrop.join(" | ")}`);
          const single = reg.images.length === 1 && reg.images[0].smask && reg.images[0].asset ? reg.images[0] : null;
          // Native resolution of the photo (embedded pixels per point); crops are rendered at most at this density.
          const pxPerPt = Math.max(...reg.images.map((i) => i.width / Math.max(1e-6, i.box[2] - i.box[0])));
          const longestPx = Math.round(Math.max(crop[2] - crop[0], crop[3] - crop[1]) * pxPerPt);
          if (longestPx < 400) issues.push(`low resolution: about ${longestPx} px on the longest side (minimum 400)`);
          candidates.push({ ...base, regionId: reg.id, regionImages: reg.images.map((i) => ({ xref: i.xref, box: i.box, asset: i.asset ?? null, assetSha256: i.assetSha256 ?? null })),
            cropBox: crop, renderDpi: Math.max(72, Math.min(300, Math.round(pxPerPt * 72))), nativeLongestPx: longestPx, cropSource: single ? "embedded-asset" : "page-render", asset: single?.asset ?? null, assetSha256: single?.assetSha256 ?? null, issues });
        }
      }
    }
  }
  // An image asset used for several models anywhere in the catalogue is a shared image.
  for (const c of candidates) {
    const others = new Set(c.regionImages.flatMap((i) => [...(assetUse.get(i.assetSha256) ?? [])])); others.delete(c.evidence.text.trim());
    const otherCodes = [...others].filter((x) => !MATCH_ACCEPTED.has(compareModel(x, c.model)));
    if (otherCodes.length && !c.issues.some((i) => i.startsWith("shared"))) c.issues.push(`same image used for ${otherCodes.join(", ")}`);
    // Identity (is this photo exactly this model?) and quality (is the image good enough?) are judged separately.
    const identityIssues = c.issues.filter((i) => !/^low resolution/.test(i));
    c.identity = identityIssues.some((i) => /shared|ALSO AVAILABLE|same image/.test(i)) ? "SHARED_IMAGE" : identityIssues.length ? "NEEDS_REVIEW" : "EXACT_UNAMBIGUOUS";
    c.quality = c.issues.some((i) => /^low resolution/.test(i)) ? "LOW_RESOLUTION" : "OK";
    c.status = c.identity === "EXACT_UNAMBIGUOUS" && c.quality !== "OK" ? "EXACT_LOW_RESOLUTION" : c.identity;
    c.eligible = c.identity === "EXACT_UNAMBIGUOUS" && c.quality === "OK";
  }
  const productModels = products.map((p) => p.model);
  const unmatched = [...inventory.keys()].filter((code) => !productModels.some((m) => MATCH_ACCEPTED.has(compareModel(code, m))));
  const missingTargets = products.filter((p) => targets.has(p.id) && !found.get(p.id).some((f) => MATCH_ACCEPTED.has(f.level)));
  const nearMisses = missingTargets.map((p) => ({ productId: p.id, model: p.model,
    similar: [...inventory.keys()].filter((code) => editDistance(code.toUpperCase(), p.model.toUpperCase()) <= 2).slice(0, 6) }));
  return { candidates, flags, inventory: Object.fromEntries([...inventory].map(([k, v]) => [k, [...v]])), occurrences: Object.fromEntries(found), unmatchedCatalogueModels: unmatched, missingTargets: missingTargets.map((p) => p.id), nearMisses };
}

export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
