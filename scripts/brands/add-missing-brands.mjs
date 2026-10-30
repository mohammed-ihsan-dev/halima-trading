// Adds the Brands-page brands (data/brand-showcase.ts) that are missing from the MongoDB `brands` collection.
// Existing records are matched by slug and by name (case-, space- and punctuation-insensitive) and are never changed;
// only missing ones are inserted, in the collection's existing shape { id: "brand-<slug>", slug, name, createdAt,
// updatedAt }. Inserts are upserts on slug with $setOnInsert, so reruns change nothing. Products are not touched.
// Dry run by default; --execute writes.
// Run: node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/brands/add-missing-brands.mjs [--execute]
const EXECUTE = process.argv.includes("--execute");
const { brandShowcase } = await import("@/data/brand-showcase");
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const db = await getMongoDb();
const col = db.collection("brands");
const existing = await col.find({}, { projection: { _id: 0, id: 1, slug: 1, name: 1 } }).toArray();
const bySlug = new Map(existing.map((b) => [b.slug, b]));
const byName = new Map(existing.map((b) => [norm(b.name), b]));

const present = [], added = [];
for (const b of brandShowcase) {
  const match = bySlug.get(b.slug) ?? byName.get(norm(b.name));
  if (match) { present.push({ brand: b.name, record: match.id }); continue; }
  const now = new Date();
  const doc = { id: `brand-${b.slug}`, slug: b.slug, name: b.name, createdAt: now, updatedAt: now };
  if (EXECUTE) {
    const res = await col.updateOne({ slug: b.slug }, { $setOnInsert: doc }, { upsert: true });
    added.push({ brand: b.name, id: doc.id, inserted: res.upsertedCount === 1 });
  } else added.push({ brand: b.name, id: doc.id, inserted: "dry-run" });
}
const after = await col.countDocuments();
const dupSlugs = await col.aggregate([{ $group: { _id: "$slug", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
const names = (await col.find({}, { projection: { _id: 0, name: 1 } }).toArray()).map((d) => norm(d.name));
console.log(JSON.stringify({ mode: EXECUTE ? "execute" : "dry-run", showcase: brandShowcase.length, before: existing.length, after, present, added,
  duplicateSlugs: dupSlugs.length, duplicateNames: names.length - new Set(names).size }, null, 1));
await (await getMongoClient()).close();
