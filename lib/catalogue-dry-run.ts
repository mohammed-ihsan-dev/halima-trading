/**
 * JSON catalogue import — DRY RUN.
 *
 * Reads an incoming product catalogue (JSON) and compares it with the live
 * `products` collection. This module is strictly read-only: it only ever calls
 * countDocuments, find and aggregate, and the collection it receives is typed
 * so that no write method is reachable. tests/catalogue-dry-run.unit.test.mjs
 * also asserts that no write method name appears in this file.
 */
import { createHash } from "node:crypto";
import type { Document, Filter, FindOptions } from "mongodb";
import { brands as presetBrands } from "@/data/brands";
import { getMongoDb } from "@/lib/mongodb";
import { slugify } from "@/lib/repositories/products";
import { resolveStoreCategory } from "@/lib/categories";

export const CATALOGUE_MAX_RECORDS = 5000;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type DryRunGroup =
  | "SAFE_TO_IMPORT"
  | "SKIP_SKU_EXISTS"
  | "SKIP_SLUG_EXISTS"
  | "SKIP_SKU_AND_SLUG_EXIST"
  | "SKIP_DUPLICATE_IN_FILE"
  | "INVALID";

export const GROUP_LABELS: Record<DryRunGroup, string> = {
  SAFE_TO_IMPORT: "Safe to import",
  SKIP_SKU_EXISTS: "Skip — SKU exists",
  SKIP_SLUG_EXISTS: "Skip — slug exists",
  SKIP_SKU_AND_SLUG_EXIST: "Skip — SKU and slug exist",
  SKIP_DUPLICATE_IN_FILE: "Skip — duplicate in file",
  INVALID: "Invalid",
};

/** The only collection methods a dry run may use. Real MongoDB collections satisfy this. */
export interface ReadOnlyProducts {
  countDocuments(filter?: Filter<Document>): Promise<number>;
  find(filter: Filter<Document>, options?: FindOptions): { toArray(): Promise<Document[]> };
  aggregate(pipeline: Document[]): { toArray(): Promise<Document[]> };
}

export interface ExistingProductRef {
  id: string;
  sku: string;
  slug: string;
  name: string;
  status: string;
}

export interface Conflict {
  /** Incoming field that collided. */
  field: "sku" | "slug" | "id";
  /** Field on the existing product it collided with. */
  existingField: "sku" | "slug" | "id";
  existing: ExistingProductRef;
}

export interface DryRunRow {
  recordNumber: number; // 1-based position in the JSON products array
  id: string;
  name: string;
  model: string;
  sku: string;
  slug: string;
  brand: string;
  /** Category exactly as written in the file. */
  category: string;
  /** Store category it resolves to (empty when it does not resolve). Imports save this value. */
  storeCategory: string;
  group: DryRunGroup;
  reasons: string[];
  errors: string[];
  warnings: string[];
  conflicts: Conflict[];
  duplicateOfRecords: number[];
}

export interface DryRunSummary {
  totalRecords: number;
  validated: number;
  safeToImport: number;
  skipSkuExists: number;
  skipSlugExists: number;
  skipSkuAndSlugExist: number;
  duplicatesInFile: number;
  invalid: number;
  recordsWithWarnings: number;
  conflictsWithExisting: number;
}

export interface DryRunReport {
  dryRun: true;
  fileName: string;
  generatedAt: string;
  durationMs: number;
  database: {
    name: string;
    collection: "products";
    existingCountBefore: number;
    existingCountAfter: number;
    fingerprintBefore: string;
    fingerprintAfter: string;
    unchanged: boolean;
  };
  fileWarnings: string[];
  summary: DryRunSummary;
  /** Same message across many rows, grouped — e.g. one unknown category used 118 times. */
  issueBreakdown: { kind: "error" | "warning"; message: string; count: number }[];
  rows: DryRunRow[];
}

export class CatalogueFileError extends Error {}
export class DryRunDatabaseError extends Error {}

/* -------------------------------------------------------------------------- */
/* File parsing                                                               */
/* -------------------------------------------------------------------------- */

export interface ParsedCatalogue {
  meta: Record<string, unknown>;
  records: unknown[];
}

export function parseCatalogueJson(text: string): ParsedCatalogue {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    throw new CatalogueFileError(`The file is not valid JSON (${(error as Error).message}).`);
  }
  if (Array.isArray(data)) return { meta: {}, records: data };
  if (data && typeof data === "object" && Array.isArray((data as { products?: unknown }).products)) {
    const { products, ...meta } = data as { products: unknown[] } & Record<string, unknown>;
    return { meta, records: products };
  }
  throw new CatalogueFileError('Expected a JSON array of products, or an object with a "products" array.');
}

