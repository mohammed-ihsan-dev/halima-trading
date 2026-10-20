// Catalogue PDF matching: exact model codes, OCR look-alikes, layout association, shared images, crop boundaries,
// resolution, idempotency — plus the PyMuPDF extractor on a generated PDF. No database, network or storage access.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const m = await import("../scripts/product-images/catalogue-match.mjs");

// Synthetic page builders (PDF points, A4).
const line = (text, x, y, { w = 60, hgt = 12, source = "ocr", conf = 1 } = {}) => ({ text, box: [x, y, x + w, y + hgt], source, conf });
const img = (xref, box, { px = 2.8, smask = true, asset = `assets/${xref}.png`, sha = `sha${xref}` } = {}) => ({ xref, box, contentBox: box, width: Math.round((box[2] - box[0]) * px), height: Math.round((box[3] - box[1]) * px), pageFraction: ((box[2] - box[0]) * (box[3] - box[1])) / (595 * 842), onPage: 1, smask, asset, assetSha256: sha });
const page = (n, lines, images) => ({ page: n, width: 595, height: 842, lines, images, previewDpi: 90 });
const P = (id, model) => ({ id, model, brand: "Super General" });

test("model codes: identical and case/space-only matches accepted; punctuation and OCR look-alikes never", () => {
  assert.equal(m.compareModel("SGA18AE", "SGA18AE"), "IDENTICAL");
  assert.equal(m.compareModel("SGW1056N", "SGW 1056N"), "CASE_SPACE");
  assert.equal(m.compareModel("SGST945iTZ", "SGST945ITZ"), "CASE_SPACE");
  assert.equal(m.compareModel("SG-A18AE", "SGA18AE"), "PUNCTUATION");
  assert.equal(m.compareModel("SGBO2SS", "SGB 02 SS"), "OCR_CONFUSABLE", "letter O read for digit 0");
  assert.equal(m.compareModel("SGA25AE", "SGA24AE"), null, "similar codes are different models");
  assert.equal(m.compareModel("SGF444H", "SGF444HE"), null, "no suffix completion");
  assert.equal(m.compareModel("SGF444HM", "SGF444HMEI"), null);
  for (const level of ["PUNCTUATION", "OCR_CONFUSABLE"]) assert.ok(!m.MATCH_ACCEPTED.has(level));
});

test("tokens: whole-token matching only (SGA19 never matches inside SGA19-42AE); OCR-split codes are joined", () => {
  const codes = m.pageModels(page(1, [line("SGA19-42AE", 300, 100), line("SGW 1056N", 300, 200)], [])).map((x) => x.code);
  assert.ok(codes.includes("SGA19-42AE"));
  assert.ok(!codes.includes("SGA19"));
  assert.ok(codes.includes("SGW1056N"), "split by OCR, joined for comparison");
  assert.ok(!m.looksLikeModel("1350x272x365"), "dimensions are not models");
  const phrases = ["Rated T1 capacity", "20L MICROWAVE OVEN", "Rotary T3", "220-240V, 50Hz, 1Ph", "4 Way Swing", "Stuffing (40HC Units)", "ROTARY T3"];
  assert.deepEqual(m.pageModels(page(1, phrases.map((t, i) => line(t, 100, 100 + i * 20)), [])).map((x) => x.code), [], "spec phrases are never joined into codes");
  assert.deepEqual(m.pageModels(page(1, [line("SGCT N90H", 300, 100), line("SG AA 110T5", 300, 140)], [])).map((x) => x.code).sort(), ["SGAA110T5", "SGCTN90H"]);
  assert.ok(!m.looksLikeModel("Specifications"));
});

const layoutPage = () => page(22, [
  line("Window Air Conditioners - Rotary Series", 40, 40, { w: 400, hgt: 20 }),
  line("SGA25AE", 350, 117), line("SGA19AE", 450, 117), line("Specifications", 240, 130),
  line("SGA18AE", 368, 287), line("Specifications", 250, 300),
  line("SGA19-42AE", 364, 456), line("SGA25-42AE", 455, 456),
  line("SGSC137 / SGSC138", 380, 560, { w: 90 }),
], [
  img(1, [12, 117, 244, 268], { sha: "top" }), // photo for SGA25AE + SGA19AE
  img(2, [14, 290, 242, 439], { sha: "mid" }), // photo for SGA18AE alone
  img(3, [22, 452, 252, 520], { sha: "bot" }), // photo for SGA19-42AE + SGA25-42AE
  img(4, [30, 540, 230, 640], { sha: "chiller" }), // photo for the two-code heading
  { ...img(5, [-30, 650, 300, 860], { sha: "kid" }), onPage: 0.8 }, // decoration bleeding off the page
]);

