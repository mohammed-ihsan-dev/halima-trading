/**
 * Which storage receives NEW product image uploads (server-only).
 *
 * Supabase Storage when it is configured (if only some Supabase variables are set, uploads stay
 * off and the missing names are reported), otherwise Cloudflare R2 when that is configured, otherwise none (the Add/Edit pages then keep their legacy embedded-image behaviour).
 * Images already saved with either provider's URL keep working: product image URLs are plain
 * https URLs, whichever provider serves them.
 */
import { createR2Store, getR2Config, publicUrlForKey, keyFromPublicUrl, type ImageObjectStore } from "@/lib/r2";
import { createSupabaseStore, getSupabaseStorageConfig } from "@/lib/supabase-storage";

export type ImageStorageProvider = "supabase" | "r2";

export interface ImageStorage {
  provider: ImageStorageProvider;
  store: ImageObjectStore;
  publicBaseUrl: string;
  publicUrlForKey(key: string): string;
  /** The key of a URL served by THIS provider's public base, or null (other URLs are never touched). */
  keyFromPublicUrl(url: string): string | null;
}

export type ImageStorageResult =
  | { ok: true; storage: ImageStorage }
  | { ok: false; missing: string[]; invalid: string[] };

export function getImageStorage(env: Record<string, string | undefined> = process.env, fetchImpl?: typeof fetch): ImageStorageResult {
  const supabase = getSupabaseStorageConfig(env);
  const wantsSupabase = !!(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_SECRET_KEY);
  if (supabase.ok) {
    const base = supabase.config.publicBaseUrl;
    return {
      ok: true,
      storage: {
        provider: "supabase",
        store: createSupabaseStore(supabase.config, fetchImpl),
        publicBaseUrl: base,
        publicUrlForKey: (key) => publicUrlForKey(base, key),
        keyFromPublicUrl: (url) => keyFromPublicUrl(base, url),
      },
    };
  }
  // Supabase partly configured: report what is missing rather than silently using R2.
  if (wantsSupabase) return { ok: false, missing: supabase.missing, invalid: supabase.invalid };
  const r2 = getR2Config(env);
  if (r2.ok) {
    const base = r2.config.publicBaseUrl;
    return {
      ok: true,
      storage: {
        provider: "r2",
        store: createR2Store(r2.config),
        publicBaseUrl: base,
        publicUrlForKey: (key) => publicUrlForKey(base, key),
        keyFromPublicUrl: (url) => keyFromPublicUrl(base, url),
      },
    };
  }
  // Nothing configured: name the variables for Supabase, the provider for new uploads.
  return { ok: false, missing: supabase.missing, invalid: supabase.invalid };
}

export const isImageStorageConfigured = (env: Record<string, string | undefined> = process.env) => getImageStorage(env).ok;

/** Image rule context for the configured storage: uploads enabled, and its own public URLs accepted. */
export function imageRuleStorageContext(env: Record<string, string | undefined> = process.env) {
  const result = getImageStorage(env);
  return result.ok ? { storageEnabled: true, storageBaseUrl: result.storage.publicBaseUrl } : { storageEnabled: false };
}
