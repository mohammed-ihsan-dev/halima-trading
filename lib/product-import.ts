/**
 * Bulk product import: parse a CSV/XLSX upload, validate every row against the
 * same rules as Admin → Add Product, classify each row against MongoDB by SKU,
 * and (only when confirmed) insert the new products. Imports are create-only:
 * existing products are never updated, replaced or merged.
 *
 * Server-only. The browser never validates or writes anything itself — preview
 * and confirm both send the original file and both re-run the full pipeline.
 */
import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { ObjectId } from "mongodb";
import { ensureMongoIndexes, getMongoDb } from "@/lib/mongodb";
import { insertProductsWithoutOverwrite, slugify, type MongoProductDoc } from "@/lib/repositories/products";
import { resolveStoreCategory } from "@/lib/categories";
import { categories as categoryList } from "@/data/categories";
import { brands as staticBrands } from "@/data/brands";

export const IMPORT_MAX_FILE_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request body cap
export const IMPORT_MAX_ROWS = 2000;

// Same fallbacks createMongoProduct applies, so imported products match manual ones.
const DEFAULT_IMAGE = "/featured/hisense-window-ac.png";
const DEFAULT_FEATURES = ["Quality guaranteed"];

const MAX_PRICE = 10_000_000;
const MAX_STOCK = 1_000_000;
const MAX_DELIVERY = 100_000;
const MAX_IMAGES = 20;
const MAX_DESCRIPTION = 20_000;
const EXAMPLE_SKU_PREFIX = "EXAMPLE-";

/* -------------------------------------------------------------------------- */
/* Columns                                                                    */
/* -------------------------------------------------------------------------- */

export type ImportField =
  | "sku"
  | "name"
  | "category"
  | "subcategory"
  | "brand"
  | "model"
  | "price"
  | "stock"
  | "deliveryRate"
  | "description"
  | "image"
  | "galleryImages"
  | "specifications"
  | "featured";

interface ImportColumn {
  key: ImportField;
  header: string;
  required: boolean;
  /** Normalised header spellings accepted on upload (lowercase, alphanumerics only). */
  aliases: string[];
  rule: string;
  width: number;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "sku", header: "SKU", required: true, aliases: ["sku", "productcode", "itemcode"], width: 16,
    rule: "Unique product code. Matches existing products for updates. Letters, numbers, - _ . / only." },
  { key: "name", header: "Product Name", required: true, aliases: ["productname", "name", "title"], width: 36,
    rule: "Up to 200 characters." },
  { key: "category", header: "Category", required: true, aliases: ["category"], width: 22,
    rule: "Must be one of the store categories (see Lists sheet)." },
  { key: "subcategory", header: "Subcategory", required: false, aliases: ["subcategory", "subcat"], width: 22,
    rule: "Optional. Defaults to General for new products." },
  { key: "brand", header: "Brand", required: true, aliases: ["brand"], width: 18,
    rule: "Must match an existing brand (see Lists sheet) unless new brands are allowed at upload." },
  { key: "model", header: "Model", required: false, aliases: ["model", "modelnumber", "modelno"], width: 18,
    rule: "Optional. Defaults to N/A for new products." },
  { key: "price", header: "Price (AED)", required: true, aliases: ["priceaed", "price"], width: 12,
    rule: "Plain number, e.g. 1899 or 2499.50. No currency or thousands separators. 0 shows Contact for Price." },
  { key: "stock", header: "Stock", required: true, aliases: ["stock", "stockquantity", "stockcount", "quantity", "qty"], width: 9,
    rule: "Whole number, 0 or more." },
  { key: "deliveryRate", header: "Delivery Rate (AED)", required: false,
    aliases: ["deliveryrateaed", "deliveryrate", "delivery", "deliveryfee", "deliverycharge"], width: 14,
    rule: "0 = FREE DELIVERY. Defaults to 0 for new products." },
  { key: "description", header: "Description", required: false, aliases: ["description"], width: 48,
    rule: "Optional. Line breaks and commas are kept exactly." },
  { key: "image", header: "Primary Image URL", required: false,
    aliases: ["primaryimageurl", "primaryimage", "image", "imageurl", "mainimage"], width: 36,
    rule: "https:// URL or a site path such as /featured/item.png." },
  { key: "galleryImages", header: "Gallery Image URLs", required: false,
    aliases: ["galleryimageurls", "galleryimages", "images", "gallery"], width: 36,
    rule: "Extra images, separated by | or one per line." },
  { key: "specifications", header: "Specifications", required: false, aliases: ["specifications", "specs"], width: 36,
    rule: "Key: Value pairs separated by | or one per line, e.g. Capacity: 1.5 Ton | Type: Split." },
  { key: "featured", header: "Featured", required: false, aliases: ["featured"], width: 10,
    rule: "Yes or No. Defaults to No for new products." },
];