test("layout: a photo belongs to the first heading row below it; multi-model rows and two-code headings are shared", () => {
  const products = [P("a18", "SGA18AE"), P("a25", "SGA25AE"), P("a19", "SGA19AE"), P("sc137", "SGSC137"), P("a1942", "SGA19-42AE")];
  const r = m.matchCatalogue({ pdf: "cat.pdf", pages: [layoutPage()] }, products, new Set(products.map((p) => p.id)));
  const by = (id) => r.candidates.filter((c) => c.productId === id);
  assert.equal(by("a18").length, 1);
  assert.equal(by("a18")[0].identity, "EXACT_UNAMBIGUOUS");
  assert.deepEqual(by("a18")[0].regionImages.map((i) => i.xref), [2], "its own photo, not the neighbour's");
  assert.equal(by("a25")[0].identity, "SHARED_IMAGE");
  assert.deepEqual(by("a25")[0].rowModels.sort(), ["SGA19AE", "SGA25AE"]);
  assert.equal(by("a1942")[0].identity, "SHARED_IMAGE");
  assert.equal(by("sc137")[0].identity, "SHARED_IMAGE", "\"SGSC137 / SGSC138\" is one heading for two models");
  assert.deepEqual(by("sc137")[0].regionImages.map((i) => i.xref), [4]);
  assert.ok(!r.candidates.some((c) => c.regionImages.some((i) => i.xref === 5)), "images bleeding off the page are not product photos");
});

test("layout: ALSO AVAILABLE variants share the photo; several photos in one block need review", () => {
  const pg = page(21, [line("SGST945iTZ", 210, 400), line("ALSO AVAILABLE", 200, 600, { w: 90 }), line("SGST1245iTZ", 540, 640), line("SGST1845iTZ", 790, 640)],
    [img(1, [90, 120, 474, 245]), img(2, [402, 433, 535, 539])]);
  const r = m.matchCatalogue({ pdf: "c.pdf", pages: [pg] }, [P("t945", "SGST945ITZ")], new Set(["t945"]));
  assert.ok(r.candidates.length >= 1);
  assert.ok(r.candidates.every((c) => c.identity === "SHARED_IMAGE"));
  assert.match(r.candidates[0].issues.join(" "), /ALSO AVAILABLE/);
  const two = page(5, [line("SGX1000AB", 300, 400)], [img(1, [40, 100, 280, 300]), img(2, [320, 100, 560, 300])]);
  const r2 = m.matchCatalogue({ pdf: "c.pdf", pages: [two] }, [P("x", "SGX1000AB")], new Set(["x"]));
  assert.equal(r2.candidates.length, 2);
  assert.ok(r2.candidates.every((c) => c.identity === "NEEDS_REVIEW" && !c.eligible));
});

test("shared images: the same asset used for different models anywhere in the catalogue is flagged", () => {
  const p1 = page(1, [line("SGY100AA", 300, 320)], [img(1, [40, 100, 280, 300], { sha: "same" })]);
  const p2 = page(2, [line("SGY200BB", 300, 320)], [img(9, [40, 100, 280, 300], { sha: "same" })]);
  const r = m.matchCatalogue({ pdf: "c.pdf", pages: [p1, p2] }, [P("y1", "SGY100AA"), P("y2", "SGY200BB")], new Set(["y1", "y2"]));
  assert.ok(r.candidates.every((c) => c.identity === "SHARED_IMAGE"));
  assert.match(r.candidates[0].issues.join(" "), /same image used for SGY200BB/);
});

