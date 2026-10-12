/**
 * Browser-side product image upload to Cloudflare R2, used by Add / Edit Product.
 * Contains no credentials: the server issues short-lived presigned URLs and verifies
 * every upload before returning its public URL.
 */
export interface UploadConfig {
  enabled: boolean;
  maxBytes: number;
  allowedTypes: string[];
}

const DISABLED: UploadConfig = { enabled: false, maxBytes: 0, allowedTypes: [] };
const MAX_DIMENSION = 1200; // same resizing the pages already apply
const JPEG_QUALITY = 0.85;

export async function fetchUploadConfig(): Promise<UploadConfig> {
  try {
    const res = await fetch("/api/admin/uploads/config", { cache: "no-store" });
    if (!res.ok) return DISABLED;
    const data = await res.json();
    return { enabled: data.enabled === true, maxBytes: data.maxBytes ?? 0, allowedTypes: data.allowedTypes ?? [] };
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

/** Uploads files to R2 and returns the verified public URLs plus a readable error per failed file. */
export async function uploadImagesToStorage(files: File[], config: UploadConfig): Promise<{ urls: string[]; errors: string[] }> {
  const errors: string[] = [];
  const prepared: { name: string; blob: Blob }[] = [];

  for (const file of files) {
    if (!config.allowedTypes.includes(file.type)) {
      errors.push(`${file.name}: only JPEG, PNG and WebP images can be uploaded.`);
      continue;
    }
    const blob = (await compressToJpeg(file)) ?? file;
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
    body: JSON.stringify({ files: prepared.map((p) => ({ contentType: p.blob.type, size: p.blob.size })) }),
  });
  const presigned = await presign.json().catch(() => ({}));
  if (!presign.ok || !Array.isArray(presigned.uploads)) {
    return { urls: [], errors: [...errors, presigned.error || "Could not prepare the upload."] };
  }

  const uploadedKeys: string[] = [];
  await Promise.all(
    presigned.uploads.map(async (u: { key: string; uploadUrl: string; headers: Record<string, string> }, i: number) => {
      try {
        const res = await fetch(u.uploadUrl, { method: "PUT", headers: u.headers, body: prepared[i].blob });
        if (res.ok) uploadedKeys.push(u.key);
        else errors.push(`${prepared[i].name}: upload was rejected by image storage (HTTP ${res.status}).`);
      } catch {
        errors.push(`${prepared[i].name}: upload failed — check your connection and the bucket's CORS settings.`);
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