const EXAMPLE_ROWS: Record<ImportField, string>[] = [
  {
    sku: "EXAMPLE-001", name: "Samsung 1.5 Ton Split Air Conditioner", category: "Air Conditioning",
    subcategory: "Split Air Conditioners", brand: "Samsung", model: "AR18TYHYEWKN", price: "1899", stock: "10",
    deliveryRate: "0", description: "Premium inverter split AC with fast cooling, ideal for UAE homes.",
    image: "/featured/ogeneral-split-indoor.png", galleryImages: "/featured/ogeneral-split-outdoor.png",
    specifications: "Capacity: 1.5 Ton | Type: Split", featured: "No",
  },
  {
    sku: "EXAMPLE-002", name: "Midea Front-Load Washing Machine 8kg", category: "Laundry Appliances",
    subcategory: "Washing Machines", brand: "Midea", model: "MF100W80", price: "1650.50", stock: "4",
    deliveryRate: "25", description: "Inverter front-load washer with 14 programs.",
    image: "/featured/midea-front-load-black.png", galleryImages: "", specifications: "Capacity: 8 kg", featured: "Yes",
  },
];

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

export class ImportFileError extends Error {}

export interface ParsedSheet {
  fileName: string;
  columns: ImportField[];
  ignoredHeaders: string[];
  rows: { rowNumber: number; values: Partial<Record<ImportField, string>> }[];
}

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    // Formulas are never evaluated or stored — only Excel's cached result is read.
    if ("formula" in value || "sharedFormula" in value) {
      return cellToString((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    }
    if ("hyperlink" in value) {
      const text = (value as ExcelJS.CellHyperlinkValue).text as unknown;
      if (typeof text === "string") return text;
      if (text && typeof text === "object" && "richText" in text) {
        return (text as ExcelJS.CellRichTextValue).richText.map((part) => part.text).join("");
      }
      return (value as ExcelJS.CellHyperlinkValue).hyperlink ?? "";
    }
    if ("error" in value) return "#ERROR";
  }
  return String(value);
}

async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new ImportFileError("This Excel file could not be read. Re-save it as .xlsx and try again.");
  }
  const sheet = workbook.getWorksheet("Products") ?? workbook.worksheets[0];
  if (!sheet) throw new ImportFileError("The Excel file has no worksheets.");

  const width = sheet.columnCount;
  const records: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber > IMPORT_MAX_ROWS + 1 + 500) return; // stop reading absurd sheets early
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellToString(row.getCell(c).value));
    records[rowNumber - 1] = cells;
  });
  // eachRow skips trailing gaps; keep row numbers aligned with what Excel shows.
  for (let i = 0; i < records.length; i++) records[i] ??= [];
  return records;
}

function readCsv(bytes: Uint8Array): string[][] {
  if (bytes.subarray(0, 8192).includes(0)) {
    throw new ImportFileError("This file is not a text CSV. Please upload a CSV or Excel (.xlsx) file.");
  }
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const fatal = parsed.errors.find((e) => e.type === "Quotes");
  if (fatal) {
    throw new ImportFileError(
      `CSV formatting problem near row ${(fatal.row ?? 0) + 1}: a quoted value is never closed.`
    );
  }
  return parsed.data;
}

