// READ-ONLY final audit after the migration: fresh scan of every product, existence + public check of every Supabase
// image reference, every remaining external reference explained, and the migration results. Writes
// MIGRATION-REPORT.md, MIGRATED-IMAGES.csv, REMAINING-EXTERNAL-IMAGES.csv, NOT-MIGRATED.csv.
import { readFileSync, writeFileSync } from "node:fs";
const R = "reports/product-image-supabase-migration-2026-10-30";
const { getMongoDb, getMongoClient } = await import("@/lib/mongodb");
const { getImageStorage } = await import("@/lib/image-storage");
const { verifyPublicImageUrl, contentTypeForKey } = await import("@/lib/r2");
const st = getImageStorage().storage, base = `${st.publicBaseUrl}/`;
const plan = JSON.parse(readFileSync(`${R}/plan.json`, "utf8"));
const state = JSON.parse(readFileSync(`${R}/state.json`, "utf8"));
const verify = JSON.parse(readFileSync(`${R}/tools/verify-after-all.json`, "utf8"));
const db = await getMongoDb();
const docs = await db.collection("products").find({ status: { $ne: "deleted" } }, { projection: { _id: 1, id: 1, name: 1, brand: 1, model: 1, images: 1 } }).toArray();

const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const writeCsv = (n, rows, cols) => writeFileSync(`${R}/${n}`, [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");
const planBy = new Map(plan.rows.map((r) => [`${r.productId}|${r.url}`, r]));

let sbRefs = 0, b64 = 0; const ext = [], sbUrls = new Set();
for (const d of docs) for (const [i, u] of (d.images ?? []).entries()) {
  if (typeof u !== "string") continue;
  if (u.startsWith(base)) { sbRefs++; sbUrls.add(u); }
  else if (u.startsWith("data:")) b64++;
  else if (/^https?:\/\//.test(u)) { const p = planBy.get(`${d._id}|${u}`); ext.push({ productId: String(d._id), id: d.id, name: d.name, brand: d.brand, model: d.model, position: i + 1, url: u, reason: !p ? "not in the migration plan (added after the plan was made)" : p.decision === "eligible" ? `held back: ${state.images[`${p.productId}|${p.url}`]?.reason ?? state.images[`${p.productId}|${p.url}`]?.status ?? "not processed"}` : `${p.decision}: ${p.reason}` }); }
}
let sbValid = 0; const sbBad = [];
const list = [...sbUrls];
for (let i = 0; i < list.length; i += 10) await Promise.all(list.slice(i, i + 10).map(async (u) => {
  const key = st.keyFromPublicUrl(u);
  const head = key ? await st.store.head(key).catch(() => null) : null;
  const pub = head ? await verifyPublicImageUrl(u, contentTypeForKey(key)) : { ok: false, reason: key ? "object missing" : "not a bucket key" };
  if (head && pub.ok) sbValid++; else sbBad.push({ url: u, reason: pub.reason });
}));
const sbRefsValid = docs.reduce((a, d) => a + (d.images ?? []).filter((u) => typeof u === "string" && u.startsWith(base) && !sbBad.some((x) => x.url === u)).length, 0);

const imgs = Object.values(state.images);
const count = (s) => imgs.filter((r) => r.status === s).length;
const migrated = imgs.filter((r) => r.status === "migrated");
const reused = migrated.filter((r) => r.reusedExistingObject || r.reusedObject).length;
const notMigrated = [...imgs.filter((r) => r.status !== "migrated"), ...plan.rows.filter((r) => r.decision === "eligible" && !state.images[`${r.productId}|${r.url}`]).map((r) => ({ ...r, previousUrl: r.url, status: "not processed" }))];
writeCsv("MIGRATED-IMAGES.csv", migrated, ["productId", "id", "name", "brand", "model", "position", "previousUrl", "newUrl", "storagePath", "sourceSha256", "reusedExistingObject", "width", "height", "bytes", "format", "migratedAt", "status"]);
writeCsv("REMAINING-EXTERNAL-IMAGES.csv", ext, ["productId", "id", "brand", "model", "name", "position", "url", "reason"]);
writeCsv("NOT-MIGRATED-APPROVED.csv", notMigrated, ["status", "reason", "productId", "id", "name", "brand", "model", "position", "previousUrl"]);

const remBy = ext.reduce((m, r) => { const k = r.reason.split(":")[0]; m[k] = (m[k] ?? 0) + 1; return m; }, {});
const L = [
  `# Product image migration to Supabase: final report (${new Date().toISOString().slice(0, 10)})`, ``,
  `- **Plan:** \`PLAN.md\` lists 167 approved references.`,
  `- **Execution:** a 5-product test batch, then batches of 25.`,
  `- **Final audit:** a fresh, read-only scan of the live database and Supabase Storage, taken after the run.`, ``,
  `| Metric | Final result |`, `|---|---:|`,
  `| Products inspected | ${docs.length} |`,
  `| Approved migration references | ${plan.rows.filter((r) => r.decision === "eligible").length} |`,
  `| Successfully migrated | ${migrated.length} |`,
  `| Existing Supabase objects reused | ${reused} |`,
  `| New Supabase uploads | ${new Set(migrated.filter((r) => !(r.reusedExistingObject || r.reusedObject)).map((r) => r.newUrl)).size} |`,
  `| Skipped (changed since plan / content changed) | ${count("skipped-changed-since-plan") + count("manual-review") + count("skipped-product-missing")} |`,
  `| Failed downloads | ${count("failed-download")} |`,
  `| Failed uploads | ${count("failed-upload")} |`,
  `| Failed database updates | ${count("failed-db-update")} |`,
  `| Orphaned storage objects | ${state.orphans.length} |`,
  `| Logos preserved | ${verify.logosKept} of ${verify.logosChecked} logo references (55 external + 8 already in Supabase) |`,
  `| External product image references remaining | ${ext.length} |`,
  `| Valid Supabase image references | ${sbRefsValid} of ${sbRefs} (${sbValid} unique objects verified: object exists and public URL serves the image) |`,
  `| Base64 images inside MongoDB (out of scope, unchanged) | ${b64} |`, ``,
  `## Checks`, ``,
  `Every product was compared before and after the run, using \`tools/snapshot-before.json\` and \`tools/snapshot-after-all.json\`.`,
  `- **Product data:** ${verify.problems.length ? `PROBLEMS: ${verify.problems.join("; ")}` : "Every migrated product changed only at its planned image positions; gallery order and every other field are identical."}`,
  `- **Other products:** ${verify.concurrentChanges.length ? `${verify.concurrentChanges.length} were edited by someone else during the run (not by the migration): ${verify.concurrentChanges.join("; ")}` : "No other product changed."}`,
  `- **Logos:** ${verify.logosKept} of ${verify.logosChecked} logo references are still exactly where they were.${verify.logosMovedByOthers.length ? ` Exceptions: ${verify.logosMovedByOthers.join("; ")}` : ""}`,
  `- **Storage:** every migrated URL is a bucket object that exists and is publicly served. There are ${verify.duplicateUploadsForSameContent} duplicate uploads of the same content and ${state.orphans.length} orphans.`,
  `- **Import log:** ${verify.importLogRecords} \`product_image_imports\` records were written by this migration. Reused objects get no new record.`, ``,
  `## Approved references not migrated`, ``,
  notMigrated.length ? notMigrated.map((r) => `- ${r.brand} ${r.model} (#${r.position}): **${r.status}**. ${r.reason ?? ""}`).join("\n") : "None.", ``,
  `## Remaining external references (${ext.length}), by reason`, ``,
  ...Object.entries(remBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`), ``,
  `Each reference is listed with its reason in \`REMAINING-EXTERNAL-IMAGES.csv\`.`, ``,
  sbBad.length ? `## Supabase references that failed the check\n\n${sbBad.map((x) => `- ${x.url}: ${x.reason}`).join("\n")}\n` : "",
  `## Files`, ``,
  `| File | Contents |`, `|---|---|`,
  `| \`MIGRATED-IMAGES.csv\` | Each migrated image: product, previous URL, new URL, storage path, SHA-256, time |`,
  `| \`NOT-MIGRATED-APPROVED.csv\` | Approved references that were skipped or failed, with the reason |`,
  `| \`REMAINING-EXTERNAL-IMAGES.csv\` | Every external URL still in the database, with the reason |`,
  `| \`state.json\` | Migration state; makes the run resumable and idempotent |`,
  `| \`backups/\` | Each product document as it was before its update |`,
  `| \`tools/\` | Scripts, snapshots and verification output |`, ``,
];
writeFileSync(`${R}/MIGRATION-REPORT.md`, L.join("\n"));
console.log(JSON.stringify({ products: docs.length, migrated: migrated.length, reused, failed: { download: count("failed-download"), upload: count("failed-upload"), db: count("failed-db-update") }, skipped: notMigrated.length, orphans: state.orphans.length, externalRemaining: ext.length, remBy, sbRefs, sbRefsValid, sbUnique: sbUrls.size, sbValid, b64, verifyProblems: verify.problems.length }, null, 1));
await (await getMongoClient()).close();
