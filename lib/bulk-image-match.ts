/**
 * Bulk Image Upload — matching image files to products (pure; used in the browser and in tests).
 *
 * A file matches a product when its name (without extension) equals the product's SKU, model
 * number or id, compared case-insensitively and ignoring spaces and punctuation:
 *   "SGR186E.jpg", "sgr-186e.webp", "BD-HX230T-B5.png" …
 * A trailing "-2", "_3" or " (2)" adds further images in that order: "SGR186E-2.jpg".
 * Nothing is guessed: no match, more than one possible product, or two files claiming the same
 * position all leave the product untouched and are reported.
 */

export const BULK_PLACEHOLDER_IMAGE = "/featured/hisense-window-ac.png";
export const MAX_IMAGES_PER_PRODUCT = 10;
export const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024; // before the browser resizes it
export const BULK_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export type BulkMode = "empty-only" | "add" | "replace";

export interface BulkFile {
  name: string;
  size: number;
  type: string;
}

export interface BulkProduct {
  id: string;
  sku?: string;
  model?: string;
  name: string;
  brand?: string;
  status?: string;
  images?: string[];
}

export type FileProblem = "invalid-file" | "unmatched" | "ambiguous" | "duplicate" | "too-many";

export interface FileMatch {
  file: BulkFile;
  fileIndex: number;
  productId?: string;
  position?: number; // 1-based order within the product
  matchedOn?: "sku" | "model" | "id";
  problem?: FileProblem;
  detail?: string;
}

export interface ProductPlan {
  product: BulkProduct;
  fileIndexes: number[]; // in image order
  action: "set" | "add" | "replace" | "skip";
  reason?: string;
  /** The product's images now; the update only applies if they are still exactly these. */
  expectedImages: string[];
  /** Images kept in front of the uploaded ones ("add" mode). */
  keepImages: string[];
}

export interface BulkPlan {
  files: FileMatch[];
  products: ProductPlan[];
  summary: { files: number; matchedFiles: number; problemFiles: number; productsToUpdate: number; productsSkipped: number };
}

export const normalizeKey = (value: unknown) => (typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "");

const stem = (fileName: string) => fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "");
const SUFFIX = /(?:[-_ ]\(?|\s*\()(\d{1,2})\)?$/;

export const realImages = (images: readonly string[] | undefined) =>
  (images ?? []).filter((img) => typeof img === "string" && img.trim() && img !== BULK_PLACEHOLDER_IMAGE);

function buildIndex(products: readonly BulkProduct[]) {
  const index = new Map<string, { productId: string; field: "sku" | "model" | "id" }[]>();
  for (const p of products) {
    for (const field of ["sku", "model", "id"] as const) {
      const key = normalizeKey(p[field]);
      if (key.length < 3 || key === "NA") continue; // too short to identify a product safely
      const list = index.get(key) ?? [];
      if (!list.some((e) => e.productId === p.id)) list.push({ productId: p.id, field });
      index.set(key, list);
    }
  }
  return index;
}

export function planBulkImages(files: readonly BulkFile[], products: readonly BulkProduct[], mode: BulkMode = "empty-only"): BulkPlan {
  const index = buildIndex(products);
  const byId = new Map(products.map((p) => [p.id, p]));

  const matches: FileMatch[] = files.map((file, fileIndex) => {
    if (!BULK_INPUT_TYPES.includes(file.type)) {
      return { file, fileIndex, problem: "invalid-file", detail: "Only JPEG, PNG, WebP and AVIF images are accepted." };
    }
    if (file.size <= 0 || file.size > MAX_SOURCE_FILE_BYTES) {
      return { file, fileIndex, problem: "invalid-file", detail: file.size <= 0 ? "The file is empty." : "The file is larger than 25 MB." };
    }
    const name = stem(file.name).trim();
    const tryKey = (raw: string, position: number) => {
      const hits = index.get(normalizeKey(raw));
      return hits ? { hits, position } : null;
    };
    const suffix = SUFFIX.exec(name);
    const found = tryKey(name, 1) ?? (suffix ? tryKey(name.slice(0, suffix.index), Number(suffix[1])) : null);
    if (!found) return { file, fileIndex, problem: "unmatched", detail: "No product has this SKU, model number or id." };
    const ids = [...new Set(found.hits.map((h) => h.productId))];
    if (ids.length > 1) {
      return {
        file, fileIndex, problem: "ambiguous",
        detail: `Matches ${ids.length} products: ${ids.map((id) => byId.get(id)?.name ?? id).slice(0, 3).join("; ")}`,
      };
    }
    return { file, fileIndex, productId: ids[0], position: found.position, matchedOn: found.hits[0].field };
  });

  // Group by product; two files for the same product and position are both held back.
  const groups = new Map<string, FileMatch[]>();
  for (const m of matches) if (m.productId) groups.set(m.productId, [...(groups.get(m.productId) ?? []), m]);

  const plans: ProductPlan[] = [];
  for (const [productId, group] of groups) {
    const product = byId.get(productId)!;
    const positions = new Map<number, FileMatch[]>();
    for (const m of group) positions.set(m.position!, [...(positions.get(m.position!) ?? []), m]);
    for (const same of positions.values()) {
      if (same.length > 1) for (const m of same) Object.assign(m, { problem: "duplicate", detail: `${same.length} files claim image ${m.position} of this product.` });
    }
    const usable = group.filter((m) => !m.problem).sort((a, b) => a.position! - b.position!);
    const current = [...(product.images ?? [])];
    const existing = realImages(current);
    const plan: ProductPlan = { product, fileIndexes: usable.map((m) => m.fileIndex), action: "skip", expectedImages: current, keepImages: [] };

    if (group.some((m) => m.problem === "duplicate")) {
      plan.reason = "Two files claim the same image position — rename one of them.";
    } else if (usable.length > MAX_IMAGES_PER_PRODUCT) {
      for (const m of usable) Object.assign(m, { problem: "too-many", detail: `At most ${MAX_IMAGES_PER_PRODUCT} images per product in one upload.` });
      plan.fileIndexes = [];
      plan.reason = `More than ${MAX_IMAGES_PER_PRODUCT} images for one product.`;
    } else if (existing.length === 0) {
      plan.action = "set";
    } else if (mode === "add") {
      if (existing.length + usable.length > 20) plan.reason = "The product would have more than 20 images.";
      else Object.assign(plan, { action: "add", keepImages: existing });
    } else if (mode === "replace") {
      plan.action = "replace";
    } else {
      plan.reason = `Already has ${existing.length} image(s) — choose "Add to existing" or "Replace" to change it.`;
    }
    plans.push(plan);
  }

  plans.sort((a, b) => (a.action === "skip" ? 1 : 0) - (b.action === "skip" ? 1 : 0) || a.product.name.localeCompare(b.product.name));
  const problemFiles = matches.filter((m) => m.problem).length;
  return {
    files: matches,
    products: plans,
    summary: {
      files: files.length,
      matchedFiles: matches.filter((m) => m.productId && !m.problem).length,
      problemFiles,
      productsToUpdate: plans.filter((p) => p.action !== "skip").length,
      productsSkipped: plans.filter((p) => p.action === "skip").length,
    },
  };
}

/** The images a product should have after a successful upload. */
export const plannedImages = (plan: ProductPlan, uploadedUrls: readonly string[]) => [...plan.keepImages, ...uploadedUrls];
