// Image discovery / verification / approval pipeline: audit classes, approval rules, SSRF guards, search
// adapter, advisory AI, normalisation and review-record building. No network, database or storage access.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
process.env.PIPELINE_NO_MAIN = "1";
process.env.PIPELINE_STATE_DIR = mkdtempSync(path.join(tmpdir(), "pipeline-unit-"));

const { classifyRefs, refType, PLACEHOLDER } = await import("../scripts/product-images/audit-classes.mjs");
const review = await import("@/lib/product-image-review");
const ssrf = await import("@/lib/safe-image-fetch");
const search = await import("../scripts/product-images/search.mjs");
const { createVisionProvider, assessmentFlags } = await import("../scripts/product-images/vision.mjs");
const { optimise } = await import("../scripts/product-images/images.mjs");
const { automatedAccessProhibited } = await import("../scripts/product-images/policy.mjs");
const { pickPilot, buildReviewRecords } = await import("../scripts/product-images/pipeline.mjs");

const SB = "https://x.supabase.co/storage/v1/object/public/product-images/";
const auth = { type: "written_permission", grantedBy: "Brand UAE LLC", reference: "email 2026-10-19 ref BR-77" };
const rec = (over = {}) => ({ reviewId: "p1:abc", productId: "p1", state: "pending_review", version: 1, history: [],
  candidate: { url: "https://brand.example/a.jpg", technicallyValid: true, modelEvidence: "exact model in title", permissionStatus: "permission_pending" }, ...over });

/* ------------------------------------------------------------------ audit */
test("audit: missing, placeholder-only and broken references are told apart", () => {
  assert.equal(classifyRefs([]), "NO_IMAGE");
  assert.equal(classifyRefs([{ type: "placeholder", valid: false }]), "PLACEHOLDER");
  assert.equal(classifyRefs([{ type: "external", valid: false }]), "BROKEN");
  assert.equal(classifyRefs([{ type: "placeholder" }, { type: "supabase", valid: false }]), "BROKEN", "a dead upload is broken, not a placeholder");
  assert.equal(classifyRefs([{ type: "external", valid: true }]), "EXTERNAL_NEEDS_VERIFICATION");
  assert.equal(classifyRefs([{ type: "supabase", valid: true }]), "SUPABASE_UNREVIEWED");
  assert.equal(classifyRefs([{ type: "supabase", valid: true, provenance: "batch 3" }]), "VALID_VERIFIED");
  assert.equal(refType(PLACEHOLDER, SB), "placeholder");
  assert.equal(refType(`${SB}products/a/b.webp`, SB), "supabase");
  assert.equal(refType("data:image/png;base64,AAAA", SB), "embedded");
  assert.equal(refType("https://cdn.example/x.jpg", SB), "external");
  assert.equal(refType("", SB), "empty");
});

/* ------------------------------------------------------------------ approval rules */
test("approval: requires the reviewer's exact-model confirmation", () => {
  const r = review.applyReviewAction(rec(), { type: "approve", exactModelConfirmed: false, authorization: auth }, "admin@x");
  assert.match(r.error, /exact product model/);
});

test("approval: unauthorized images are refused, whatever the AI score", () => {
  const withAi = rec({ candidate: { ...rec().candidate, aiAssessment: { provider: "anthropic", score: 99, summary: "perfect", issues: [] } } });
  assert.match(review.applyReviewAction(withAi, { type: "approve", exactModelConfirmed: true, authorization: null }, "a").error, /authorization is required/);
  assert.match(review.applyReviewAction(withAi, { type: "approve", exactModelConfirmed: true, authorization: { ...auth, reference: "" } }, "a").error, /reference its evidence/);
  assert.match(review.applyReviewAction(withAi, { type: "approve", exactModelConfirmed: true, authorization: { ...auth, grantedBy: " " } }, "a").error, /who granted/);
  assert.match(review.applyReviewAction(withAi, { type: "approve", exactModelConfirmed: true, authorization: { type: "documented_licence", grantedBy: "Open Icecat", reference: "https://iceclog.com/opl", conditionsMet: false } }, "a").error, /conditions must be met/);
  const denied = rec({ candidate: { ...rec().candidate, permissionStatus: "permission_denied" } });
  assert.match(review.applyReviewAction(denied, { type: "approve", exactModelConfirmed: true, authorization: { ...auth, type: "client_supplied" } }, "a").error, /prohibit reuse/);
  assert.ok("record" in review.applyReviewAction(denied, { type: "approve", exactModelConfirmed: true, authorization: auth }, "a"), "a written grant from the rights holder overrides");
});

