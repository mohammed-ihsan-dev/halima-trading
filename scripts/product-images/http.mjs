// Polite HTTP for the product-image pipeline: per-host concurrency and spacing, timeouts,
// retries with exponential backoff, and robots.txt checks. No access restriction is bypassed:
// 401/403/429 and bot-challenge responses are reported, never worked around.
const UA = "HalimaTradingCatalogueBot/1.0 (+https://halimatrading.com; product image verification)";
const TIMEOUT_MS = 30_000;
const PER_HOST = 2; // concurrent requests per host
const SPACING_MS = 350; // minimum gap between request starts per host

const hosts = new Map(); // host -> { active, queue, last }
const robotsCache = new Map(); // origin -> Promise<{ disallow: RegExp[], allow: RegExp[] }>

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function slot(host) {
  const h = hosts.get(host) ?? hosts.set(host, { active: 0, queue: [], last: 0 }).get(host);
  if (h.active >= PER_HOST) await new Promise((r) => h.queue.push(r));
  h.active++;
  const wait = h.last + SPACING_MS - Date.now();
  h.last = Math.max(Date.now(), h.last + SPACING_MS);
  if (wait > 0) await sleep(wait);
  return () => { h.active--; h.queue.shift()?.(); };
}

const pattern = (rule) => new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));

async function robotsFor(origin) {
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      try {
        const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return { disallow: [], allow: [] };
        const lines = (await res.text()).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
        const rules = { disallow: [], allow: [] };
        let applies = false;
        for (const line of lines) {
          const [k, ...rest] = line.split(":");
          const v = rest.join(":").trim();
          const key = (k || "").toLowerCase();
          if (key === "user-agent") applies = v === "*";
          else if (applies && key === "disallow" && v) rules.disallow.push(pattern(v));
          else if (applies && key === "allow" && v) rules.allow.push(pattern(v));
        }
        return rules;
      } catch {
        return { disallow: [], allow: [] };
      }
    })());
  }
  return robotsCache.get(origin);
}

export async function robotsAllowed(url) {
  const u = new URL(url);
  const r = await robotsFor(u.origin);
  const path = u.pathname + u.search;
  const best = (list) => Math.max(-1, ...list.filter((re) => re.test(path)).map((re) => re.source.length));
  return best(r.allow) >= best(r.disallow);
}

/**
 * GET with retries. Returns { ok, status, url, headers, body: Buffer, error }.
 * Retries network errors, timeouts and 5xx; never retries 4xx (including 403/429 blocks).
 */
export async function get(url, { tries = 3, accept = "*/*", checkRobots = true, headers: extraHeaders = {} } = {}) {
  if (checkRobots && !(await robotsAllowed(url))) return { ok: false, status: 0, url, error: "disallowed by robots.txt", body: Buffer.alloc(0), headers: {} };
  const host = new URL(url).host;
  let last;
  for (let i = 0; i < tries; i++) {
    const release = await slot(host);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, ...extraHeaders }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) }); // extra headers (e.g. API tokens) are sent, never stored or logged
      const body = Buffer.from(await res.arrayBuffer());
      const headers = Object.fromEntries(res.headers.entries());
      const out = { ok: res.ok, status: res.status, url: res.url, headers, body };
      if (res.status >= 500 && i < tries - 1) { last = out; await sleep(1000 * 2 ** i); continue; }
      if (res.status === 429) { out.rateLimited = true; if (i < tries - 1) { const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * 2 ** i; await sleep(Math.min(wait, 60_000)); continue; } }
      if ([401, 403, 429].includes(res.status)) out.error = `access restricted (HTTP ${res.status}) — not bypassed`;
      return out;
    } catch (e) {
      last = { ok: false, status: 0, url, headers: {}, body: Buffer.alloc(0), error: `${e.name}: ${e.cause?.code ?? e.message}` };
      if (i < tries - 1) await sleep(1000 * 2 ** i);
    } finally {
      release();
    }
  }
  return last;
}

export async function getJson(url, opts) {
  const r = await get(url, { ...opts, accept: "application/json" });
  if (!r.ok) return { ...r, json: null };
  try { return { ...r, json: JSON.parse(r.body.toString("utf8")) }; } catch { return { ...r, ok: false, json: null, error: "invalid JSON" }; }
}

export async function getText(url, opts) {
  const r = await get(url, { ...opts, accept: "text/html,application/xml;q=0.9,*/*;q=0.8" });
  return { ...r, text: r.body.toString("utf8") };
}

/** Runs fn over items with at most n in flight. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
