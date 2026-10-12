// Integration tests for scripts/import-approved-catalogue.mjs CLI.
// Runs ONLY against an ISOLATED local MongoDB (never Atlas, never production).
// Requires TEST_MONGODB_URI pointing at a local server, e.g. mongodb://127.0.0.1:27017
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const uri = process.env.TEST_MONGODB_URI;
const isLocal = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(uri);
const skip = !isLocal && "set TEST_MONGODB_URI to a local MongoDB (mongodb://127.0.0.1:<port>) to run these tests";
const dbName = `halima_cli_import_test_${process.pid}`;

let client, db, products, getMongoClient;

const scriptPath = fileURLToPath(new URL("../scripts/import-approved-catalogue.mjs", import.meta.url));
const registerPath = fileURLToPath(new URL("./support/register-ts.mjs", import.meta.url));
const fixturePath = fileURLToPath(new URL(`./tmp_approved_fixture_${process.pid}.json`, import.meta.url));
const resultPath = fileURLToPath(new URL(`./tmp_import_result_${process.pid}.json`, import.meta.url));

const fixtureData = {
  database: "halima",
  collection: "products",
  selection: { basis: "source-verified" },
  productCount: 3,
  products: [
    {
      sku: "TEST-CLI-001",
      slug: "test-cli-product-001",
      name: "Test CLI Product One",
      brand: "Super General",
      model: "SG-CLI-100",
      category: "Air Conditioning",
      subcategory: "Window Air Conditioners",
      description: "Test description one",
      price: 0,
      currency: "AED",
      images: [],
      inStock: true,
      stockCount: 1,
      featured: false,
      deliveryRate: 75,
      status: "active",
    },
    {
      sku: "TEST-CLI-002",
      slug: "test-cli-product-002",
      name: "Test CLI Product Two",
      brand: "Midea",
      model: "MD-CLI-200",
      category: "Laundry Appliances",
      subcategory: "Washing Machines",
      description: "Test description two",
      price: 0,
      currency: "AED",
      images: [],
      inStock: true,
      stockCount: 2,
      featured: false,
      deliveryRate: 75,
      status: "active",
    },
    {
      sku: "TEST-CLI-EXISTING",
      slug: "test-cli-existing-slug",
      name: "Attempted Overwrite Of Existing",
      brand: "Hisense",
      model: "HS-CLI-300",
      category: "Refrigeration",
      description: "Should be skipped because SKU already exists",
      price: 9999,
      currency: "AED",
      images: [],
      inStock: true,
      stockCount: 5,
      featured: false,
      deliveryRate: 0,
      status: "active",
    },
  ],
};

const preSeededExisting = {
  id: "p-existing-cli-1",
  sku: "TEST-CLI-EXISTING",
  slug: "test-cli-existing-slug",
  name: "Original Pre-existing Product",
  brand: "Hisense",
  model: "HS-ORIG-100",
  category: "Refrigeration",
  description: "Must stay byte-identical and never be overwritten",
  price: 1500,
  currency: "AED",
  images: ["/featured/hisense-window-ac.png"],
  inStock: true,
  stockCount: 10,
  featured: true,
  deliveryRate: 50,
  status: "active",
  createdAt: new Date("2026-09-01T10:00:00Z"),
  updatedAt: new Date("2026-09-01T10:00:00Z"),
};

function runCli(args, envOverrides = {}) {
  const env = {
    ...process.env,
    MONGODB_URI: uri,
    MONGODB_DB: dbName,
    IMPORT_RESULT_PATH: resultPath,
    ...envOverrides,
  };
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--import", registerPath, scriptPath, ...args],
      {
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message,
    };
  }
}

before(async () => {
  if (skip) return;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = dbName;
  ({ getMongoClient } = await import("@/lib/mongodb"));
  client = await getMongoClient();
  db = client.db(dbName);
  products = db.collection("products");

  await products.createIndex({ sku: 1 }, { unique: true });
  await products.createIndex({ slug: 1 }, { unique: true });

  writeFileSync(fixturePath, JSON.stringify(fixtureData, null, 2), "utf8");
});