test("approval: technically invalid images and images with no file cannot be approved", () => {
  const bad = rec({ candidate: { ...rec().candidate, technicallyValid: false, technicalIssue: "too small (200x200)" } });
  assert.match(review.applyReviewAction(bad, { type: "approve", exactModelConfirmed: true, authorization: auth }, "a").error, /technical validation/);
  const none = rec({ candidate: { technicallyValid: true } });
  assert.match(review.applyReviewAction(none, { type: "approve", exactModelConfirmed: true, authorization: auth }, "a").error, /no image/);
});

test("approval workflow: approve, withdraw, reject and invalid transitions", () => {
  const ok = review.applyReviewAction(rec(), { type: "approve", exactModelConfirmed: true, authorization: auth }, "admin@x", "2026-10-19T10:00:00Z");
  assert.equal(ok.record.state, "approved");
  assert.equal(ok.record.version, 2);
  assert.equal(ok.record.decidedBy, "admin@x");
  assert.deepEqual(ok.record.authorization, auth);
  assert.equal(ok.record.history.at(-1).to, "approved");
  assert.ok(!("status" in ok.record), "a review record carries no publication status");
  const withdrawn = review.applyReviewAction(ok.record, { type: "reject", reason: "brand withdrew permission" }, "admin@x");
  assert.equal(withdrawn.record.state, "rejected");
  assert.equal(withdrawn.record.rejectionReason, "brand withdrew permission");
  assert.match(review.applyReviewAction(rec(), { type: "reject", reason: "  " }, "a").error, /reason is required/);
  const uploaded = review.applyReviewAction(ok.record, { type: "mark_uploaded", uploadedUrl: `${SB}products/p1/x.webp` }, "pipeline").record;
  assert.equal(uploaded.state, "uploaded");
  assert.match(review.applyReviewAction(uploaded, { type: "reject", reason: "x" }, "a").error, /cannot move/);
  assert.match(review.applyReviewAction(rec({ state: "needs_manual_source" }), { type: "approve", exactModelConfirmed: true, authorization: auth }, "a").error, /cannot approve/);
  assert.match(review.applyReviewAction(rec(), { type: "mark_uploaded", uploadedUrl: "https://x/y.webp" }, "a").error, /cannot move/, "only approved records can be uploaded");
});

test("approval: discovered candidates never start approved", () => {
  for (const c of [{ technicallyValid: true, modelEvidence: "exact", permissionStatus: "confirmed" }, { technicallyValid: true }, { technicallyValid: false }, { permissionStatus: "permission_denied", technicallyValid: true, modelEvidence: "x" }]) {
    assert.notEqual(review.initialState(c), "approved");
  }
  assert.equal(review.initialState({ technicallyValid: true, modelEvidence: "exact model in title" }), "pending_review");
  assert.equal(review.initialState({ technicallyValid: true }), "needs_manual_verification");
});

/* ------------------------------------------------------------------ SSRF */
test("safe fetch: malicious and internal URLs are refused before any request", () => {
  for (const [url, why] of [
    ["http://example.com/a.jpg", /only https/], ["file:///etc/passwd", /only https/], ["ftp://x.example/a.jpg", /only https/],
    ["https://user:pw@example.com/a.jpg", /credentials/], ["https://example.com:8443/a.jpg", /ports/],
    ["https://localhost/a.jpg", /internal/], ["https://printer.local/a.jpg", /internal/], ["https://intranet/a.jpg", /internal/],
    ["https://127.0.0.1/a.jpg", /private/], ["https://10.1.2.3/a.jpg", /private/], ["https://169.254.169.254/latest/meta-data", /private/],
    ["https://[::1]/a.jpg", /private/], ["https://192.168.0.10/a.jpg", /private/], ["https://100.64.0.1/a.jpg", /private/], ["not a url", /valid URL/],
  ]) {
    const r = ssrf.checkFetchUrl(url);
    assert.equal(r.ok, false, url);
    assert.match(r.reason, why, url);
  }
  assert.equal(ssrf.checkFetchUrl("https://images.brand.example/p/a.jpg").ok, true);
});