export async function parseImportFile(fileName: string, bytes: Uint8Array): Promise<ParsedSheet> {
  const lower = fileName.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx");
  const isCsv = lower.endsWith(".csv");
  if (!isXlsx && !isCsv) throw new ImportFileError("Please upload a CSV or Excel (.xlsx) file.");
  if (bytes.byteLength === 0) throw new ImportFileError("The file is empty.");
  if (bytes.byteLength > IMPORT_MAX_FILE_BYTES) {
    throw new ImportFileError(`The file is larger than ${IMPORT_MAX_FILE_BYTES / 1024 / 1024} MB.`);
  }
  // .xlsx is a zip container; reject renamed .xls/other binaries before handing them to the parser.
  if (isXlsx && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw new ImportFileError("This is not a valid .xlsx file. Older .xls files must be re-saved as .xlsx.");
  }

  const records = isXlsx ? await readXlsx(bytes) : readCsv(bytes);
  const headerIndex = records.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIndex === -1) throw new ImportFileError("The file is empty.");

  const headerRow = records[headerIndex];
  const columnFor: (ImportField | null)[] = [];
  const seen = new Map<ImportField, string>();
  const ignoredHeaders: string[] = [];
  headerRow.forEach((raw) => {
    const header = raw.trim();
    const norm = normalizeHeader(header);
    const column = norm ? IMPORT_COLUMNS.find((c) => c.aliases.includes(norm)) : undefined;
    if (!column) {
      if (header) ignoredHeaders.push(header);
      columnFor.push(null);
      return;
    }
    if (seen.has(column.key)) {
      throw new ImportFileError(`The columns "${seen.get(column.key)}" and "${header}" both map to ${column.header}. Keep only one.`);
    }
    seen.set(column.key, header);
    columnFor.push(column.key);
  });

  const missing = IMPORT_COLUMNS.filter((c) => c.required && !seen.has(c.key)).map((c) => c.header);
  if (missing.length) {
    throw new ImportFileError(
      `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected headers.`
    );
  }

  const rows: ParsedSheet["rows"] = [];
  for (let i = headerIndex + 1; i < records.length; i++) {
    const cells = records[i] ?? [];
    if (!cells.some((c) => (c ?? "").trim() !== "")) continue;
    const values: Partial<Record<ImportField, string>> = {};
    columnFor.forEach((key, idx) => {
      if (key) values[key] = (cells[idx] ?? "").replace(/\r\n?/g, "\n");
    });
    rows.push({ rowNumber: i + 1, values });
    if (rows.length > IMPORT_MAX_ROWS) {
      throw new ImportFileError(`The file has more than ${IMPORT_MAX_ROWS} products. Split it into smaller files.`);
    }
  }
  if (rows.length === 0) throw new ImportFileError("No product rows were found under the header row.");

  return { fileName, columns: [...seen.keys()], ignoredHeaders, rows };
}

/* -------------------------------------------------------------------------- */
/* Row validation (no database access)                                        */
/* -------------------------------------------------------------------------- */

interface NormalizedRow {
  sku: string;
  name: string;
  category: string;
  subcategory?: string;
  brand: string;
  model?: string;
  price: number;
  stock: number;
  deliveryRate?: number;
  description?: string;
  images?: string[];
  specifications?: Record<string, string>;
  featured?: boolean;
}

const MONEY = /^\d+(\.\d{1,2})?$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._\-/]{0,63}$/;

function parseMoney(raw: string, label: string, max: number, errors: string[]): number | undefined {
  const value = raw.trim();
  if (!MONEY.test(value)) {
    errors.push(`${label} must be a plain number like 1899 or 2499.50 (got "${value}")`);
    return undefined;
  }
  const num = Number(value);
  if (num > max) {
    errors.push(`${label} ${value} is unrealistically large`);
    return undefined;
  }
  return num;
}

function validateImageRef(ref: string): string | null {
  if (ref.length > 2048) return "is longer than 2048 characters";
  if (ref.startsWith("/") && !ref.startsWith("//")) {
    return /\s/.test(ref) ? "contains spaces" : null;
  }
  try {
    const url = new URL(ref);
    return url.protocol === "https:" ? null : "must start with https:// (or be a site path like /featured/item.png)";
  } catch {
    return "is not a valid URL";
  }
}

const splitList = (raw: string) => raw.split(/\n|\|/).map((s) => s.trim()).filter(Boolean);

