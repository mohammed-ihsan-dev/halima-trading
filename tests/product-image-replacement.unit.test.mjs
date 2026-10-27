// Replacement review, local-file previews and their review records (pure / local files only; no database, no storage).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.PIPELINE_NO_MAIN = "1";
process.env.PIPELINE_STATE_DIR = mkdtempSync(path.join(tmpdir(), "replacement-unit-"));
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { replacementEligibility, parseIncludeClasses, replacedImages, unsuitableReason, REPLACEABLE_CLASSES } = await import("../scripts/product-images/replacement.mjs");
const { localManifestCandidates } = await import("../scripts/product-images/sources.mjs");
const { buildReviewRecords, writeLocalPreview } = await import("../scripts/product-images/pipeline.mjs");
const { approvalProblem, initialState } = await import("@/lib/product-image-review");

const THUMB = "https://encrypted-tbn0.gstatic.com/images?q=tbn:abc";
const SB = "https://x.supabase.co/storage/v1/object/public/product-images/products/a/1.webp";
const ext = (ref, w, h, over = {}) => ({ ref, type: "external", valid: true, width: w, height: h, ...over });
const product = (over) => ({ id: "p-1", name: "Gree X", brand: "Gree", model: "GR-X18", sku: "GR-X18", category: "Air Conditioning", status: "active", singleModel: true, ...over });