test("crops: never extend into the model's heading row or table; layout text inside a crop blocks eligibility", () => {
  const pg = page(3, [line("SGZ500AE", 100, 300, { w: 80 }), line("Specifications", 100, 320, { w: 80 })], [img(1, [60, 100, 300, 360])]);
  const r = m.matchCatalogue({ pdf: "c.pdf", pages: [pg] }, [P("z", "SGZ500AE")], new Set(["z"]));
  const c = r.candidates[0];
  assert.ok(c.cropBox[3] <= 298, `crop bottom ${c.cropBox[3]} stops above the heading`);
  const pg2 = page(4, [line("SGZ600AE", 400, 300), line("Specifications", 120, 200, { w: 80 })], [img(1, [60, 100, 300, 260])]);
  const c2 = m.matchCatalogue({ pdf: "c.pdf", pages: [pg2] }, [P("z6", "SGZ600AE")], new Set(["z6"])).candidates[0];
  assert.match(c2.issues.join(" "), /crop contains layout text: Specifications/);
  assert.equal(c2.eligible, false);
});

test("resolution: identity and image quality are separate; low-resolution photos are never eligible", () => {
  const pg = page(6, [line("SGQ123AB", 300, 320)], [img(1, [40, 100, 200, 300], { px: 1.39 })]); // ~100 dpi
  const c = m.matchCatalogue({ pdf: "c.pdf", pages: [pg] }, [P("q", "SGQ123AB")], new Set(["q"])).candidates[0];
  assert.equal(c.identity, "EXACT_UNAMBIGUOUS");
  assert.equal(c.quality, "LOW_RESOLUTION");
  assert.equal(c.status, "EXACT_LOW_RESOLUTION");
  assert.equal(c.eligible, false);
  assert.ok(c.renderDpi <= 101, "rendered at the photo's native density, not upsampled");
  const hi = page(6, [line("SGQ123AB", 300, 320)], [img(1, [40, 100, 200, 300], { px: 4 })]);
  const c2 = m.matchCatalogue({ pdf: "c.pdf", pages: [hi] }, [P("q", "SGQ123AB")], new Set(["q"])).candidates[0];
  assert.equal(c2.eligible, true);
  assert.equal(c2.renderDpi, 288);
});

test("report data: missing targets with similar codes, unmatched catalogue models, OCR variants; deterministic output", () => {
  const pg = page(7, [line("SGF444H", 300, 320), line("SGBO2SS", 300, 500), line("SGNEW999", 300, 700)], [img(1, [40, 100, 280, 300])]);
  const products = [P("f", "SGF444HE"), P("b", "SGB 02 SS"), P("other", "SGOTHER1")];
  const idx = { pdf: "c.pdf", pages: [pg] };
  const r = m.matchCatalogue(idx, products, new Set(["f", "b"]));
  assert.equal(r.candidates.length, 0, "nothing matched by approximation");
  assert.deepEqual([...r.missingTargets].sort(), ["b", "f"]);
  assert.ok(r.nearMisses.find((n) => n.productId === "f").similar.includes("SGF444H"));
  assert.ok(r.flags.some((f) => f.type === "possible_ocr_variant" && f.found === "SGBO2SS"));
  assert.ok(r.unmatchedCatalogueModels.includes("SGNEW999"));
  assert.deepEqual(m.matchCatalogue(idx, products, new Set(["f", "b"])), r, "same input → same output (idempotent re-runs)");
});

