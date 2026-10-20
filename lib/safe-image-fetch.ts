/**
 * Server-side image download for URLs that come from outside (search results, third-party pages).
 *
 * Guards against SSRF and bad payloads:
 *   - https only, default port only, no credentials in the URL, no internal host names;
 *   - every DNS answer must be a public unicast address — checked inside the socket's own lookup, so the
 *     address that is validated is the address that is connected to (no DNS-rebinding window);
 *   - redirects are followed manually (max 3) and each target is re-validated;
 *   - size cap enforced on Content-Length and while streaming; total time limit; no compressed transfer;
 *   - the response must be served as an image AND its bytes must carry a raster image signature
 *     (HTML, SVG, XML and unknown files are rejected).
 * Never sends cookies or credentials. Secrets must not be part of the URL passed in.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import net from "node:net";

export const SAFE_FETCH_DEFAULTS = { maxBytes: 15 * 1024 * 1024, timeoutMs: 20_000, maxRedirects: 3 };

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa)$/i;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}
const inV4 = (ip: string, cidr: string) => {
  const [base, bits] = cidr.split("/");
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
};
const PRIVATE_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
];

/** True only for globally routable unicast addresses. */
export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return !PRIVATE_V4.some((c) => inV4(ip, c));
  if (!net.isIPv6(ip)) return false;
  const v6 = ip.toLowerCase();
  const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPublicAddress(mapped[1]);
  if (v6 === "::" || v6 === "::1") return false;
  const first = parseInt(v6.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (v6.startsWith("2001:db8") || v6.startsWith("64:ff9b") || v6.startsWith("2002:")) return false; // documentation, NAT64, 6to4
  return (first & 0xe000) === 0x2000; // global unicast 2000::/3
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Static URL checks (before any DNS lookup). */
export function checkFetchUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "only https URLs are fetched" };
  if (url.username || url.password) return { ok: false, reason: "URLs with credentials are refused" };
  if (url.port && url.port !== "443") return { ok: false, reason: "non-standard ports are refused" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || BLOCKED_HOST.test(host) || !host.includes(".") && !net.isIP(host)) return { ok: false, reason: "internal host names are refused" };
  if (net.isIP(host) && !isPublicAddress(host)) return { ok: false, reason: "private or reserved IP addresses are refused" };
  return { ok: true, url };
}

/** Resolves a redirect target against the current URL and re-checks it. */
export function nextRedirect(current: string, location: string | undefined): UrlCheck {
  if (!location) return { ok: false, reason: "redirect without a Location header" };
  let target: string;
  try {
    target = new URL(location, current).toString();
  } catch {
    return { ok: false, reason: "invalid redirect target" };
  }
  return checkFetchUrl(target);
}

export function sniffImage(b: Uint8Array): "jpeg" | "png" | "webp" | "avif" | "gif" | "markup" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length >= 12 && /^ftyp(avif|avis)/.test(ascii(4, 12))) return "avif";
  if (b.length >= 4 && ascii(0, 4) === "GIF8") return "gif";
  if (/^\s*<(!doctype|html|\?xml|svg|head|body)/i.test(ascii(0, Math.min(b.length, 200)))) return "markup";
  return null;
}

type Lookup = typeof dnsLookup;

