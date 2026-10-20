// SerpApi quota protection for the image pipeline.
//
//   - a local request ledger: every outbound search is recorded BEFORE it is sent (failed requests count too),
//     and no request is sent once the configured limit is reached (SERPAPI_REQUEST_LIMIT, default 200);
//   - the ledger is never reset by the pipeline — only by a person editing/removing the file deliberately;
//   - a result cache keyed by the exact query, checked before any request;
//   - a free account check (SerpApi Account API, not billed) for the remaining monthly searches.
// The API key is read from the environment and is never written to the ledger, the cache, logs or reports.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const DEFAULT_REQUEST_LIMIT = 200;

/** API origin. Tests may point it at a local fake server — loopback only, so the key can never be sent elsewhere. */
export function serpApiBase(env = process.env) {
  const t = env.SERPAPI_TEST_BASE_URL;
  return t && /^http:\/\/127\.0\.0\.1:\d+$/.test(t) ? t : "https://serpapi.com";
}
export const CACHE_MAX_AGE_DAYS = 30;

const qhash = (q) => createHash("sha256").update(q).digest("hex").slice(0, 16);
function readJson(file, fallback) { return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback; }
function writeJson(file, data) { writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 1)); renameSync(`${file}.tmp`, file); }

export function requestLimit(env = process.env) {
  const n = Number.parseInt(env.SERPAPI_REQUEST_LIMIT ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_REQUEST_LIMIT;
}

/**
 * Ledger of outbound requests. `reserve()` records the request synchronously before it is sent and throws once
 * the limit is reached, so concurrency, retries or errors can never push the count past the limit.
 */
export function openLedger(file, limit) {
  const data = readJson(file, { createdAt: new Date().toISOString(), note: "Every SerpApi search request made by the image pipeline. Never reset automatically.", requests: [] });
  const persist = () => writeJson(file, data);
  return {
    get used() { return data.requests.length; },
    get limit() { return limit; },
    get remaining() { return Math.max(0, limit - data.requests.length); },
    reserve({ productId, query, purpose }) {
      if (data.requests.length >= limit) throw Object.assign(new Error(`SerpApi request limit reached (${data.requests.length}/${limit})`), { code: "BUDGET" });
      const entry = { n: data.requests.length + 1, at: new Date().toISOString(), productId, purpose, query, queryHash: qhash(query), status: "sent" };
      data.requests.push(entry);
      persist(); // on disk before the request leaves
      return {
        done(status, detail = {}) { Object.assign(entry, { status, ...detail, finishedAt: new Date().toISOString() }); persist(); },
      };
    },
    lastFor(query) { const h = qhash(query); return [...data.requests].reverse().find((r) => r.queryHash === h) ?? null; },
    entries: () => data.requests,
  };
}

/** Query → trimmed provider results. Only result fields the pipeline uses are stored (no request metadata). */
export function openCache(file, maxAgeDays = CACHE_MAX_AGE_DAYS) {
  const data = readJson(file, {});
  let hits = 0;
  return {
    get(query) {
      const e = data[qhash(query)];
      if (!e || e.query !== query) return null;
      if (Date.now() - new Date(e.at).getTime() > maxAgeDays * 864e5) return null;
      hits++;
      return e.json;
    },
    set(query, json) {
      const images_results = (json?.images_results ?? []).slice(0, 50).map((r) => ({ original: r.original, link: r.link, title: r.title, source: r.source, original_width: r.original_width, original_height: r.original_height }));
      data[qhash(query)] = { query, at: new Date().toISOString(), json: { images_results } };
      writeJson(file, data);
      return { images_results };
    },
    get hits() { return hits; },
  };
}

/**
 * Remaining monthly searches from the SerpApi Account API (free; does not consume searches).
 * Returns only the quota fields — the response also contains account details that are never kept.
 */
export async function checkAccount({ env = process.env, fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  if (!env.SERPAPI_API_KEY) return { ok: false, error: "SERPAPI_API_KEY is not set" };
  let res;
  try {
    res = await fetchImpl(`${serpApiBase(env)}/account.json?${new URLSearchParams({ api_key: env.SERPAPI_API_KEY })}`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, error: `account check failed (${e.name})` };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) return { ok: false, error: `account check: ${String(body?.error ?? `HTTP ${res.status}`).slice(0, 120)}` };
  const num = (v) => (typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    ok: true,
    plan: typeof body.plan_name === "string" ? body.plan_name : null,
    searchesPerMonth: num(body.searches_per_month),
    thisMonthUsage: num(body.this_month_usage),
    planSearchesLeft: num(body.plan_searches_left),
    totalSearchesLeft: num(body.total_searches_left),
    checkedAt: new Date().toISOString(),
  };
}

/** Whether a batch of `needed` requests may start: both the API quota and the local limit must cover it. */
export function budgetDecision({ account, ledger, needed }) {
  if (!account?.ok) return { allowed: false, reason: account?.error ?? "account check unavailable" };
  const apiLeft = account.totalSearchesLeft ?? account.planSearchesLeft;
  if (apiLeft == null) return { allowed: false, reason: "account check did not report remaining searches" };
  if (needed > apiLeft) return { allowed: false, reason: `insufficient SerpApi quota: ${needed} searches needed, ${apiLeft} left this month` };
  if (needed > ledger.remaining) return { allowed: false, reason: `pipeline request limit: ${needed} needed, ${ledger.remaining} of ${ledger.limit} left in the local ledger` };
  return { allowed: true, apiLeft, ledgerLeft: ledger.remaining };
}
