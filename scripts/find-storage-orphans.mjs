/**
 * Finds product images in Supabase Storage that no product references (e.g. an upload whose
 * product update failed, or an image removed while the clean-up could not run).
 *
 *   # report only (default)
 *   node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/find-storage-orphans.mjs
 *
 *   # delete orphans older than 24 hours — requires --delete and a matching confirmation value
 *   CONFIRM_ORPHAN_DELETE=<bucket>:<count> node --env-file=.env.local --import ./tests/support/register-ts.mjs \
 *     scripts/find-storage-orphans.mjs --delete
 *
 * Only keys this app generates are considered. Each candidate is re-checked against MongoDB
 * immediately before it is deleted. R2 is never touched.
 */
import { pathToFileURL } from "node:url";

const MIN_AGE_MS = 24 * 60 * 60 * 1000; // never delete an upload that may still be in progress

async function main() {
  const doDelete = process.argv.includes("--delete");
  const { getSupabaseStorageConfig, listSupabaseObjects, createSupabaseStore } = await import("@/lib/supabase-storage");
  const { isValidImageKey, publicUrlForKey } = await import("@/lib/r2");
  const { getMongoClient, getMongoDb } = await import("@/lib/mongodb");
  const cfg = getSupabaseStorageConfig();
  if (!cfg.ok) throw new Error(`Supabase Storage is not configured: ${[...cfg.missing, ...cfg.invalid].join(", ")}`);
  const { config } = cfg;
  try {
    const db = await getMongoDb();
    const objects = (await listSupabaseObjects(config)).filter((o) => isValidImageKey(o.key));
    const referenced = new Set((await db.collection("products").distinct("images")).filter((u) => typeof u === "string"));
    const now = Date.now();
    const orphans = objects.filter((o) => !referenced.has(publicUrlForKey(config.publicBaseUrl, o.key)));
    const old = orphans.filter((o) => o.createdAt && now - Date.parse(o.createdAt) > MIN_AGE_MS);
    console.log(JSON.stringify({ bucket: config.bucket, objects: objects.length, unreferenced: orphans.length, olderThan24h: old.length }, null, 1));
    for (const o of orphans) console.log(`${old.includes(o) ? "ORPHAN" : "RECENT"}  ${o.key}  ${o.size} bytes  ${o.createdAt}`);
    if (!doDelete) {
      console.log(`Report only. To delete, set CONFIRM_ORPHAN_DELETE=${config.bucket}:${old.length} and add --delete.`);
      return;
    }
    if (process.env.CONFIRM_ORPHAN_DELETE !== `${config.bucket}:${old.length}`) {
      throw new Error(`Refusing to delete: set CONFIRM_ORPHAN_DELETE=${config.bucket}:${old.length}.`);
    }
    const store = createSupabaseStore(config);
    let deleted = 0;
    for (const o of old) {
      const url = publicUrlForKey(config.publicBaseUrl, o.key);
      if (await db.collection("products").countDocuments({ images: url })) continue; // referenced meanwhile
      await store.delete(o.key);
      deleted++;
    }
    console.log(JSON.stringify({ deleted }));
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
