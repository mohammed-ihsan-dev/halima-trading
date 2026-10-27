/**
 * Audit log of external images imported into image storage (`product_image_imports`). One record per import action:
 * source URL, the URL after redirects, storage key, content hash and the admin.
 * Not product data — products keep their `images: string[]` field.
 */
import type { Collection } from "mongodb";
import { getMongoDb } from "@/lib/mongodb";
import type { ImageImportRecord } from "@/lib/external-image-import";

export const IMPORT_COLLECTION = "product_image_imports";
let indexes: Promise<unknown> | null = null;

async function collection(): Promise<Collection<ImageImportRecord>> {
  const col = (await getMongoDb()).collection<ImageImportRecord>(IMPORT_COLLECTION);
  indexes ??= col.createIndexes([{ key: { productRef: 1, sourceUrl: 1, importedAt: -1 } }, { key: { sha256: 1 } }]).catch(() => { indexes = null; });
  await indexes;
  return col;
}

export async function recordImageImport(rec: ImageImportRecord): Promise<void> {
  await (await collection()).insertOne({ ...rec });
}

/** The most recent import of this source URL into this product folder. */
export async function findPreviousImageImport(q: { sourceUrl: string; productRef: string }) {
  const doc = await (await collection()).find({ sourceUrl: q.sourceUrl, productRef: q.productRef }, { projection: { _id: 0, storageKey: 1, publicUrl: 1 } }).sort({ importedAt: -1 }).limit(1).next();
  return doc ? { storageKey: doc.storageKey, publicUrl: doc.publicUrl } : null;
}
