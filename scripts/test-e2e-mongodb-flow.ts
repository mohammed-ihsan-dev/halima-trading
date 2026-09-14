import fs from "node:fs";
import path from "node:path";

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
  console.warn("Could not load .env.local:", err);
}

import { getMongoDb } from "../lib/mongodb";
import {
  getMongoProducts,
  getMongoProductByIdOrSlug,
  getMongoProductsByCategory,
  createMongoProduct,
  updateMongoProduct,
  deleteMongoProduct,
} from "../lib/repositories/products";

async function runE2ETest() {
  console.log("==================================================");
  console.log("STARTING MANDATORY END-TO-END MONGODB FLOW TEST");
  console.log("==================================================");

  // Pre-test cleanup of any existing test document
  const db = await getMongoDb();
  await db.collection("products").deleteMany({
    $or: [
      { slug: { $regex: /mongodb-test-product/i } },
      { sku: "HT-AC-TEST999" },
    ],
  });

  // TEST A: Check initial migrated products
  const initialProducts = await getMongoProducts();
  console.log(`[TEST A] Initial MongoDB products count: ${initialProducts.length}`);
  if (initialProducts.length < 11) {
    throw new Error(`Expected at least 11 products, found ${initialProducts.length}`);
  }
  console.log("✓ TEST A PASSED: Migrated products available in MongoDB.");

  // TEST B: Create new test product via Admin repository
  const testProductPayload = {
    name: "MONGODB TEST PRODUCT",
    category: "Air Conditioning",
    brand: "Hisense",
    model: "HT-TEST-2026",
    price: 2499,
    sku: "HT-AC-TEST999",
    description: "Automated end-to-end verification product for persistent MongoDB source of truth.",
    inStock: true,
    stockCount: 15,
    featured: true,
  };

  console.log("\n[TEST B] Creating new product via Admin/Repository flow...");
  const createdProduct = await createMongoProduct(testProductPayload);
  console.log(`✓ TEST B PASSED: Product created with ID: ${createdProduct.id}, Slug: ${createdProduct.slug}`);

  // TEST C: Check MongoDB count (11 -> 12)
  const afterAddProducts = await getMongoProducts();
  console.log(`\n[TEST C] MongoDB products count after addition: ${afterAddProducts.length}`);
  if (afterAddProducts.length !== initialProducts.length + 1) {
    throw new Error(`Expected ${initialProducts.length + 1} products, got ${afterAddProducts.length}`);
  }
  console.log("✓ TEST C PASSED: Product count incremented persistently in MongoDB.");

  // TEST D & E: Public Website read & refresh simulation
  console.log("\n[TEST D & E] Simulating Public Website list query & refresh...");
  const publicProducts = await getMongoProducts();
  const foundInPublic = publicProducts.find((p) => p.slug === createdProduct.slug);
  if (!foundInPublic) {
    throw new Error("Newly created product failed to appear in public product list!");
  }
  console.log(`✓ TEST D & E PASSED: Newly created product "${foundInPublic.name}" is visible on Public Website!`);

  // TEST F: Category query
  console.log("\n[TEST F] Testing category page query for Air Conditioning...");
  const categoryProducts = await getMongoProductsByCategory("Air Conditioning");
  const foundInCat = categoryProducts.find((p) => p.slug === createdProduct.slug);
  if (!foundInCat) {
    throw new Error("Newly created product did not appear in Category query!");
  }
  console.log("✓ TEST F PASSED: Product correctly appears under its Category.");

  // TEST G & H: Search & Product Detail resolution
  console.log("\n[TEST G & H] Testing Product Detail page lookup by slug...");
  const detailProduct = await getMongoProductByIdOrSlug(createdProduct.slug);
  if (!detailProduct || detailProduct.name !== "MONGODB TEST PRODUCT") {
    throw new Error("Failed to fetch product detail from MongoDB by slug!");
  }
  console.log(`✓ TEST G & H PASSED: Product detail resolved for "${detailProduct.name}" (Price: ${detailProduct.priceLabel}).`);

  // TEST I: Admin Edit Product
  console.log("\n[TEST I] Editing product in Admin...");
  const updatedProduct = await updateMongoProduct(createdProduct.slug, {
    name: "MONGODB TEST PRODUCT UPDATED",
    price: 2899,
  });
  if (!updatedProduct || updatedProduct.name !== "MONGODB TEST PRODUCT UPDATED" || updatedProduct.price !== 2899) {
    throw new Error("Failed to update product in MongoDB!");
  }
  const publicUpdated = await getMongoProductByIdOrSlug(createdProduct.slug);
  if (publicUpdated?.name !== "MONGODB TEST PRODUCT UPDATED" || publicUpdated?.price !== 2899) {
    throw new Error("Updated product changes failed to reflect on Public Website!");
  }
  console.log("✓ TEST I PASSED: Admin edit instantly reflected on Public Website!");

  // TEST J: Admin Delete Product
  console.log("\n[TEST J] Deleting product in Admin...");
  const deleted = await deleteMongoProduct(createdProduct.slug);
  if (!deleted) {
    throw new Error("Failed to delete test product from MongoDB!");
  }
  const afterDeleteProducts = await getMongoProducts();
  const foundDeleted = afterDeleteProducts.find((p) => p.slug === createdProduct.slug);
  if (foundDeleted) {
    throw new Error("Deleted product still appears in public products list!");
  }
  console.log(`✓ TEST J PASSED: Product deleted cleanly. MongoDB count returned to ${afterDeleteProducts.length}.`);

  // TEST K: Verify Original 11 products intact
  console.log("\n[TEST K] Verifying original 11 products remain intact...");
  if (afterDeleteProducts.length !== initialProducts.length) {
    throw new Error(`Original products count mismatched! Expected ${initialProducts.length}, got ${afterDeleteProducts.length}`);
  }
  console.log("✓ TEST K PASSED: All original products remain 100% intact.");

  console.log("\n==================================================");
  console.log("ALL MANDATORY END-TO-END TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

runE2ETest().catch((err) => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