test("eligibility: only products whose every usable image is a Google thumbnail or undersized", () => {
  const thumb = product({ imageClass: "EXTERNAL_NEEDS_VERIFICATION", images: [THUMB], refs: [ext(THUMB, 225, 225)] });
  assert.deepEqual(replacementEligibility(thumb), { eligible: true, reason: null, removeRefs: [THUMB], reasons: [`Google search thumbnail: ${THUMB}`] });

  const tiny = product({ imageClass: "SUPABASE_UNREVIEWED", images: [SB], refs: [{ ref: SB, type: "supabase", valid: true, width: 180, height: 120, tooSmall: true }] });
  assert.equal(replacementEligibility(tiny).eligible, true);
  assert.match(replacementEligibility(tiny).reasons[0], /undersized \(180x120/);

  // A product that also has a good image is not a replacement target: its usable image must not be removed.
  const mixed = product({ imageClass: "EXTERNAL_NEEDS_VERIFICATION", images: [THUMB, "https://brand.example/big.jpg"], refs: [ext(THUMB, 225, 225), ext("https://brand.example/big.jpg", 1200, 1200)] });
  assert.equal(replacementEligibility(mixed).eligible, false);

  // Default targets and embedded images never enter through this path.
  for (const imageClass of ["NO_IMAGE", "PLACEHOLDER", "BROKEN", "EMBEDDED_PRESERVED"]) assert.equal(replacementEligibility(product({ imageClass, refs: [ext(THUMB, 225, 225)] })).eligible, false, imageClass);
  assert.deepEqual([...REPLACEABLE_CLASSES].sort(), ["EXTERNAL_NEEDS_VERIFICATION", "SUPABASE_UNREVIEWED", "VALID_VERIFIED"]);
  // A verified upload qualifies only when it is undersized; a good verified image never does.
  assert.equal(replacementEligibility(product({ imageClass: "VALID_VERIFIED", refs: [{ ref: SB, type: "supabase", valid: true, width: 164, height: 292, tooSmall: true }] })).eligible, true);
  assert.equal(replacementEligibility(product({ imageClass: "VALID_VERIFIED", refs: [{ ref: SB, type: "supabase", valid: true, width: 800, height: 800 }] })).eligible, false);
  // A logo-only product is eligible; a logo next to a real product photo is not (the photo must never be removed).
  const LOGO = "https://images.seeklogo.com/logo-png/6/1/gree-logo.png";
  assert.equal(replacementEligibility(product({ imageClass: "EXTERNAL_NEEDS_VERIFICATION", refs: [ext(LOGO, 600, 600)] })).eligible, true);
  assert.equal(replacementEligibility(product({ imageClass: "EXTERNAL_NEEDS_VERIFICATION", refs: [ext(LOGO, 600, 600), ext("https://www.gree.com/media/gr-x18.jpg", 1000, 800)] })).eligible, false);
  // Broken references are not "usable" and are never selected for removal.
  assert.equal(unsuitableReason({ ref: THUMB, type: "external", valid: false }), null);
  assert.equal(unsuitableReason(ext("https://brand.example/ok.jpg", 800, 600)), null);
});

test("conservative logo / app-icon / placeholder detection; product photos with branding stay usable", () => {
  const r = (url) => unsuitableReason(ext(url, 800, 800));
  // Flagged
  assert.match(r("https://images.seeklogo.com/logo-png/6/1/gree-logo.png"), /^brand logo/);
  assert.match(r("https://logos-world.net/wp-content/uploads/2023/akai-logo.png"), /^brand logo/);
  assert.match(r("https://cdn.vectorstock.com/i/1000v/12/00/phoenix-lettering-logo-concept-vector-46531200.jpg"), /^logo graphic/);
  assert.match(r("https://play-lh.googleusercontent.com/2Sabc=w512"), /^app store icon/);
  assert.match(r("https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/aa/bb/AppIcon-1x.png/512x512bb.jpg"), /^app store icon/);
  assert.match(r("https://via.placeholder.com/600x600"), /^generic placeholder/);
  assert.match(r("https://shop.example/media/no-image.png"), /^generic placeholder/);
  assert.match(r("https://shop.example/media/image_not_available.jpg"), /^generic placeholder/);
  assert.match(r("https://shop.example/media/coming-soon.webp"), /^generic placeholder/);
  // NOT flagged: real product photos, even with the brand or "logo" in the URL, and other images on the same hosts
  for (const ok of [
    "https://www.gree.com/media/gree-logo-split-ac-gr-x18.jpg", // brand site, branded product shot
    "https://pimcdn.sharafdg.com/images/S300123_1?logo=gree", // shop CDN with "logo" in the query
    "https://cdn.vectorstock.com/i/1000v/11/22/air-conditioner-vector-123.jpg", // stock vector not named as a logo
    "https://lh3.googleusercontent.com/abc=w800", // other Google user content
    "https://is1-ssl.mzstatic.com/image/thumb/Video/v4/aa/poster.jpg", // App Store CDN, not app artwork
    "https://shop.example/media/placeholder-holder-ac-bracket.jpg", // product whose name starts with the word
    "https://m.media-amazon.com/images/I/61abc._AC_SL1500_.jpg",
  ]) assert.equal(r(ok), null, ok);
});

test("--include-classes: replaceable classes only, and only with an explicit product selection", () => {
  assert.deepEqual([...parseIncludeClasses(null, [])], [], "default: nothing extra");
  assert.throws(() => parseIncludeClasses("EXTERNAL_NEEDS_VERIFICATION", []), /explicit product selection/);
  assert.throws(() => parseIncludeClasses("EMBEDDED_PRESERVED", ["p-1"]), /accepts only/);
  assert.throws(() => parseIncludeClasses("NO_IMAGE", ["p-1"]), /accepts only/);
  assert.throws(() => parseIncludeClasses("EXTERNAL_NEEDS_VERIFICATION,EMBEDDED_PRESERVED", ["p-1"]), /accepts only/);
  assert.deepEqual([...parseIncludeClasses("EXTERNAL_NEEDS_VERIFICATION,SUPABASE_UNREVIEWED", ["p-1"])], ["EXTERNAL_NEEDS_VERIFICATION", "SUPABASE_UNREVIEWED"]);
});

test("replaced images: new image first, only the approved references removed, every other image kept", () => {
  const broken = "https://gone.example/x.jpg";
  assert.deepEqual(replacedImages([THUMB, broken, "/featured/hisense-window-ac.png"], "NEW", [THUMB]), ["NEW", broken]);
  assert.deepEqual(replacedImages(["https://keep.example/a.jpg", THUMB], "NEW", [THUMB]), ["NEW", "https://keep.example/a.jpg"]);
  assert.equal(replacedImages(["https://other.example/now.jpg"], "NEW", [THUMB]), null, "product changed since review → nothing planned");
  assert.deepEqual(replacedImages(["NEW", THUMB], "NEW", [THUMB]), ["NEW"], "never duplicates the new URL");
});

test("local files: optimised preview in the path the admin preview route serves; local-candidates source", async () => {
  const route = readFileSync("app/api/admin/product-image-reviews/preview/route.ts", "utf8");
  const PREVIEW_PATH = new RegExp(route.match(/const PREVIEW_PATH = \/(.+)\/;/)[1]);
  const img = await sharp({ create: { width: 1000, height: 600, channels: 3, background: "#3366aa" } }).jpeg().toBuffer();
  const rel = await writeLocalPreview(img);
  assert.match(rel, PREVIEW_PATH, "the existing preview route accepts this path unchanged");
  const meta = await sharp(path.join(process.env.PIPELINE_STATE_DIR, rel)).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 800, 800]);
  assert.equal(await writeLocalPreview(img), rel, "deterministic: same file → same preview");

  const root = mkdtempSync(path.join(tmpdir(), "lc-root-"));
  writeFileSync(path.join(root, "photo.jpg"), img);
  const lcFile = path.join(root, "local-candidates.json");
  writeFileSync(lcFile, JSON.stringify({ products: { "p-1": [{ file: "photo.jpg", sourceType: "client-supplied file", sourcePage: "catalogues-source/photo.jpg" }, { nofile: true }] } }));
  const map = localManifestCandidates(root, { stateDir: path.join(root, "state"), localCandidatesFile: lcFile });
  const c = map.get("p-1");
  assert.equal(c.length, 1, "entries without a file are ignored");
  assert.equal(c[0].adapter, "local-file");
  assert.equal(c[0].images[0].file, path.join(root, "photo.jpg"));
  assert.equal(c[0].decision, "PENDING_REVIEW");
  assert.equal(localManifestCandidates(root, { stateDir: path.join(root, "state") }).size, 0, "no local-candidates file → no local candidates");
});