test("safe fetch: address classification and redirect re-validation", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.100.1.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "224.0.0.1"]) {
    assert.equal(ssrf.isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::1111"]) assert.equal(ssrf.isPublicAddress(ip), true, ip);
  assert.equal(ssrf.nextRedirect("https://cdn.example/a.jpg", "http://169.254.169.254/").ok, false);
  assert.equal(ssrf.nextRedirect("https://cdn.example/a.jpg", "https://127.0.0.1/x").ok, false);
  assert.equal(ssrf.nextRedirect("https://cdn.example/a.jpg", undefined).ok, false);
  assert.equal(ssrf.nextRedirect("https://cdn.example/a.jpg", "/b.jpg").url.toString(), "https://cdn.example/b.jpg");
});

test("safe fetch: a public-looking host that resolves to a private address is never connected to (DNS rebinding)", async () => {
  const fakeDns = (answers) => (host, opts, cb) => cb(null, answers);
  for (const address of ["127.0.0.1", "10.0.0.7", "169.254.169.254", "::1"]) {
    const r = await ssrf.safeFetchImage("https://images.evil.example/a.jpg", { resolve: fakeDns([{ address, family: address.includes(":") ? 6 : 4 }]), timeoutMs: 3000 });
    assert.equal(r.ok, false);
    assert.match(r.reason, /non-public address/, address);
  }
  const mixed = await ssrf.safeFetchImage("https://images.evil.example/a.jpg", { resolve: fakeDns([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]), timeoutMs: 3000 });
  assert.match(mixed.reason, /non-public/, "one private answer blocks the host");
});

test("safe fetch: HTML disguised as an image is recognised", () => {
  assert.equal(ssrf.sniffImage(Buffer.from("<!DOCTYPE html><title>Access denied</title>")), "markup");
  assert.equal(ssrf.sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), "markup");
  assert.equal(ssrf.sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "jpeg");
  assert.equal(ssrf.sniffImage(Buffer.from("just text")), null);
});

/* ------------------------------------------------------------------ search */
const product = { id: "sg-1", brand: "Super General", model: "SGW 1056N", category: "Washing Machines" };

test("search: manufacturer first; exact model detected; other sources classified as 'other'", () => {
  const q = search.buildQueries(product, { holders: {} });
  assert.equal(q[0].tier, "manufacturer");
  assert.match(q[0].query, /site:supergeneral\.com/);
  assert.equal(q.at(-1).tier, "other");
  const register = { holders: { Dist: { domains: ["dist.example"], status: "confirmed", grant: {} }, Pending: { domains: ["pending.example"], status: "permission_pending" } } };
  assert.equal(search.classifySource("https://www.supergeneral.com/product/x", "Super General"), "manufacturer");
  assert.equal(search.classifySource("https://shop.dist.example/p", "Super General", register), "authorized_distributor");
  assert.equal(search.classifySource("https://pending.example/p", "Super General", register), "other", "pending permission is not authorization");
  const json = { images_results: [
    { original: "https://www.supergeneral.com/media/sgw1056n-1.webp", link: "https://www.supergeneral.com/product/10kg-twin-tub-sgw1056n", title: "SGW 1056N twin tub", source: "Super General", original_width: 1000, original_height: 1000 },
    { original: "https://shop.example/img/similar.jpg", link: "https://shop.example/p/123", title: "Twin tub washing machine 10kg" },
    { original: "http://insecure.example/a.jpg", link: "https://insecure.example/p" },
  ] };
  const c = search.parseSerpApiImages(json, product, { query: "q", tier: "manufacturer", register: {} });
  assert.equal(c.length, 2, "non-https images are dropped");
  assert.equal(c[0].sourceType, "manufacturer");
  assert.equal(c[0].exactModel, true);
  assert.equal(c[1].sourceType, "other");
  assert.equal(c[1].exactModel, false);
  assert.match(c[1].matchEvidence, /not shown/);
});

