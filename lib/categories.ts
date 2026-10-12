import { categories } from "@/data/categories";
import { categoryAliases } from "@/data/categoryAliases";

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const storeBySlug = new Map(categories.map((c) => [slug(c.name), c.name]));
const aliasBySlug = new Map(Object.entries(categoryAliases).map(([from, to]) => [slug(from), to]));

export const storeCategoryNames = categories.map((c) => c.name);

export type CategoryResolution =
  | { ok: true; category: string; via: "exact" | "spelling" | "alias"; note?: string }
  | { ok: false; error: string };

/**
 * Resolves an incoming category to a store category: an exact name, a spelling or
 * capitalisation variant of one, or a documented alias. Anything else is rejected.
 */
export function resolveStoreCategory(input: string): CategoryResolution {
  const value = input.trim();
  if (!value) return { ok: false, error: "Category is required" };
  if (storeCategoryNames.includes(value)) return { ok: true, category: value, via: "exact" };

  const key = slug(value);
  const spelling = storeBySlug.get(key);
  if (spelling) {
    return { ok: true, category: spelling, via: "spelling", note: `Category "${value}" will be saved as "${spelling}"` };
  }
  const alias = aliasBySlug.get(key);
  if (alias && storeCategoryNames.includes(alias)) {
    return { ok: true, category: alias, via: "alias", note: `Category "${value}" maps to the store category "${alias}"` };
  }
  return {
    ok: false,
    error: `Category "${value}" is not a store category and has no approved mapping. Store categories: ${storeCategoryNames.join(", ")}`,
  };
}
