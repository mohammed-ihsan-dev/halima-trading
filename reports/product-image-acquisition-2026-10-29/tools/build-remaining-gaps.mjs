// Remaining image gaps after import batch 01 (no network, no database). Combines the audit classification, the batch
// results and the follow-up search (Samsung gallery images, sibling/variant official pages). Writes REMAINING-GAPS.csv,
// NEXT-BATCH-CANDIDATES.csv and REMAINING-GAPS.md.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Papa = require("papaparse");
const R = "reports/product-image-acquisition-2026-10-29";
const csv = (p) => Papa.parse(readFileSync(p, "utf8"), { header: true, skipEmptyLines: true }).data;
const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const writeCsv = (n, rows, cols) => writeFileSync(`${R}/${n}`, [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");

const status = csv(`${R}/PRODUCT-IMAGE-STATUS.csv`);
const cands = csv(`${R}/IMAGE-CANDIDATE-MATCHES.csv`);
const done = new Map(Object.values(JSON.parse(readFileSync(`${R}/import-batch-01/state.json`, "utf8"))).map((s) => [s.productId, s]));
const SAMSUNG = { // follow-up search: exact model folder on Samsung's official image server + the official UAE page (viewed)
  "DV90CGC2A0ABGU": "https://images.samsung.com/is/image/samsung/p6pim/ae/dv90cgc2a0abgu/gallery/ae-dv5000c-dv90cgc2a0abgu-546264081",
  "WW11BB944DGBGU": "https://images.samsung.com/is/image/samsung/p6pim/ae/ww11bb944dgbgu/gallery/ae-ww9400b-458631-ww11bb944dgbgu-536407303",
  "WW70T3020WW / GU": "https://images.samsung.com/is/image/samsung/p6pim/ae/ww70t3020ww-gu/gallery/ae-front-loading-washer-ww90t3040bwah-ww70t3020ww-gu-369966072",
  "WW90TA046AE / GU": "https://images.samsung.com/is/image/samsung/p6pim/ae/ww90ta046ae-gu/gallery/ae-front-loading-washer-ww80ta046aeef-379586-ww90ta046ae-gu-403519792",
};
const VARIANTS = { // official page exists only for a sibling / variant code → never automatic
  "HD100-A5979S8U1": "https://www.haier.com/ae/washing-machines/hd100-a5979su1.shtml (HD100-A5979SU1 — possibly the same unit; confirm)",
  "HCF-590S": "https://www.haier.com/ae/freezers/hcf-590v.shtml (HCF-590V — different suffix; confirm)",
  "HSU-18/24LPA03": "haier.com/ae/air-conditioners/hsu-18lpa03r2-t3t4-.shtml (record combines two models)",
  "HCR6060GC2": "only sibling cookers HCR6060GT1/GT2/ET1 on haier.com/ae",
};
const remaining = [], next = [];
for (const s of status.filter((r) => r.needsImage === "true")) {
  const d = done.get(s.productId);
  if (d?.result === "imported") continue;
  let cls = s.classification, best = s.bestCandidate, src = s.bestSource, ev = s.bestEvidence, note = d?.result === "skipped" ? `batch 01 skipped: ${d.reason}` : "";
  if (SAMSUNG[s.model]) { cls = "verified exact match"; best = SAMSUNG[s.model]; src = "official manufacturer image server (samsung.com/ae gallery)"; ev = "exact model in the official asset path and on the official UAE page; 1920x1280 PNG; viewed — correct product type"; note = "audit candidate was the Samsung logo (og:image); replaced by the gallery image"; }
  if (VARIANTS[s.model]) { cls = "likely match"; best = VARIANTS[s.model]; src = "official manufacturer page (variant code)"; ev = "official page for a sibling/variant code — needs confirmation"; }
  const row = { productId: s.productId, id: s.id, brand: s.brand, model: s.model, name: s.name, status: s.status, imageStatus: s.imageStatus, inReplacementQueue: s.importedFrom ? "yes" : "", importedFrom: s.importedFrom,
    classification: cls, bestSource: src, bestCandidate: best, evidence: ev, rights: "owner-confirmed permission (2026-10-29)", note };
  remaining.push(row);
  if (cls === "verified exact match" || cls === "likely match") next.push({ ...row, action: cls === "verified exact match" ? "ready for the next import batch" : "visual confirmation required before import" });
}
writeCsv("REMAINING-GAPS.csv", remaining, ["productId", "id", "brand", "model", "name", "status", "imageStatus", "inReplacementQueue", "importedFrom", "classification", "bestSource", "bestCandidate", "evidence", "rights", "note"]);
writeCsv("NEXT-BATCH-CANDIDATES.csv", next, ["productId", "id", "brand", "model", "classification", "action", "bestSource", "bestCandidate", "evidence", "note"]);
const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const byBrand = Object.entries(count(remaining, (r) => r.brand)).sort((a, b) => b[1] - a[1]);
const byClass = count(remaining, (r) => r.classification);
const queue = remaining.filter((r) => r.inReplacementQueue);
const L = [
  `# Remaining image gaps after import batch 01 (2026-10-29)`, ``,
  `- **Before batch 01:** ${status.filter((r) => r.needsImage === "true").length} products needed an image.`,
  `- **Batch 01:** imported ${[...done.values()].filter((d) => d.result === "imported").length}.`,
  `- **Still needing an image:** **${remaining.length}**, including **${queue.length}** in the thumbnail/logo replacement queue (originally 57; 4 were replaced in batch 01).`, ``,
  `| Classification | Products |`, `|---|---|`, ...Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), ``,
  `## Ready for the next batch: ${next.filter((n) => n.classification === "verified exact match").length} verified exact matches`, ``,
  `The Samsung audit candidates were the Samsung logo, which the page's og:image points to. The follow-up search found each model's official gallery photo on images.samsung.com, in a folder named by the exact model. All were viewed and are 1920×1280. These are listed in \`NEXT-BATCH-CANDIDATES.csv\`, and the batch script can import them the same way as batch 01.`, ``,
  `## Needs a person to confirm: ${next.filter((n) => n.classification === "likely match").length} likely matches`, ``,
  `- **LG \`.UUAE\` / \`.UUAE2\` models:** the official page shows the base model.`,
  `- **Haier variant codes:** HD100-A5979SU1 vs S8U1, and HCF-590V vs S.`,
  `- **Catalogue crops and local files.**`, ``,
  `These are not imported automatically.`, ``,
  `## No freely accessible exact source (${byClass["no candidate found"] ?? 0})`, ``,
  `| Brand | Remaining |`, `|---|---|`, ...byBrand.map(([b, n]) => `| ${b} | ${n} |`), ``,
  `This run searched these sources:`,
  `- all 25 PDFs, using exact-model crops (only 4 exact crops, all under 400 px);`,
  `- official sitemaps for Haier, LG, Samsung, O General and Simfer;`,
  `- sitemap checks for Midea, TCL, Indesit, Panasonic, Mitsubishi Electric and Whirlpool (none, 404 or 403);`,
  `- web searches for sample models of every brand with gaps.`, ``,
  `For Midea (the largest gap), Westpoint and Clivet, no official model pages exist. The only images online are retailer listings, and the rules say not to use those as product images. An image pack named by model, from whoever supplies these products, can be loaded with the pipeline's \`--local-candidates\` source in one step.`, ``,
  `## Replacement queue (${queue.length})`, ``,
  `These products show an image that was imported from a Google search thumbnail or a logo site. A verified replacement exists for the Samsung products listed above. The rest have no exact-model source yet.`, ``,
  `| Brand | In queue |`, `|---|---|`, ...Object.entries(count(queue, (r) => r.brand)).sort((a, b) => b[1] - a[1]).map(([b, n]) => `| ${b} | ${n} |`), ``,
];
writeFileSync(`${R}/REMAINING-GAPS.md`, L.join("\n") + "\n");
console.log(JSON.stringify({ remaining: remaining.length, queue: queue.length, byClass, nextVerified: next.filter((n) => n.classification === "verified exact match").length, nextLikely: next.filter((n) => n.classification === "likely match").length }));
