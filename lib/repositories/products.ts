import { MongoBulkWriteError } from "mongodb";
import { getMongoDb, ensureMongoIndexes } from "@/lib/mongodb";
import type { Product } from "@/data/products";
import { PRICE_RANGES, searchTokens, type CatalogueState } from "@/lib/catalogue-query";

export interface MongoProductDoc {
  _id?: any;
  id: string;
  slug: string;
  sku: string;
  name: string;
  brand: string;
  brandSlug?: string;
  model: string;
  category: string;
  categorySlug?: string;
  subcategory?: string;
  description?: string;
  features?: string[];
  specifications?: Record<string, string>;
  price?: number | null;
  priceLabel?: string;
  currency?: string;
  images?: string[];
  inStock?: boolean;
  stockCount?: number;
  featured?: boolean;
  deliveryRate?: number;
  status?: "active" | "draft" | "inactive" | "deleted";
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Products customers may see or buy. "draft" (e.g. imported, not yet priced or reviewed)
 * and "inactive" are hidden everywhere public, and so is "deleted". A document with no
 * status counts as active, exactly as before.
 */
export const UNPUBLISHED_STATUSES = ["draft", "inactive", "deleted"] as const;
const PUBLIC_FILTER = { status: { $nin: [...UNPUBLISHED_STATUSES] } };
const ADMIN_FILTER = { status: { $ne: "deleted" } };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatProduct(doc: any): Product {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return {
    ...rest,
    id: rest.id || String(_id),
    slug: rest.slug || slugify(rest.name || "product"),
    sku: rest.sku || `HT-${(rest.category || "GEN").substring(0, 2).toUpperCase()}-001`,
    name: rest.name || "Untitled Product",
    brand: rest.brand || "Halima Trading",
    model: rest.model || "N/A",
    category: rest.category || "General",
    subcategory: rest.subcategory || "General",
    description: rest.description || "",
    features: Array.isArray(rest.features) ? rest.features : [],
    specifications: rest.specifications || {},
    price: rest.price ?? null,
    priceLabel: rest.price ? `${rest.price} AED` : rest.priceLabel || "Contact for Price",
    images:
      Array.isArray(rest.images) && rest.images.length > 0
        ? rest.images.filter((img: any) => typeof img === "string" && img.trim() !== "")
        : ["/featured/hisense-window-ac.png"],
    inStock: rest.inStock !== undefined ? Boolean(rest.inStock) : true,
    stockCount: rest.stockCount !== undefined ? Number(rest.stockCount) : 12,
    featured: rest.featured !== undefined ? Boolean(rest.featured) : false,
    deliveryRate: rest.deliveryRate !== undefined && rest.deliveryRate !== null ? Number(rest.deliveryRate) : 0,
  };
}

/** Public listing by default; pass includeUnpublished only from authenticated admin code. */
export async function getMongoProducts(options: { includeUnpublished?: boolean } = {}): Promise<Product[]> {
  try {
    await ensureMongoIndexes();
    const db = await getMongoDb();
    const docs = await db
      .collection("products")
      .find(
        options.includeUnpublished ? ADMIN_FILTER : PUBLIC_FILTER,
        {
          projection: {
            id: 1,
            slug: 1,
            sku: 1,
            name: 1,
            brand: 1,
            model: 1,
            category: 1,
            subcategory: 1,
            price: 1,
            priceLabel: 1,
            images: 1,
            inStock: 1,
            stockCount: 1,
            featured: 1,
            deliveryRate: 1,
            status: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(formatProduct);
  } catch (error) {
    console.error("Error fetching products from MongoDB:", error);
    return [];
  }
}

export async function getMongoProductByIdOrSlug(
  idOrSlug: string,
  options: { includeUnpublished?: boolean } = {}
): Promise<Product | null> {
  try {
    await ensureMongoIndexes();
    const db = await getMongoDb();
    const doc = await db.collection("products").findOne({
      $and: [
        options.includeUnpublished ? ADMIN_FILTER : PUBLIC_FILTER,
        { $or: [{ id: idOrSlug }, { slug: idOrSlug }, { sku: idOrSlug }] },
      ],
    });
    return doc ? formatProduct(doc) : null;
  } catch (error) {
    console.error(`Error fetching product by id/slug (${idOrSlug}) from MongoDB:`, error);
    return null;
  }
}

export const PLACEHOLDER_IMAGE = "/featured/hisense-window-ac.png";

/**
 * Raw publication facts for one product (admin use): the stored status, price and images,
 * without the display fallbacks formatProduct applies (e.g. the placeholder image).
 */
/** The images currently stored on a product (raw, without display fallbacks); [] if not found. */
export async function getStoredProductImages(idOrSlug: string): Promise<string[]> {
  const db = await getMongoDb();
  const doc = await db.collection("products").findOne(
    { $and: [ADMIN_FILTER, { $or: [{ id: idOrSlug }, { slug: idOrSlug }] }] },
    { projection: { images: 1 } }
  );
  return Array.isArray(doc?.images) ? doc.images.filter((i: unknown): i is string => typeof i === "string") : [];
}

/**
 * Sets a product's images only if they are still exactly `expected` — so a bulk upload never
 * overwrites an edit made meanwhile. Touches nothing but `images` and `updatedAt`. Returns the
 * product's slug on success, "changed" if its images changed since they were read, or null if
 * there is no such product.
 */
export async function setProductImagesIfUnchanged(
  id: string,
  expected: readonly string[],
  images: readonly string[]
): Promise<{ slug: string } | "changed" | null> {
  const db = await getMongoDb();
  const products = db.collection("products");
  // "No images" is stored as a missing/empty list but shown to the admin as the placeholder:
  // both mean the same state, so either expectation matches either form.
  const noImages = expected.length === 0 || (expected.length === 1 && expected[0] === PLACEHOLDER_IMAGE);
  const sameImages = noImages
    ? { $or: [{ images: { $exists: false } }, { images: { $size: 0 } }, { images: { $eq: [PLACEHOLDER_IMAGE] } }] }
    : { images: { $eq: [...expected] } };
  const res = await products.findOneAndUpdate(
    { $and: [ADMIN_FILTER, { id }, sameImages] },
    { $set: { images: [...images], updatedAt: new Date() } },
    { projection: { slug: 1 }, returnDocument: "after" }
  );
  if (res) return { slug: String(res.slug ?? "") };
  return (await products.countDocuments({ $and: [ADMIN_FILTER, { id }] })) ? "changed" : null;
}

/** How many products (any status, including deleted) still reference this image URL. */
export async function countProductsReferencingImage(url: string): Promise<number> {
  const db = await getMongoDb();
  return db.collection("products").countDocuments({ images: url });
}

export async function getProductPublicationFacts(
  idOrSlug: string
): Promise<{ status: string; price: number | null; realImageCount: number } | null> {
  const db = await getMongoDb();
  const doc = await db.collection("products").findOne(
    { $and: [ADMIN_FILTER, { $or: [{ id: idOrSlug }, { slug: idOrSlug }] }] },
    { projection: { status: 1, price: 1, images: 1 } }
  );
  if (!doc) return null;
  const images = Array.isArray(doc.images) ? doc.images : [];
  return {
    status: typeof doc.status === "string" ? doc.status : "active",
    price: typeof doc.price === "number" ? doc.price : null,
    realImageCount: images.filter((i: unknown) => typeof i === "string" && i.trim() && i !== PLACEHOLDER_IMAGE).length,
  };
}

export async function getMongoFeaturedProducts(): Promise<Product[]> {
  try {
    await ensureMongoIndexes();
    const db = await getMongoDb();
    const docs = await db
      .collection("products")
      .find(
        { featured: true, ...PUBLIC_FILTER },
        {
          projection: {
            id: 1,
            slug: 1,
            sku: 1,
            name: 1,
            brand: 1,
            model: 1,
            category: 1,
            subcategory: 1,
            price: 1,
            priceLabel: 1,
            images: 1,
            inStock: 1,
            stockCount: 1,
            featured: 1,
            deliveryRate: 1,
            status: 1,
          },
        }
      )
      .toArray();
    return docs.map(formatProduct);
  } catch (error) {
    console.error("Error fetching featured products from MongoDB:", error);
    return [];
  }
}

export async function getMongoProductsByCategory(categoryNameOrSlug: string): Promise<Product[]> {
  try {
    await ensureMongoIndexes();
    const db = await getMongoDb();
    const slug = slugify(categoryNameOrSlug);
    const docs = await db
      .collection("products")
      .find(
        {
          $and: [
            PUBLIC_FILTER,
            {
              $or: [
                { category: { $regex: new RegExp(`^${escapeRegExp(categoryNameOrSlug)}$`, "i") } },
                { categorySlug: slug },
              ],
            },
          ],
        },
        {
          projection: {
            id: 1,
            slug: 1,
            sku: 1,
            name: 1,
            brand: 1,
            model: 1,
            category: 1,
            subcategory: 1,
            price: 1,
            priceLabel: 1,
            images: 1,
            inStock: 1,
            stockCount: 1,
            featured: 1,
            deliveryRate: 1,
            status: 1,
          },
        }
      )
      .toArray();
    return docs.map(formatProduct);
  } catch (error) {
    console.error(`Error fetching products by category (${categoryNameOrSlug}):`, error);
    return [];
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Fields a product card or the admin list needs — only the first image, never descriptions or specs. */
const LISTING_PROJECTION = {
  _id: 1, id: 1, slug: 1, sku: 1, name: 1, brand: 1, model: 1, category: 1, subcategory: 1, price: 1,
  priceLabel: 1, images: { $slice: 1 }, inStock: 1, stockCount: 1, featured: 1, deliveryRate: 1, status: 1, createdAt: 1,
};

export interface ProductPage {
  products: Product[];
  currentPage: number;
  pageSize: number;
  totalProducts: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * One page of the catalogue, paginated in MongoDB. Visibility, category and search are applied
 * before skip/limit; the sort always ends with _id so pages are stable. A page past the end
 * returns the last page (currentPage says which). Public by default — pass includeUnpublished
 * only from authenticated admin code.
 */
export async function queryMongoProducts(
  state: CatalogueState,
  options: { includeUnpublished?: boolean } = {}
): Promise<ProductPage> {
  const db = await getMongoDb();
  const products = db.collection("products");

  const and: Record<string, unknown>[] = [options.includeUnpublished ? ADMIN_FILTER : PUBLIC_FILTER];
  // A category name ("Air Conditioning") or its slug ("air-conditioning", used by the home page tiles).
  if (state.category) {
    and.push({
      $or: [
        { category: { $regex: new RegExp(`^${escapeRegExp(state.category)}$`, "i") } },
        { categorySlug: slugify(state.category) },
      ],
    });
  }
  // Each word must appear in the name, brand, model or SKU (the fields the old in-browser search used).
  for (const token of searchTokens(state.q)) {
    const re = new RegExp(escapeRegExp(token), "i");
    and.push({ $or: [{ name: re }, { brand: re }, { model: re }, { sku: re }] });
  }
  // Same rule as checkout and isInStock() in lib/pricing.ts, on the values formatProduct produces:
  // a missing stockCount is no limit (shown as 12), but a stored null counts as 0.
  if (state.availability === "in-stock") {
    and.push({ inStock: { $ne: false } }, { $or: [{ stockCount: { $exists: false } }, { stockCount: { $gt: 0 } }] });
  } else if (state.availability === "on-request") {
    and.push({ $or: [{ inStock: false }, { stockCount: { $lte: 0 } }, { stockCount: { $type: "null" } }] });
  }
  // Numeric comparisons only match numbers, and every range starts above 0, so
  // "Contact for Price" products (0 or no price) never fall into a price range.
  if (state.price) {
    const { label: _label, ...range } = PRICE_RANGES[state.price];
    void _label;
    and.push({ price: Object.fromEntries(Object.entries(range).map(([op, v]) => [`$${op}`, v])) });
  }
  const filter = { $and: and };

  const fetchPage = (page: number) => {
    const skip = (page - 1) * state.pageSize;
    if (state.sort === "low") {
      // Priced products first, cheapest first; "Contact for Price" (0 or no price) after them.
      return products
        .aggregate([
          { $match: filter },
          { $addFields: { _unpriced: { $cond: [{ $and: [{ $isNumber: "$price" }, { $gt: ["$price", 0] }] }, 0, 1] } } },
          { $sort: { _unpriced: 1, price: 1, _id: 1 } },
          { $skip: skip },
          { $limit: state.pageSize },
          // Aggregation spells "first image only" differently from a find() projection.
          { $project: { ...LISTING_PROJECTION, images: { $slice: [{ $cond: [{ $isArray: "$images" }, "$images", []] }, 1] } } },
        ])
        .toArray();
    }
    const sort: Record<string, 1 | -1> = state.sort === "az" ? { name: 1, _id: 1 } : { createdAt: -1, _id: -1 };
    return products
      .find(filter, { projection: LISTING_PROJECTION, collation: state.sort === "az" ? { locale: "en", strength: 2 } : undefined })
      .sort(sort)
      .skip(skip)
      .limit(state.pageSize)
      .toArray();
  };

  const [totalProducts, firstTry] = await Promise.all([products.countDocuments(filter), fetchPage(state.page)]);
  const totalPages = Math.max(1, Math.ceil(totalProducts / state.pageSize));
  const currentPage = Math.min(state.page, totalPages);
  const docs = currentPage === state.page ? firstTry : await fetchPage(currentPage);

  return {
    products: docs.map(formatProduct),
    currentPage,
    pageSize: state.pageSize,
    totalProducts,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
}

/** Categories that have at least one public product, for the shop's category filter. */
export async function getPublicProductCategories(): Promise<string[]> {
  const db = await getMongoDb();
  const values = await db.collection("products").distinct("category", PUBLIC_FILTER);
  return values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

/** The newest public products other than the given one — for "related products" (was: the whole catalogue, then slice). */
export async function getMongoRelatedProducts(excludeId: string, limit = 4): Promise<Product[]> {
  try {
    const db = await getMongoDb();
    const docs = await db
      .collection("products")
      .find({ $and: [PUBLIC_FILTER, { id: { $ne: excludeId } }] }, { projection: LISTING_PROJECTION })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return docs.map(formatProduct);
  } catch (error) {
    console.error("Error fetching related products from MongoDB:", error);
    return [];
  }
}

/**
 * Builds a new product document with the repository's standard defaults and derived
 * fields (slugs, priceLabel, currency). Shared by Add Product and catalogue imports.
 */
export function buildProductDocument(data: Partial<Product>): MongoProductDoc {
  const name = data.name ? data.name.trim() : "Untitled Product";
  const slug = data.slug || slugify(name);
  const id = data.id || `p-${Date.now()}`;
  const sku = data.sku?.trim() || `HT-${(data.category || "GEN").substring(0, 2).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

  const doc: MongoProductDoc = {
    id,
    slug,
    sku,
    name,
    brand: data.brand || "Halima Trading",
    brandSlug: slugify(data.brand || "Halima Trading"),
    model: data.model || "N/A",
    category: data.category || "General",
    categorySlug: slugify(data.category || "General"),
    subcategory: data.subcategory || "General",
    description: data.description || "",
    features: data.features || ["Quality guaranteed"],
    specifications: data.specifications || {},
    price: data.price ?? null,
    priceLabel: data.price ? `${data.price} AED` : "Contact for Price",
    currency: "AED",
    images: data.images && data.images.length > 0 ? data.images : [], // no images: the storefront shows the placeholder
    inStock: data.inStock !== undefined ? Boolean(data.inStock) : true,
    stockCount: data.stockCount !== undefined ? Number(data.stockCount) : 12,
    featured: data.featured !== undefined ? Boolean(data.featured) : false,
    deliveryRate: data.deliveryRate !== undefined && data.deliveryRate !== null ? Math.max(0, Number(data.deliveryRate) || 0) : 0,
    status: "active",
    updatedAt: new Date(),
  };
  return doc;
}

export async function createMongoProduct(data: Partial<Product>): Promise<Product> {
  const db = await getMongoDb();
  const doc = buildProductDocument(data);

  await db.collection("products").updateOne(
    { slug: doc.slug },
    { $set: doc, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );

  return formatProduct(doc);
}

export interface InsertWithoutOverwriteResult {
  inserted: { sku: string; slug: string }[];
  rejected: { sku: string; slug: string; reason: string }[];
}

/**
 * Insert-only write for catalogue imports. Never updates, replaces or upserts: if a
 * document with the same unique key (sku or slug) already exists — including one
 * created concurrently — MongoDB rejects that document and it is reported here.
 */
export async function insertProductsWithoutOverwrite(
  docs: MongoProductDoc[]
): Promise<InsertWithoutOverwriteResult> {
  const result: InsertWithoutOverwriteResult = { inserted: [], rejected: [] };
  if (docs.length === 0) return result;

  await ensureMongoIndexes();
  const db = await getMongoDb();
  const batch = docs.map((d) => ({ ...d })); // insertMany adds _id to the objects it is given
  const failed = new Map<number, string>();
  try {
    await db.collection("products").insertMany(batch, { ordered: false });
  } catch (error) {
    if (!(error instanceof MongoBulkWriteError)) throw error;
    const writeErrors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
    for (const we of writeErrors) {
      // errmsg names the index: "... index: sku_1 dup key ..." or, once the case-insensitive
      // migration is applied, "... index: sku_unique_ci dup key ...".
      const key = we.code === 11000 ? /index: (sku|slug)_/.exec(we.errmsg ?? "")?.[1] : undefined;
      failed.set(
        we.index,
        we.code === 11000
          ? `Not inserted: a product with this ${key === "sku" ? "SKU" : key ?? "SKU or slug"} already exists (it may have been created by another import moments earlier)`
          : `Not inserted: ${we.errmsg || "rejected by the database"}`
      );
    }
    if (failed.size === 0) throw error;
  }
  docs.forEach((d, i) => {
    const reason = failed.get(i);
    if (reason) result.rejected.push({ sku: d.sku, slug: d.slug, reason });
    else result.inserted.push({ sku: d.sku, slug: d.slug });
  });
  return result;
}

export async function updateMongoProduct(idOrSlug: string, updates: Partial<Product>): Promise<Product | null> {
  const db = await getMongoDb();
  const existing = await db.collection("products").findOne({
    $or: [{ id: idOrSlug }, { slug: idOrSlug }],
  });

  if (!existing) return null;

  const updateFields: Record<string, any> = {
    ...updates,
    updatedAt: new Date(),
  };

  if (updates.slug) {
    updateFields.slug = slugify(updates.slug);
  }
  // Uniqueness treats SKUs case- and space-insensitively; never store surrounding spaces.
  if (typeof updates.sku === "string") {
    updateFields.sku = updates.sku.trim();
  }
  if (updates.category) {
    updateFields.categorySlug = slugify(updates.category);
  }
  if (updates.brand) {
    updateFields.brandSlug = slugify(updates.brand);
  }
  if (updates.price !== undefined) {
    updateFields.priceLabel = updates.price ? `${updates.price} AED` : "Contact for Price";
  }
  if (updates.deliveryRate !== undefined) {
    updateFields.deliveryRate = Math.max(0, Number(updates.deliveryRate) || 0);
  }

  await db.collection("products").updateOne(
    { _id: existing._id },
    { $set: updateFields }
  );

  const updatedDoc = await db.collection("products").findOne({ _id: existing._id });
  return updatedDoc ? formatProduct(updatedDoc) : null;
}

export async function deleteMongoProduct(idOrSlug: string): Promise<boolean> {
  try {
    const db = await getMongoDb();
    const result = await db.collection("products").deleteOne({
      $or: [{ id: idOrSlug }, { slug: idOrSlug }],
    });
    return (result.deletedCount ?? 0) > 0;
  } catch (error) {
    console.error(`Error deleting product (${idOrSlug}):`, error);
    return false;
  }
}
