/**
 * Server-only: import an external product image into the app's image storage (Supabase Storage).
 *
 *   1. URL rules and the download come from safe-image-fetch (https only, public addresses only — checked at
 *      connect time, every redirect re-validated, size/time limits, real image bytes required).
 *   2. The bytes are validated again here (signature, and a full decode when `sharp` is available). AVIF or files
 *      over the storage limit are converted to JPEG when `sharp` is available, otherwise refused.
 *   3. The storage key is derived from the product folder and the SHA-256 of the stored bytes, so importing the same
 *      image for the same product twice reuses the existing object; signed uploads can never overwrite an object.
 *   4. The new object is verified (object check + public URL) and the import is written to the audit log. If any of
 *      that fails, ONLY the object created by this call is deleted — an existing object is never touched.
 * MongoDB product documents are never written here: the caller adds the returned URL through the existing gallery
 * save, which only succeeds if the product's images are unchanged.
 */
import { createHash } from "node:crypto";
import { checkFetchUrl, safeFetchImage, sniffImage, type SafeFetchResult } from "@/lib/safe-image-fetch";
import { ALLOWED_IMAGE_TYPES, IMAGE_UPLOAD, detectImageType, isValidImageKey, productKeySegment, verifyPublicImageUrl, type AllowedImageType } from "@/lib/r2";
import type { ImageStorage } from "@/lib/image-storage";

export const IMPORT_LIMITS = {
  sourceMaxBytes: 15 * 1024 * 1024, // what may be downloaded; the stored file must fit IMAGE_UPLOAD.maxBytes
  timeoutMs: 20_000,
  maxRedirects: 3,
  maxPixels: 40_000_000,
  convertMaxDimension: 2400,
  maxUrlLength: 2048,
} as const;

export interface ImageImportRecord {
  sourceUrl: string;
  finalUrl: string;
  productRef: string;
  storageKey: string;
  publicUrl: string;
  sha256: string;
  sourceSha256: string | null;
  format: AllowedImageType;
  sourceFormat: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
  converted: boolean;
  reused: boolean;
  importedBy: string;
  importedAt: Date;
}

type SharpLike = (input: Buffer, options?: { limitInputPixels?: number }) => {
  metadata(): Promise<{ width?: number; height?: number; format?: string }>;
  rotate(): SharpLikeChain;
};
type SharpLikeChain = {
  resize(o: { width: number; height: number; fit: "inside"; withoutEnlargement: true }): SharpLikeChain;
  flatten(o: { background: string }): SharpLikeChain;
  jpeg(o: { quality: number; mozjpeg?: boolean }): SharpLikeChain;
  toBuffer(): Promise<Buffer>;
};

/** `sharp` is optional at runtime (it is not a declared dependency): null when it cannot be loaded. */
export async function loadSharp(): Promise<SharpLike | null> {
  try {
    const mod = (await import(/* webpackIgnore: true */ "sharp" as string)) as { default?: SharpLike };
    return (mod.default ?? (mod as unknown as SharpLike)) || null;
  } catch {
    return null;
  }
}

export interface ImportDeps {
  storage: ImageStorage;
  importedBy: string;
  fetchImage?: (url: string) => Promise<SafeFetchResult>;
  /** Earlier import of the same source URL for the same product folder (audit log). Failures are treated as "none". */
  findPrevious?: (q: { sourceUrl: string; productRef: string }) => Promise<{ storageKey: string; publicUrl: string } | null>;
  /** Writes the audit record. If it throws, the import fails and its new object is removed. */
  record: (rec: ImageImportRecord) => Promise<void>;
  sharp?: SharpLike | null;
  /** HTTP client for the signed upload PUT and the public URL check (tests point it at a fake storage). */
  fetchImpl?: typeof fetch;
}

