// Official manufacturer sources — READ-ONLY probe. For each product that needs an image (or whose stored image was
// imported from a Google thumbnail / logo site), find the brand's official UAE product page through its public sitemap,
// confirm the model is printed on the page, and record the page's official image (og:image) with its size.
// One request per second per run, honest User-Agent, robots-allowed paths only (product pages; no search URLs).
// Nothing is downloaded beyond a 64 KB image header; nothing is stored or uploaded.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { imageSize } from "image-size";

const R = "reports/product-image-acquisition-2026-10-29";
const UA = "HalimaTradingCatalogueBot/1.0 (+https://halimatrading.com; product image verification)";
const CACHE = `${R}/tools/cache/official-probe.json`;
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : { pages: {}, sitemaps: {} };
const save = () => writeFileSync(CACHE, JSON.stringify(cache));
const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url, { range = false } = {}) {
  const wait = 1000 - (Date.now() - last); if (wait > 0) await sleep(wait); last = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...(range ? { Range: "bytes=0-65535" } : {}) }, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get("content-type") ?? "", buf, url: r.url };
  } catch (e) { return { status: 0, error: String(e.cause?.code ?? e.message), buf: Buffer.alloc(0) }; }
}
async function sitemapUrls(root, filter = () => true, depth = 0) {
  if (cache.sitemaps[root]) return cache.sitemaps[root];
  const r = await get(root);
  const locs = [...r.buf.toString("utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&").trim());
  let out = [];
  if (/<sitemapindex/i.test(r.buf.toString("utf8").slice(0, 2000)) && depth < 2) { for (const l of locs.filter(filter)) out.push(...(await sitemapUrls(l, filter, depth + 1))); }
  else out = locs;
  cache.sitemaps[root] = out; save();
  return out;
}

// --- targets -------------------------------------------------------------------------------------------------------
const inv = JSON.parse(readFileSync(`${R}/tools/baseline/product-image-inventory.json`, "utf8")).products;
const flagged = new Set(JSON.parse(readFileSync(`${R}/tools/cache/import-flags.json`, "utf8")).flaggedProductIds);
const SOURCES = {
  Haier: { sitemap: "https://www.haier.com/ae/sitemap.xml", keep: (u) => /haier\.com\/ae\//.test(u), site: "haier.com/ae" },
  LG: { sitemap: "https://www.lg.com/ae/sitemap.xml", keep: (u) => /lg\.com\/ae\//.test(u), site: "lg.com/ae" },
  Samsung: { sitemap: "https://www.samsung.com/ae/b2c-sitemap.xml", keep: (u) => /samsung\.com\/ae\//.test(u), site: "samsung.com/ae" },
  "O General": { sitemap: "https://www.ogeneralac.com/sitemap_products_1.xml?from=542691262523&to=8088860852339", keep: () => true, site: "ogeneralac.com" },
  Simfer: { sitemap: "https://simfer.com.tr/xml/sitemap/product.xml", keep: () => true, site: "simfer.com.tr" },
};
const baseModel = (brand, m) => {
  const s = String(m ?? "").trim();
  if (brand === "LG") return s.replace(/\..*$/, "");
  if (brand === "Samsung") return s.replace(/\s*\/.*$/, "");
  return s;
};
const results = [];
for (const [brand, src] of Object.entries(SOURCES)) {
  const targets = inv.filter((p) => p.brand === brand && (!p.hasValidImage || flagged.has(p.productId)));
  if (!targets.length) continue;
  const urls = (await sitemapUrls(src.sitemap, (u) => !/image|video|blog|news|support|business/i.test(u))).filter(src.keep);
  console.log(`${brand}: ${targets.length} target(s), ${urls.length} sitemap URLs`);
  for (const p of targets) {
    const full = norm(p.model), base = norm(baseModel(brand, p.model));
    const matches = full.length >= 5 ? urls.filter((u) => { const path = norm(new URL(u).pathname); return path.includes(full) || (base.length >= 5 && path.includes(base)); }) : [];
    const pick = [...new Set(matches)].sort((a, b) => a.length - b.length).slice(0, 2);
    const rec = { productId: p.productId, id: p.id, brand, model: p.model, reason: p.hasValidImage ? "stored image came from a thumbnail/logo import" : `no suitable image (${p.imageStatus})`, site: src.site, sitemapMatches: matches.length, candidates: [] };
    for (const url of pick) {
      const page = cache.pages[url] ?? (await (async () => {
        const r = await get(url);
        const html = r.buf.toString("utf8");
        const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ?? null;
        const text = norm(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "));
        const out = { status: r.status, finalUrl: r.url, ogImage: og ? new URL(og, url).href : null, fullModelOnPage: full.length >= 5 && text.includes(full), baseModelOnPage: base.length >= 5 && text.includes(base),
          title: (html.match(/<title>([^<]*)/i)?.[1] ?? "").trim().slice(0, 140) };
        cache.pages[url] = out; save(); return out;
      })());
      const c = { pageUrl: url, httpStatus: page.status, title: page.title, imageUrl: page.ogImage, evidence: page.fullModelOnPage ? "exact model printed on the official page" : page.baseModelOnPage ? `base model ${baseModel(brand, p.model)} printed on the page (product record carries a regional suffix)` : "model NOT found on the page" };
      if (page.ogImage) {
        const key = `img:${page.ogImage}`;
        const im = cache.pages[key] ?? (await (async () => {
          const r = await get(page.ogImage, { range: true });
          let d = null; try { d = imageSize(r.buf); } catch { /* unreadable header */ }
          const out = { status: r.status, type: r.type, width: d?.width ?? null, height: d?.height ?? null };
          cache.pages[key] = out; save(); return out;
        })());
        Object.assign(c, { imageStatus: im.status, imageType: im.type, width: im.width, height: im.height });
      }
      c.classification = page.status !== 200 || !c.imageUrl ? "no usable image on page"
        : !page.fullModelOnPage && !page.baseModelOnPage ? "uncertain (model not on page)"
        : ![200, 206].includes(c.imageStatus) || !/^image\//.test(c.imageType ?? "") ? "image not retrievable"
        : Math.max(c.width ?? 0, c.height ?? 0) < 400 ? "image too small"
        : page.fullModelOnPage ? "verified exact match" : "likely match (regional suffix)";
      rec.candidates.push(c);
    }
    rec.best = rec.candidates.find((c) => c.classification === "verified exact match") ?? rec.candidates.find((c) => c.classification.startsWith("likely")) ?? rec.candidates[0] ?? null;
    rec.classification = rec.best?.classification ?? (matches.length ? "no usable image on page" : "no official page found");
    results.push(rec);
    console.log(`  ${p.model}: ${rec.classification}${rec.best?.pageUrl ? ` — ${rec.best.pageUrl}` : ""}`);
  }
}
writeFileSync(`${R}/tools/cache/official-candidates.json`, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 1));
const by = results.reduce((m, r) => ((m[`${r.brand}: ${r.classification}`] = (m[`${r.brand}: ${r.classification}`] ?? 0) + 1), m), {});
console.log(JSON.stringify(by, null, 1));