after(async () => {
  if (existsSync(fixturePath)) unlinkSync(fixturePath);
  if (existsSync(resultPath)) unlinkSync(resultPath);
  if (client) {
    await db.dropDatabase();
    await client.close();
  }
});

test("CLI 1. dry-run without --confirm performs zero writes and leaves database unchanged", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne({ ...preSeededExisting });
  const beforeDocs = await products.find({}).toArray();

  const res = runCli([fixturePath]);
  assert.equal(res.status, 0, `dry run failed: ${res.stderr}`);
  assert.match(res.stdout, /dry run \(no writes\)/);
  assert.match(res.stdout, new RegExp(`${dbName}\\.products`));

  const afterDocs = await products.find({}).toArray();
  assert.deepEqual(afterDocs, beforeDocs, "dry run must not modify any document");
});

test("CLI 2. --confirm without CONFIRM_CATALOGUE_IMPORT refuses to write", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne({ ...preSeededExisting });
  const beforeDocs = await products.find({}).toArray();

  const res = runCli([fixturePath, "--confirm"], { CONFIRM_CATALOGUE_IMPORT: "" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Refusing to import/);

  const afterDocs = await products.find({}).toArray();
  assert.deepEqual(afterDocs, beforeDocs, "refused import must not write anything");
});

test("CLI 3. --confirm with wrong database or count confirmation refuses to write", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne({ ...preSeededExisting });
  const beforeDocs = await products.find({}).toArray();

  // Wrong database
  const resWrongDb = runCli([fixturePath, "--confirm"], {
    CONFIRM_CATALOGUE_IMPORT: `wrong_db.products:${fixtureData.products.length}`,
  });
  assert.equal(resWrongDb.status, 1);
  assert.match(resWrongDb.stderr, /Refusing to import/);

  // Wrong count
  const resWrongCount = runCli([fixturePath, "--confirm"], {
    CONFIRM_CATALOGUE_IMPORT: `${dbName}.products:999`,
  });
  assert.equal(resWrongCount.status, 1);
  assert.match(resWrongCount.stderr, /Refusing to import/);

  const afterDocs = await products.find({}).toArray();
  assert.deepEqual(afterDocs, beforeDocs, "wrong confirmation must not write anything");
});

test("CLI 4 & 5. valid confirmation inserts safe approved products as drafts with zero prices", { skip }, async () => {
  await products.deleteMany({});
  await products.insertOne({ ...preSeededExisting });
  const beforeExisting = await products.findOne({ sku: preSeededExisting.sku });

  const validToken = `${dbName}.products:${fixtureData.products.length}`;
  const res = runCli([fixturePath, "--confirm"], {
    CONFIRM_CATALOGUE_IMPORT: validToken,
  });
  assert.equal(res.status, 0, `import failed: ${res.stderr}`);
  assert.match(res.stdout, /"inserted": 2/);
  assert.match(res.stdout, /"skippedBeforeWrite": 1/);

  // Verify inserted products
  const p1 = await products.findOne({ sku: "TEST-CLI-001" });
  assert.ok(p1, "TEST-CLI-001 must be inserted");
  assert.equal(p1.status, "draft", "must be inserted as draft");
  assert.equal(p1.price, 0, "price must be 0");
  assert.deepEqual(p1.images, [], "images must be empty");

  const p2 = await products.findOne({ sku: "TEST-CLI-002" });
  assert.ok(p2, "TEST-CLI-002 must be inserted");
  assert.equal(p2.status, "draft", "must be inserted as draft");
  assert.equal(p2.price, 0, "price must be 0");

  // Verify existing pre-seeded product was NOT overwritten
  const afterExisting = await products.findOne({ sku: preSeededExisting.sku });
  assert.deepEqual(afterExisting, beforeExisting, "existing product must remain byte-identical");
  assert.equal(await products.countDocuments(), 3);
});

