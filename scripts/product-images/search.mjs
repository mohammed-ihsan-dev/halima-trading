// Image search (server-side only): finds candidate pages/images for one exact model through a configurable
// provider. Search results are leads, never permission: every result is classified by source type and goes
// through verification and human review before it can be used.
//
//   IMAGE_SEARCH_PROVIDER=serpapi   SERPAPI_API_KEY=…   (provider "none" or a missing key disables search)
//
// The API key is sent only to the provider, never stored in results, logs or state files.
import { modelMatch, norm } from "./sources.mjs";
import { serpApiBase } from "./serpapi-budget.mjs";

/** Manufacturer (official brand) domains, used for source priority and classification. */
export const MANUFACTURER_DOMAINS = {
  "super general": ["supergeneral.com"], mazaya: ["mazayauae.com"], geepas: ["geepas.com"], panasonic: ["panasonic.com"],
  lg: ["lg.com"], samsung: ["samsung.com"], indesit: ["indesit.com", "indesit.co.uk"], gree: ["gree.com", "global.gree.com"],
  "blue star": ["bluestarindia.com", "bluestarlimited.com"], aftron: ["aftron.com"], nikai: ["nikaigroup.com", "nikai.com"],
  "mitsubishi electric": ["mitsubishielectric.com"], symphony: ["symphonylimited.com"], daewoo: ["daewoo.com", "daewooelectricals.com"],
  krome: ["kromeappliances.com"], "o general": ["o-general.com", "ogeneral.com", "fujitsu-general.com"], bosch: ["bosch-home.com", "bosch-home.ae"],
  toshiba: ["toshiba-lifestyle.com", "toshiba.com"], "black+decker": ["blackanddecker.com", "blackanddecker.ae"], haier: ["haier.com"],
  "pro general": ["progeneral.com"], akai: ["akai.com", "akaiglobal.com"], phoenix: ["phoenix.ae"], kenwood: ["kenwoodworld.com"],
};

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const onDomain = (host, d) => host === d || host.endsWith(`.${d}`);

export function searchConfig(env = process.env) {
  const provider = (env.IMAGE_SEARCH_PROVIDER || (env.SERPAPI_API_KEY ? "serpapi" : "none")).toLowerCase();
  const int = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.parseInt(v ?? "", 10) || d));
  return {
    provider: provider === "serpapi" && env.SERPAPI_API_KEY ? "serpapi" : "none",
    disabledReason: provider === "serpapi" && !env.SERPAPI_API_KEY ? "SERPAPI_API_KEY is not set" : provider === "none" ? "IMAGE_SEARCH_PROVIDER is not set" : provider !== "serpapi" ? `unknown provider "${provider}"` : null,
    perProduct: int(env.IMAGE_CANDIDATES_PER_PRODUCT, 5, 1, 20),
    timeoutMs: int(env.IMAGE_SEARCH_TIMEOUT_MS, 20_000, 2_000, 120_000),
    minIntervalMs: int(env.IMAGE_SEARCH_MIN_INTERVAL_MS, 1_200, 0, 60_000),
    country: env.IMAGE_SEARCH_COUNTRY || "ae",
  };
}

/**
 * Source type, in priority order:
 *   manufacturer            the brand's own domain
 *   authorized_distributor  a holder in the permission register with a documented grant ("confirmed")
 *   other                   anything else (needs exact-model identity AND commercial authorization before use)
 */
export function classifySource(url, brand, register = {}) {
  const host = hostOf(url);
  if (!host) return "other";
  if ((MANUFACTURER_DOMAINS[String(brand).trim().toLowerCase()] ?? []).some((d) => onDomain(host, d))) return "manufacturer";
  for (const h of Object.values(register.holders ?? {})) {
    if (h.status === "confirmed" && (h.domains ?? []).some((d) => !d.includes("/") && onDomain(host, d))) return "authorized_distributor";
  }
  return "other";
}

export const SOURCE_PRIORITY = { manufacturer: 0, authorized_distributor: 1, other: 2 };

/** Queries in priority order: the brand's own domain first, then documented distributors, then the open web. */
export function buildQueries(product, register = {}) {
  const model = String(product.model ?? "").trim();
  if (!model) return [];
  const brand = String(product.brand ?? "").trim();
  const exact = `"${model}"`;
  const q = [];
  for (const d of MANUFACTURER_DOMAINS[brand.toLowerCase()] ?? []) q.push({ tier: "manufacturer", query: `${brand} ${exact} site:${d}` });
  const distributors = Object.values(register.holders ?? {}).filter((h) => h.status === "confirmed").flatMap((h) => (h.domains ?? []).filter((d) => !d.includes("/")));
  for (const d of distributors) q.push({ tier: "authorized_distributor", query: `${brand} ${exact} site:${d}` });
  q.push({ tier: "other", query: `${brand} ${exact} ${product.category ?? ""}`.trim() });
  return q;
}

