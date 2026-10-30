// Phase 4: check each Supabase image referenced in MongoDB. READ-ONLY.
// It uses storage.info, the metadata read behind head(), plus the bytes the visual step already downloaded.
// For every URL it records whether the object exists, its stored size and type, whether the downloaded bytes match the stored object, and whether the key follows the bucket's naming rule.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const A = "reports/product-image-database-audit-2026-10-30";
const IMG = process.env.AUDIT_IMAGE_CACHE;
const { getImageStorage } = await import("@/lib/image-storage");
const s = getImageStorage();
if (!s.ok) throw new Error("image storage not configured");
const st = s.storage, store = { keyFromPublicUrl: st.keyFromPublicUrl, head: (k) => st.store.head(k) };
const manifest = JSON.parse(readFileSync(`${A}/tools/cache/visual-manifest.json`, "utf8"));
const urls = [...new Set(manifest.filter((m) => m.storageType === "supabase").map((m) => m.ref))];
const key = (u) => createHash("sha256").update(u).digest("hex").slice(0, 32);
const SNIFF = { ffd8ff: "image/jpeg", "89504e": "image/png", 524946: "image/webp", 474946: "image/gif" };
const out = {};
for (let i = 0; i < urls.length; i += 10) {
  await Promise.all(urls.slice(i, i + 10).map(async (url) => {
    const k = store.keyFromPublicUrl(url);
    const r = { url, key: k, keyValid: !!k };
    if (!k) { r.status = "url not in bucket naming scheme"; out[url] = r; return; }
    try {
      const h = await store.head(k);
      if (!h) { r.status = "object missing"; out[url] = r; return; }
      r.objectSize = h.size; r.objectContentType = h.contentType;
      const f = `${IMG}/${key(url)}`;
      if (existsSync(f)) {
        const b = readFileSync(f);
        r.downloadedSize = b.length;
        r.sniffedType = SNIFF[b.subarray(0, 3).toString("hex")] ?? (b.subarray(8, 12).toString() === "WEBP" ? "image/webp" : "unknown");
        r.sizeMatches = b.length === h.size;
        r.typeMatches = r.sniffedType === h.contentType.split(";")[0].trim();
        r.extensionMatchesType = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[k.split(".").pop()] === r.sniffedType;
      }
      r.status = r.sizeMatches === false || r.typeMatches === false ? "object exists — mismatch" : "verified";
    } catch (e) { r.status = `check failed: ${e.name}`; }
    out[url] = r;
  }));
}
writeFileSync(`${A}/tools/cache/supabase-verify.json`, JSON.stringify(out, null, 1));
const c = Object.values(out).reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
console.log(JSON.stringify({ unique: urls.length, ...c, extMismatch: Object.values(out).filter((r) => r.extensionMatchesType === false).length }));
