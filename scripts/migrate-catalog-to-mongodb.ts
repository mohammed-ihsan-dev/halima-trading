import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

// Load .env.local if present
try {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, "utf-8");
    envText.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [k, ...v] = trimmed.split("=");
        if (k && v.length) {
          process.env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
        }
      }
    });
  }
} catch (err) {
  console.warn("Could not load .env.local automatically:", err);
}

// Static Source Datasets
import { categories as sourceCategories } from "../data/categories";
import { brands as sourceBrands } from "../data/brands";
import { products as sourceProducts } from "../data/products";
import { applianceCategories as sourceApplianceCategories } from "../data/applianceCategories";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function migrateCatalogToMongoDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "halima";

  if (!uri) {
    throw new Error("MONGODB_URI environment variable is missing.");
  }

  console.log("Connecting to MongoDB Atlas database:", dbName);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  const categoriesCollection = db.collection("categories");
  const brandsCollection = db.collection("brands");
  const productsCollection = db.collection("products");

  console.log("\n--- PHASE 1: CREATING INDEXES ---");
  await categoriesCollection.createIndex({ slug: 1 }, { unique: true });
  await categoriesCollection.createIndex({ name: 1 }, { unique: true });
  await brandsCollection.createIndex({ slug: 1 }, { unique: true });
  await brandsCollection.createIndex({ name: 1 }, { unique: true });
  await productsCollection.createIndex({ slug: 1 }, { unique: true });
  await productsCollection.createIndex({ sku: 1 }, { unique: true });
  await productsCollection.createIndex({ category: 1 });
  await productsCollection.createIndex({ brand: 1 });
  await productsCollection.createIndex({ featured: 1 });
  await productsCollection.createIndex({ status: 1 });
  console.log("✓ MongoDB indexes created successfully.");

  console.log("\n--- PHASE 2: MIGRATING CATEGORIES ---");
  let categoriesInsertedOrUpdated = 0;
  for (const cat of sourceCategories) {
    const slug = slugify(cat.name);
    const matchedApplianceCat = sourceApplianceCategories.find(
      (ac) => ac.title.toLowerCase() === cat.name.toLowerCase() || ac.id === slug
    );

    const categoryDocument = {
      id: matchedApplianceCat?.id || `cat-${slug}`,
      name: cat.name,
      slug: slug,
      description: cat.description,
      count: cat.count,
      icon: cat.icon,
      image: matchedApplianceCat?.image || "",
      href: `/shop?category=${encodeURIComponent(cat.name)}`,
      updatedAt: new Date(),
    };

    await categoriesCollection.updateOne(
      { slug },
      {
        $set: categoryDocument,
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    categoriesInsertedOrUpdated++;
  }
  console.log(`✓ Migrated ${categoriesInsertedOrUpdated} categories.`);

  console.log("\n--- PHASE 3: MIGRATING BRANDS ---");
  let brandsInsertedOrUpdated = 0;
  for (const brandName of sourceBrands) {
    const slug = slugify(brandName);
    const brandDocument = {
      id: `brand-${slug}`,
      name: brandName,
      slug: slug,
      updatedAt: new Date(),
    };

    await brandsCollection.updateOne(
      { slug },
      {
        $set: brandDocument,
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    brandsInsertedOrUpdated++;
  }
  console.log(`✓ Migrated ${brandsInsertedOrUpdated} brands.`);

  console.log("\n--- PHASE 4: MIGRATING PRODUCTS ---");
  let productsInsertedOrUpdated = 0;
  for (let idx = 0; idx < sourceProducts.length; idx++) {
    const p = sourceProducts[idx];
    const categorySlug = slugify(p.category || "General");
    const brandSlug = slugify(p.brand || "Halima Trading");
    const generatedSku = p.sku || `HT-${(p.category || "GEN").substring(0, 2).toUpperCase()}-00${idx + 1}`;

    const productDocument = {
      id: p.id,
      slug: p.slug,
      sku: generatedSku,
      name: p.name,
      brand: p.brand,
      brandSlug: brandSlug,
      model: p.model || "Model on request",
      category: p.category,
      categorySlug: categorySlug,
      subcategory: p.subcategory || "General",
      description: p.description || "",
      features: p.features || [],
      specifications: p.specifications || {},
      price: p.price ?? null,
      priceLabel: p.price ? `${p.price} AED` : "Contact for Price",
      currency: "AED",
      images: p.images && p.images.length > 0 ? p.images : ["/featured/hisense-window-ac.png"],
      inStock: p.inStock !== undefined ? Boolean(p.inStock) : true,
      stockCount: p.stockCount !== undefined ? p.stockCount : p.inStock ? 12 : 0,
      featured: p.featured !== undefined ? Boolean(p.featured) : false,
      status: "active",
      updatedAt: new Date(),
    };

    await productsCollection.updateOne(
      { slug: p.slug },
      {
        $set: productDocument,
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    productsInsertedOrUpdated++;
  }
  console.log(`✓ Migrated ${productsInsertedOrUpdated} products.`);

  console.log("\n--- PHASE 5: VALIDATING MONGODB DATA ---");
  const dbCategoriesCount = await categoriesCollection.countDocuments();
  const dbBrandsCount = await brandsCollection.countDocuments();
  const dbProductsCount = await productsCollection.countDocuments();

  const fetchedProducts = await productsCollection.find({}).toArray();

  let missingProducts = 0;
  let orphanedCategories = 0;
  let orphanedBrands = 0;

  for (const originalProduct of sourceProducts) {
    const foundInDb = fetchedProducts.find((p) => p.slug === originalProduct.slug);
    if (!foundInDb) {
      missingProducts++;
      console.warn(`[VALIDATION WARNING] Missing product in MongoDB: ${originalProduct.name}`);
    } else {
      // Check relationship validity
      const catExists = sourceCategories.some((c) => c.name.toLowerCase() === foundInDb.category?.toLowerCase());
      if (!catExists) orphanedCategories++;

      const brandExists = sourceBrands.some((b) => b.toLowerCase() === foundInDb.brand?.toLowerCase());
      if (!brandExists) orphanedBrands++;
    }
  }

  console.log("--------------------------------------------------");
  console.log("VALIDATION SUMMARY:");
  console.log(`Original Categories: ${sourceCategories.length} | MongoDB Categories: ${dbCategoriesCount}`);
  console.log(`Original Brands:     ${sourceBrands.length} | MongoDB Brands:     ${dbBrandsCount}`);
  console.log(`Original Products:   ${sourceProducts.length} | MongoDB Products:   ${dbProductsCount}`);
  console.log(`Missing Products:    ${missingProducts}`);
  console.log(`Orphaned Categories: ${orphanedCategories}`);
  console.log(`Orphaned Brands:     ${orphanedBrands}`);
  console.log("--------------------------------------------------");

  await client.close();

  return {
    success: missingProducts === 0,
    sourceCategoriesCount: sourceCategories.length,
    dbCategoriesCount,
    sourceBrandsCount: sourceBrands.length,
    dbBrandsCount,
    sourceProductsCount: sourceProducts.length,
    dbProductsCount,
    missingProducts,
    orphanedCategories,
    orphanedBrands,
  };
}

if (import.meta.url.endsWith(path.basename(process.argv[1] || ""))) {
  migrateCatalogToMongoDB()
    .then((res) => {
      console.log("Catalog migration completed with result:", res);
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Catalog migration failed:", err);
      process.exit(1);
    });
}
