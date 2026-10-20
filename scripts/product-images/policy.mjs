// Image reuse-permission policy and model-consistency checks for the product-image pipeline.
//
// Permission is never inferred from public availability or from the source being an official website.
// An image may be uploaded only when the permission register (work/product-image-pipeline/permissions.json)
// holds a "confirmed" record for its rights holder WITH evidence (a saved written grant: who granted it,
// when, and where the document is kept). Everything else is held.
import { existsSync } from "node:fs";
import path from "node:path";

export const PERMISSION = { CONFIRMED: "confirmed", PENDING: "permission_pending", DENIED: "permission_denied" };

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };

/**
 * Resolves the permission status for one candidate image.
 * register: { holders: { [name]: { domains: [..], status, evidence: [...], grant?: { grantedBy, date, document } } },
 *             products?: { [productId]: same shape } }
 */
export function resolvePermission(register, { productId, sourcePage, sourceImageUrl, imageUrl, root = process.cwd() }) {
  const urls = [sourcePage, sourceImageUrl, imageUrl].filter((u) => typeof u === "string" && /^https?:\/\//.test(u));
  const hosts = urls.map(hostOf).filter(Boolean);
  // "example.com" matches that host and its subdomains; "host/path" matches URLs under that path (e.g. one brand's CDN folder).
  const matches = (d) => (d.includes("/") ? urls.some((u) => u.replace(/^https?:\/\/(www\.)?/, "").startsWith(d)) : hosts.some((x) => x === d || x.endsWith(`.${d}`)));
  const productRule = register?.products?.[productId];
  const holderEntry = productRule ? ["product override", productRule]
    : Object.entries(register?.holders ?? {}).find(([, h]) => (h.domains ?? []).some(matches) || (h.documents ?? []).some((doc) => typeof sourcePage === "string" && sourcePage.includes(doc)));
  if (!holderEntry) return { status: PERMISSION.PENDING, holder: null, reason: `no permission record for ${hosts.join(", ") || "this source"}`, evidence: [] };
  const [holder, h] = holderEntry;
  if (h.status === PERMISSION.CONFIRMED) {
    const g = h.grant ?? {};
    const docOk = g.document && existsSync(path.resolve(root, g.document));
    if (!(g.grantedBy && g.date && docOk)) {
      return { status: PERMISSION.PENDING, holder, reason: "marked confirmed but the written grant (grantedBy, date, saved document) is incomplete", evidence: h.evidence ?? [] };
    }
    return { status: PERMISSION.CONFIRMED, holder, reason: `written permission from ${g.grantedBy} (${g.date})`, evidence: [...(h.evidence ?? []), { type: "grant", ...g }] };
  }
  // A published licence (e.g. Icecat's Open Content License) counts as permission only once its conditions are met on the site.
  if (h.status === "licensed") {
    if (h.conditionsMet === true) return { status: PERMISSION.CONFIRMED, holder, reason: `${h.licence} — conditions met`, evidence: h.evidence ?? [] };
    return { status: PERMISSION.PENDING, holder, reason: `${h.licence} permits reuse, but its conditions are not yet met: ${(h.conditions ?? []).join("; ")}`, evidence: h.evidence ?? [] };
  }
  if (h.status === PERMISSION.DENIED) return { status: PERMISSION.DENIED, holder, reason: h.summary ?? "source terms prohibit reuse", evidence: h.evidence ?? [] };
  return { status: PERMISSION.PENDING, holder, reason: h.summary ?? "reuse permission not confirmed", evidence: h.evidence ?? [] };
}

const alnum = (s) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * If an image file name carries a model code of the same family that is NOT the product's model
 * (e.g. "…-sgcl80t3-1.webp" for SG CL 50T3), returns that code; otherwise null.
 */
export function filenameModelConflict(model, url) {
  const m = alnum(model);
  if (m.length < 5) return null;
  let name;
  try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? ""); } catch { name = String(url).split("/").pop() ?? ""; }
  const stem = name.replace(/\.[a-z0-9]+$/i, "");
  if (alnum(stem).includes(m)) return null;
  const prefix = m.match(/^[A-Z]{2,}/)?.[0];
  if (!prefix) return null;
  const tokens = stem.split(/[^A-Za-z0-9]+/).map(alnum).filter((t) => /[A-Z]/.test(t) && /\d/.test(t) && t.length >= 5);
  const other = tokens.find((t) => t.startsWith(prefix.slice(0, 2)) && t !== m);
  return other ?? null;
}

/**
 * True when the source's rights holder prohibits automated access (scripts, crawlers): such images are
 * never downloaded by the pipeline, even when a search provider lists them. Set per holder in the register
 * as `automatedAccessProhibited: true`, with the quoted terms as evidence.
 */
export function automatedAccessProhibited(register, urls) {
  const list = urls.filter((u) => typeof u === "string" && /^https?:\/\//.test(u));
  const hosts = list.map(hostOf).filter(Boolean);
  for (const [holder, h] of Object.entries(register?.holders ?? {})) {
    if (h.automatedAccessProhibited !== true) continue;
    const hit = (h.domains ?? []).some((d) => (d.includes("/") ? list.some((u) => u.replace(/^https?:\/\/(www\.)?/, "").startsWith(d)) : hosts.some((x) => x === d || x.endsWith(`.${d}`))));
    if (hit) return holder;
  }
  return null;
}
