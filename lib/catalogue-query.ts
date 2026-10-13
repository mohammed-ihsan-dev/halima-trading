/**
 * Catalogue listing state (page, page size, search, category, sort) as URL search parameters.
 * The URL is the single source of truth: the shop and the admin product list read it, write
 * it, and product pages link back to it. Pure — safe for server and client code.
 */

export const PAGE_SIZES = [12, 24, 48] as const;
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
export const MAX_SEARCH_LENGTH = 100;

export const CATALOGUE_SORTS = ["newest", "low", "az"] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];

/** "in-stock": can be bought now (the checkout rule); "on-request": everything else. */
export const AVAILABILITY_FILTERS = ["in-stock", "on-request"] as const;
export type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number];

/** Ranges over real selling prices only — 0 / "Contact for Price" never matches a range. */
export const PRICE_RANGES = {
  "under-1000": { label: "Under AED 1,000", gt: 0, lt: 1000 },
  "1000-3000": { label: "AED 1,000–3,000", gte: 1000, lte: 3000 },
  "over-3000": { label: "Above AED 3,000", gt: 3000 },
} as const;
export type PriceRangeFilter = keyof typeof PRICE_RANGES;

export interface CatalogueState {
  page: number;
  pageSize: number;
  q: string;
  /** Category name, or "" for all categories. */
  category: string;
  sort: CatalogueSort;
  /** "" for all products. */
  availability: AvailabilityFilter | "";
  /** "" for any price. */
  price: PriceRangeFilter | "";
}

export const DEFAULT_CATALOGUE_STATE: CatalogueState = {
  page: 1, pageSize: DEFAULT_PAGE_SIZE, q: "", category: "", sort: "newest", availability: "", price: "",
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: ParamSource, key: string): string {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

/** Lenient parser: anything invalid falls back to its default instead of failing the page. */
export function parseCatalogueParams(params: ParamSource): CatalogueState {
  const pageRaw = read(params, "page");
  const page = /^\d{1,6}$/.test(pageRaw) && Number(pageRaw) >= 1 ? Number(pageRaw) : 1;
  const limitRaw = Number(read(params, "limit"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(limitRaw) ? limitRaw : DEFAULT_PAGE_SIZE;
  const q = read(params, "q").slice(0, MAX_SEARCH_LENGTH);
  const categoryRaw = read(params, "category").slice(0, 100);
  const category = categoryRaw.toLowerCase() === "all" ? "" : categoryRaw;
  const sortRaw = read(params, "sort");
  const sort = (CATALOGUE_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as CatalogueSort) : "newest";
  const availabilityRaw = read(params, "availability");
  const availability = (AVAILABILITY_FILTERS as readonly string[]).includes(availabilityRaw) ? (availabilityRaw as AvailabilityFilter) : "";
  const priceRaw = read(params, "price");
  const price = Object.hasOwn(PRICE_RANGES, priceRaw) ? (priceRaw as PriceRangeFilter) : "";
  return { page, pageSize, q, category, sort, availability, price };
}

/** Canonical query string: fixed parameter order, defaults omitted, each key at most once. */
export function catalogueQueryString(state: Partial<CatalogueState>): string {
  const s = { ...DEFAULT_CATALOGUE_STATE, ...state };
  const params = new URLSearchParams();
  if (s.q) params.set("q", s.q);
  if (s.category) params.set("category", s.category);
  if (s.availability) params.set("availability", s.availability);
  if (s.price) params.set("price", s.price);
  if (s.sort !== "newest") params.set("sort", s.sort);
  if (s.pageSize !== DEFAULT_PAGE_SIZE) params.set("limit", String(s.pageSize));
  if (s.page > 1) params.set("page", String(s.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const catalogueHref = (basePath: string, state: Partial<CatalogueState>) => `${basePath}${catalogueQueryString(state)}`;

/**
 * Validates a "return to the catalogue" path taken from a URL. Only the given internal listing
 * path is accepted (never another origin, scheme or route), and the query is rebuilt from the
 * known catalogue parameters, so nothing else can be smuggled through. Returns null if invalid.
 */
export function safeCatalogueReturnPath(value: unknown, basePath: string): string | null {
  if (typeof value !== "string" || value.length > 600) return null;
  if (!value.startsWith(basePath) || /[\\\u0000-\u001f]/.test(value) || value.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(value, "http://internal.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://internal.invalid" || url.pathname !== basePath) return null;
  return catalogueHref(basePath, parseCatalogueParams(url.searchParams));
}

/** Link to a product/edit page that remembers where the user came from (only when it is not the default view). */
export function withReturnPath(href: string, returnPath: string | null | undefined, basePath: string): string {
  if (!returnPath || returnPath === basePath) return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=${encodeURIComponent(returnPath)}`;
}

/** Splits a search query into lower-cased words; every word must match some listing field. */
export const searchTokens = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

/** Page numbers with gaps, e.g. 1 … 6 7 8 … 31 — the same pattern as the admin pagination. */
export function pageNumbers(currentPage: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "gap")[] = [1];
  if (currentPage > 3) pages.push("gap");
  for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push("gap");
  pages.push(totalPages);
  return pages;
}
