// Image audit classification (pure): what state a product's `images` field is in.
export const PLACEHOLDER = "/featured/hisense-window-ac.png";

export const IMAGE_CLASSES = ["VALID_VERIFIED", "SUPABASE_UNREVIEWED", "EMBEDDED_PRESERVED", "EXTERNAL_NEEDS_VERIFICATION", "BROKEN", "PLACEHOLDER", "NO_IMAGE"];
/** Products the discovery stage works on: nothing usable to show. */
export const TARGET_CLASSES = new Set(["NO_IMAGE", "PLACEHOLDER", "BROKEN"]);

/** Kind of one image reference. `supabaseBase` is the public base URL of the bucket, ending in "/". */
export function refType(ref, supabaseBase) {
  if (typeof ref !== "string" || !ref.trim()) return "empty";
  if (ref === PLACEHOLDER) return "placeholder";
  if (ref.startsWith("data:")) return "embedded";
  if (supabaseBase && ref.startsWith(supabaseBase)) return "supabase";
  if (ref.startsWith("/")) return "local";
  return "external";
}

/**
 * refs: [{ type, valid, provenance? }] after each reference was checked (HTTP status + file signature).
 *   NO_IMAGE     no references at all
 *   PLACEHOLDER  only the site placeholder
 *   BROKEN       has references, none of them loads as a real image
 */
export function classifyRefs(refs) {
  const usable = refs.filter((r) => r.type !== "placeholder" && r.type !== "empty");
  const valid = usable.filter((r) => r.valid);
  if (valid.some((r) => r.type === "supabase" && r.provenance)) return "VALID_VERIFIED";
  if (valid.some((r) => r.type === "supabase")) return "SUPABASE_UNREVIEWED";
  if (valid.some((r) => r.type === "embedded")) return "EMBEDDED_PRESERVED";
  if (valid.some((r) => r.type === "external" || r.type === "local")) return "EXTERNAL_NEEDS_VERIFICATION";
  if (usable.length) return "BROKEN";
  if (refs.some((r) => r.type === "placeholder")) return "PLACEHOLDER";
  return "NO_IMAGE";
}
