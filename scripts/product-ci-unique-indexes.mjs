/**
 * Case-insensitive uniqueness for product SKUs and slugs.
 *
 * The existing unique indexes (sku_1, slug_1) compare bytes, so "ab-1" and "AB-1"
 * can coexist if two writes race past the application's case-insensitive check.
 * This migration ADDS two unique indexes with a case-insensitive collation next to
 * the existing ones. Nothing is dropped, no document is touched, and existing
 * queries keep using sku_1 / slug_1 exactly as today.
 *
 *   node --env-file=.env.local scripts/product-ci-unique-indexes.mjs            # read-only check (default)
 *   CONFIRM_INDEX_MIGRATION=<db>.products \
 *     node --env-file=.env.local scripts/product-ci-unique-indexes.mjs --apply   # create the two indexes
 *   CONFIRM_INDEX_MIGRATION=<db>.products \
 *     node --env-file=.env.local scripts/product-ci-unique-indexes.mjs --rollback # drop only those two
 */
import { MongoClient } from "mongodb";
import { pathToFileURL } from "node:url";

export const CI_COLLATION = { locale: "en", strength: 2 }; // case-insensitive, accent-sensitive
export const CI_INDEXES = [
  { name: "sku_unique_ci", key: { sku: 1 }, field: "sku" },
  { name: "slug_unique_ci", key: { slug: 1 }, field: "slug" },
];

/** Read-only. Reports existing indexes and any values that would violate the new indexes. */
export async function checkCaseInsensitiveUniqueness(products) {
  const indexes = await products.indexes();
  const present = CI_INDEXES.filter((ci) => indexes.some((i) => i.name === ci.name));
  const conflicts = {};
  for (const { field } of CI_INDEXES) {
    // $group compares strings with the collation given to the aggregation — the same rule the index will enforce.
    conflicts[field] = await products
      .aggregate(
        [
          { $match: { [field]: { $type: "string" } } },
          { $group: { _id: `$${field}`, count: { $sum: 1 }, values: { $push: `$${field}` } } },
          { $match: { count: { $gt: 1 } } },
        ],
        { collation: CI_COLLATION }
      )
      .toArray();
  }
  const missingOrNonString = {};
  for (const { field } of CI_INDEXES) {
    missingOrNonString[field] = await products.countDocuments({ [field]: { $not: { $type: "string" } } });
  }
  // A case-insensitive collation does NOT ignore whitespace: " AB-1" and "AB-1" are different to the
  // index but the same to the application (which trims). Report both kinds of problem.
  const whitespace = {};
  const trimmedConflicts = {};
  for (const { field } of CI_INDEXES) {
    whitespace[field] = await products.countDocuments({ [field]: { $type: "string", $regex: /^\s|\s$/ } });
    trimmedConflicts[field] = await products
      .aggregate([
        { $match: { [field]: { $type: "string" } } },
        { $group: { _id: { $toLower: { $trim: { input: `$${field}` } } }, count: { $sum: 1 }, values: { $push: `$${field}` } } },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
  }
  const blockers = Object.entries(conflicts).flatMap(([field, groups]) =>
    groups.map((g) => `${field}: ${g.values.map((v) => JSON.stringify(v)).join(" / ")} differ only by case`)
  );
  for (const [field, groups] of Object.entries(trimmedConflicts)) {
    for (const g of groups) {
      const msg = `${field}: ${g.values.map((v) => JSON.stringify(v)).join(" / ")} differ only by case or surrounding spaces`;
      if (!blockers.some((b) => b.startsWith(`${field}: `) && g.values.every((v) => b.includes(JSON.stringify(v))))) blockers.push(msg);
    }
  }
  for (const [field, n] of Object.entries(whitespace)) {
    if (n > 0) blockers.push(`${field}: ${n} value(s) have leading or trailing spaces — trim them before applying (the index would treat them as different)`);
  }
  for (const [field, n] of Object.entries(missingOrNonString)) {
    if (n > 1) blockers.push(`${field}: ${n} documents have no ${field}; a unique index allows only one`);
  }
  return {
    documents: await products.countDocuments(),
    existingIndexes: indexes.map((i) => ({ name: i.name, key: i.key, unique: !!i.unique, collation: i.collation ?? null })),
    alreadyApplied: present.map((p) => p.name),
    valuesWithSurroundingSpaces: whitespace,
    blockers,
    ready: blockers.length === 0,
  };
}

export async function applyCaseInsensitiveUniqueIndexes(products) {
  const check = await checkCaseInsensitiveUniqueness(products);
  if (!check.ready) throw new Error(`Not applied — fix these first:\n  ${check.blockers.join("\n  ")}`);
  for (const ci of CI_INDEXES) {
    if (check.alreadyApplied.includes(ci.name)) continue;
    await products.createIndex(ci.key, { name: ci.name, unique: true, collation: CI_COLLATION });
  }
  const after = await products.indexes();
  const missing = CI_INDEXES.filter((ci) => !after.some((i) => i.name === ci.name && i.unique && i.collation?.strength === 2));
  if (missing.length) throw new Error(`Index creation could not be verified: ${missing.map((m) => m.name).join(", ")}`);
  return { created: CI_INDEXES.map((c) => c.name).filter((n) => !check.alreadyApplied.includes(n)) };
}

export async function rollbackCaseInsensitiveUniqueIndexes(products) {
  const indexes = await products.indexes();
  const dropped = [];
  for (const ci of CI_INDEXES) {
    if (indexes.some((i) => i.name === ci.name)) {
      await products.dropIndex(ci.name); // only the indexes this migration created
      dropped.push(ci.name);
    }
  }
  return { dropped };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "halima";
  if (!uri) throw new Error("MONGODB_URI is not set (use --env-file=.env.local).");
  const action = process.argv.includes("--apply") ? "apply" : process.argv.includes("--rollback") ? "rollback" : "check";
  const target = `${dbName}.products`;
  if (action !== "check" && process.env.CONFIRM_INDEX_MIGRATION !== target) {
    throw new Error(`Refusing to ${action}: set CONFIRM_INDEX_MIGRATION=${target} to confirm the target collection.`);
  }

  const client = await new MongoClient(uri).connect();
  try {
    const products = client.db(dbName).collection("products");
    const result =
      action === "apply" ? await applyCaseInsensitiveUniqueIndexes(products)
      : action === "rollback" ? await rollbackCaseInsensitiveUniqueIndexes(products)
      : await checkCaseInsensitiveUniqueness(products);
    console.log(JSON.stringify({ target, action, ...result }, null, 2));
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