test("CLI 6 & 7. running a second time inserts zero duplicates and leaves existing untouched", { skip }, async () => {
  const countBefore = await products.countDocuments();
  assert.equal(countBefore, 3);
  const docsBefore = await products.find({}).sort({ sku: 1 }).toArray();

  const validToken = `${dbName}.products:${fixtureData.products.length}`;
  const res = runCli([fixturePath, "--confirm"], {
    CONFIRM_CATALOGUE_IMPORT: validToken,
  });
  assert.equal(res.status, 0, `second run failed: ${res.stderr}`);
  assert.match(res.stdout, /"inserted": 0/);
  assert.match(res.stdout, /"skippedBeforeWrite": 3/);

  const docsAfter = await products.find({}).sort({ sku: 1 }).toArray();
  assert.deepEqual(docsAfter, docsBefore, "second run must not alter any product or insert duplicate");
  assert.equal(await products.countDocuments(), 3);
});

test("CLI 8. full approved catalogue (308 records) end-to-end against isolated local database", { skip }, async () => {
  const approvedPath = "/Users/ihsan/Downloads/halima-catalogue-corrected/halima-products-import.approved.json";
  if (!existsSync(approvedPath)) return;

  await products.deleteMany({});
  await products.insertOne({ ...preSeededExisting });
  const beforeExisting = await products.findOne({ sku: preSeededExisting.sku });

  // 1. Dry run
  const dryRes = runCli([approvedPath]);
  assert.equal(dryRes.status, 0, `dry run failed: ${dryRes.stderr}`);
  assert.match(dryRes.stdout, /dry run \(no writes\)/);
  assert.equal(await products.countDocuments(), 1, "dry run must perform zero writes");

  // 2. Refuses without confirmation variable
  const noVarRes = runCli([approvedPath, "--confirm"], { CONFIRM_CATALOGUE_IMPORT: "" });
  assert.equal(noVarRes.status, 1);
  assert.match(noVarRes.stderr, /Refusing to import/);
  assert.equal(await products.countDocuments(), 1);

  // 3. Refuses with wrong confirmation
  const wrongVarRes = runCli([approvedPath, "--confirm"], {
    CONFIRM_CATALOGUE_IMPORT: `${dbName}.products:100`,
  });
  assert.equal(wrongVarRes.status, 1);
  assert.match(wrongVarRes.stderr, /Refusing to import/);
  assert.equal(await products.countDocuments(), 1);

  // 4. Valid confirmation
  const validToken = `${dbName}.products:308`;
  const importRes = runCli([approvedPath, "--confirm"], {
    CONFIRM_CATALOGUE_IMPORT: validToken,
  });
  assert.equal(importRes.status, 0, `import failed: ${importRes.stderr}`);
  assert.match(importRes.stdout, /"inserted": 308/);

  // 5. Verify inserted count, status, zero prices
  assert.equal(await products.countDocuments(), 309, "1 existing + 308 imported");
  const nonDrafts = await products.countDocuments({ sku: { $ne: preSeededExisting.sku }, status: { $ne: "draft" } });
  assert.equal(nonDrafts, 0, "all 308 imported products must be drafts");
  const nonZeroPrices = await products.countDocuments({ sku: { $ne: preSeededExisting.sku }, price: { $ne: 0 } });
  assert.equal(nonZeroPrices, 0, "all 308 imported products must have price 0");

  // 6. Run a second time: no duplicates
  const secondRes = runCli([approvedPath, "--confirm"], {
    CONFIRM_CATALOGUE_IMPORT: validToken,
  });
  assert.equal(secondRes.status, 0, `second run failed: ${secondRes.stderr}`);
  assert.match(secondRes.stdout, /"inserted": 0/);
  assert.match(secondRes.stdout, /"skippedBeforeWrite": 308/);
  assert.equal(await products.countDocuments(), 309, "count must remain exactly 309");

  // 7. Verify existing record unchanged
  const afterExisting = await products.findOne({ sku: preSeededExisting.sku });
  assert.deepEqual(afterExisting, beforeExisting, "existing record must be unchanged");
});