/* -------------------------------------------------------------------------- */
/* Record validation (pure)                                                   */
/* -------------------------------------------------------------------------- */

const SCHEMA_FIELDS = new Set([
  "id", "slug", "sku", "name", "brand", "brandSlug", "model", "category", "categorySlug", "subcategory",
  "description", "features", "specifications", "price", "priceLabel", "currency", "images", "inStock",
  "stockCount", "featured", "deliveryRate", "status", "createdAt", "updatedAt",
]);
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_DESCRIPTION = 20_000;

export const normalizeIdentifier = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/**
 * A model number has at least one code-like token mixing letters and digits, e.g.
 * "AR12BRHQKWK", "TSB 1CF-13", "DP-2GSIX". A number followed by a word ("4-Way",
 * "3-Star", "46 dB", "850 W output") is a specification value, not a model.
 */
function looksLikeModelNumber(model: string): boolean {
  const tokens = model.split(/[\s/]+/).filter(Boolean);
  if (tokens.some((t) => t.length >= 4 && /[A-Za-z]/.test(t) && /\d/.test(t) && !/^\d+[-.]?[A-Za-z]+$/.test(t))) return true;
  // Digit-free series names written as one hyphenated all-caps token, e.g. "XL-WINTER", "XXL-MOVICOOL".
  if (/^[A-Z]{1,4}-[A-Z]{3,}$/.test(model.trim())) return true;
  // Short all-caps series code followed by numeric parts, e.g. "BSWC 30 2T", "PN - 165 4T".
  // A long word ("CATALOGUE 2025") does not qualify.
  const [head, ...rest] = model.replace(/\s*-\s*/g, " ").split(/\s+/);
  return /^[A-Z]{2,5}$/.test(head) && rest.length > 0 &&
    rest.every((t) => /^[A-Z0-9]+$/.test(t) && /\d/.test(t)) && (rest.join("").match(/\d/g) ?? []).length >= 2;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function validImageRef(ref: string): boolean {
  if (ref.startsWith("/") && !ref.startsWith("//")) return !/\s/.test(ref);
  try {
    return new URL(ref).protocol === "https:";
  } catch {
    return false;
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Checks one record against the rules the existing product system actually enforces
 * (repository defaults, Admin Add/Edit forms, unique indexes). Never alters values.
 */
export function validateCatalogueRecord(raw: unknown, knownBrands: Map<string, string>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainObject(raw)) {
    return { errors: ["Record is not a JSON object"], warnings, fields: emptyFields() };
  }
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");

  const requireString = (key: string, label: string, max: number) => {
    const v = raw[key];
    if (v === undefined || v === null || v === "") errors.push(`${label} is required`);
    else if (typeof v !== "string") errors.push(`${label} must be a string (got ${typeof v})`);
    else if (!v.trim()) errors.push(`${label} is blank`);
    else if (v.length > max) errors.push(`${label} is longer than ${max} characters`);
  };

  // Identifiers are compared trimmed + case-insensitively, but never rewritten.
  requireString("sku", "SKU", 64);
  const sku = str("sku");
  if (sku && sku !== sku.trim()) errors.push("SKU has leading or trailing spaces — fix it in the file");
  else if (sku && !SKU_PATTERN.test(sku)) errors.push(`SKU "${sku}" may only contain letters, numbers and - _ . /`);

  requireString("slug", "Slug", 200);
  const slug = str("slug");
  if (slug && slug !== slugify(slug)) {
    errors.push(`Slug "${slug}" is not URL-safe — slugs must be lowercase letters, numbers and single hyphens`);
  }

  if (raw.id !== undefined) {
    if (typeof raw.id !== "string" || !raw.id.trim()) errors.push("id must be a non-empty string when present");
    else if (raw.id.length > 100 || !ID_PATTERN.test(raw.id)) errors.push(`id "${raw.id}" may only contain letters, numbers and - _ .`);
  } else {
    warnings.push("No id — one would be generated on import (p-<timestamp>)");
  }

  requireString("name", "Name", 200);
  requireString("brand", "Brand", 80);
  const brand = str("brand").trim();
  if (brand) {
    const known = knownBrands.get(brand.toLowerCase());
    if (!known) warnings.push(`New brand "${brand}" — not in the preset brand list or existing products`);
    else if (known !== brand) warnings.push(`Brand "${brand}" differs only in capitalisation from existing "${known}"`);
  }
  if (raw.brandSlug !== undefined && brand && raw.brandSlug !== slugify(brand)) {
    warnings.push(`brandSlug "${String(raw.brandSlug)}" does not match the brand; it would be recomputed as "${slugify(brand)}"`);
  }

  if (raw.model !== undefined && typeof raw.model !== "string") errors.push("Model must be a string");
  else if (!str("model").trim()) warnings.push('No model — stored as "N/A" like a manually added product');
  else if (!looksLikeModelNumber(str("model"))) {
    errors.push(`Model "${str("model").trim()}" does not look like a model number — the record may be a specification line from the source catalogue`);
  }

  // A model or name that names a different brand means the record's brand is wrong.
  if (brand) {
    const own = brand.toLowerCase();
    const text = `${str("model")} ${str("name")}`;
    for (const other of new Set(knownBrands.values())) {
      if (other.toLowerCase() === own || own.includes(other.toLowerCase())) continue;
      if (new RegExp(`(^|[^a-z])${escapeRegExp(other)}([^a-z]|$)`, "i").test(text)) {
        errors.push(`Brand is "${brand}" but the model or name refers to ${other}`);
        break;
      }
    }
  }

  // The Admin Edit form's category <select> is required and only offers store
  // categories, so a value outside them would leave the product impossible to save there.
  requireString("category", "Category", 100);
  const category = str("category").trim();
  let storeCategory = "";
  if (category) {
    const resolved = resolveStoreCategory(category);
    if (resolved.ok) {
      storeCategory = resolved.category;
      if (resolved.note) warnings.push(resolved.note);
    } else {
      errors.push(resolved.error);
    }
  }
  if (raw.categorySlug !== undefined && storeCategory && raw.categorySlug !== slugify(storeCategory)) {
    warnings.push(`categorySlug "${String(raw.categorySlug)}" does not match the category; it would be recomputed`);
  }
  if (raw.subcategory !== undefined && typeof raw.subcategory !== "string") errors.push("Subcategory must be a string");

  if (raw.description !== undefined && typeof raw.description !== "string") errors.push("Description must be a string");
  else if (str("description").length > MAX_DESCRIPTION) errors.push(`Description is longer than ${MAX_DESCRIPTION} characters`);

  if (raw.price === undefined || raw.price === null) errors.push("Price is required (use 0 for Contact for Price)");
  else if (typeof raw.price !== "number" || !Number.isFinite(raw.price)) errors.push("Price must be a number");
  else if (raw.price < 0) errors.push("Price cannot be negative");
  else if (Math.round(raw.price * 100) !== raw.price * 100) errors.push("Price may have at most 2 decimal places");
  else if (raw.price === 0) {
    warnings.push('Price is 0 — shown as "Contact for Price"; it cannot be bought online or published until it has a price');
  }

  if (raw.currency !== undefined && raw.currency !== "AED") errors.push(`Currency must be "AED" (got ${JSON.stringify(raw.currency)})`);

  if (raw.images === undefined) warnings.push("No images field — the storefront shows the placeholder image");
  else if (!Array.isArray(raw.images)) errors.push("images must be an array of URLs");
  else if (raw.images.length === 0) warnings.push("No images — the storefront shows the placeholder image");
  else {
    raw.images.forEach((img, i) => {
      if (typeof img !== "string" || !img.trim()) errors.push(`images[${i}] must be a non-empty string`);
      else if (!validImageRef(img)) errors.push(`images[${i}] must be an https:// URL or a site path like /featured/x.png`);
    });
  }

  if (raw.stockCount === undefined) errors.push("stockCount is required");
  else if (typeof raw.stockCount !== "number" || !Number.isInteger(raw.stockCount) || raw.stockCount < 0) {
    errors.push("stockCount must be a whole number, 0 or more");
  }
  if (raw.inStock !== undefined && typeof raw.inStock !== "boolean") errors.push("inStock must be true or false");
  else if (typeof raw.inStock === "boolean" && typeof raw.stockCount === "number" && raw.inStock !== raw.stockCount > 0) {
    warnings.push(`inStock is ${raw.inStock} but stockCount is ${raw.stockCount}`);
  }

  if (raw.deliveryRate !== undefined && raw.deliveryRate !== null) {
    if (typeof raw.deliveryRate !== "number" || !Number.isFinite(raw.deliveryRate) || raw.deliveryRate < 0) {
      errors.push("deliveryRate must be a number, 0 or more (0 = free delivery)");
    }
  }
  if (raw.featured !== undefined && typeof raw.featured !== "boolean") errors.push("featured must be true or false");

  if (raw.status !== undefined && !["active", "draft", "inactive"].includes(raw.status as string)) {
    errors.push(`status must be "active", "draft" or "inactive" (got ${JSON.stringify(raw.status)})`);
  }

  for (const key of ["createdAt", "updatedAt"]) {
    if (raw[key] !== undefined && (typeof raw[key] !== "string" || Number.isNaN(Date.parse(raw[key] as string)))) {
      errors.push(`${key} must be an ISO date string`);
    }
  }
  if (raw.features !== undefined && !(Array.isArray(raw.features) && raw.features.every((f) => typeof f === "string"))) {
    errors.push("features must be an array of strings");
  }
  if (raw.specifications !== undefined &&
      !(isPlainObject(raw.specifications) && Object.values(raw.specifications).every((v) => typeof v === "string"))) {
    errors.push("specifications must be an object of text values");
  }

  const extra = Object.keys(raw).filter((k) => !SCHEMA_FIELDS.has(k));
  if (extra.length) warnings.push(`Fields not in the product schema would be ignored: ${extra.join(", ")}`);

  return {
    errors,
    warnings,
    fields: {
      id: typeof raw.id === "string" ? raw.id : "",
      sku, slug, brand,
      name: str("name"),
      model: str("model"),
      category,
      storeCategory,
    },
  };
}

function emptyFields() {
  return { id: "", sku: "", slug: "", brand: "", name: "", model: "", category: "", storeCategory: "" };
}

/* -------------------------------------------------------------------------- */
/* Classification (pure)                                                      */
/* -------------------------------------------------------------------------- */

export function buildKnownBrands(existingBrandNames: unknown[]): Map<string, string> {
  const map = new Map(presetBrands.map((b) => [b.toLowerCase(), b]));
  for (const b of existingBrandNames) {
    if (typeof b === "string" && b.trim() && !map.has(b.trim().toLowerCase())) map.set(b.trim().toLowerCase(), b.trim());
  }
  return map;
}

/**
 * Classifies every record into exactly one group. Precedence:
 * INVALID → DUPLICATE IN FILE → SKU AND SLUG EXIST → SKU EXISTS → SLUG EXISTS → SAFE.
 * Every applicable reason is still listed on the row.
 */
export function classifyCatalogue(
  records: unknown[],
  existing: ExistingProductRef[],
  knownBrands: Map<string, string>
): { rows: DryRunRow[]; summary: DryRunSummary; issueBreakdown: DryRunReport["issueBreakdown"] } {
  const validated = records.map((raw, i) => ({ recordNumber: i + 1, ...validateCatalogueRecord(raw, knownBrands) }));

  // Duplicates inside the file are found before anything is judged safe.
  const inFile = { sku: new Map<string, number[]>(), slug: new Map<string, number[]>(), id: new Map<string, number[]>() };
  for (const v of validated) {
    for (const field of ["sku", "slug", "id"] as const) {
      const key = normalizeIdentifier(v.fields[field]);
      if (key) inFile[field].set(key, [...(inFile[field].get(key) ?? []), v.recordNumber]);
    }
  }

  const index = { sku: new Map<string, ExistingProductRef>(), slug: new Map<string, ExistingProductRef>(), id: new Map<string, ExistingProductRef>() };
  for (const p of existing) {
    for (const field of ["sku", "slug", "id"] as const) {
      const key = normalizeIdentifier(p[field]);
      if (key && !index[field].has(key)) index[field].set(key, p);
    }
  }

  const rows: DryRunRow[] = validated.map((v) => {
    const row: DryRunRow = {
      recordNumber: v.recordNumber, ...v.fields, group: "SAFE_TO_IMPORT",
      reasons: [], errors: [...v.errors], warnings: [...v.warnings], conflicts: [], duplicateOfRecords: [],
    };

    // In-file duplicates.
    const dupMessages: string[] = [];
    for (const field of ["sku", "slug", "id"] as const) {
      const key = normalizeIdentifier(v.fields[field]);
      const same = key ? inFile[field].get(key)! : [];
      if (same.length > 1) {
        const others = same.filter((n) => n !== v.recordNumber);
        row.duplicateOfRecords.push(...others);
        dupMessages.push(`${field.toUpperCase()} "${v.fields[field]}" also appears in record${others.length > 1 ? "s" : ""} ${others.join(", ")}`);
      }
    }
    row.duplicateOfRecords = [...new Set(row.duplicateOfRecords)].sort((a, b) => a - b);

    // Conflicts with the live collection — every identifier against every existing identifier,
    // because product lookups match id, slug OR sku and a cross-field clash would make them ambiguous.
    for (const field of ["sku", "slug", "id"] as const) {
      const key = normalizeIdentifier(v.fields[field]);
      if (!key) continue;
      for (const existingField of ["sku", "slug", "id"] as const) {
        const hit = index[existingField].get(key);
        if (hit) row.conflicts.push({ field, existingField, existing: hit });
      }
    }
    const skuHit = row.conflicts.find((c) => c.field === "sku" && c.existingField === "sku");
    const slugHit = row.conflicts.find((c) => c.field === "slug" && c.existingField === "slug");
    const otherHits = row.conflicts.filter((c) => !(c === skuHit || c === slugHit));

    const describe = (c: Conflict) =>
      `${c.field.toUpperCase()} "${v.fields[c.field]}" matches the ${c.existingField} of existing product ` +
      `"${c.existing.name}" (id ${c.existing.id || "—"}, SKU ${c.existing.sku || "—"}, slug ${c.existing.slug || "—"})`;
    const conflictReasons = row.conflicts.map(describe);
    if (skuHit && slugHit && skuHit.existing.id !== slugHit.existing.id) {
      conflictReasons.push("The SKU and slug belong to two different existing products");
    }

    // Identifier collisions across fields (e.g. incoming slug == an existing id) block the record too.
    const blockingCollision = otherHits.length > 0;
    if (blockingCollision) {
      row.errors.push(...otherHits.map((c) => `Identifier collision: ${describe(c)}`));
    }

    if (row.errors.length) {
      row.group = "INVALID";
      row.reasons = [...row.errors, ...dupMessages, ...(blockingCollision ? [] : conflictReasons)];
    } else if (dupMessages.length) {
      row.group = "SKIP_DUPLICATE_IN_FILE";
      row.reasons = [...dupMessages, ...conflictReasons];
    } else if (skuHit && slugHit) {
      row.group = "SKIP_SKU_AND_SLUG_EXIST";
      row.reasons = conflictReasons;
    } else if (skuHit) {
      row.group = "SKIP_SKU_EXISTS";
      row.reasons = conflictReasons;
    } else if (slugHit) {
      row.group = "SKIP_SLUG_EXISTS";
      row.reasons = conflictReasons;
    } else {
      row.reasons = ["No SKU, slug or id conflicts; passes validation"];
    }
    return row;
  });

  const count = (g: DryRunGroup) => rows.filter((r) => r.group === g).length;
  const breakdown = new Map<string, { kind: "error" | "warning"; message: string; count: number }>();
  for (const r of rows) {
    for (const [kind, list] of [["error", r.errors], ["warning", r.warnings]] as const) {
      for (const m of new Set(list)) {
        const k = `${kind}:${m}`;
        breakdown.set(k, { kind, message: m, count: (breakdown.get(k)?.count ?? 0) + 1 });
      }
    }
  }

  return {
    rows,
    summary: {
      totalRecords: rows.length,
      validated: rows.filter((r) => r.errors.length === 0).length,
      safeToImport: count("SAFE_TO_IMPORT"),
      skipSkuExists: count("SKIP_SKU_EXISTS"),
      skipSlugExists: count("SKIP_SLUG_EXISTS"),
      skipSkuAndSlugExist: count("SKIP_SKU_AND_SLUG_EXIST"),
      duplicatesInFile: count("SKIP_DUPLICATE_IN_FILE"),
      invalid: count("INVALID"),
      recordsWithWarnings: rows.filter((r) => r.warnings.length > 0).length,
      conflictsWithExisting: rows.filter((r) => r.conflicts.length > 0).length,
    },
    issueBreakdown: [...breakdown.values()].sort((a, b) => b.count - a.count || a.message.localeCompare(b.message)),
  };
}

/* -------------------------------------------------------------------------- */
/* Database-backed dry run (read-only)                                        */
/* -------------------------------------------------------------------------- */

/**
 * A content fingerprint of the collection, built from an aggregation projection so
 * large fields (images, descriptions) are measured rather than transferred. Any
 * change to identifiers, price, stock, delivery, status, flags, image or
 * description content length, or updatedAt changes the hash.
 */
async function fingerprint(products: ReadOnlyProducts): Promise<{ count: number; hash: string }> {
  const docs = await products
    .aggregate([
      {
        $project: {
          id: 1, sku: 1, slug: 1, name: 1, brand: 1, category: 1, price: 1, stockCount: 1, inStock: 1,
          deliveryRate: 1, status: 1, featured: 1, updatedAt: 1,
          imageBytes: {
            $sum: {
              $map: {
                input: { $cond: [{ $isArray: "$images" }, "$images", []] },
                as: "img",
                in: { $strLenBytes: { $cond: [{ $eq: [{ $type: "$$img" }, "string"] }, "$$img", ""] } },
              },
            },
          },
          imageCount: { $size: { $cond: [{ $isArray: "$images" }, "$images", []] } },
          descriptionBytes: { $strLenBytes: { $cond: [{ $eq: [{ $type: "$description" }, "string"] }, "$description", ""] } },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();
  const hash = createHash("sha256");
  for (const d of docs) hash.update(JSON.stringify(d)).update("\n");
  return { count: docs.length, hash: hash.digest("hex").slice(0, 16) };
}

export interface DryRunOptions {
  fileName: string;
  meta?: Record<string, unknown>;
  /** Injected for tests; defaults to the app's own MongoDB connection. */
  products?: ReadOnlyProducts;
  databaseName?: string;
}

export async function runCatalogueDryRun(records: unknown[], options: DryRunOptions): Promise<DryRunReport> {
  const startedAt = Date.now();
  if (records.length === 0) throw new CatalogueFileError("The file contains no products.");
  if (records.length > CATALOGUE_MAX_RECORDS) {
    throw new CatalogueFileError(`The file has ${records.length} products; the limit is ${CATALOGUE_MAX_RECORDS}.`);
  }

  let products = options.products;
  let databaseName = options.databaseName ?? "unknown";
  try {
    if (!products) {
      const db = await getMongoDb();
      databaseName = db.databaseName;
      products = db.collection("products") as unknown as ReadOnlyProducts;
    }

    const before = await fingerprint(products);
    // Identifiers of every stored product, whatever its status — the unique indexes cover all of them.
    const existingDocs = await products
      .find({}, { projection: { _id: 0, id: 1, sku: 1, slug: 1, name: 1, status: 1, brand: 1 } })
      .toArray();
    const after = await fingerprint(products);

    const existing: ExistingProductRef[] = existingDocs.map((d) => ({
      id: typeof d.id === "string" ? d.id : "",
      sku: typeof d.sku === "string" ? d.sku : "",
      slug: typeof d.slug === "string" ? d.slug : "",
      name: typeof d.name === "string" ? d.name : "",
      status: typeof d.status === "string" ? d.status : "",
    }));
    if (existing.length !== before.count) {
      throw new DryRunDatabaseError("The product list read from the database is incomplete. The dry run was stopped.");
    }

    const { rows, summary, issueBreakdown } = classifyCatalogue(
      records, existing, buildKnownBrands(existingDocs.map((d) => d.brand))
    );

    const fileWarnings: string[] = [
      "Imports create every product as a draft (hidden from the shop and checkout), whatever the file's status field says.",
    ];
    const meta = options.meta ?? {};
    if (typeof meta.database === "string" && meta.database !== databaseName) {
      fileWarnings.push(`The file targets database "${meta.database}" but this site uses "${databaseName}".`);
    }
    if (typeof meta.collection === "string" && meta.collection !== "products") {
      fileWarnings.push(`The file targets collection "${meta.collection}"; products live in "products".`);
    }
    if (typeof meta.productCount === "number" && meta.productCount !== records.length) {
      fileWarnings.push(`The file says productCount ${meta.productCount} but contains ${records.length} products.`);
    }

    return {
      dryRun: true,
      fileName: options.fileName,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      database: {
        name: databaseName,
        collection: "products",
        existingCountBefore: before.count,
        existingCountAfter: after.count,
        fingerprintBefore: before.hash,
        fingerprintAfter: after.hash,
        unchanged: before.hash === after.hash && before.count === after.count,
      },
      fileWarnings,
      summary,
      issueBreakdown,
      rows,
    };
  } catch (error) {
    if (error instanceof CatalogueFileError || error instanceof DryRunDatabaseError) throw error;
    throw new DryRunDatabaseError("Could not read the products collection. The dry run did not complete.");
  }
}
