/**
 * JSON catalogue import — the WRITE step, kept apart from the read-only dry run.
 *
 * Not exposed through any route or button yet. When it is, it must be its own
 * confirmed Admin action. Guarantees:
 *   - conflicts are re-checked against the live collection immediately before writing;
 *   - only records still classified SAFE_TO_IMPORT are written;
 *   - writes are insert-only (insertMany, ordered: false) — never update/replace/upsert;
 *   - a record that races with another import is rejected by the unique sku/slug
 *     indexes and reported, never merged;
 *   - every inserted product is a draft — hidden until an admin publishes it.
 */
import { runCatalogueDryRun, type DryRunReport } from "@/lib/catalogue-dry-run";
import {
  buildProductDocument,
  insertProductsWithoutOverwrite,
  type InsertWithoutOverwriteResult,
} from "@/lib/repositories/products";

export interface CatalogueImportResult {
  check: DryRunReport;
  write: InsertWithoutOverwriteResult;
}

export async function importSafeCatalogueRecords(
  records: unknown[],
  options: { fileName: string; confirm: boolean }
): Promise<CatalogueImportResult> {
  if (options.confirm !== true) throw new Error("Catalogue import requires explicit confirmation.");

  const check = await runCatalogueDryRun(records, { fileName: options.fileName });
  if (!check.database.unchanged) {
    throw new Error("The catalogue changed while it was being checked. Nothing was imported — run the check again.");
  }

  let generated = 0;
  const docs = check.rows
    .filter((row) => row.group === "SAFE_TO_IMPORT")
    .map((row) => {
      const raw = records[row.recordNumber - 1] as Record<string, unknown>;
      const doc = buildProductDocument({
        id: (raw.id as string) || undefined,
        slug: raw.slug as string,
        sku: raw.sku as string,
        name: raw.name as string,
        brand: raw.brand as string,
        model: raw.model as string,
        category: row.storeCategory, // resolved store category, never the raw supplier label
        subcategory: raw.subcategory as string | undefined,
        description: raw.description as string | undefined,
        specifications: raw.specifications as Record<string, string> | undefined,
        price: raw.price as number,
        inStock: raw.inStock as boolean | undefined,
        stockCount: raw.stockCount as number,
        featured: raw.featured as boolean | undefined,
        deliveryRate: raw.deliveryRate as number | undefined,
      });
      // Keep the file's own values instead of the Add Product conveniences: no placeholder
      // image or boilerplate feature is written into the record (the storefront already
      // falls back to the placeholder image on display).
      doc.images = Array.isArray(raw.images) ? (raw.images as string[]) : [];
      doc.features = Array.isArray(raw.features) ? (raw.features as string[]) : [];
      if (!raw.id) doc.id = `p-${Date.now()}-${++generated}`; // unique even within one millisecond
      // Imports never publish: every product starts as a draft (hidden from the shop and checkout)
      // until an admin adds a price and images and publishes it from Edit Product.
      doc.status = "draft";
      const now = new Date();
      doc.createdAt = now;
      doc.updatedAt = now;
      return doc;
    });

  const write = await insertProductsWithoutOverwrite(docs);
  return { check, write };
}