test("extractor: generated PDF → index with text, image placement and transparency box; crop excludes neighbours", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cat-"));
  // Product photo: red rectangle on a transparent canvas (alpha) → content box must be the red part only.
  const photo = await sharp({ create: { width: 600, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 220, g: 20, b: 20, alpha: 1 } } }).png().toBuffer(), left: 150, top: 100 }]).png().toBuffer();
  const neighbour = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#1040e0" } }).png().toBuffer();
  writeFileSync(path.join(dir, "photo.png"), photo);
  writeFileSync(path.join(dir, "neighbour.png"), neighbour);
  const pdf = path.join(dir, "cat.pdf");
  execFileSync("python3", ["-c", `
import fitz,sys
d=fitz.open();p=d.new_page(width=595,height=842)
p.insert_image(fitz.Rect(50,100,290,260),filename=sys.argv[1]+"/photo.png")
p.insert_text((320,180),"SGT100AA",fontsize=14)
p.insert_image(fitz.Rect(50,420,290,580),filename=sys.argv[1]+"/neighbour.png")
p.insert_text((320,500),"SGT200BB",fontsize=14)
p.insert_text((450,500),"SGT300CC",fontsize=14)
d.save(sys.argv[2])`, dir, pdf]);
  const out = path.join(dir, "out");
  const env = { ...process.env, CATALOGUE_OCR: "0" };
  execFileSync("python3", ["scripts/product-images/catalogue_extract.py", "index", pdf, out], { env });
  const index = JSON.parse(readFileSync(path.join(out, "index.json"), "utf8"));
  assert.equal(index.pageCount, 1);
  const pg = index.pages[0];
  assert.ok(pg.lines.some((l) => l.text === "SGT100AA" && l.source === "native"));
  const ph = pg.images.find((i) => i.smask);
  assert.ok(ph.asset, "original embedded asset kept");
  assert.deepEqual(ph.contentBox.map(Math.round), [110, 140, 230, 220], "visible content from the transparency mask");
  const r = m.matchCatalogue(index, [P("t1", "SGT100AA"), P("t2", "SGT200BB")], new Set(["t1", "t2"]));
  const c1 = r.candidates.find((c) => c.productId === "t1");
  assert.equal(c1.identity, "EXACT_UNAMBIGUOUS");
  assert.equal(c1.cropSource, "embedded-asset");
  assert.equal(r.candidates.find((c) => c.productId === "t2").identity, "SHARED_IMAGE", "two models on one row");
  // Re-running is a no-op (cached by PDF hash).
  assert.match(execFileSync("python3", ["scripts/product-images/catalogue_extract.py", "index", pdf, out], { env }).toString(), /"cached": true/);
  // Rendered crop contains only the product (red), none of the neighbouring photo (blue).
  writeFileSync(path.join(out, "req.json"), JSON.stringify([{ id: "c1", page: 1, box: c1.cropBox, dpi: c1.renderDpi }]));
  execFileSync("python3", ["scripts/product-images/catalogue_extract.py", "crop", pdf, path.join(out, "req.json"), out], { env });
  const { data, info } = await sharp(path.join(out, "crops/c1.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let red = 0, blue = 0;
  for (let i = 0; i < data.length; i += info.channels) { if (data[i] > 180 && data[i + 2] < 80) red++; if (data[i + 2] > 180 && data[i] < 80) blue++; }
  assert.ok(red / (info.width * info.height) > 0.6, "crop is mostly the product");
  assert.equal(blue, 0, "no pixel of the neighbouring photo");
});

test("approval: only exact, unambiguous catalogue matches can be approved; never without authorization", async () => {
  const { approvalProblem } = await import("@/lib/product-image-review");
  const auth = { type: "written_permission", grantedBy: "Super General", reference: "email 2026-10-19 ref SG-1" };
  const cat = (identity) => ({ pdf: "superGeneral.pdf", page: 22, cropBox: [0, 0, 1, 1], cropSource: "page-render", evidenceText: "SGA18AE", matchLevel: "IDENTICAL", identity, quality: "OK", issues: [], rowModels: ["SGA18AE"], preview: "catalogue/super-general/previews/ab.webp", highlight: "catalogue/super-general/highlights/cd.jpg" });
  const review = (identity) => ({ state: "pending_review", candidate: { localPreview: "catalogue/super-general/previews/ab.webp", technicallyValid: true, modelEvidence: "exact", permissionStatus: "permission_pending", catalogue: cat(identity) } });
  assert.equal(approvalProblem(review("EXACT_UNAMBIGUOUS"), { type: "approve", exactModelConfirmed: true, authorization: auth }), null);
  assert.match(approvalProblem(review("SHARED_IMAGE"), { type: "approve", exactModelConfirmed: true, authorization: auth }), /does not identify one model/);
  assert.match(approvalProblem(review("NEEDS_REVIEW"), { type: "approve", exactModelConfirmed: true, authorization: auth }), /does not identify one model/);
  assert.match(approvalProblem(review("EXACT_UNAMBIGUOUS"), { type: "approve", exactModelConfirmed: true, authorization: null }), /authorization is required/, "the catalogue is not permission");
});
