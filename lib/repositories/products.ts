import { getMongoDb } from "@/lib/mongodb";
import type { Product } from "@/data/products";

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
  status?: "active" | "inactive" | "deleted";
  createdAt?: Date;
  updatedAt?: Date;
}

function slugify(text: string): string {
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
        ? rest.images.map((img: string) =>
            typeof img === "string" && img.startsWith("data:") && img.length > 300000
              ? "/featured/hisense-window-ac.png"
              : img
          )
        : ["/featured/hisense-window-ac.png"],
    inStock: rest.inStock !== undefined ? Boolean(rest.inStock) : true,
    stockCount: rest.stockCount !== undefined ? Number(rest.stockCount) : 12,
    featured: rest.featured !== undefined ? Boolean(rest.featured) : false,
  };
}

export async function getMongoProducts(): Promise<Product[]> {
  try {
    const db = await getMongoDb();
    const docs = await db
      .collection("products")
      .find({ status: { $ne: "deleted" } })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(formatProduct);
  } catch (error) {
    console.error("Error fetching products from MongoDB:", error);
    return [];
  }
}

export async function getMongoProductByIdOrSlug(idOrSlug: string): Promise<Product | null> {
  try {
    const db = await getMongoDb();
    const doc = await db.collection("products").findOne({
      $and: [
        { status: { $ne: "deleted" } },
        { $or: [{ id: idOrSlug }, { slug: idOrSlug }, { sku: idOrSlug }] },
      ],
    });
    return doc ? formatProduct(doc) : null;
  } catch (error) {
    console.error(`Error fetching product by id/slug (${idOrSlug}) from MongoDB:`, error);
    return null;
  }
}

export async function getMongoFeaturedProducts(): Promise<Product[]> {
  try {
    const db = await getMongoDb();
    const docs = await db
      .collection("products")
      .find({ featured: true, status: { $ne: "deleted" } })
      .toArray();
    return docs.map(formatProduct);
  } catch (error) {
    console.error("Error fetching featured products from MongoDB:", error);
    return [];
  }
}

export async function getMongoProductsByCategory(categoryNameOrSlug: string): Promise<Product[]> {
  try {
    const db = await getMongoDb();
    const slug = slugify(categoryNameOrSlug);
    const docs = await db
      .collection("products")
      .find({
        $and: [
          { status: { $ne: "deleted" } },
          {
            $or: [
              { category: { $regex: new RegExp(`^${categoryNameOrSlug}$`, "i") } },
              { categorySlug: slug },
            ],
          },
        ],
      })
      .toArray();
    return docs.map(formatProduct);
  } catch (error) {
    console.error(`Error fetching products by category (${categoryNameOrSlug}):`, error);
    return [];
  }
}

export async function createMongoProduct(data: Partial<Product>): Promise<Product> {
  const db = await getMongoDb();
  const name = data.name ? data.name.trim() : "Untitled Product";
  const slug = data.slug || slugify(name);
  const id = data.id || `p-${Date.now()}`;
  const sku = data.sku || `HT-${(data.category || "GEN").substring(0, 2).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

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
    images: data.images && data.images.length > 0 ? data.images : ["/featured/hisense-window-ac.png"],
    inStock: data.inStock !== undefined ? Boolean(data.inStock) : true,
    stockCount: data.stockCount !== undefined ? Number(data.stockCount) : 12,
    featured: data.featured !== undefined ? Boolean(data.featured) : false,
    status: "active",
    updatedAt: new Date(),
  };

  await db.collection("products").updateOne(
    { slug: doc.slug },
    { $set: doc, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );

  return formatProduct(doc);
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
  if (updates.category) {
    updateFields.categorySlug = slugify(updates.category);
  }
  if (updates.brand) {
    updateFields.brandSlug = slugify(updates.brand);
  }
  if (updates.price !== undefined) {
    updateFields.priceLabel = updates.price ? `${updates.price} AED` : "Contact for Price";
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
