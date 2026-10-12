/**
 * Import the approved catalogue — create-only, every product as a hidden DRAFT.
 *
 *   # read-only dry run (default)
 *   node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/import-approved-catalogue.mjs <approved.json>
 *
 *   # write — requires BOTH --confirm and a matching confirmation value
 *   CONFIRM_CATALOGUE_IMPORT=<db>.products:<record count> \
 *     node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/import-approved-catalogue.mjs <approved.json> --confirm
 *
 * Uses importSafeCatalogueRecords: conflicts are re-checked against MongoDB immediately
 * before writing, only records still safe are inserted (insertMany, ordered:false), and
 * existing products are never updated, replaced or merged. Re-running is safe: already
 * imported records are skipped as existing SKUs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--confirm");
  const file = args[0];
  const confirm = process.argv.includes("--confirm");
  if (!file) throw new Error("usage: scripts/import-approved-catalogue.mjs <approved.json> [--confirm]");

  const { parseCatalogueJson, runCatalogueDryRun } = await import("@/lib/catalogue-dry-run");
  const { importSafeCatalogueRecords } = await import("@/lib/catalogue-import");
  const { getMongoClient, getMongoDb } = await import("@/lib/mongodb");

  const raw = readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.selection?.basis) throw new Error("This file has no approval selection metadata — use halima-products-import.approved.json.");
  const { meta, records } = parseCatalogueJson(raw);
  const target = `${(await getMongoDb()).databaseName}.products`;

  try {
    if (!confirm) {
      const report = await runCatalogueDryRun(records, { fileName: file, meta });
      console.log(JSON.stringify({ mode: "dry run (no writes)", target, ...report.summary, databaseUnchanged: report.database.unchanged }, null, 1));
      console.log(`To import, set CONFIRM_CATALOGUE_IMPORT=${target}:${records.length} and add --confirm.`);
      return;
    }
    const expected = `${target}:${records.length}`;
    if (process.env.CONFIRM_CATALOGUE_IMPORT !== expected) {
      throw new Error(`Refusing to import: set CONFIRM_CATALOGUE_IMPORT=${expected} to confirm the target and record count.`);
    }
    const { check, write } = await importSafeCatalogueRecords(records, { fileName: file, confirm: true });
    const result = {
      target, attempted: records.length,
      inserted: write.inserted.length, rejectedAtWrite: write.rejected.length,
      skippedBeforeWrite: records.length - check.summary.safeToImport,
      status: "all inserted products are drafts (hidden from the shop and checkout)",
    };
    const out = process.env.IMPORT_RESULT_PATH || `${file.replace(/\.json$/, "")}.import-result-${Date.now()}.json`;
    writeFileSync(out, JSON.stringify({ ...result, rejected: write.rejected, skipped: check.rows.filter((r) => r.group !== "SAFE_TO_IMPORT") }, null, 2));
    console.log(JSON.stringify(result, null, 1));
    console.log(`Details: ${out}`);
  } finally {
    try {
      const client = await getMongoClient();
      await client.close();
    } catch {
      // ignore close errors so original error is preserved
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
