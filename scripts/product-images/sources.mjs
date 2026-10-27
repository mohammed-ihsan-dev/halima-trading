import path from "node:path";
// Candidate-image sources. Each adapter looks a product up by its exact model on ONE known
// official site (brand store / manufacturer site) and returns the source's own product record —
// never search-engine results or thumbnails. A candidate is only produced when the source record
// itself carries the exact model (SKU, title or product URL).
import { existsSync, readFileSync } from "node:fs";
import { get, getJson, getText } from "./http.mjs";

export const norm = (s) => (s ?? "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
const decode = (s) => (s ?? "").replace(/&#8211;|&ndash;/g, "-").replace(/&#038;|&amp;/g, "&").replace(/&#8217;/g, "'").replace(/<[^>]+>/g, "").trim();

/** Exact model match: normalised equality, or the model as a whole token inside a longer text. */
export function modelMatch(model, text) {
  const m = norm(model);
  if (m.length < 4) return false;
  const t = (text ?? "").toString().toUpperCase();
  if (norm(t) === m) return true;
  // token boundaries: the model's characters (ignoring separators) must not continue with another letter/digit
  const parts = model.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ");
  const re = new RegExp(`(^|[^A-Z0-9])${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^A-Z0-9]*")}($|[^A-Z0-9])`);
  return re.test(t);
}

/* ------------------------------------------------------------------ Shopify brand store */
export function shopify({ name, origin, official }) {
  return {
    name, official,
    async find(product) {
      const q = encodeURIComponent(product.model);
      const s = await getJson(`${origin}/search/suggest.json?q=${q}&resources[type]=product&resources[limit]=6`);
      if (!s.ok) return { error: s.error ?? `search HTTP ${s.status}` };
      const hits = s.json?.resources?.results?.products ?? [];
      const out = [];
      for (const h of hits) {
        const p = await getJson(`${origin}/products/${h.handle}.json`);
        const rec = p.json?.product;
        if (!rec) continue;
        const skus = (rec.variants ?? []).map((v) => v.sku).filter(Boolean);
        const evidence = skus.find((s) => norm(s) === norm(product.model)) ? `SKU "${skus.find((s) => norm(s) === norm(product.model))}"`
          : modelMatch(product.model, rec.title) ? `title "${rec.title}"` : modelMatch(product.model, rec.handle) ? `URL handle "${rec.handle}"` : null;
        if (!evidence) continue;
        out.push({
          adapter: name, official, sourcePage: `${origin}/products/${rec.handle}`, sourceTitle: rec.title, vendor: rec.vendor,
          matchEvidence: `exact model in source ${evidence}`,
          images: (rec.images ?? []).map((i) => ({ url: i.src, width: i.width, height: i.height, position: i.position })),
        });
      }
      return { candidates: out, searched: [`${origin}/search/suggest.json?q=${product.model}`] };
    },
  };
}

/* ------------------------------------------------------------------ WooCommerce Store API */
function woo({ name, origin, official }) {
  return {
    name, official,
    async find(product) {
      const r = await getJson(`${origin}/wp-json/wc/store/v1/products?search=${encodeURIComponent(product.model)}&per_page=10`);
      if (!r.ok) return { error: r.error ?? `HTTP ${r.status}` };
      const out = [];
      for (const rec of r.json ?? []) {
        const title = decode(rec.name);
        const evidence = rec.sku && norm(rec.sku) === norm(product.model) ? `SKU "${rec.sku}"` : modelMatch(product.model, title) ? `title "${title}"` : modelMatch(product.model, rec.slug) ? `URL slug "${rec.slug}"` : null;
        if (!evidence) continue;
        out.push({ adapter: name, official, sourcePage: rec.permalink, sourceTitle: title, matchEvidence: `exact model in source ${evidence}`,
          images: (rec.images ?? []).map((i, k) => ({ url: i.src, position: k + 1, alt: i.alt })) });
      }
      return { candidates: out, searched: [`${origin}/wp-json/wc/store/v1/products?search=${product.model}`] };
    },
  };
}

/* ------------------------------------------------------------------ Super General (sitemap → product page) */
function superGeneral() {
  const origin = "https://www.supergeneral.com";
  let urls;
  return {
    name: "supergeneral.com", official: true,
    async find(product) {
      if (!urls) {
        const sm = await getText(`${origin}/sitemap.xml`);
        urls = sm.ok ? [...sm.text.matchAll(/<loc>([^<]+\/product\/[^<]+)<\/loc>/g)].map((m) => m[1].trim()) : [];
        if (!urls.length) return { error: "sitemap unavailable" };
      }
      const m = norm(product.model);
      const pages = urls.filter((u) => norm(u.split("/").pop()).endsWith(m));
      const out = [];
      for (const page of pages) {
        const r = await getText(page);
        if (!r.ok) continue;
        const title = decode((r.text.match(/<title>([^<]*)/) ?? [])[1]);
        if (!modelMatch(product.model, title) && !modelMatch(product.model, page)) continue;
        const og = (r.text.match(/og:image" content="([^"]+)/) ?? [])[1];
        const gallery = [...new Set([...r.text.matchAll(/https:\/\/www\.supergeneral\.com\/media\/products\/[^"' )]+\.(?:webp|png|jpe?g)/g)].map((x) => x[0]))];
        const primary = og ? new URL(og, `${origin}/`).href : null;
        const imgs = [...new Set([primary, ...gallery].filter(Boolean))].filter((u) => modelMatch(product.model, u.split("/").pop()) || u === primary);
        out.push({ adapter: "supergeneral.com", official: true, sourcePage: page, sourceTitle: title,
          matchEvidence: `exact model in product URL and page title "${title}"`, images: imgs.map((url, k) => ({ url, position: k + 1 })) });
      }
      return { candidates: out, searched: [`${origin}/sitemap.xml (product URLs ending in ${product.model})`] };
    },
  };
}

/* ------------------------------------------------------------------ Open Icecat (licensed product-content API) */
// Docs: https://iceclog.com/manual-for-icecat-json-product-requests/ — GET https://live.icecat.biz/api with the
// `api-token` and `content-token` HEADERS (env ICECAT_API_TOKEN / ICECAT_CONTENT_TOKEN). Icecat's Terms grant automated access
// to Open Icecat via the documented APIs. Image links carry the content token as a query parameter: it is stripped before
// anything is stored, and added back only in memory when downloading (see withContentToken).
const ICECAT_STATUS = { 4: "invalid product identifier", 8: "not in the Icecat database", 9: "Full Icecat product — not available with Open Icecat", 12: "outside subscription verticals",
  14: "brand restriction / not public in this language", 15: "release date in the future", 16: "invalid or unknown GTIN", 17: "no product information for this id", 18: "API token not recognised" };
export const stripToken = (u) => { try { const x = new URL(u); x.searchParams.delete("content_token"); return x.toString(); } catch { return u; } };
export function withContentToken(u) {
  const t = process.env.ICECAT_CONTENT_TOKEN;
  if (!t || !/^https:\/\/images\.icecat\.biz\//.test(u)) return u;
  const x = new URL(u); x.searchParams.set("content_token", t); return x.toString();
}
const BRAND_ALIASES = { "MITSUBISHIELECTRIC": ["MITSUBISHIELECTRIC", "MITSUBISHI"], "BLACKDECKER": ["BLACKDECKER", "BLACKANDDECKER"], "SUPERGENERAL": ["SUPERGENERAL"] };
const brandOk = (ours, theirs) => (BRAND_ALIASES[norm(ours)] ?? [norm(ours)]).includes(norm(theirs));

function icecatAdapter() {
  const api = "https://live.icecat.biz/api";
  const headers = () => ({ "api-token": process.env.ICECAT_API_TOKEN, "content-token": process.env.ICECAT_CONTENT_TOKEN });
  async function lookup(query) {
    const r = await get(`${api}?lang=en&${query}`, { headers: headers(), checkRobots: false, accept: "application/json" }); // robots.txt on live.icecat.biz errors (HTTP 500); API access is granted by Icecat's Terms
    let json = null;
    try { json = JSON.parse(r.body.toString("utf8")); } catch { /* non-JSON error page */ }
    const code = json?.StatusCode ?? json?.statusCode ?? null; // Icecat puts its status code in the body of 4xx responses too
    return { http: r.status, code, message: ICECAT_STATUS[code] ?? (r.ok ? null : r.error ?? `HTTP ${r.status}`), data: json?.data ?? null, rateLimited: !!r.rateLimited };
  }
  return {
    name: "icecat", official: false, licensed: true,
    async find(product) {
      if (!process.env.ICECAT_API_TOKEN || !process.env.ICECAT_CONTENT_TOKEN) return { error: "ICECAT_API_TOKEN / ICECAT_CONTENT_TOKEN not set" };
      const tries = [];
      const model = String(product.model ?? "").trim();
      tries.push({ how: "brand+model", q: `Brand=${encodeURIComponent(product.brand)}&ProductCode=${encodeURIComponent(model)}` });
      if (model.includes(" ")) tries.push({ how: "brand+model (no spaces)", q: `Brand=${encodeURIComponent(product.brand)}&ProductCode=${encodeURIComponent(model.replace(/\s+/g, ""))}` });
      if (product.barcode) tries.push({ how: "GTIN", q: `GTIN=${encodeURIComponent(product.barcode)}` });
      const searched = [], attempts = [];
      for (const t of tries) {
        const r = await lookup(t.q);
        searched.push(`icecat ${t.how}`);
        attempts.push({ how: t.how, http: r.http, code: r.code, message: r.message, rateLimited: r.rateLimited });
        if (!r.data?.GeneralInfo) continue;
        const g = r.data.GeneralInfo;
        const mpn = g.BrandPartCode ?? "";
        const gtins = [...new Set([...(g.GTIN ?? []), ...((g.GTINs ?? []).map((x) => (typeof x === "string" ? x : x?.GTIN)))].filter(Boolean))];
        const exact = norm(mpn) === norm(model);
        const byGtin = product.barcode && gtins.includes(String(product.barcode));
        const variant = !exact && norm(mpn).startsWith(norm(model)) ? mpn : null;
        if (!brandOk(product.brand, g.Brand)) { attempts.at(-1).message = `brand mismatch (Icecat brand "${g.Brand}")`; continue; }
        const evidence = exact ? `exact model: Icecat part code "${mpn}"` + (byGtin ? ` and GTIN ${product.barcode}` : "")
          : byGtin ? `GTIN ${product.barcode} matches but Icecat part code is "${mpn}" (model ${model} not confirmed)`
          : variant ? `regional/variant code: Icecat part code "${mpn}" for model ${model}` : `Icecat part code "${mpn}" differs from model ${model}`;
        const imgs = [];
        if (r.data.Image?.HighPic) imgs.push({ url: stripToken(r.data.Image.HighPic), width: Number(r.data.Image.HighPicWidth) || null, height: Number(r.data.Image.HighPicHeight) || null, position: 0, requiresContentToken: true });
        for (const gi of r.data.Gallery ?? []) if (gi.Pic && !imgs.some((x) => x.url === stripToken(gi.Pic))) imgs.push({ url: stripToken(gi.Pic), width: Number(gi.PicWidth) || null, height: Number(gi.PicHeight) || null, position: imgs.length, requiresContentToken: true });
        return {
          searched, attempts,
          candidates: [{ adapter: "icecat", official: false, licensed: true, sourceType: "Open Icecat data-sheet (Open Content License)",
            sourcePage: `${api}?lang=en&icecat_id=${g.IcecatId}`, icecatId: g.IcecatId, sourceTitle: g.Title, icecatBrand: g.Brand, icecatPartCode: mpn, icecatGtins: gtins,
            demoAccount: r.data.DemoAccount ?? null, matchEvidence: evidence, exactModel: exact, images: imgs }],
        };
      }
      const rate = attempts.some((a) => a.rateLimited);
      return { searched, attempts, candidates: [], notFoundReason: rate ? "rate limited" : [...new Set(attempts.map((a) => a.message).filter(Boolean))].join("; ") || "not found" };
    },
  };
}
export const ICECAT = icecatAdapter();

/* ------------------------------------------------------------------ Earlier reviewed work (local manifests) */
/**
 * Earlier reviewed manifests, supplier/brand catalogue extractions and operator-supplied local files.
 * stateDir: the pipeline state directory (PIPELINE_STATE_DIR in rehearsals). localCandidatesFile: optional JSON
 * { products: { <productId>: [{ file, sourceType?, sourcePage?, matchEvidence? }] } } of local image files to review;
 * defaults to <stateDir>/local-candidates.json. Files are paths relative to the project root.
 */
export function localManifestCandidates(root, { stateDir = `${root}/work/product-image-pipeline`, localCandidatesFile = null } = {}) {
  const read = (p) => (existsSync(`${root}/${p}`) ? JSON.parse(readFileSync(`${root}/${p}`, "utf8")) : []);
  const map = new Map();
  const add = (id, c) => id && (map.get(id) ?? map.set(id, []).get(id)).push(c);
  const local = (f) => (f ? (f.startsWith("work/") ? `${root}/${f}` : f) : null);
  for (const r of read("work/catalogue-images/batch4/manifest-akai.json"))
    add(r.id, { adapter: "reviewed-manifest", official: false, sourceType: "supplier datasheet PDF", sourcePage: `${r.source} p.${r.page}`, matchEvidence: `manual review: ${r.decision}`, decision: r.decision, images: [{ file: local(r.prepared) }] });
  // The ready file's "source" field names the rejected PDF thumbnail; the image itself was taken from Symphony's
  // own sites, recorded in official-candidates.json — use that as the provenance.
  const official = read("work/catalogue-images/symphony-official/official-candidates.json");
  for (const r of read("work/catalogue-images/gree-symphony-ready-symphony.json")) {
    const o = official.find((c) => c.file && r.prepared && c.file.endsWith(r.prepared.split("/").pop()));
    add(r.id, { adapter: "reviewed-manifest", official: true, sourceType: o?.sourceType ?? "Symphony manufacturer website", sourcePage: o?.pageUrl ?? r.source, sourceImageUrl: o?.imageUrl ?? null, retrieved: o?.retrieved ?? null,
      matchEvidence: `manual review: ${r.decision} (${o?.officialName ?? r.model})`, decision: r.decision, images: [{ file: local(r.prepared) }] });
  }
  for (const r of read("work/catalogue-images/audit/pdf-extraction/gree-symphony-review.json"))
    if (r.matchDecision === "PENDING_REVIEW" || r.matchDecision === "CONFIRMED_FAMILY_IMAGE")
      add(r.productId, { adapter: "reviewed-manifest", official: (r.sourceType || "").includes("official"), sourceType: r.sourceType || "catalogue", sourcePage: r.sourceUrl || `${r.sourcePdf} p.${r.sourcePage}`, matchEvidence: `${r.matchDecision} (${r.matchConfidence}): ${r.reviewReason || r.matchEvidence || ""}`.slice(0, 300), decision: r.matchDecision, images: [{ file: local(r.extractedFile) }] });
  for (const r of read("work/catalogue-images/manifest.json"))
    if (r.decision === "REVIEW_REQUIRED") add(r.id, { adapter: "reviewed-manifest", official: false, sourceType: "supplier catalogue PDF", sourcePage: `${r.source} p.${r.page}`, matchEvidence: `REVIEW_REQUIRED: ${r.note || r.method || ""}`, decision: r.decision, images: [{ file: local(r.prepared) }] });
  // Exact-model pages in supplier catalogue PDFs (extracted image + visual review in supplier-review.json).
  const sup = existsSync(`${stateDir}/supplier-candidates.json`) ? JSON.parse(readFileSync(`${stateDir}/supplier-candidates.json`, "utf8")) : {};
  const rev = existsSync(`${stateDir}/supplier-review.json`) ? JSON.parse(readFileSync(`${stateDir}/supplier-review.json`, "utf8")) : {};
  for (const [id, x] of Object.entries(sup)) {
    if (!x.file) continue;
    const r = rev[id];
    add(id, { adapter: "supplier-catalogue", official: false, sourceType: "supplier catalogue PDF", sourcePage: `${x.pdf} p.${x.page}`,
      matchEvidence: `exact model printed on catalogue page ${x.page} (${x.modelsOnPage} catalogue model${x.modelsOnPage === 1 ? "" : "s"} on that page)`,
      decision: r?.decision === "EXACT" ? "VERIFIED" : r?.decision === "FAMILY" ? "FAMILY_IMAGE" : r?.decision === "REJECT" ? "REJECTED" : "PENDING_REVIEW",
      reviewNote: r?.note ?? null, images: [{ file: `${root}/${x.file}` }] });
  }
  // Brand catalogue PDFs processed by `pipeline.mjs catalogue` (exact model heading + layout association).
  const catFile = `${stateDir}/catalogue-candidates.json`;
  const cat = existsSync(catFile) ? JSON.parse(readFileSync(catFile, "utf8")) : null;
  for (const [id, list] of Object.entries(cat?.products ?? {})) for (const x of list) {
    add(id, { adapter: "catalogue-pdf", official: false, sourceType: "brand catalogue PDF", sourcePage: `${cat.pdf} p.${x.page}`,
      matchEvidence: `exact model printed as a heading on catalogue page ${x.page} ("${x.evidence.text}", ${x.evidence.source}${x.evidence.source === "ocr" ? ` confidence ${x.evidence.ocrConfidence}` : ""}, ${x.evidence.level})`,
      exactModel: x.identity === "EXACT_UNAMBIGUOUS", decision: x.identity === "SHARED_IMAGE" ? "FAMILY_IMAGE" : "PENDING_REVIEW", reviewNote: x.issues.join("; ") || null,
      catalogue: { pdf: cat.pdf, page: x.page, cropBox: x.cropBox, cropSource: x.cropSource, evidenceText: x.evidence.text, matchLevel: x.evidence.level, identity: x.identity, quality: x.quality,
        issues: x.issues, rowModels: x.rowModels, preview: x.preview, highlight: x.highlight, previewSha256: x.previewSha256, sourceSha256: x.sourceSha256, nativeLongestPx: x.nativeLongestPx },
      images: [{ file: `${stateDir}/${x.extracted}` }] });
  }
  // Operator-supplied local files (e.g. a reviewed pilot manifest). Never trusted beyond "a person must look at this".
  const lcFile = localCandidatesFile ?? `${stateDir}/local-candidates.json`;
  const lc = existsSync(lcFile) ? JSON.parse(readFileSync(lcFile, "utf8")) : null;
  for (const [id, list] of Object.entries(lc?.products ?? {})) for (const x of list) {
    if (!x?.file || typeof x.file !== "string") continue;
    add(id, { adapter: "local-file", official: false, sourceType: x.sourceType ?? "local file", sourcePage: x.sourcePage ?? x.file,
      matchEvidence: x.matchEvidence ?? "operator-supplied local file", decision: "PENDING_REVIEW", images: [{ file: path.resolve(root, x.file) }] });
  }
  return map;
}

/** Brand (normalised) → official-site adapter. Brands without a reachable, machine-readable official source have none. */
export const ADAPTERS = {
  mazaya: woo({ name: "mazayauae.com", origin: "https://mazayauae.com", official: true }),
  "super general": superGeneral(),
};

/** Why brands without an adapter have none (checked during implementation; see report). */
export const NO_ADAPTER_REASON = {
  // geepas.com/pages/terms-of-website-use: "You specifically agree not to: Access or attempt to access the Site … through any
  // automated means, including but not limited to the use of scripts or web crawlers." — so no automated lookups (checked 2026-10-15).
  geepas: "geepas.com terms prohibit automated access (scripts / crawlers) — automated lookups disabled",
  symphony: "shop.symphonylimited.com terms prohibit spidering, crawling and scraping — no automated lookups",
  panasonic: "panasonic.com/mea returns HTTP 403 to automated requests (not bypassed)",
  haier: "haier.com/ae timed out",
  daewoo: "daewooelectronics.com sells a different (UK) range; DW-… models not listed",
  nikai: "nikai.com has no product search or sitemap; nikaigroup.com has an invalid TLS certificate",
  indesit: "indesit.com search returns HTTP 500; UAE models not addressable",
  toshiba: "toshiba-lifestyle.com/ae returns 404",
  phoenix: "phoenix-uae.com returns HTTP 403",
  krome: "no official website found",
};