/** A socket lookup that only ever yields public addresses (all answers must be public). */
export function publicOnlyLookup(resolve: Lookup = dnsLookup) {
  return ((hostname: string, options: { all?: boolean; family?: number } | number, callback: (...args: unknown[]) => void) => {
    const opts = typeof options === "number" ? { family: options } : options ?? {};
    resolve(hostname, { all: true, family: (opts.family as 0 | 4 | 6 | undefined) ?? 0 }, (err, addresses) => {
      if (err) return callback(err);
      const list = (addresses as unknown as LookupAddress[]) ?? [];
      if (!list.length) return callback(Object.assign(new Error(`no address for ${hostname}`), { code: "ENOTFOUND" }));
      const blocked = list.find((a) => !isPublicAddress(a.address));
      if (blocked) return callback(Object.assign(new Error(`${hostname} resolves to a non-public address`), { code: "EBLOCKED" }));
      if (opts.all) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  }) as unknown as Lookup;
}

export type SafeFetchResult =
  | { ok: true; buffer: Buffer; contentType: string; kind: string; finalUrl: string; status: number }
  | { ok: false; reason: string; status?: number; retryable?: boolean };

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  /** DNS resolver (tests inject a fake one); results are still filtered to public addresses. */
  resolve?: Lookup;
}

function requestOnce(url: URL, opts: Required<Omit<SafeFetchOptions, "resolve" | "userAgent">> & { userAgent: string; resolve?: Lookup }, deadline: number) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body?: Buffer; error?: string }>((resolveP) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return resolveP({ status: 0, headers: {}, error: "timed out" });
    const req = https.request(url, {
      method: "GET",
      agent: false,
      lookup: publicOnlyLookup(opts.resolve),
      headers: { "User-Agent": opts.userAgent, Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1", "Accept-Encoding": "identity" },
    });
    const timer = setTimeout(() => req.destroy(new Error("timed out")), remaining);
    req.on("error", (e) => { clearTimeout(timer); resolveP({ status: 0, headers: {}, error: e.message }); });
    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) { clearTimeout(timer); res.resume(); return resolveP({ status, headers: res.headers }); }
      if (status !== 200) { clearTimeout(timer); res.resume(); return resolveP({ status, headers: res.headers, error: `HTTP ${status}` }); }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > opts.maxBytes) { clearTimeout(timer); req.destroy(); return resolveP({ status, headers: res.headers, error: `file too large (${declared} bytes)` }); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > opts.maxBytes) { clearTimeout(timer); req.destroy(); resolveP({ status, headers: res.headers, error: `file too large (> ${opts.maxBytes} bytes)` }); return; }
        chunks.push(c);
      });
      res.on("end", () => { clearTimeout(timer); resolveP({ status, headers: res.headers, body: Buffer.concat(chunks) }); });
      res.on("error", (e) => { clearTimeout(timer); resolveP({ status, headers: res.headers, error: e.message }); });
    });
    req.end();
  });
}

export async function safeFetchImage(raw: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const opts = {
    maxBytes: options.maxBytes ?? SAFE_FETCH_DEFAULTS.maxBytes,
    timeoutMs: options.timeoutMs ?? SAFE_FETCH_DEFAULTS.timeoutMs,
    maxRedirects: options.maxRedirects ?? SAFE_FETCH_DEFAULTS.maxRedirects,
    userAgent: options.userAgent ?? "HalimaTradingCatalogueBot/1.0 (+https://halimatrading.com; product image verification)",
    resolve: options.resolve,
  };
  let check = checkFetchUrl(raw);
  const deadline = Date.now() + opts.timeoutMs;
  for (let hop = 0; ; hop++) {
    if (!check.ok) return { ok: false, reason: check.reason };
    const res = await requestOnce(check.url, opts, deadline);
    if (res.status >= 300 && res.status < 400) {
      if (hop >= opts.maxRedirects) return { ok: false, reason: "too many redirects", status: res.status };
      const loc = Array.isArray(res.headers.location) ? res.headers.location[0] : res.headers.location;
      check = nextRedirect(check.url.toString(), loc);
      continue;
    }
    if (res.error || !res.body) return { ok: false, reason: res.error ?? "empty response", status: res.status, retryable: res.status === 429 || res.status >= 500 || res.status === 0 };
    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) return { ok: false, reason: `served as ${contentType || "unknown type"}, not an image`, status: res.status };
    if (contentType.startsWith("image/svg")) return { ok: false, reason: "SVG is not accepted", status: res.status };
    const kind = sniffImage(res.body);
    if (!kind || kind === "markup") return { ok: false, reason: kind === "markup" ? "HTML/XML returned instead of an image" : "bytes are not a recognised image", status: res.status };
    return { ok: true, buffer: res.body, contentType, kind, finalUrl: check.url.toString(), status: res.status };
  }
}
