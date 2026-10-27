/**
 * Browser-side product image upload to image storage (Supabase Storage or Cloudflare R2),
 * used by Add / Edit Product and Bulk Image Upload.
 * Contains no credentials: the server issues short-lived presigned URLs and verifies
 * every upload before returning its public URL.
 */
export interface UploadConfig {
  enabled: boolean;
  maxBytes: number;
  allowedTypes: string[];
  provider?: "supabase" | "r2";
  /** Public base URL of the image storage (not a secret): images under it are already stored. */
  publicBaseUrl?: string;
  /** Why uploads are unavailable (shown to the admin) — variable names only, never values. */
  reason?: string;
}

const DISABLED: UploadConfig = { enabled: false, maxBytes: 0, allowedTypes: [] };
/** Inputs the browser can read and re-encode as JPEG before upload (AVIF included where supported). */
export const ACCEPTED_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_DIMENSION = 1200; // same resizing the pages already apply
const JPEG_QUALITY = 0.85;
const CONVERT_MAX_DIMENSION = 2400; // AVIF → JPEG conversion when uploading originals
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;

export async function fetchUploadConfig(): Promise<UploadConfig> {
  try {
    const res = await fetch("/api/admin/uploads/config", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ...DISABLED, reason: data.error || `Could not check image storage (HTTP ${res.status}).` };
    const enabled = data.enabled === true;
    const missing = Array.isArray(data.missing) && data.missing.length ? ` (missing: ${data.missing.join(", ")})` : "";
    const invalid = Array.isArray(data.invalid) && data.invalid.length ? ` (invalid: ${data.invalid.join(", ")})` : "";
    return {
      enabled, maxBytes: data.maxBytes ?? 0, allowedTypes: data.allowedTypes ?? [], provider: data.provider,
      publicBaseUrl: typeof data.publicBaseUrl === "string" ? data.publicBaseUrl : undefined,
      ...(enabled ? {} : { reason: `Image storage is not configured on this server${missing}${invalid}.` }),
    };
  } catch {
    return { ...DISABLED, reason: "Could not reach the server to check image storage. Check your connection and reload." };
  }
}

