// Writes reports/product-image-pilot/local-candidates.json (the pipeline's `--local-candidates=` format) from the pilot
// manifest: supplied files in catalogues-source/ that decoded and were not ruled out. Prepared files under work/ already
// reach the pipeline through its reviewed manifests, so they are not repeated here. Read-only apart from that one file.
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "reports/product-image-pilot";
const manifest = JSON.parse(readFileSync(`${OUT}/pilot-manifest.json`, "utf8"));
const products = {};
for (const p of manifest.products) {
  const files = p.candidates.filter((c) => c.kind === "local-file" && c.path?.startsWith("catalogues-source/") && c.validation === "valid" && c.reviewBucket !== "no-suitable-candidate");
  if (files.length) products[p.pipelineProductId] = files.map((c) => ({ file: c.path, sourceType: "supplied product photo (catalogues-source)", sourcePage: c.path, matchEvidence: c.evidence }));
}
writeFileSync(`${OUT}/local-candidates.json`, JSON.stringify({ generatedAt: new Date().toISOString(), from: `${OUT}/pilot-manifest.json`, products }, null, 1) + "\n");
console.log(JSON.stringify({ products: Object.keys(products).length, files: Object.values(products).flat().length }));