test("search: disabled without a key; one request per product; the API key never appears in stored results", async () => {
  const { openLedger, openCache } = await import("../scripts/product-images/serpapi-budget.mjs");
  const dir = mkdtempSync(path.join(tmpdir(), "serp-"));
  const ledger = openLedger(path.join(dir, "ledger.json"), 10), cache = openCache(path.join(dir, "cache.json"));
  assert.equal((await search.findSearchCandidates(product, { env: {}, ledger, cache })).disabled, "IMAGE_SEARCH_PROVIDER is not set");
  assert.equal((await search.findSearchCandidates(product, { env: { IMAGE_SEARCH_PROVIDER: "serpapi" }, ledger, cache })).disabled, "SERPAPI_API_KEY is not set");
  await assert.rejects(search.findSearchCandidates(product, { env: { SERPAPI_API_KEY: "k" } }), /ledger and cache/, "no search without quota accounting");
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ search_parameters: { api_key: "SECRET-KEY-123" }, images_results: [{ original: "https://www.supergeneral.com/m/sgw1056n.webp", link: "https://www.supergeneral.com/product/sgw1056n", title: "SGW1056N" }, { original: "https://www.supergeneral.com/m/sgw1056n.webp", link: "https://x.example/p", title: "dup" }] }), { status: 200 });
  };
  const env = { SERPAPI_API_KEY: "SECRET-KEY-123", IMAGE_SEARCH_MIN_INTERVAL_MS: "0" };
  const r = await search.findSearchCandidates(product, { env, fetchImpl: fakeFetch, ledger, cache });
  assert.equal(calls.length, 1, "pass 1 is a single request");
  assert.match(decodeURIComponent(calls[0]), /q=Super\+General\+"SGW\+1056N"\+Washing\+Machines/);
  assert.equal(r.candidates.length, 1, "duplicate images are merged");
  assert.equal(r.candidates[0].sourceType, "manufacturer");
  const again = await search.findSearchCandidates(product, { env, fetchImpl: fakeFetch, ledger, cache });
  assert.deepEqual([calls.length, again.requests, again.cacheHits], [1, 0, 1], "cached result reused, no new request");
  for (const f of ["ledger.json", "cache.json"]) assert.ok(!readFileSync(path.join(dir, f), "utf8").includes("SECRET-KEY-123"), `key not stored in ${f}`);
  assert.ok(!JSON.stringify(r).includes("SECRET-KEY-123"));
});

test("policy: sources whose terms prohibit automated access are never downloaded", () => {
  const reg = { holders: { Geepas: { domains: ["geepas.com", "cdn.shopify.com/s/files/1/0720/0879/4350"], status: "permission_denied", automatedAccessProhibited: true } } };
  assert.equal(automatedAccessProhibited(reg, ["https://uae.geepas.com/products/x"]), "Geepas");
  assert.equal(automatedAccessProhibited(reg, ["https://cdn.shopify.com/s/files/1/0720/0879/4350/a.jpg"]), "Geepas");
  assert.equal(automatedAccessProhibited(reg, ["https://cdn.shopify.com/s/files/1/9999/a.jpg"]), null);
});

/* ------------------------------------------------------------------ vision (advisory) */
test("vision: assessment is advisory metadata; unavailable without configuration", async () => {
  assert.match((await createVisionProvider({ env: {} })).unavailable, /IMAGE_VISION_PROVIDER/);
  assert.match((await createVisionProvider({ env: { IMAGE_VISION_PROVIDER: "anthropic" } })).unavailable, /ANTHROPIC_API_KEY/);
  let sent;
  const fakeClient = { messages: { create: async (req) => { sent = req; return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ isSameProductType: true, brandVisibleOrConsistent: true, modelVisible: false, cleanProductPhoto: true, hasWatermarkOrOverlay: true, showsMultipleProducts: false, score: 88, issues: ["price sticker"], summary: "Twin tub with price sticker." }) }] }; } } };
  const v = await createVisionProvider({ client: fakeClient, env: {} });
  const img = await sharp({ create: { width: 500, height: 500, channels: 3, background: "#123456" } }).png().toBuffer();
  const a = await v.assess(img, { brand: "Super General", model: "SGW 1056N" });
  assert.equal(sent.model, "claude-opus-5-5");
  assert.equal(sent.messages[0].content[0].type, "image");
  assert.equal(a.score, 88);
  assert.equal(a.advisoryOnly, true);
  assert.deepEqual(assessmentFlags(a), ["AI: watermark, price or promotional overlay"]);
  const failing = await createVisionProvider({ client: { messages: { create: async () => { throw Object.assign(new Error("x"), { status: 529 }); } } }, env: {} });
  assert.match((await failing.assess(img, product)).error, /529/);
  // Even a perfect AI score does not let an unauthorized image through.
  const r = rec({ candidate: { ...rec().candidate, aiAssessment: { provider: "x", score: 100 } } });
  assert.ok(review.approvalProblem(r, { type: "approve", exactModelConfirmed: true, authorization: undefined }));
});