/** Normalises a SerpAPI google_images response into candidates (only the fields we keep — no API metadata). */
export function parseSerpApiImages(json, product, { query, tier, register } = {}) {
  const results = Array.isArray(json?.images_results) ? json.images_results : [];
  const out = [];
  for (const r of results) {
    const image = typeof r.original === "string" ? r.original : null;
    const page = typeof r.link === "string" ? r.link : null;
    if (!image || !page || !/^https:\/\//i.test(image)) continue;
    const title = String(r.title ?? "");
    const inTitle = modelMatch(product.model, title);
    const inUrl = modelMatch(product.model, page) || modelMatch(product.model, image);
    const sourceType = classifySource(page, product.brand, register);
    out.push({
      adapter: "serpapi", sourcePage: page, sourceType, official: sourceType === "manufacturer",
      images: [{ url: image }], title: title.slice(0, 300), sourceName: String(r.source ?? "").slice(0, 120),
      reportedWidth: Number(r.original_width) || null, reportedHeight: Number(r.original_height) || null,
      exactModel: inTitle || inUrl,
      matchEvidence: inTitle ? "exact model in the result title" : inUrl ? "exact model in the page or image URL" : `model ${product.model} not shown in the result`,
      searchQuery: query, searchTier: tier, discoveredAt: new Date().toISOString(),
    });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

/** Pass 1: exactly one query per product — exact brand, quoted model and category. */
export function firstPassQuery(product) {
  const model = String(product.model ?? "").trim();
  if (!model) return null;
  return `${String(product.brand ?? "").trim()} "${model}" ${product.category ?? ""}`.replace(/\s+/g, " ").trim();
}

/** One provider request. Recorded in the ledger before it is sent; never retried automatically. */
async function serpApiCall(query, cfg, env, fetchImpl, ledger, productId, purpose) {
  const slot = ledger.reserve({ productId, query, purpose }); // throws when the limit is reached
  const wait = lastCall + cfg.minIntervalMs - Date.now(); // provider rate limit
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const params = new URLSearchParams({ engine: "google_images", q: query, gl: cfg.country, hl: "en", safe: "active", api_key: env.SERPAPI_API_KEY });
  let res;
  try {
    res = await fetchImpl(`${serpApiBase(env)}/search.json?${params}`, { signal: AbortSignal.timeout(cfg.timeoutMs) });
  } catch (e) {
    slot.done("failed", { error: `request failed (${e.name})` });
    return { error: `search request failed (${e.name})` };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    const msg = String(body?.error ?? `HTTP ${res.status}`);
    if (/hasn't returned any results/i.test(msg)) { slot.done("ok", { results: 0 }); return { json: { images_results: [] } }; }
    slot.done("failed", { error: msg.slice(0, 160), http: res.status }); // provider messages never contain the key
    return { error: `search provider: ${msg.slice(0, 160)}` };
  }
  slot.done("ok", { results: (body.images_results ?? []).length });
  return { json: body };
}

/**
 * Candidates for one product. Pass 1 makes at most ONE request (cache first). Pass 2 (manufacturer `site:` queries)
 * runs only when the operator asks for it. A query whose last request failed is not repeated unless `retryFailed`.
 * `ledger` and `cache` are required: there is no way to search without quota accounting.
 */
export async function findSearchCandidates(product, { register = {}, env = process.env, fetchImpl = fetch, ledger, cache, pass = 1, retryFailed = false } = {}) {
  const cfg = searchConfig(env);
  if (cfg.provider === "none") return { candidates: [], searched: [], disabled: cfg.disabledReason, requests: 0, cacheHits: 0 };
  if (!ledger || !cache) throw new Error("search requires the request ledger and cache");
  const queries = pass === 1
    ? [{ tier: "open", query: firstPassQuery(product) }].filter((q) => q.query)
    : buildQueries(product, register).filter((q) => q.tier !== "other");
  const seen = new Set();
  const candidates = [], searched = [], errors = [];
  let requests = 0, cacheHits = 0, skippedFailed = 0;
  for (const { tier, query } of queries) {
    let json = cache.get(query);
    if (json) { cacheHits++; searched.push(`serpapi (cached): ${query}`); }
    else {
      const last = ledger.lastFor(query);
      if (last && last.status !== "ok" && !retryFailed) { skippedFailed++; errors.push(`previous request failed (${last.error ?? last.status}); not retried without --retry-failed`); continue; }
      if (ledger.remaining <= 0) { errors.push("request limit reached"); break; }
      const r = await serpApiCall(query, cfg, env, fetchImpl, ledger, product.id, `pass ${pass}`);
      requests++;
      searched.push(`serpapi: ${query}`);
      if (r.error) { errors.push(r.error); continue; }
      json = cache.set(query, r.json); // the trimmed form that is stored
    }
    for (const c of parseSerpApiImages(json, product, { query, tier, register })) {
      const key = norm(c.images[0].url);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(c);
    }
  }
  candidates.sort((a, b) => SOURCE_PRIORITY[a.sourceType] - SOURCE_PRIORITY[b.sourceType] || Number(b.exactModel) - Number(a.exactModel));
  return { candidates: candidates.slice(0, cfg.perProduct), totalResults: candidates.length, searched, requests, cacheHits, skippedFailed, error: errors.length && !candidates.length ? errors[0] : null };
}
