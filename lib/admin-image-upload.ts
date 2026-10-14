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
}

const DISABLED: UploadConfig = { enabled: false, maxBytes: 0, allowedTypes: [] };
/** Inputs the browser can read and re-encode as JPEG before upload (AVIF included where supported). */
export const ACCEPTED_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const UPLOAD_TIMEOUT_MS = 60_000;
const MAX_DIMENSION = 1200; // same resizing the pages already apply
const JPEG_QUALITY = 0.85;

export async function fetchUploadConfig(): Promise<UploadConfig> {
  try {
    const res = await fetch("/api/admin/uploads/config", { cache: "no-store" });
    if (!res.ok) return DISABLED;
    const data = await res.json();
    return { enabled: data.enabled === true, maxBytes: data.maxBytes ?? 0, allowedTypes: data.allowedTypes ?? [], provider: data.provider };
  } catch {
    return DISABLED;
  }
}

/** Resizes to at most 1200px and re-encodes as JPEG on a white background (transparent PNGs stay clean). */
async function compressToJpeg(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
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

/**
 * Uploads files to image storage and returns the verified public URLs plus a readable error per
 * failed file. `productRef` (SKU or id) groups the objects in a folder for that product.
 */
export async function uploadImagesToStorage(
  files: File[],
  config: UploadConfig,
  productRef?: string
): Promise<{ urls: string[]; errors: string[] }> {
  const errors: string[] = [];
  const prepared: { name: string; blob: Blob }[] = [];

  for (const file of files) {
    if (!ACCEPTED_INPUT_TYPES.includes(file.type)) {
      errors.push(`${file.name}: only JPEG, PNG, WebP and AVIF images can be uploaded.`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`${file.name}: the file is empty.`);
      continue;
    }
    const blob = (await compressToJpeg(file)) ?? file;
    if (!config.allowedTypes.includes(blob.type)) {
      errors.push(`${file.name}: this browser could not read the image — convert it to JPEG or PNG and try again.`);
      continue;
    }
    if (blob.size > config.maxBytes) {
      errors.push(`${file.name}: larger than ${Math.round(config.maxBytes / 1024 / 1024)} MB after resizing.`);
      continue;
    }
    prepared.push({ name: file.name, blob });
  }
  if (prepared.length === 0) return { urls: [], errors };

  const presign = await fetch("/api/admin/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: prepared.map((p) => ({ contentType: p.blob.type, size: p.blob.size })),
      ...(productRef ? { productRef } : {}),
    }),
  });
  const presigned = await presign.json().catch(() => ({}));
  if (!presign.ok || !Array.isArray(presigned.uploads)) {
    return { urls: [], errors: [...errors, presigned.error || "Could not prepare the upload."] };
  }

  const uploadedKeys: string[] = [];
  await Promise.all(
    presigned.uploads.map(async (u: { key: string; uploadUrl: string; headers: Record<string, string> }, i: number) => {
      try {
        const res = await fetch(u.uploadUrl, {
          method: "PUT", headers: u.headers, body: prepared[i].blob, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        });
        if (res.ok) uploadedKeys.push(u.key);
        else errors.push(`${prepared[i].name}: upload was rejected by image storage (HTTP ${res.status}).`);
      } catch (error) {
        errors.push(
          (error as Error).name === "TimeoutError"
            ? `${prepared[i].name}: upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s — check your connection and try again.`
            : `${prepared[i].name}: upload failed — check your connection and the storage CORS settings.`
        );
      }
    })
  );
  if (uploadedKeys.length === 0) return { urls: [], errors };

  const complete = await fetch("/api/admin/uploads/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: uploadedKeys }),
  });
  const verified = await complete.json().catch(() => ({}));
  if (!complete.ok || !Array.isArray(verified.results)) {
    return { urls: [], errors: [...errors, verified.error || "Could not verify the upload."] };
  }
  const urls: string[] = [];
  for (const r of verified.results) {
    if (r.ok) urls.push(r.url);
    else errors.push(r.error);
  }
  return { urls, errors };
}
