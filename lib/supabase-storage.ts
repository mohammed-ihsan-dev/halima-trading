/**
 * Supabase Storage for product images (server-only — never import from client components).
 *
 * Same flow as R2: the server creates a one-time signed upload URL for a key it chooses, the
 * browser uploads directly to Supabase, and the server verifies the stored object before its
 * public URL is used. The secret key stays on the server; browsers only ever receive a signed
 * upload URL for one new object (which cannot overwrite an existing one).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ImageObjectStore } from "@/lib/r2";

export const SUPABASE_ENV_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
export const DEFAULT_SUPABASE_BUCKET = "product-images";

export interface SupabaseStorageConfig {
  url: string; // https://<project>.supabase.co, no trailing slash
  secretKey: string;
  bucket: string;
  publicBaseUrl: string; // <url>/storage/v1/object/public/<bucket>
}

export type SupabaseConfigResult =
  | { ok: true; config: SupabaseStorageConfig }
  | { ok: false; missing: string[]; invalid: string[] };

/** Reports missing or malformed variable NAMES only — values are never echoed. */
export function getSupabaseStorageConfig(env: Record<string, string | undefined> = process.env): SupabaseConfigResult {
  const value = (name: string) => (env[name] ?? "").trim();
  const missing: string[] = SUPABASE_ENV_VARS.filter((name) => !value(name));
  const invalid: string[] = [];
  let url = value("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && /^(127\.0\.0\.1|localhost)$/.test(parsed.hostname))) {
        invalid.push("NEXT_PUBLIC_SUPABASE_URL");
      }
      url = parsed.origin;
    } catch {
      invalid.push("NEXT_PUBLIC_SUPABASE_URL");
    }
  }
  // A publishable/anon key here would make every upload fail the bucket's policies.
  const secret = value("SUPABASE_SECRET_KEY");
  if (secret && /^sb_publishable_/.test(secret)) invalid.push("SUPABASE_SECRET_KEY");
  const bucket = value("SUPABASE_STORAGE_BUCKET") || DEFAULT_SUPABASE_BUCKET;
  if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(bucket)) invalid.push("SUPABASE_STORAGE_BUCKET");
  if (missing.length || invalid.length) return { ok: false, missing, invalid };
  return {
    ok: true,
    config: { url, secretKey: secret, bucket, publicBaseUrl: `${url}/storage/v1/object/public/${bucket}` },
  };
}

export function createSupabaseAdminClient(config: SupabaseStorageConfig, fetchImpl?: typeof fetch): SupabaseClient {
  return createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
}

/** Errors carry no key or URL with a token in them — only the operation and the HTTP status. */
class StorageError extends Error {
  constructor(operation: string, status?: number) {
    super(`Supabase Storage ${operation} failed${status ? ` (HTTP ${status})` : ""}`);
    this.name = "SupabaseStorageError";
  }
}

const statusOf = (error: unknown) =>
  Number((error as { statusCode?: string | number; status?: number })?.statusCode ?? (error as { status?: number })?.status) || undefined;

export function createSupabaseStore(config: SupabaseStorageConfig, fetchImpl: typeof fetch = fetch): ImageObjectStore {
  const storage = createSupabaseAdminClient(config, fetchImpl).storage.from(config.bucket);
  const authHeaders = { apikey: config.secretKey, Authorization: `Bearer ${config.secretKey}` };
  const objectUrl = (key: string) => `${config.url}/storage/v1/object/${config.bucket}/${key}`;

  return {
    async presignPut(key) {
      // upsert is off: the signed URL can only create this new object, never replace one.
      const { data, error } = await storage.createSignedUploadUrl(key);
      if (error || !data?.signedUrl) throw new StorageError("sign upload", statusOf(error));
      return data.signedUrl;
    },
    uploadHeaders(contentType) {
      // Supabase stores Cache-Control as given; keys are unique per upload, so cache for a year.
      return { "Content-Type": contentType, "Cache-Control": `max-age=${31536000}`, "x-upsert": "false" };
    },
    async head(key) {
      const { data, error } = await storage.info(key);
      if (error) {
        const status = statusOf(error);
        if (status === 404 || status === 400 || /not.?found/i.test(error.message)) return null;
        throw new StorageError("info", status);
      }
      const info = data as unknown as { size?: number; contentType?: string; metadata?: { size?: number; mimetype?: string } };
      return {
        size: Number(info.size ?? info.metadata?.size ?? 0),
        contentType: String(info.contentType ?? info.metadata?.mimetype ?? ""),
      };
    },
    async readPrefix(key, bytes) {
      const res = await fetchImpl(objectUrl(key), { headers: { ...authHeaders, Range: `bytes=0-${bytes - 1}` }, cache: "no-store" });
      if (!res.ok) throw new StorageError("read", res.status);
      return new Uint8Array(await res.arrayBuffer()).subarray(0, bytes);
    },
    async delete(key) {
      const { error } = await storage.remove([key]);
      if (error) throw new StorageError("delete", statusOf(error));
    },
  };
}

/** Every object key under a prefix (recursive), for the orphan-cleanup script. */
export async function listSupabaseObjects(
  config: SupabaseStorageConfig,
  prefix = "products",
  fetchImpl: typeof fetch = fetch
): Promise<{ key: string; size: number; createdAt: string }[]> {
  const storage = createSupabaseAdminClient(config, fetchImpl).storage.from(config.bucket);
  const out: { key: string; size: number; createdAt: string }[] = [];
  const walk = async (path: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(path, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new StorageError("list", statusOf(error));
      for (const entry of data ?? []) {
        const full = `${path}/${entry.name}`;
        if (entry.id === null) await walk(full); // a folder
        else out.push({ key: full, size: Number(entry.metadata?.size ?? 0), createdAt: entry.created_at ?? "" });
      }
      if ((data ?? []).length < 1000) break;
    }
  };
  await walk(prefix);
  return out;
}

