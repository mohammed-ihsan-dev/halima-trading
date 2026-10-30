// Read-only: confirms each imported product's images in MongoDB, the storage object, and the live product page.
import { readFileSync } from "node:fs";
const R = "reports/product-image-acquisition-2026-10-29";
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");
const { getImageStorage } = await import("@/lib/image-storage");
const st = Object.values(JSON.parse(readFileSync(`${R}/import-batch-01/state.json`, "utf8"))).filter((s) => s.result === "imported");
const db = await getMongoDb(); const storage = getImageStorage().storage;
let dbOk = 0, objOk = 0, live = 0, liveChecked = 0;
for (const s of st) {
  const d = await db.collection("products").findOne({ id: s.id }, { projection: { images: 1, slug: 1 } });
  if (JSON.stringify(d.images) === JSON.stringify(s.after) && d.images.includes(s.url)) dbOk++;
  const h = await storage.store.head(s.key); if (h && h.size === s.bytes) objOk++;
  const html = await fetch(`https://halimatrading.com/shop/${d.slug}`, { cache: "no-store" }).then((r) => r.text()).catch(() => "");
  liveChecked++; if (html.includes(s.url)) live++;
}
await (await getMongoClient()).close();
console.log(JSON.stringify({ imported: st.length, mongoImagesMatch: dbOk, storageObjectsMatch: objOk, livePagesShowingNewImage: live, liveChecked }));