function validateRow(values: Partial<Record<ImportField, string>>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (key: ImportField) => (values[key] ?? "").trim();

  for (const key of Object.keys(values) as ImportField[]) {
    if (key !== "description" && /^[=@]/.test(get(key))) {
      errors.push(`${IMPORT_COLUMNS.find((c) => c.key === key)!.header} looks like a spreadsheet formula ("${get(key).slice(0, 30)}")`);
    }
  }

  const sku = get("sku").toUpperCase();
  if (!sku) errors.push("SKU is required");
  else if (sku.startsWith(EXAMPLE_SKU_PREFIX)) errors.push("This is an example row from the template — delete it before importing");
  else if (!SKU_PATTERN.test(sku)) errors.push(`SKU "${get("sku")}" may only contain letters, numbers and - _ . / (max 64 characters)`);

  const name = get("name").replace(/\s+/g, " ");
  if (!name) errors.push("Product Name is required");
  else if (name.length > 200) errors.push("Product Name is longer than 200 characters");

  const categoryInput = get("category");
  let category = "";
  if (!categoryInput) errors.push("Category is required");
  else {
    const resolved = resolveStoreCategory(categoryInput);
    if (resolved.ok) {
      category = resolved.category;
      if (resolved.note) warnings.push(resolved.note);
    } else {
      errors.push(resolved.error);
    }
  }

  const brand = get("brand").replace(/\s+/g, " ");
  if (!brand) errors.push("Brand is required");
  else if (brand.length > 80) errors.push("Brand is longer than 80 characters");

  const priceRaw = get("price");
  const price = priceRaw ? parseMoney(priceRaw, "Price", MAX_PRICE, errors) : (errors.push("Price is required"), undefined);

  const stockRaw = get("stock");
  let stock: number | undefined;
  if (!stockRaw) errors.push("Stock is required");
  else if (/^-\d/.test(stockRaw)) errors.push(`Stock cannot be negative (got ${stockRaw})`);
  else if (!/^\d+$/.test(stockRaw)) errors.push(`Stock must be a whole number (got "${stockRaw}")`);
  else if (Number(stockRaw) > MAX_STOCK) errors.push(`Stock ${stockRaw} is unrealistically large`);
  else stock = Number(stockRaw);

  const deliveryRaw = get("deliveryRate");
  const deliveryRate = deliveryRaw ? parseMoney(deliveryRaw, "Delivery Rate", MAX_DELIVERY, errors) : undefined;

  const subcategory = get("subcategory").replace(/\s+/g, " ") || undefined;
  if (subcategory && subcategory.length > 100) errors.push("Subcategory is longer than 100 characters");
  const model = get("model") || undefined;
  if (model && model.length > 100) errors.push("Model is longer than 100 characters");

  // Description is kept verbatim apart from outer whitespace: no truncation, line breaks preserved.
  const descriptionRaw = values.description ?? "";
  const description = descriptionRaw.trim() ? descriptionRaw.trim() : undefined;
  if (description && description.length > MAX_DESCRIPTION) {
    errors.push(`Description is ${description.length.toLocaleString()} characters — the limit is ${MAX_DESCRIPTION.toLocaleString()}`);
  }

  const primary = get("image");
  const gallery = splitList(values.galleryImages ?? "");
  let images: string[] | undefined;
  if (primary || gallery.length) {
    images = [...new Set([primary, ...gallery].filter(Boolean))];
    if (!primary) warnings.push("No primary image — the first gallery image will be used as primary");
    if (images.length > MAX_IMAGES) errors.push(`Too many images (${images.length}); the limit is ${MAX_IMAGES}`);
    for (const ref of images) {
      const problem = validateImageRef(ref);
      if (problem) errors.push(`Image "${ref.slice(0, 60)}" ${problem}`);
    }
  }

  let specifications: Record<string, string> | undefined;
  const specLines = splitList(values.specifications ?? "");
  if (specLines.length) {
    specifications = {};
    for (const line of specLines) {
      const colon = line.indexOf(":");
      const key = colon > 0 ? line.slice(0, colon).trim() : "";
      const val = colon > 0 ? line.slice(colon + 1).trim() : "";
      if (!key || !val) errors.push(`Specification "${line.slice(0, 40)}" must be written as Key: Value`);
      else specifications[key] = val;
    }
  }

  const featuredRaw = get("featured").toLowerCase();
  let featured: boolean | undefined;
  if (featuredRaw) {
    if (["yes", "y", "true", "1"].includes(featuredRaw)) featured = true;
    else if (["no", "n", "false", "0"].includes(featuredRaw)) featured = false;
    else errors.push(`Featured must be Yes or No (got "${get("featured")}")`);
  }

  const row: NormalizedRow | null =
    errors.length === 0
      ? { sku, name, category, subcategory, brand, model, price: price!, stock: stock!, deliveryRate,
          description, images, specifications, featured }
      : null;
  return { sku, name, row, errors, warnings };
}

