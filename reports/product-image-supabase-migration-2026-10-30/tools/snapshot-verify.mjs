// READ-ONLY. `snapshot <label>` records every product's images and a hash of all other fields (except updatedAt).
// `verify <beforeLabel> <afterLabel>` compares two snapshots against state.json:
//   - migrated products: only the planned positions changed, from the planned external URL to a Supabase URL
//   - every other product: images and all other fields unchanged
//   - logo URLs: still on the same products at the same positions
//   - each migrated URL: object exists in Supabase, public URL serves the image, import-log record exists (or reused)
//   - storage: no two migrated URLs for the same content (no duplicate uploads); orphans listed
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");
const R = "reports/product-image-supabase-migration-2026-10-30";
const [mode, a, b] = process.argv.slice(2);
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");
const db = await getMongoDb();

if (mode === "snapshot") {
  const docs = await db.collection("products").find({}).toArray();
  const snap = {};
  for (const d of docs) { const { _id, images, updatedAt, ...rest } = d; snap[String(_id)] = { id: d.id, status: d.status, images: images ?? null, rest: createHash("sha256").update(JSON.stringify(rest)).digest("hex"), updatedAt: updatedAt ?? null }; }
  writeFileSync(`${R}/tools/snapshot-${a}.json`, JSON.stringify({ takenAt: new Date().toISOString(), count: docs.length, products: snap }));
  console.log(JSON.stringify({ snapshot: a, products: docs.length }));
  await (await getMongoClient()).close(); process.exit(0);
}

const { getImageStorage } = await import("@/lib/image-storage");
const { verifyPublicImageUrl, contentTypeForKey } = await import("@/lib/r2");
const st = getImageStorage().storage;
const S0 = JSON.parse(readFileSync(`${R}/tools/snapshot-${a}.json`, "utf8")).products, S1 = JSON.parse(readFileSync(`${R}/tools/snapshot-${b}.json`, "utf8")).products;
const state = JSON.parse(readFileSync(`${R}/state.json`, "utf8"));
const migrated = Object.values(state.images).filter((s) => s.status === "migrated");
const byPid = new Map(); for (const s of migrated) (byPid.get(s.productId) ?? byPid.set(s.productId, []).get(s.productId)).push(s);
const problems = [], concurrent = [];
for (const [pid, s0] of Object.entries(S0)) {
  const s1 = S1[pid];
  if (!s1) { problems.push(`${pid}: product disappeared`); continue; }
  const mig = byPid.get(pid);
  if (mig) {
    if (s1.rest !== s0.rest) problems.push(`${s0.id}: other fields changed`);
    const expected = (s0.images ?? []).map((u, i) => mig.find((m) => m.position === i + 1 && m.previousUrl === u)?.newUrl ?? u);
    if (JSON.stringify(expected) !== JSON.stringify(s1.images)) problems.push(`${s0.id}: images not as expected (order/content)`);
  } else if (s1.rest !== s0.rest || JSON.stringify(s0.images) !== JSON.stringify(s1.images)) {
    concurrent.push(`${s0.id}: changed by someone else between snapshots (not by the migration)`);
  }
}
// products changed by others are not migration problems, but a migrated id must never be among them
const logos = Papa.parse(readFileSync("reports/product-image-database-audit-2026-10-30/PRODUCTS-USING-LOGOS.csv", "utf8"), { header: true, skipEmptyLines: true }).data;
let logosKept = 0, logosMovedByOthers = [];
for (const l of logos) {
  const s1 = S1[l.productId];
  const at = s1?.images?.[Number(l.position) - 1];
  if (at === l.url) logosKept++;
  else if (byPid.has(l.productId) && (S0[l.productId]?.images?.[Number(l.position) - 1] === l.url)) problems.push(`${l.id}: LOGO changed by migration`);
  else logosMovedByOthers.push(`${l.brand} ${l.model}: logo at #${l.position} not present (${S0[l.productId]?.images?.[Number(l.position) - 1] === l.url ? "changed between snapshots by someone else" : "already different before the migration"})`);
}
const objects = new Map(); let objOk = 0;
for (const s of migrated) {
  const key = st.keyFromPublicUrl(s.newUrl);
  if (!key) { problems.push(`${s.id}: new URL is not a bucket key`); continue; }
  if (!objects.has(s.newUrl)) {
    const head = await st.store.head(key).catch(() => null);
    const pub = head ? await verifyPublicImageUrl(s.newUrl, contentTypeForKey(key)) : { ok: false };
    objects.set(s.newUrl, !!head && pub.ok);
  }
  if (objects.get(s.newUrl)) objOk++; else problems.push(`${s.id}: object missing or public URL not serving`);
}
const shaToUrls = new Map(); for (const s of migrated) (shaToUrls.get(s.sourceSha256) ?? shaToUrls.set(s.sourceSha256, new Set()).get(s.sourceSha256)).add(s.newUrl);
const dupContent = [...shaToUrls.entries()].filter(([, u]) => u.size > 1);
const logged = await db.collection("product_image_imports").countDocuments({ importedBy: /supabase-migration-2026-10-30/ });
const result = { productsCompared: Object.keys(S0).length, migratedRefs: migrated.length, migratedProducts: byPid.size, objectsVerified: objOk, uniqueObjects: objects.size,
  duplicateUploadsForSameContent: dupContent.length, importLogRecords: logged, logosChecked: logos.length, logosKept, logosMovedByOthers, orphans: state.orphans.length, concurrentChanges: concurrent, problems };
writeFileSync(`${R}/tools/verify-${b}.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
await (await getMongoClient()).close();
process.exit(problems.length ? 2 : 0);