test("review records: replacement candidates carry the exact references to remove; local previews are reviewable; defaults unchanged", () => {
  const result = { adapter: "local-file", sourceType: "client-supplied file", sourcePage: "catalogues-source/x.jpg", matchEvidence: "operator-supplied local file", image: { file: "/abs/x.jpg" },
    inspection: { ok: true, width: 1000, height: 600, kind: "jpeg", sha256: "ab" }, confidence: "UNCERTAIN", reasons: ["local file — awaiting admin visual review"], cacheFile: "cache/ab.jpeg", localPreview: "catalogue/local/previews/abcdef0123456789abcdef01.webp" };
  const rep = product({ imageClass: "EXTERNAL_NEEDS_VERIFICATION", images: [THUMB], refs: [ext(THUMB, 225, 225)] });
  const def = product({ id: "p-2", imageClass: "NO_IMAGE", images: [], refs: [] });
  const recs = buildReviewRecords({ targets: [rep, def], candidates: { "p-1": { candidates: [{}] }, "p-2": { candidates: [{}] } }, verified: { "p-1": { results: [result] }, "p-2": { results: [{ ...result }] } }, register: { holders: {} }, perProduct: 3, root: "/" });
  const r1 = recs.find((r) => r.productId === "p-1"), r2 = recs.find((r) => r.productId === "p-2");
  assert.deepEqual(r1.candidate.replaces.refs, [THUMB]);
  assert.ok(r1.candidate.checks.some((c) => /^REPLACEMENT: approving this image replaces 1 unsuitable image/.test(c)));
  assert.equal(r1.candidate.localPreview, result.localPreview);
  assert.ok(!r1.candidate.checks.some((c) => /cannot be shown or approved/.test(c)));
  assert.equal(r2.candidate.replaces, undefined, "a default target never removes anything");
  assert.equal(r1.candidate.permissionStatus, "permission_pending", "no permission is inferred");
  assert.equal(initialState(r1.candidate), "needs_manual_verification", "never auto-approved");
});

test("permission enforcement: approval needs exact model, authorization type, grantor and evidence location", () => {
  const review = { state: "needs_manual_verification", candidate: { localPreview: "catalogue/local/previews/abcdef0123456789abcdef01.webp", technicallyValid: true, permissionStatus: "permission_pending" } };
  const auth = { type: "client_supplied", grantedBy: "Halima Trading (supplier pack)", reference: "email 2026-10-26 'Gree images'" };
  assert.match(approvalProblem(review, { type: "approve", exactModelConfirmed: false, authorization: auth }), /exact product model/);
  assert.match(approvalProblem(review, { type: "approve", exactModelConfirmed: true, authorization: null }), /authorization is required/);
  assert.match(approvalProblem(review, { type: "approve", exactModelConfirmed: true, authorization: { ...auth, grantedBy: "" } }), /who granted/);
  assert.match(approvalProblem(review, { type: "approve", exactModelConfirmed: true, authorization: { ...auth, reference: "" } }), /reference its evidence/);
  assert.equal(approvalProblem(review, { type: "approve", exactModelConfirmed: true, authorization: auth }), null);
  assert.match(approvalProblem({ ...review, candidate: { technicallyValid: true } }, { type: "approve", exactModelConfirmed: true, authorization: auth }), /no image/, "a local file without a preview cannot be approved");
});