export type ImportResult =
  | { ok: true; url: string; key: string; reused: boolean; converted: boolean; format: AllowedImageType; width: number | null; height: number | null; bytes: number; sourceUrl: string }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): ImportResult => ({ ok: false, status, error });
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** RFC 4122 v4-shaped UUID derived from the product folder and the content hash (same scheme as the image pipeline). */
export function contentUuid(folder: string, contentSha: string): string {
  const h = createHash("sha256").update(`${folder}\n${contentSha}`).digest("hex").slice(0, 32).split("");
  h[12] = "4";
  h[16] = "89ab"[parseInt(h[16], 16) % 4];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Maps a safe-fetch failure to an HTTP status the admin UI can explain. */
export function fetchFailureStatus(reason: string, retryable?: boolean): number {
  if (/refused|non-public|not a valid URL|only https|redirect without|invalid redirect|too many redirects/i.test(reason)) return 400;
  if (/too large/i.test(reason)) return 413;
  if (/not an image|not a recognised image|HTML|SVG/i.test(reason)) return 415;
  return retryable ? 502 : 422;
}

export async function importExternalImage(rawUrl: string, productRefRaw: string | undefined, deps: ImportDeps): Promise<ImportResult> {
  const sourceUrl = rawUrl.trim();
  if (!sourceUrl || sourceUrl.length > IMPORT_LIMITS.maxUrlLength) return fail(400, "Paste a complete image URL (https://…).");
  const check = checkFetchUrl(sourceUrl);
  if (!check.ok) return fail(400, `This URL cannot be imported: ${check.reason}.`);
  const folder = productKeySegment(productRefRaw) || "imports";
  const { storage } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;

  // 1. Same source URL imported for this product before → reuse that object if it is still there and still served.
  const previous = deps.findPrevious ? await deps.findPrevious({ sourceUrl, productRef: folder }).catch(() => null) : null;
  if (previous && isValidImageKey(previous.storageKey) && (await storage.store.head(previous.storageKey).catch(() => null))) {
    const type = (Object.entries(ALLOWED_IMAGE_TYPES).find(([, ext]) => previous.storageKey.endsWith(`.${ext}`))?.[0] ?? "image/jpeg") as AllowedImageType;
    const prevUrl = storage.publicUrlForKey(previous.storageKey);
    const pub = await verifyPublicImageUrl(prevUrl, type, fetchImpl);
    if (pub.ok) {
      try { // this action is logged too (who reused it); nothing is deleted on failure
        await deps.record({ sourceUrl, finalUrl: sourceUrl, productRef: folder, storageKey: previous.storageKey, publicUrl: prevUrl, sha256: "", sourceSha256: null, format: type, sourceFormat: null,
          width: null, height: null, bytes: 0, converted: false, reused: true, importedBy: deps.importedBy, importedAt: new Date() });
      } catch {
        return fail(500, "The import could not be recorded, so the image was not added. Please try again.");
      }
      return { ok: true, url: prevUrl, key: previous.storageKey, reused: true, converted: false, format: type, width: null, height: null, bytes: 0, sourceUrl };
    }
  }

  // 2. Download (SSRF-safe).
  const got = await (deps.fetchImage ?? ((u: string) => safeFetchImage(u, { maxBytes: IMPORT_LIMITS.sourceMaxBytes, timeoutMs: IMPORT_LIMITS.timeoutMs, maxRedirects: IMPORT_LIMITS.maxRedirects })))(sourceUrl);
  if (!got.ok) return fail(fetchFailureStatus(got.reason, got.retryable), `The image could not be downloaded: ${got.reason}.`);
  const source = got.buffer;
  const kind = sniffImage(source);
  if (kind === "gif") return fail(415, "GIF images are not accepted. Use a JPEG, PNG, WebP or AVIF image.");
  if (kind !== "jpeg" && kind !== "png" && kind !== "webp" && kind !== "avif") return fail(415, "The file is not a JPEG, PNG, WebP or AVIF image.");

  // 3. Validate by decoding; convert AVIF / oversized images to JPEG.
  const sharp = deps.sharp === undefined ? await loadSharp() : deps.sharp;
  let bytes: Buffer = source, width: number | null = null, height: number | null = null, converted = false;
  const needsConversion = kind === "avif" || source.length > IMAGE_UPLOAD.maxBytes;
  if (sharp) {
    let meta;
    try {
      meta = await sharp(source, { limitInputPixels: IMPORT_LIMITS.maxPixels }).metadata();
    } catch {
      return fail(415, "The file looks like an image but cannot be decoded (corrupt, or larger than 40 megapixels).");
    }
    if (!meta.width || !meta.height) return fail(415, "The image has no readable dimensions.");
    width = meta.width; height = meta.height;
    if (needsConversion) {
      let out: Buffer | null = null;
      for (const quality of [85, 75, 65]) {
        out = await sharp(source, { limitInputPixels: IMPORT_LIMITS.maxPixels }).rotate()
          .resize({ width: IMPORT_LIMITS.convertMaxDimension, height: IMPORT_LIMITS.convertMaxDimension, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
        if (out.length <= IMAGE_UPLOAD.maxBytes) break;
      }
      if (!out || out.length > IMAGE_UPLOAD.maxBytes) return fail(413, "The image is too large even after resizing.");
      const m2 = await sharp(out).metadata();
      bytes = out; converted = true; width = m2.width ?? width; height = m2.height ?? height;
    }
  } else if (needsConversion) {
    return fail(kind === "avif" ? 415 : 413, kind === "avif"
      ? "AVIF images cannot be converted on this server. Download the image and use Upload File instead (the browser converts it)."
      : `The image is larger than ${IMAGE_UPLOAD.maxBytes / 1024 / 1024} MB. Download it and use Upload File instead (the browser resizes it).`);
  }
  const detected = detectImageType(bytes);
  if (!detected) return fail(415, "The stored file would not be a JPEG, PNG or WebP image.");
  const format: AllowedImageType = detected;

  // 4. Content-addressed key: same image + same product folder → same object.
  const sha = sha256(bytes);
  const key = `products/${folder}/${contentUuid(folder, sha)}.${ALLOWED_IMAGE_TYPES[format]}`;
  if (!isValidImageKey(key)) return fail(400, "Could not build a storage key for this product.");
  const url = storage.publicUrlForKey(key);
  let created = false;
  const removeCreated = async () => { if (created) await storage.store.delete(key).catch(() => undefined); };

  try {
    if (!(await storage.store.head(key))) {
      const signed = await storage.store.presignPut(key, format, bytes.length);
      const put = await fetchImpl(signed, { method: "PUT", headers: storage.store.uploadHeaders(format), body: new Uint8Array(bytes), signal: AbortSignal.timeout(60_000) });
      if (put.ok) created = true;
      else if (!(await storage.store.head(key))) return fail(502, `Image storage refused the upload (HTTP ${put.status}). Nothing was changed.`); // else: created concurrently by an identical import
    }
    const stored = await storage.store.head(key);
    if (!stored || stored.size !== bytes.length) { await removeCreated(); return fail(502, "The upload could not be confirmed in image storage. Nothing was changed."); }
    const pub = await verifyPublicImageUrl(url, format, fetchImpl);
    if (!pub.ok) { await removeCreated(); return fail(502, `The image was stored, but ${pub.reason}. It was not added.`); }
  } catch {
    await removeCreated();
    return fail(502, "Image storage is not reachable right now. Nothing was changed.");
  }

  // 5. Audit record (who imported what, from where).
  try {
    await deps.record({
      sourceUrl, finalUrl: got.finalUrl, productRef: folder, storageKey: key, publicUrl: url, sha256: sha, sourceSha256: converted ? sha256(source) : null,
      format, sourceFormat: kind, width, height, bytes: bytes.length, converted, reused: !created, importedBy: deps.importedBy, importedAt: new Date(),
    });
  } catch {
    await removeCreated();
    return fail(500, "The import could not be recorded, so the image was not added. Please try again.");
  }
  return { ok: true, url, key, reused: !created, converted, format, width, height, bytes: bytes.length, sourceUrl };
}