/* ------------------------------------------------------------------ normalisation */
test("normalisation: 800×800 WebP, aspect ratio kept, never upscaled", async () => {
  const wide = await sharp({ create: { width: 1600, height: 800, channels: 4, background: { r: 200, g: 10, b: 10, alpha: 0.5 } } }).png().toBuffer();
  const a = await optimise(wide);
  assert.equal(a.contentType, "image/webp");
  assert.deepEqual([a.width, a.height, a.fittedWidth, a.fittedHeight], [800, 800, 800, 400]);
  assert.equal((await sharp(a.buffer).metadata()).hasAlpha, false, "transparency flattened onto white");
  const small = await sharp({ create: { width: 500, height: 300, channels: 3, background: "#0a0" } }).jpeg().toBuffer();
  const b = await optimise(small);
  assert.deepEqual([b.width, b.height, b.fittedWidth, b.fittedHeight], [800, 800, 500, 300]);
  assert.equal((await optimise(small)).sha256, b.sha256, "deterministic output → same storage key on re-runs");
});

/* ------------------------------------------------------------------ pilot + review records */
test("pilot: spread across brands and categories", () => {
  const ps = [];
  for (const [brand, n] of [["Indesit", 10], ["Gree", 6], ["Toshiba", 3], ["Haier", 1]]) for (let i = 0; i < n; i++) ps.push({ id: `${brand}-${i}`, brand, category: `${brand}-cat-${i % 3}` });
  const picked = pickPilot(ps, 12);
  assert.equal(picked.length, 12);
  assert.equal(new Set(picked.map((p) => p.brand)).size, 4);
  assert.equal(new Set(picked.filter((p) => p.brand === "Indesit").map((p) => p.category)).size, 3, "different categories first");
});

test("review records: no candidates → needs_manual_source; local-only files cannot be approved; nothing starts approved", () => {
  const targets = [
    { id: "a", name: "A", brand: "Gree", model: "G1", images: [] },
    { id: "b", name: "B", brand: "Nikai", model: "N1", images: ["/featured/hisense-window-ac.png"] },
    { id: "c", name: "C", brand: "Daewoo", model: "D1", images: [] },
  ];
  const candidates = { a: { candidates: [], notes: ["search: no results for the exact model"] }, b: { candidates: [{}], notes: [] }, c: { candidates: [{}, {}], notes: [] } };
  const verified = {
    b: { results: [{ adapter: "supplier-catalogue", sourcePage: "Nikai Cataloge.pdf p.3", image: { file: "/tmp/x.png" }, inspection: { ok: true, width: 900, height: 900, kind: "png", sha256: "ff" }, confidence: "HIGH", decision: "VERIFIED", matchEvidence: "exact model on its own page", reasons: [] }] },
    c: { results: [
      { adapter: "serpapi", sourceType: "other", sourcePage: "https://shop.example/p", image: { url: "https://shop.example/a.jpg" }, inspection: { ok: true, width: 1000, height: 1000, kind: "jpeg", sha256: "aa" }, confidence: "UNCERTAIN", exactModel: true, matchEvidence: "exact model in the result title", reasons: [] },
      { adapter: "serpapi", sourceType: "other", sourcePage: "https://bad.example/p", image: { url: "https://bad.example/a.jpg" }, inspection: { ok: false, reason: "too small" }, confidence: "REJECT", reasons: ["too small"] },
    ] },
  };
  const recs = buildReviewRecords({ targets, candidates, verified, register: { holders: {} }, perProduct: 5, root: "/tmp" });
  const by = (id) => recs.filter((r) => r.productId === id);
  assert.equal(by("a")[0].state, "needs_manual_source");
  assert.match(by("a")[0].candidate.checks[0], /no results/);
  assert.match(by("b")[0].candidate.checks.join(" "), /cannot be shown or approved/);
  assert.match(review.approvalProblem(by("b")[0], { type: "approve", exactModelConfirmed: true, authorization: auth }), /no image/);
  assert.equal(by("c").length, 1, "rejected candidates are not queued");
  assert.equal(by("c")[0].state, "pending_review");
  assert.equal(by("c")[0].candidate.permissionStatus, "permission_pending");
  assert.ok(recs.every((r) => r.state !== "approved" && r.version === 1));
  assert.equal(new Set(recs.map((r) => r.reviewId)).size, recs.length, "stable unique ids");
});