/* -------------------------------------------------------------------------- */
/* Planning (reads MongoDB, never writes)                                     */
/* -------------------------------------------------------------------------- */

// Imports are create-only: a row whose SKU already exists is skipped, never merged.
export type RowStatus = "new" | "skipped" | "error" | "duplicate";

export interface ImportRowResult {
  rowNumber: number;
  sku: string;
  name: string;
  status: RowStatus;
  errors: string[];
  warnings: string[];
}

export interface ImportSummary {
  totalRows: number;
  toCreate: number;
  skippedExisting: number;
  errors: number;
  duplicates: number;
}

export interface ImportPlan {
  fileName: string;
  ignoredHeaders: string[];
  rows: ImportRowResult[];
  summary: ImportSummary;
  /** New documents only, in row order. */
  inserts: { rowNumber: number; doc: MongoProductDoc }[];
}

type CatalogDoc = Pick<MongoProductDoc, "id" | "sku" | "slug" | "name" | "brand" | "subcategory" | "status"> & { _id: ObjectId };

const priceLabelFor = (price: number) => (price ? `${price} AED` : "Contact for Price");

export async function planImport(sheet: ParsedSheet, options: { allowNewBrands: boolean }): Promise<ImportPlan> {
  const validated = sheet.rows.map((r) => ({ rowNumber: r.rowNumber, ...validateRow(r.values) }));

  // Every occurrence of a repeated SKU is held back: there is no safe way to pick a winner.
  const rowsBySku = new Map<string, number[]>();
  for (const v of validated) {
    if (v.sku) rowsBySku.set(v.sku, [...(rowsBySku.get(v.sku) ?? []), v.rowNumber]);
  }

  await ensureMongoIndexes();
  const db = await getMongoDb();
  const products = db.collection("products");

  // Light projection only — no images or descriptions, which can be large data URIs.
  const catalog = (await products
    .find({}, { projection: { id: 1, sku: 1, slug: 1, name: 1, brand: 1, subcategory: 1, status: 1 } })
    .toArray()) as unknown as CatalogDoc[];

  const bySku = new Map<string, CatalogDoc>();
  const byNameSlug = new Map<string, CatalogDoc>();
  const takenSlugs = new Set<string>(); // lower-cased, so case variants count as taken
  const brandBySlug = new Map<string, string>();
  const subcategoryBySlug = new Map<string, string>();
  for (const name of staticBrands) brandBySlug.set(slugify(name), name);
  for (const doc of catalog) {
    if (doc.sku) bySku.set(String(doc.sku).trim().toUpperCase(), doc);
    if (doc.slug) takenSlugs.add(String(doc.slug).trim().toLowerCase());
    if (doc.id) takenSlugs.add(String(doc.id).trim().toLowerCase()); // ids share the lookup namespace
    if (doc.name) byNameSlug.set(slugify(doc.name), doc);
    if (doc.brand && !brandBySlug.has(slugify(doc.brand))) brandBySlug.set(slugify(doc.brand), doc.brand);
    if (doc.subcategory && !subcategoryBySlug.has(slugify(doc.subcategory))) {
      subcategoryBySlug.set(slugify(doc.subcategory), doc.subcategory);
    }
  }

  const results: ImportRowResult[] = [];
  const inserts: ImportPlan["inserts"] = [];
  const now = new Date();
  let sequence = 0;

  for (const v of validated) {
    const result: ImportRowResult = {
      rowNumber: v.rowNumber, sku: v.sku, name: v.name, status: "error", errors: v.errors, warnings: v.warnings,
    };
    results.push(result);

    const sameSku = v.sku ? rowsBySku.get(v.sku)! : [];
    if (sameSku.length > 1) {
      result.status = "duplicate";
      result.errors = [
        `SKU ${v.sku} appears ${sameSku.length} times in this file (rows ${sameSku.join(", ")}) — none of these rows will be imported`,
        ...v.errors,
      ];
      continue;
    }
    if (!v.row) continue;
    const row = v.row;

    const existing = bySku.get(row.sku);
    if (existing) {
      result.status = "skipped";
      result.warnings.push(
        `SKU already exists on "${existing.name}" (slug ${existing.slug}) — imports never change existing products`
      );
      continue;
    }

    const brandSlug = slugify(row.brand);
    const knownBrand = brandBySlug.get(brandSlug);
    if (knownBrand) row.brand = knownBrand;
    else if (options.allowNewBrands) {
      brandBySlug.set(brandSlug, row.brand); // later rows with another casing reuse this spelling
      result.warnings.push(`New brand "${row.brand}" will be added to the catalogue`);
    } else {
      result.errors.push(`Brand "${row.brand}" is not an existing brand. Fix the spelling, or tick "Allow new brands" to add it.`);
      continue;
    }
    if (row.subcategory) row.subcategory = subcategoryBySlug.get(slugify(row.subcategory)) ?? row.subcategory;

    const twin = byNameSlug.get(slugify(row.name));
    if (twin) {
      result.warnings.push(`A product with the same name already exists under SKU ${twin.sku} — this row will create a second one`);
    }

    // This file format has no slug column, so the slug is generated from the name the
    // same way Add Product does, and made unique against every existing slug and id.
    const base = slugify(row.name) || "product";
    let slug = base;
    if (takenSlugs.has(slug)) slug = `${base}-${slugify(row.sku)}`;
    for (let n = 2; takenSlugs.has(slug); n++) slug = `${base}-${slugify(row.sku)}-${n}`;
    if (slug !== base) result.warnings.push(`URL slug "${base}" is already used — this product will use "${slug}"`);
    takenSlugs.add(slug);

    const doc: MongoProductDoc = {
      id: `p-${now.getTime()}-${++sequence}`,
      slug,
      sku: row.sku,
      name: row.name,
      brand: row.brand,
      brandSlug: slugify(row.brand),
      model: row.model ?? "N/A",
      category: row.category,
      categorySlug: slugify(row.category),
      subcategory: row.subcategory ?? "General",
      description: row.description ?? "",
      features: DEFAULT_FEATURES,
      specifications: row.specifications ?? {},
      price: row.price,
      priceLabel: priceLabelFor(row.price),
      currency: "AED",
      images: row.images ?? [DEFAULT_IMAGE],
      inStock: row.stock > 0,
      stockCount: row.stock,
      featured: row.featured ?? false,
      deliveryRate: row.deliveryRate ?? 0,
      // Same rule as publishing from Edit Product: live only with a real price and image.
      status: row.price > 0 && row.images ? "active" : "draft",
      createdAt: now,
      updatedAt: now,
    };
    if (!row.images) result.warnings.push("No image given — the default placeholder image will be used");
    if (doc.status === "draft") {
      result.warnings.push(
        `Will be created as a draft (hidden from the shop) because it has ${[row.price > 0 ? "" : "no price", row.images ? "" : "no image"].filter(Boolean).join(" and ")} — publish it from Edit Product once complete`
      );
    }
    result.status = "new";
    inserts.push({ rowNumber: result.rowNumber, doc });
  }

  const count = (s: RowStatus) => results.filter((r) => r.status === s).length;
  return {
    fileName: sheet.fileName,
    ignoredHeaders: sheet.ignoredHeaders,
    rows: results,
    inserts,
    summary: {
      totalRows: results.length,
      toCreate: count("new"),
      skippedExisting: count("skipped"),
      errors: count("error"),
      duplicates: count("duplicate"),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                  */
/* -------------------------------------------------------------------------- */

export interface ImportResult {
  created: number;
  failed: { rowNumber: number; sku: string; message: string }[];
}

/**
 * Insert-only. The plan passed in must have been built moments earlier by
 * planImport (the API re-plans from the uploaded file on every confirm), and any
 * row the database still rejects — e.g. a SKU created concurrently — is reported.
 */
export async function executeImport(plan: ImportPlan): Promise<ImportResult> {
  if (plan.inserts.length === 0) return { created: 0, failed: [] };
  const write = await insertProductsWithoutOverwrite(plan.inserts.map((i) => i.doc));
  const rowBySku = new Map(plan.inserts.map((i) => [i.doc.sku, i.rowNumber]));
  return {
    created: write.inserted.length,
    failed: write.rejected.map((r) => ({ rowNumber: rowBySku.get(r.sku) ?? 0, sku: r.sku, message: r.reason })),
  };
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

export async function listKnownBrands(): Promise<string[]> {
  const bySlug = new Map(staticBrands.map((b) => [slugify(b), b]));
  try {
    const db = await getMongoDb();
    const dbBrands = (await db.collection("products").distinct("brand")) as unknown[];
    for (const b of dbBrands) {
      if (typeof b === "string" && b.trim() && !bySlug.has(slugify(b))) bySlug.set(slugify(b), b);
    }
  } catch {
    // Template still works with the static list if the database is unreachable.
  }
  return [...bySlug.values()].sort((a, b) => a.localeCompare(b));
}

export function buildCsvTemplate(): string {
  const header = IMPORT_COLUMNS.map((c) => c.header);
  const rows = EXAMPLE_ROWS.map((ex) => IMPORT_COLUMNS.map((c) => ex[c.key]));
  // BOM so Excel opens the file as UTF-8.
  return "﻿" + Papa.unparse([header, ...rows], { quotes: true, newline: "\r\n" });
}

export async function buildXlsxTemplate(brandNames: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Halima Trading Admin";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell, col) => {
    const required = IMPORT_COLUMNS[col - 1].required;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: required ? "FFD71920" : "FF0F172A" } };
    cell.alignment = { vertical: "middle" };
    cell.note = `${required ? "Required. " : "Optional. "}${IMPORT_COLUMNS[col - 1].rule}`;
  });
  for (const ex of EXAMPLE_ROWS) {
    const row = sheet.addRow(ex);
    row.font = { italic: true, color: { argb: "FF64748B" } };
  }
  // Text format so codes like 00123 keep their leading zeros.
  sheet.getColumn("sku").numFmt = "@";
  sheet.getColumn("model").numFmt = "@";
  sheet.getColumn("description").alignment = { wrapText: true, vertical: "top" };

  const lists = wb.addWorksheet("Lists");
  lists.columns = [
    { header: "Categories", key: "category", width: 28 },
    { header: "Existing brands", key: "brand", width: 28 },
  ];
  lists.getRow(1).font = { bold: true };
  const longest = Math.max(categoryList.length, brandNames.length);
  for (let i = 0; i < longest; i++) {
    lists.addRow({ category: categoryList[i]?.name ?? "", brand: brandNames[i] ?? "" });
  }

  const lastRow = IMPORT_MAX_ROWS + 1;
  const catCol = sheet.getColumn("category").letter;
  const featCol = sheet.getColumn("featured").letter;
  for (let r = 2; r <= lastRow; r++) {
    sheet.getCell(`${catCol}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`Lists!$A$2:$A$${categoryList.length + 1}`],
      showErrorMessage: true, errorTitle: "Unknown category", error: "Pick a category from the list.",
    };
    sheet.getCell(`${featCol}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"Yes,No"'],
    };
  }

  const help = wb.addWorksheet("Instructions");
  help.columns = [
    { header: "Column", key: "column", width: 24 },
    { header: "Required", key: "required", width: 10 },
    { header: "Rules", key: "rule", width: 100 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of IMPORT_COLUMNS) help.addRow({ column: c.header, required: c.required ? "Yes" : "No", rule: c.rule });
  help.addRow({});
  for (const line of [
    "Delete the two grey EXAMPLE rows before importing — they are rejected on purpose.",
    "Rows whose SKU already exists update that product; new SKUs create new products. Uploading the same file twice never creates duplicates.",
    "When updating, blank optional cells keep the product's current value.",
    "Nothing is saved until you review the preview and click Confirm Import.",
  ]) help.addRow({ column: "Note", rule: line });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
