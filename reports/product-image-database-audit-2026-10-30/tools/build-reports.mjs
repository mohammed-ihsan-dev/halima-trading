// Phase 2–7: classify every product from its PRIMARY image (images[0], what the storefront shows) and write the
// deliverables. Pure local computation over: the fresh baseline (MongoDB read + URL checks), the visual manifest
// (downloaded bytes + content stats), the Supabase object verification, and the visual decisions taken from the sheets.
// No network, no database.
import { readFileSync, writeFileSync } from "node:fs";

const A = "reports/product-image-database-audit-2026-10-30";
const inv = JSON.parse(readFileSync(`${A}/tools/baseline/product-image-inventory.json`, "utf8")).products;
const manifest = JSON.parse(readFileSync(`${A}/tools/cache/visual-manifest.json`, "utf8"));
const sbv = JSON.parse(readFileSync(`${A}/tools/cache/supabase-verify.json`, "utf8"));
const dec = JSON.parse(readFileSync(`${A}/tools/visual-decisions.json`, "utf8"));
const sheets = JSON.parse(readFileSync(`${A}/tools/cache/sheets.json`, "utf8"));
const sheetOf = new Map(sheets.flatMap((s) => s.codes.map((c) => [c, s.file])));

const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const writeCsv = (n, rows, cols) => writeFileSync(`${A}/${n}`, [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// ---- source classification -------------------------------------------------------------------------------------
const MANUFACTURER = /(^|\.)(lg\.com|haier\.com|haierlebanon\.com|samsung\.com|supergeneral\.com|symphonylimited\.com|ogeneralac\.com|o-general\.com|midea\.com|carriermideaindia\.com|geepas\.com|simferglobal\.com|panasonic\.scene7\.com|globalbluestar\.com|digitalassets-cdn\.thron\.com|indesituk\.vtexassets\.com|skilltechonline\.com|genralline\.com|gratusworld\.com)$/;
const SEARCH_OR_LOGO = /(^|\.)(gstatic\.com|seeklogo\.com|logos-world\.net|freebiesupply\.com|vectorstock\.com|googleusercontent\.com)$/;
const OTHER = /(^|\.)(cloudfront\.net|vercel-storage\.com|website-files\.com|i0\.wp\.com|botanve\.co|amplience\.net)$/;
const hostOf = (u) => { try { return new URL(u).host; } catch { return ""; } };
const sourceClass = (host) => !host ? "unknown" : SEARCH_OR_LOGO.test(host) ? "other host — image search / logo library" : MANUFACTURER.test(host) ? "manufacturer" : OTHER.test(host) ? "other host" : "retailer / third-party shop";

// ---- per image ------------------------------------------------------------------------------------------------------
const mByRef = new Map(); // productId|index -> manifest row
for (const m of manifest) mByRef.set(`${m.productId}|${m.imageIndex}`, m);
const decLogo = dec.logo, decBroken = dec.brokenLogo, decBad = dec.unsuitable;

function judgeImage(p, im, idx) {
  const m = mByRef.get(`${p.productId}|${idx}`) ?? {};
  const code = m.code ?? "";
  const w = m.width ?? im.width, h = m.height ?? im.height;
  const host = im.storageType === "external-url" ? hostOf(im.ref) : im.storageType === "supabase" ? hostOf(im.ref) : "";
  const origin = m.importedFrom || (im.storageType === "external-url" ? host : "");
  const broken = im.result !== "accessible" || !m.sha256;
  const r = { code, sheet: sheetOf.get(code) ?? "", width: w, height: h, host, origin, broken, verdict: "A", reason: "", confidence: "confirmed", logoType: "" };
  if (broken) { r.verdict = "E"; r.reason = `${im.result}${im.httpStatus ? ` (HTTP ${im.httpStatus})` : ""}`; if (decBroken[code]) r.logoType = decBroken[code]; return r; }
  if (decLogo[code]) { r.verdict = "C"; r.logoType = decLogo[code]; r.reason = "brand logo / icon instead of a product photo (viewed)"; return r; }
  const reasons = [];
  if (decBad[code]) { reasons.push(decBad[code][1]); r.confidence = decBad[code][0]; }
  if ((im.flags ?? []).includes("google-search-thumbnail")) reasons.push("Google search thumbnail (external link)");
  if (/gstatic|seeklogo/.test(m.importedFrom ?? "")) reasons.push(`imported into Supabase from ${m.importedFrom} (search thumbnail)`);
  if (w && h && Math.max(w, h) < 400) reasons.push(`low resolution ${w}x${h}`);
  if (reasons.length) { r.verdict = "F"; r.reason = reasons.join("; "); if (!decBad[code]) r.confidence = "confirmed"; }
  return r;
}

const CAT = { A: "Suitable", B: "No Image", C: "Logo Only", D: "Placeholder / Generic", E: "Broken", F: "Low-Quality / Unsuitable" };
const products = inv.map((p) => {
  const imgs = p.images.map((im, i) => ({ im, j: judgeImage(p, im, i) }));
  const primary = imgs[0];
  const verdict = primary ? primary.j.verdict : "B";
  const galleryIssues = imgs.slice(1).filter((x) => x.j.verdict !== "A").map((x) => `#${x.im === undefined ? "" : imgs.indexOf(x) + 1} ${CAT[x.j.verdict]}: ${x.j.reason || x.j.logoType}`);
  const betterLater = verdict !== "A" && imgs.slice(1).some((x) => x.j.verdict === "A");
  const dupRefs = p.images.length !== new Set(p.images.map((i) => i.ref)).size;
  return { p, imgs, primary, verdict, category: CAT[verdict], galleryIssues, betterLater, dupRefs,
    primaryStorage: primary ? primary.im.storageType : "none", primarySource: primary ? (primary.im.storageType === "supabase" ? "supabase" : primary.im.storageType === "mongodb-base64" ? "base64 in MongoDB" : sourceClass(primary.j.host)) : "none" };
});

// ---- reconciliation ------------------------------------------------------------------------------------------------
const total = products.length;
const byCat = Object.fromEntries(Object.keys(CAT).map((k) => [k, products.filter((x) => x.verdict === k).length]));
const sumCats = Object.values(byCat).reduce((a, b) => a + b, 0);
const brands = [...new Set(products.map((x) => x.p.brand))].sort((a, b) => a.localeCompare(b));
const brandRows = brands.map((b) => {
  const xs = products.filter((x) => x.p.brand === b), n = (k) => xs.filter((x) => x.verdict === k).length;
  return { brand: b, total: xs.length, active: xs.filter((x) => x.p.status === "active").length, draft: xs.filter((x) => x.p.status !== "active").length,
    suitable: n("A"), missing: n("B"), logo: n("C"), placeholder: n("D"), broken: n("E"), lowQuality: n("F"),
    supabase: xs.filter((x) => x.primaryStorage === "supabase").length, external: xs.filter((x) => x.primaryStorage === "external-url").length,
    base64: xs.filter((x) => x.primaryStorage === "mongodb-base64").length, coveragePct: pct(n("A"), xs.length),
    problems: xs.length - n("A") };
});
const checks = {
  categoriesSumToTotal: sumCats === total,
  brandTotalsSumToTotal: brandRows.reduce((a, r) => a + r.total, 0) === total,
  brandCategorySumsMatch: brandRows.every((r) => r.suitable + r.missing + r.logo + r.placeholder + r.broken + r.lowQuality === r.total),
  everyProductOnce: new Set(products.map((x) => x.p.productId)).size === total,
  storageSplitMatches: brandRows.reduce((a, r) => a + r.supabase + r.external + r.base64, 0) + byCat.B === total,
  allImagesOnSheets: manifest.every((m) => sheetOf.has(m.code)),
  supabaseAllVerified: Object.values(sbv).every((v) => v.status === "verified"),
};
if (!Object.values(checks).every(Boolean)) { console.error("RECONCILIATION FAILED", checks); process.exit(1); }

// ---- CSVs ----------------------------------------------------------------------------------------------------------
const base = (x) => ({ productId: x.p.productId, id: x.p.id, sku: x.p.sku, name: x.p.name, brand: x.p.brand, model: x.p.model, category: x.p.category, status: x.p.status });
writeCsv("PRODUCT-IMAGE-CLASSIFICATION.csv", products.map((x) => ({ ...base(x), code: x.primary?.j.code.replace(/[a-z]$/, "") ?? "", primaryCategory: `${x.verdict}. ${x.category}`, reason: x.primary?.j.reason || x.primary?.j.logoType || "",
  confidence: x.verdict === "A" || x.verdict === "B" ? "" : x.primary.j.confidence, imageCount: x.p.images.length, primaryUrl: x.primary?.im.ref.slice(0, 300) ?? "", primaryStorage: x.primaryStorage, primarySource: x.primarySource,
  importedFrom: x.primary?.j.origin && x.primaryStorage === "supabase" ? x.primary.j.origin : "", width: x.primary?.j.width ?? "", height: x.primary?.j.height ?? "", betterImageLaterInGallery: x.betterLater ? "yes" : "",
  galleryIssues: x.galleryIssues.join(" | "), contactSheet: x.primary?.j.sheet ?? "" })),
  ["productId", "id", "sku", "brand", "model", "name", "category", "status", "code", "primaryCategory", "reason", "confidence", "imageCount", "primaryStorage", "primarySource", "importedFrom", "width", "height", "betterImageLaterInGallery", "galleryIssues", "primaryUrl", "contactSheet"]);

writeCsv("BRAND-WISE-IMAGE-REPORT.csv", brandRows, ["brand", "total", "active", "draft", "suitable", "missing", "logo", "placeholder", "broken", "lowQuality", "supabase", "external", "base64", "coveragePct"]);
writeCsv("PRODUCTS-WITHOUT-IMAGES.csv", products.filter((x) => x.verdict === "B").map(base), ["productId", "id", "name", "brand", "model", "sku", "category", "status"]);

const logoRows = [];
for (const x of products) for (const [i, { im, j }] of x.imgs.entries()) if (j.logoType) logoRows.push({ ...base(x), position: i + 1, isPrimary: i === 0 ? "yes" : "no", url: im.ref, logoType: j.logoType, storage: im.storageType, primaryCategory: `${x.verdict}. ${x.category}`, code: j.code, contactSheet: j.sheet });
writeCsv("PRODUCTS-USING-LOGOS.csv", logoRows, ["productId", "id", "name", "brand", "model", "sku", "status", "url", "logoType", "storage", "position", "isPrimary", "primaryCategory", "code", "contactSheet"]);

const brokenRows = [];
for (const x of products) for (const [i, { im, j }] of x.imgs.entries()) if (j.verdict === "E") brokenRows.push({ ...base(x), position: i + 1, isPrimary: i === 0 ? "yes" : "no", url: im.ref, result: im.result, httpStatus: im.httpStatus ?? "", domain: j.host, note: j.logoType });
writeCsv("PRODUCTS-WITH-BROKEN-IMAGES.csv", brokenRows, ["productId", "id", "name", "brand", "model", "sku", "status", "url", "domain", "result", "httpStatus", "position", "isPrimary", "note"]);

const lqRows = [];
for (const x of products) for (const [i, { im, j }] of x.imgs.entries()) if (j.verdict === "F") lqRows.push({ ...base(x), position: i + 1, isPrimary: i === 0 ? "yes" : "no", url: im.ref.slice(0, 300), storage: im.storageType, width: j.width ?? "", height: j.height ?? "", reason: j.reason, confidence: j.confidence, primaryCategory: `${x.verdict}. ${x.category}`, code: j.code, contactSheet: j.sheet });
writeCsv("PRODUCTS-WITH-LOW-QUALITY-IMAGES.csv", lqRows, ["productId", "id", "name", "brand", "model", "sku", "status", "isPrimary", "position", "reason", "confidence", "width", "height", "storage", "url", "primaryCategory", "code", "contactSheet"]);

const srcRows = [];
for (const x of products) for (const [i, { im, j }] of x.imgs.entries()) {
  const v = im.storageType === "supabase" ? sbv[im.ref] : null;
  srcRows.push({ productId: x.p.productId, id: x.p.id, brand: x.p.brand, model: x.p.model, position: i + 1, url: im.storageType === "mongodb-base64" ? `${im.ref.slice(0, 40)}… (inline base64)` : im.ref,
    domain: j.host || (im.storageType === "mongodb-base64" ? "(inline in MongoDB)" : ""), storage: im.storageType === "supabase" ? "supabase" : im.storageType === "external-url" ? "external" : "base64 in MongoDB",
    sourceType: im.storageType === "supabase" ? "supabase" : im.storageType === "mongodb-base64" ? "inline (MongoDB)" : j.broken ? "unknown / inaccessible" : sourceClass(j.host),
    originalSource: im.storageType === "supabase" ? (j.origin || "direct upload (no import record)") : "", originalSourceType: im.storageType === "supabase" && j.origin ? sourceClass(j.origin) : "",
    httpResult: im.result, httpStatus: im.httpStatus ?? "", redirected: im.redirected ? "yes" : "", contentType: im.contentType ?? "",
    objectVerification: v ? `${v.status}: ${v.objectSize} B ${v.objectContentType}; bytes match ${v.sizeMatches ? "yes" : "no"}; type match ${v.typeMatches ? "yes" : "no"}` : "",
    storageKey: v?.key ?? "", width: j.width ?? "", height: j.height ?? "", verdict: CAT[j.verdict] });
}
writeCsv("PRODUCT-IMAGE-SOURCE-REPORT.csv", srcRows, ["productId", "id", "brand", "model", "position", "url", "domain", "storage", "sourceType", "originalSource", "originalSourceType", "httpResult", "httpStatus", "redirected", "contentType", "objectVerification", "storageKey", "width", "height", "verdict"]);

// ---- numbers for the markdown --------------------------------------------------------------------------------------
const refs = srcRows.length, uniqRefs = new Set(products.flatMap((x) => x.p.images.map((i) => i.ref))).size;
const st = (k) => srcRows.filter((r) => r.storage === k).length;
const srcType = srcRows.reduce((m, r) => ((m[r.sourceType] = (m[r.sourceType] ?? 0) + 1), m), {});
const sbOrigin = srcRows.filter((r) => r.storage === "supabase").reduce((m, r) => { const k = r.originalSourceType || "direct upload (no import record)"; m[k] = (m[k] ?? 0) + 1; return m; }, {});
const WRONG = /wrong brand|another brand|other brand|stock photo|generic, distorted/;
const fReasons = { thumb: 0, small: 0, wrong: 0, other: 0 };
const wrongBy = {};
for (const x of products.filter((y) => y.verdict === "F" && WRONG.test(y.primary.j.reason))) wrongBy[x.p.brand] = (wrongBy[x.p.brand] ?? 0) + 1;
const thumbSb = srcRows.filter((r) => r.storage === "supabase" && /gstatic/.test(r.originalSource)).length;
const imgDist = products.reduce((m, x) => ((m[x.p.images.length] = (m[x.p.images.length] ?? 0) + 1), m), {});
const galleryBy = Object.entries(products.filter((x) => x.galleryIssues.length).reduce((m, x) => ((m[x.p.brand] = (m[x.p.brand] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(", ");
for (const x of products.filter((y) => y.verdict === "F")) { const r = x.primary.j.reason; if (WRONG.test(r)) fReasons.wrong++; else if (/thumbnail/.test(r)) fReasons.thumb++; else if (/low resolution/.test(r)) fReasons.small++; else fReasons.other++; }
const fNeeds = products.filter((x) => x.verdict === "F" && x.primary.j.confidence === "needs-confirmation").length;
const logoPrim = products.filter((x) => x.verdict === "C");
const logoTypes = logoPrim.reduce((m, x) => { const t = /seeklogo/.test(x.primary.j.logoType) ? "logo library (seeklogo / logos-world / freebiesupply / VectorStock)" : /freebiesupply|VectorStock|logos-world/.test(x.primary.j.logoType) ? "logo library (seeklogo / logos-world / freebiesupply / VectorStock)" : /Google thumbnail/.test(x.primary.j.logoType) ? "Google search thumbnail of the logo" : /Supabase/.test(x.primary.j.logoType) ? "logo stored in our Supabase bucket" : /Google Play/.test(x.primary.j.logoType) ? "app icon (Google Play)" : "manufacturer site logo"; m[t] = (m[t] ?? 0) + 1; return m; }, {});
const logoSupabase = logoPrim.filter((x) => x.primaryStorage === "supabase").length;
const top10 = [...brandRows].sort((a, b) => b.problems - a.problems || a.coveragePct - b.coveragePct).slice(0, 10);
const active = products.filter((x) => x.p.status === "active"), activeA = active.filter((x) => x.verdict === "A").length;
const primStorage = { supabase: products.filter((x) => x.primaryStorage === "supabase").length, external: products.filter((x) => x.primaryStorage === "external-url").length, base64: products.filter((x) => x.primaryStorage === "mongodb-base64").length };
const multi = products.filter((x) => x.p.images.length > 1).length, single = products.filter((x) => x.p.images.length === 1).length;
const maxImgs = Math.max(...products.map((x) => x.p.images.length));
const sharedProducts = inv.filter((p) => (p.sharedImageWithProductIds ?? []).length).length;
const galleryProblemProducts = products.filter((x) => x.galleryIssues.length).length;
const betterLater = products.filter((x) => x.betterLater);
const variants = [["O General", "O GENERAL"], ["Bosch", "BOSCH"]].map(([a, b]) => `"${a}" (${brandRows.find((r) => r.brand === a)?.total ?? 0}) and "${b}" (${brandRows.find((r) => r.brand === b)?.total ?? 0})`);
const sumA = (k) => brandRows.reduce((a, r) => a + r[k], 0);
const rowsMd = (rows) => rows.map((r) => `| ${r.brand} | ${r.total} | ${r.suitable} | ${r.missing} | ${r.logo} | ${r.broken} | ${r.lowQuality} | ${r.coveragePct}% |`).join("\n");
const sbVerified = Object.values(sbv).filter((v) => v.status === "verified").length;
const extRefs = srcRows.filter((r) => r.storage === "external"), extBroken = extRefs.filter((r) => r.httpResult !== "accessible").length;
const extRedirect = extRefs.filter((r) => r.redirected).length;
const N = { total, active: active.length, draft: total - active.length, brands: brands.length, byCat, refs, uniqRefs };
writeFileSync(`${A}/tools/cache/summary-numbers.json`, JSON.stringify({ N, checks, fReasons, fNeeds, logoTypes, logoSupabase, primStorage, srcType, sbOrigin, top10, multi, single, maxImgs, sharedProducts, galleryProblemProducts, betterLater: betterLater.length, sbVerified, extBroken, extRedirect, logoRows: logoRows.length, lqRows: lqRows.length, brokenRows: brokenRows.length }, null, 1));

// ---- EXECUTIVE-SUMMARY.md --------------------------------------------------------------------------------------------
const L = (...a) => a.join("\n");
writeFileSync(`${A}/EXECUTIVE-SUMMARY.md`, L(
  `# Product image audit: current database (2026-10-30)`, ``,
  `This was a **read-only** audit:`,
  `- MongoDB was only read.`,
  `- Supabase was only read, using metadata lookups.`,
  `- Nothing was uploaded, replaced, deleted, committed or deployed.`,
  ``,
  `All figures come from a fresh read of the production \`products\` collection and a fresh check of every image reference on 2026-10-30. No earlier audit numbers were reused.`, ``,
  `## Totals`, ``,
  `| | Count |`, `|---|---|`,
  `| Products | **${total}** (${active.length} active, ${total - active.length} draft) |`,
  `| Brands, as written in the database | **${brands.length}**. Two spelling pairs: ${variants.join(", ")}. Not merged. |`,
  `| Image references | ${refs} (${uniqRefs} unique URLs) |`,
  `| Image-array length (products) | ${Object.entries(imgDist).map(([k, v]) => `${k}: ${v}`).join(" · ")} |`,
  `| Products with 1 image | ${single} |`,
  `| Products with 2 or more images | ${multi} (maximum ${maxImgs}) |`,
  `| Products with no image | ${byCat.B} |`, ``,
  `## Primary image classification`, ``,
  `Every product is counted once, by its **first image**, which is the one the storefront and listings show.`, ``,
  `| Category | Products | % |`, `|---|---|---|`,
  ...Object.entries(CAT).map(([k, v]) => `| ${k}. ${v} | **${byCat[k]}** | ${pct(byCat[k], total)}% |`),
  `| **Total** | **${sumCats}** | 100% |`, ``,
  `Active products only: ${activeA} of ${active.length} (${pct(activeA, active.length)}%) have a suitable image.`, ``,
  `**Low-Quality / Unsuitable (${byCat.F}) breaks down as:**`,
  `- **${fReasons.thumb}** Google search thumbnails. Some are linked directly; others were imported into Supabase, where they look like our own files.`,
  `- **${fReasons.small}** images under 400 px.`,
  `- **${fReasons.wrong}** show **another brand's product, a stock photo or a generic graphic**: ${Object.entries(wrongBy).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(", ")}.`,
  `- **${fReasons.other}** other: watermarked composites, baked-in transparency checkerboards, a product lost in the frame.`,
  ``,
  `${fNeeds} of these need a person to confirm; they are marked \`needs-confirmation\`.`, ``,
  `**Logo Only (${byCat.C}):** ${Object.entries(logoTypes).map(([k, v]) => `${v} ${k}`).join("; ")}. ${logoSupabase} of these logos are files in our own Supabase bucket: 4 Pro General uploads, plus 2 Haier and 2 Midea imports. A URL or size check alone would not flag them; the Pro General logos are 2000×2000.`, ``,
  `**Broken (${byCat.E}):** the General Line freezers link to the General Line logo on genralline.com, which now returns HTTP 403.`, ``,
  `**Placeholder / Generic (${byCat.D}):** no generic placeholder image was found in the database. The storefront's display fallback is not stored on products.`, ``,
  `## Brands with the most problems`, ``,
  `| Brand | Total | Suitable | No image | Logo | Broken | Low quality | Suitable % |`, `|---|---|---|---|---|---|---|---|`,
  rowsMd(top10), ``,
  `The full table is in \`BRAND-WISE-IMAGE-REPORT.csv\`.`, ``,
  `## Storage`, ``,
  `| | Supabase | External URL | Base64 inside MongoDB | No image |`, `|---|---|---|---|---|`,
  `| Products, by primary image | ${primStorage.supabase} | ${primStorage.external} | ${primStorage.base64} | ${byCat.B} |`,
  `| Image references | ${st("supabase")} | ${st("external")} | ${st("base64 in MongoDB")} | — |`, ``,
  `- **Supabase:** all **${sbVerified}** unique objects exist. The stored size and content type match the bytes served at the URL held in MongoDB, and every key follows the bucket's naming rule.`,
  `  - Where they came from: ${Object.entries(sbOrigin).map(([k, v]) => `${v} ${k}`).join(", ")}, based on the \`product_image_imports\` log.`,
  `  - **Being in Supabase does not make an image suitable.** It holds ${thumbSb} references imported from Google thumbnails, ${logoSupabase} logos used as primary images, and several wrong-brand photos.`,
  `- **External:** ${extRefs.length} references. ${extBroken} are broken (HTTP 403) and ${extRedirect} redirects were recorded.`,
  `  - Sources: ${["manufacturer", "retailer / third-party shop", "other host — image search / logo library", "other host"].map((k) => `${srcType[k] ?? 0} ${k}`).join(", ")}.`,
  `  - A retailer image depends on someone else's site staying up, and its usage rights are unknown.`, ``,
  `## Recommendation`, ``,
  `Replace images in this order. Details are in \`RECOMMENDED-IMAGE-REPLACEMENT-PRIORITY.md\`.`,
  `1. **Wrong-brand, stock or generic images (${fReasons.wrong}).** These are the most harmful: they show a competitor's product, and Nikai is entirely affected.`,
  `2. **Logos and broken links (${byCat.C + byCat.E}).** They are highly visible. Haier, Toshiba, Gree and Simfer publish official product pages (exact-model availability was not re-checked in this audit).`,
  `3. **Products with no image (${byCat.B}).** Mostly Midea.`,
  `4. **Google thumbnails and images under 400 px (${fReasons.thumb + fReasons.small}).** Swap each for an official ≥ 800 px image, Midea, Westpoint, Mazaya and Clivet first.`, ``,
  `Nothing has been changed. Each batch needs your approval.`, ``,
  `## Files`, ``,
  `| File | Contents |`, `|---|---|`,
  `| \`PRODUCT-IMAGE-CLASSIFICATION.csv\` | One row per product (${total}): category, reason, confidence, source, gallery issues, contact-sheet cell |`,
  `| \`BRAND-WISE-IMAGE-REPORT.csv\` | Per brand: counts per category, storage, coverage % |`,
  `| \`PRODUCTS-WITHOUT-IMAGES.csv\` | ${byCat.B} products |`,
  `| \`PRODUCTS-USING-LOGOS.csv\` | ${logoRows.length} logo references (primary and gallery), plus the 6 broken General Line logo links |`,
  `| \`PRODUCTS-WITH-BROKEN-IMAGES.csv\` | ${brokenRows.length} broken references |`,
  `| \`PRODUCTS-WITH-LOW-QUALITY-IMAGES.csv\` | ${lqRows.length} references (primary and gallery), each with its reason and confidence |`,
  `| \`PRODUCT-IMAGE-SOURCE-REPORT.csv\` | One row per image reference (${refs}): domain, source type, original import source, HTTP result, Supabase object check |`,
  `| \`IMAGE-AUDIT-CONTACT-SHEETS/\` | ${sheets.length} sheets grouped by brand; see its README |`,
  `| \`DATA-QUALITY-FINDINGS.md\` | Issues beyond image suitability |`,
  `| \`RECOMMENDED-IMAGE-REPLACEMENT-PRIORITY.md\` | What to fix first and where to get images |`,
  `| \`tools/\` | The scripts used and their raw outputs; all can be re-run read-only |`, ``,
  `## Reconciliation`, ``,
  ...Object.entries(checks).map(([k, v]) => `- ${v ? "✅" : "❌"} ${k}`), ``,
) + "\n");

// ---- DATA-QUALITY-FINDINGS.md ----------------------------------------------------------------------------------------
const base64P = products.filter((x) => x.p.images.some((i) => i.storageType === "mongodb-base64"));
const nikai = brandRows.find((r) => r.brand === "Nikai");
const draftNoImg = products.filter((x) => x.verdict === "B" && x.p.status !== "active").length;
const clivetDesc = products.filter((x) => x.p.brand === "Clivet" && /ton/.test(String(x.p.model))).length;
const dupInProduct = products.filter((x) => x.dupRefs);
writeFileSync(`${A}/DATA-QUALITY-FINDINGS.md`, L(
  `# Data-quality findings (2026-10-30)`, ``,
  `These findings come from the same read-only data as the image audit. None of them was fixed.`, ``,
  `## 1. Wrong-brand product images (${fReasons.wrong} products)`, ``,
  `Every Nikai product (${nikai.total} of ${nikai.total}) shows another manufacturer's unit, a stock photo or a generic graphic. The brands shown include Blue Star, Voltas, Samsung, Panasonic, LG, Haier, O General, Cruise and Gratus, and one image carries a Dreamstime watermark. The images come from IndiaMART (imimg.com), TradeIndia (tistatic.com) and similar listing sites.`, ``,
  `Other wrong-brand images:`,
  `- **Krome:** KR-SAC18IM (Carrier), KR-FAC483PR-IN+OD (Voltas), KR-AR24MT3 and KR-AR30MT3 (Mitsubishi Electric).`,
  `- **TCL:** TAC-24CWAU/UJETI (Super General), TAC-30CSD/ZGI (Whirlpool).`,
  `- **Super General:** SGS316AE (Gree).`,
  `- **Clivet:** 8.5-ton-package-ac (Carrier).`,
  `- **Aftron:** AF-W-1860BX/CX (Hisense).`,
  ``,
  `A customer sees a competitor's logo on our product, so these are the most damaging images in the catalogue.`, ``,
  `## 2. Thumbnails and logos copied into Supabase`, ``,
  `${thumbSb} Supabase image references were imported from \`encrypted-tbn0.gstatic.com\`, which is a Google Images thumbnail.`,
  `- Several of these are brand logos: two Haier images imported from seeklogo.com, two Midea images imported from Google thumbnails, and four Pro General logos uploaded at 2000×2000.`,
  `- Inside our bucket they look like first-party files, and many pass the 400 px size rule. Only the import log (\`product_image_imports.sourceUrl\`) or a visual check reveals them.`, ``,
  `## 3. Images stored as base64 inside MongoDB (${base64P.length} products)`, ``,
  `${base64P.map((x) => `${x.p.brand} ${x.p.model}`).join(", ")}.`,
  ``,
  `The pictures are fine, but storing them inside the database makes the documents larger and every product query slower. They should be moved to Supabase in a separate, approved change.`, ``,
  `## 4. Brand spelling variants`, ``,
  `${variants.join(" and ")} are listed as separate brands. As a result, brand filters and brand pages split these products. They were not merged in this audit.`, ``,
  `## 5. Model field holds a description (Clivet, ${clivetDesc} products)`, ``,
  `Clivet records use descriptions such as \`5-ton-scroll-floor-stand-ac\` instead of manufacturer model codes. Exact-model image matching is impossible until the real codes are recorded.`, ``,
  `## 6. Same image on many products (${sharedProducts} products share at least one image URL with another product)`, ``,
  `Sharing is acceptable for colour or size variants of one unit. It is wrong when the shared file is a logo: the Daewoo, Gree, Westpoint, General Line and Pro General logo files are each reused across several products.`,
  ``,
  `${dupInProduct.length ? `${dupInProduct.length} products list the same URL twice in their own gallery.` : "No product lists the same URL twice in its own gallery."}`, ``,
  `## 7. Gallery (secondary image) issues: ${galleryProblemProducts} products`, ``,
  `- **Weak second image:** some products have a good primary image but a Google thumbnail as their second image (by brand: ${galleryBy}); see \`galleryIssues\` in \`PRODUCT-IMAGE-CLASSIFICATION.csv\`.`,
  `- **Better image further down:** ${betterLater.length ? `in ${betterLater.length} products a suitable image exists later in the gallery while the primary is unsuitable: ${betterLater.map((x) => `${x.p.brand} ${x.p.model}`).join(", ")}. Reordering would fix them at no cost.` : "no product has a suitable image hidden behind an unsuitable primary."}`, ``,
  `## 8. Undersized supplier images (Mazaya)`, ``,
  `Most Mazaya photos on Supabase are 150–400 px wide. Their longest side is often just over 400, so many pass, but they look soft on product pages. The ones under 400 px are counted as low quality.`, ``,
  `## 9. Products with no image`, ``,
  `- **Total:** ${byCat.B} products, ${draftNoImg} of them draft. They are mostly Midea (dishwashers, freezers and a hood) and Whirlpool.`, ``,
  `## 10. Rights`, ``,
  `${srcType["retailer / third-party shop"] ?? 0} references link directly to retailer sites, including Amazon, Sharaf DG, Flipkart, IndiaMART, TradeIndia and noon. ${sbOrigin["retailer / third-party shop"] ?? 0} more were copied from retailers into Supabase. The rights for these are unknown, and the files can change or disappear at any time.`, ``,
) + "\n");

// ---- RECOMMENDED-IMAGE-REPLACEMENT-PRIORITY.md -----------------------------------------------------------------------
const prBrand = (pred) => Object.entries(products.filter(pred).reduce((m, x) => ((m[x.p.brand] = (m[x.p.brand] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(", ");
writeFileSync(`${A}/RECOMMENDED-IMAGE-REPLACEMENT-PRIORITY.md`, L(
  `# Recommended image replacement priority`, ``,
  `The order puts customer harm first, then effort. Nothing below has been done; each batch needs approval and should go through the existing importer, which keeps a backup and saves conditionally.`, ``,
  `| # | Fix | Products | Brands | Where to get images |`, `|---|---|---|---|---|`,
  `| 1 | **Wrong-brand, stock or generic images** | ${fReasons.wrong} | ${prBrand((x) => x.verdict === "F" && WRONG.test(x.primary.j.reason))} | Nikai's UAE distributor or nikaigroup.com; Krome, TCL, Super General and Clivet official pages. Until then, removing the wrong image is safer than keeping it. |`,
  `| 2 | **Logo instead of product** | ${byCat.C} | ${prBrand((x) => x.verdict === "C")} | Haier (haier.com/ae), Toshiba, Gree, Simfer and Daewoo publish official product pages; exact-model availability was not re-checked in this audit. Westpoint, Pro General, Mazaya, Phoenix and Akai need supplier packs. |`,
  `| 3 | **Broken links** | ${byCat.E} | ${prBrand((x) => x.verdict === "E")} | Ask General Line for product photos. The current link is a logo and returns 403. |`,
  `| 4 | **No image** | ${byCat.B} | ${prBrand((x) => x.verdict === "B")} | Midea UAE media pack; Whirlpool's official DAM (digitalassets-cdn.thron.com already supplies Indesit). |`,
  `| 5 | **Google thumbnails** | ${fReasons.thumb} | ${prBrand((x) => x.verdict === "F" && !WRONG.test(x.primary.j.reason) && /thumbnail/.test(x.primary.j.reason))} | Official manufacturer pages (LG, Haier, Panasonic, Mitsubishi Electric, Indesit) or supplier packs (Midea, Westpoint, Clivet) |`,
  `| 6 | **Under 400 px** | ${fReasons.small} | ${prBrand((x) => x.verdict === "F" && !WRONG.test(x.primary.j.reason) && !/thumbnail/.test(x.primary.j.reason) && /low resolution/.test(x.primary.j.reason))} | Ask Mazaya for originals; Samsung's official gallery (images.samsung.com) |`,
  `| 7 | **Watermarked or defective** | ${fReasons.other} | ${prBrand((x) => x.verdict === "F" && !WRONG.test(x.primary.j.reason) && !/thumbnail|low resolution/.test(x.primary.j.reason))} | Clean official images. O General ARGH composites: check whether ogeneralac.com has plain product images. |`,
  `| 8 | **Gallery clean-up** | ${galleryProblemProducts} | | Remove thumbnails from second positions (LG and others). This is lower priority because the primary image is already fine. |`,
  `| 9 | **Move base64 images to Supabase** | ${base64P.length} | O General | Technical change only; the images themselves are fine. |`, ``,
  `**Fastest wins**`,
  `- Priority 2 for Haier, Toshiba, Gree and Simfer (${products.filter((x) => x.verdict === "C" && ["Haier", "Toshiba", "Gree", "Simfer"].includes(x.p.brand)).length} products), because these brands publish official product pages.`,
  `- The 4 Samsung gallery images found on 2026-10-29 (images.samsung.com, exact model folders) are still not imported. They cover the 4 undersized Samsung washers and dryers.`, ``,
  `**Supplier requests (one email each)**`,
  `- Nikai`,
  `- Midea`,
  `- Westpoint`,
  `- Mazaya`,
  `- Clivet (also ask for the real model codes)`,
  `- General Line`,
  `- Pro General`,
  ``,
  `Together these cover about ${products.filter((x) => x.verdict !== "A" && ["Nikai", "Midea", "Westpoint", "Mazaya", "Clivet", "General Line", "Pro General"].includes(x.p.brand)).length} of the ${total - byCat.A} products that need work.`, ``,
) + "\n");

// ---- contact sheet README ----------------------------------------------------------------------------------------------
writeFileSync(`${A}/IMAGE-AUDIT-CONTACT-SHEETS/README.md`, L(
  `# Contact sheets`, ``,
  `The sheets are grouped by brand as written in the database, and products within a brand are sorted by model. Each sheet holds up to 48 cells.`, ``,
  `**Each cell shows:**`,
  `- **Line 1:** the cell code and the model. Codes are the brand prefix plus the product number; a letter is added for the 2nd and later gallery images.`,
  `- **Line 2:** size and storage, or the automatic warning hints in red.`,
  `- **Line 3:** the source host, or for Supabase files the site the image was imported from.`, ``,
  `A **pink cell** means the image could not be downloaded.`, ``,
  `**\`FLAGGED-*.png\`** sheets show only products whose primary image is not suitable, grouped by verdict (logo, broken, wrong brand / stock / defect, Google thumbnail, under 400 px). The verdict and reason are printed under each image; a red \"CONFIRM:\" label marks a classification that needs a person to check it. They are made by \`../tools/flagged-sheets.mjs\`.`, ``,
  `**Red hints are only pointers, not verdicts.**`,
  `- "flat graphic (logo?)" fires on plain white air-conditioners too.`,
  `- Every verdict was made by looking at the image; see \`../tools/visual-decisions.json\`.`,
  `- \`PRODUCT-IMAGE-CLASSIFICATION.csv\` maps every product to its cell code and sheet.`, ``,
  `**Need a person to confirm** (\`needs-confirmation\` in the CSVs):`,
  ...Object.entries(decBad).filter(([, v]) => v[0] === "needs-confirmation").map(([k, v]) => `- ${k}: ${v[1]}`), ``,
  `| Sheet | Brand | Cells |`, `|---|---|---|`,
  ...sheets.map((s) => `| ${s.file} | ${s.brand} | ${s.codes.length} |`), ``,
) + "\n");

console.log(JSON.stringify({ total, byCat, checks, fReasons, fNeeds, logoTypes, primStorage, logoRows: logoRows.length, lqRows: lqRows.length, brokenRows: brokenRows.length, betterLater: betterLater.map((x) => x.p.brand + " " + x.p.model), top10: top10.map((r) => `${r.brand}:${r.problems}/${r.total}`) }, null, 1));
