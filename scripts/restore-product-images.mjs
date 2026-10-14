/**
 * Roll back a Bulk Image Upload: restore each product's previous images from the manifest JSON
 * the Bulk Image Upload page exports.
 *
 *   # dry run (default) — shows what would be restored
 *   node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/restore-product-images.mjs <manifest.json>
 *
 *   # restore — requires --confirm and a matching confirmation value
 *   CONFIRM_IMAGE_RESTORE=<db>.products:<count> node --env-file=.env.local --import ./tests/support/register-ts.mjs \
 *     scripts/restore-product-images.mjs <manifest.json> --confirm
 *
 * Only rows with status "done" are considered, and a product is restored only if its images are
 * still exactly what the upload set (so later edits are never undone). Only `images` and
 * `updatedAt` change. Uploaded objects are left in storage; scripts/find-storage-orphans.mjs
 * finds and removes them once nothing references them.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const confirm = process.argv.includes("--confirm");
  if (!file) throw new Error("usage: scripts/restore-product-images.mjs <manifest.json> [--confirm]");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  const rows = (manifest.rows ?? []).filter((r) => r.status === "done" && r.productId && Array.isArray(r.previousImages) && Array.isArray(r.newImages));

  const { getMongoClient, getMongoDb } = await import("@/lib/mongodb");
  const { setProductImagesIfUnchanged } = await import("@/lib/repositories/products");
  const db = await getMongoDb();
  const target = `${db.databaseName}.products`;
  try {
    const plan = [];
    for (const r of rows) {
      const doc = await db.collection("products").findOne({ id: r.productId }, { projection: { images: 1 } });
      const current = Array.isArray(doc?.images) ? doc.images : [];
      plan.push({ ...r, restorable: !!doc && JSON.stringify(current) === JSON.stringify(r.newImages) });
    }
    const restorable = plan.filter((p) => p.restorable);
    console.log(JSON.stringify({ target, doneRows: rows.length, restorable: restorable.length, changedSince: plan.length - restorable.length }, null, 1));
    for (const p of plan) console.log(`${p.restorable ? "RESTORE" : "SKIP (changed since upload)"}  ${p.productId}  ${p.model}`);
    if (!confirm) {
      console.log(`Dry run only. To restore, set CONFIRM_IMAGE_RESTORE=${target}:${restorable.length} and add --confirm.`);
      return;
    }
    const expected = `${target}:${restorable.length}`;
    if (process.env.CONFIRM_IMAGE_RESTORE !== expected) throw new Error(`Refusing to restore: set CONFIRM_IMAGE_RESTORE=${expected}.`);
    let restored = 0;
    for (const p of restorable) {
      const res = await setProductImagesIfUnchanged(p.productId, p.newImages, p.previousImages);
      if (res && res !== "changed") restored++;
      else console.log(`not restored (changed meanwhile): ${p.productId}`);
    }
    console.log(JSON.stringify({ restored }));
  } finally {
    await (await getMongoClient()).close().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