/** Client-side check of a selected file before any upload (the server re-checks type, size and file signature). */
export function checkImageFile(file: { name: string; type: string; size: number }, config: UploadConfig): string | null {
  if (!ACCEPTED_INPUT_TYPES.includes(file.type)) return `${file.name}: only JPEG, PNG, WebP and AVIF images can be uploaded.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  if (config.maxBytes && file.size > config.maxBytes) return `${file.name} is ${mb(file.size)} — the limit is ${mb(config.maxBytes)}. Please resize or compress it and try again.`;
  return null;
}

/** Resizes to at most `maxDimension` and re-encodes as JPEG on a white background (transparent PNGs stay clean). */
async function compressToJpeg(file: File, maxDimension = MAX_DIMENSION): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY));
  } catch {
    return null;
  }
}

export interface UploadOptions {
  /**
   * Upload the selected file itself (JPEG, PNG or WebP up to the size limit) instead of a resized JPEG.
   * Formats storage does not accept as-is (AVIF) are converted to JPEG at up to 2400 px.
   */
  preserveOriginal?: boolean;
}
export interface UploadFileResult { name: string; url?: string; error?: string }

/**
 * Uploads files to image storage and returns the verified public URLs plus a readable error per
 * failed file. `productRef` (SKU or id) groups the objects in a folder for that product.
 * `results` lists every file in the order given (its URL or its error).
 */
export async function uploadImagesToStorage(
  files: File[],
  config: UploadConfig,
  productRef?: string,
  options: UploadOptions = {}
): Promise<{ urls: string[]; errors: string[]; results: UploadFileResult[] }> {
  const results: UploadFileResult[] = files.map((f) => ({ name: f.name }));
  const prepared: { index: number; blob: Blob }[] = [];
  const unreadable = (name: string) => `${name}: this browser could not read the image — convert it to JPEG or PNG and try again.`;

  for (const [index, file] of files.entries()) {
    const fail = (error: string) => { results[index].error = error; };
    if (!ACCEPTED_INPUT_TYPES.includes(file.type)) { fail(`${file.name}: only JPEG, PNG, WebP and AVIF images can be uploaded.`); continue; }
    if (file.size === 0) { fail(`${file.name}: the file is empty.`); continue; }
    let blob: Blob;
    if (options.preserveOriginal) {
      if (config.allowedTypes.includes(file.type)) blob = file;
      else {
        const converted = await compressToJpeg(file, CONVERT_MAX_DIMENSION);
        if (!converted) { fail(unreadable(file.name)); continue; }
        blob = converted;
      }
    } else {
      blob = (await compressToJpeg(file)) ?? file;
    }
    if (!config.allowedTypes.includes(blob.type)) { fail(unreadable(file.name)); continue; }
    if (blob.size > config.maxBytes) {
      fail(options.preserveOriginal
        ? `${file.name} is ${mb(blob.size)} — the limit is ${mb(config.maxBytes)}. Please resize or compress it and try again.`
        : `${file.name}: larger than ${Math.round(config.maxBytes / 1024 / 1024)} MB after resizing.`);
      continue;
    }
    prepared.push({ index, blob });
  }
  const finish = () => ({
    urls: results.filter((r) => r.url).map((r) => r.url as string),
    errors: results.filter((r) => r.error).map((r) => r.error as string),
    results,
  });
  if (prepared.length === 0) return finish();

  let uploads: { key: string; uploadUrl: string; headers: Record<string, string> }[];
  try {
    const presign = await fetch("/api/admin/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: prepared.map((p) => ({ contentType: p.blob.type, size: p.blob.size })), ...(productRef ? { productRef } : {}) }),
    });
    const presigned = await presign.json().catch(() => ({}));
    if (!presign.ok || !Array.isArray(presigned.uploads)) throw new Error(presigned.error || "Could not prepare the upload.");
    uploads = presigned.uploads;
  } catch (error) {
    for (const p of prepared) results[p.index].error = `${files[p.index].name}: ${(error as Error).message}`;
    return finish();
  }

  const uploaded: { index: number; key: string }[] = [];
  await Promise.all(
    uploads.map(async (u, i) => {
      const { index, blob } = prepared[i];
      try {
        const res = await fetch(u.uploadUrl, { method: "PUT", headers: u.headers, body: blob, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
        if (res.ok) uploaded.push({ index, key: u.key });
        else results[index].error = `${files[index].name}: upload was rejected by image storage (HTTP ${res.status}).`;
      } catch (error) {
        results[index].error = (error as Error).name === "TimeoutError"
          ? `${files[index].name}: upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s — check your connection and try again.`
          : `${files[index].name}: upload failed — check your connection and the storage CORS settings.`;
      }
    })
  );
  if (uploaded.length === 0) return finish();

  try {
    const complete = await fetch("/api/admin/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: uploaded.map((u) => u.key) }),
    });
    const verified = await complete.json().catch(() => ({}));
    if (!complete.ok || !Array.isArray(verified.results)) throw new Error(verified.error || "Could not verify the upload.");
    for (const r of verified.results as { key: string; ok: boolean; url?: string; error?: string }[]) {
      const u = uploaded.find((x) => x.key === r.key);
      if (!u) continue;
      if (r.ok && r.url) results[u.index].url = r.url;
      else results[u.index].error = `${files[u.index].name}: ${r.error || "the uploaded file failed verification."}`;
    }
  } catch (error) {
    for (const u of uploaded) results[u.index].error = `${files[u.index].name}: ${(error as Error).message}`;
  }
  return finish();
}

export type ImportResult = { ok: true; url: string; reused: boolean; converted: boolean } | { ok: false; error: string };

/**
 * Asks the server to import an external image into image storage. The server downloads it (never the browser), so
 * no credentials are involved here. Nothing is saved to the product by this call.
 */
export async function importImageFromUrl(url: string, productRef: string | undefined): Promise<ImportResult> {
  try {
    const res = await fetch("/api/admin/uploads/import-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, productRef }),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS + 30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.url === "string") return { ok: true, url: data.url, reused: !!data.reused, converted: !!data.converted };
    return { ok: false, error: data.error || `The import failed (HTTP ${res.status}). Nothing was changed.` };
  } catch {
    return { ok: false, error: "Could not reach the server to import the image. Nothing was changed." };
  }
}
