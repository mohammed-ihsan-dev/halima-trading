// SerpApi quota protection and target-manifest scope, through the real pipeline CLI against a local fake
// SerpApi server that counts every request. No network, database or storage access.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const KEY = "TEST-SERPAPI-KEY-do-not-store";
let server, base;
const fake = { searches: [], accountCalls: 0, left: 250, failNext: 0 };

const product = (id, brand, model, imageClass, category = "Air Conditioning") => ({ id, brand, model, sku: model, category, imageClass, images: [], status: "draft", singleModel: true, refs: [] });
const PRODUCTS = [
  product("t-1", "Gree", "GR-A100", "NO_IMAGE"),
  product("t-2", "Haier", "HSU-18X", "PLACEHOLDER"),
  product("t-3", "Daewoo", "DW-K9", "NO_IMAGE", "Kitchen Appliances"),
  product("ok-1", "LG", "LG-OK1", "VALID_VERIFIED"), // has a verified image: never a search target
  product("ext-1", "LG", "LG-EXT1", "EXTERNAL_NEEDS_VERIFICATION"), // unverified external image: out of scope
];

function newState(products = PRODUCTS) {
  const dir = mkdtempSync(path.join(tmpdir(), "serp-state-"));
  writeFileSync(path.join(dir, "audit.json"), JSON.stringify({ auditedAt: new Date().toISOString(), storage: { objects: 0, bytes: 0 }, products }));
  writeFileSync(path.join(dir, "permissions.json"), JSON.stringify({ holders: {} }));
  return dir;
}
async function cli(state, args, env = {}) {
  const e = { ...process.env, PIPELINE_STATE_DIR: state, IMAGE_SEARCH_PROVIDER: "serpapi", SERPAPI_API_KEY: KEY, SERPAPI_TEST_BASE_URL: base, IMAGE_SEARCH_MIN_INTERVAL_MS: "0", IMAGE_VISION_PROVIDER: "none", MONGODB_URI: "mongodb://127.0.0.1:1/never", ...env };
  try {
    const r = await run(process.execPath, ["--import", "./tests/support/register-ts.mjs", "scripts/product-images/pipeline.mjs", ...args], { env: e, timeout: 60_000 });
    return { code: 0, out: r.stdout + r.stderr };
  } catch (err) {
    return { code: err.code ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}
const json = (state, f) => JSON.parse(readFileSync(path.join(state, f), "utf8"));
const searchedModels = () => fake.searches.map((q) => q.match(/"([^"]+)"/)?.[1]);

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    res.setHeader("Content-Type", "application/json");
    if (url.searchParams.get("api_key") !== KEY) { res.statusCode = 401; return res.end(JSON.stringify({ error: "Invalid API key." })); }
    if (url.pathname === "/account.json") {
      fake.accountCalls++;
      return res.end(JSON.stringify({ api_key: KEY, account_email: "owner@example.com", plan_name: "Free Plan", searches_per_month: 250, this_month_usage: 250 - fake.left, plan_searches_left: fake.left, total_searches_left: fake.left }));
    }
    if (url.pathname === "/search.json") {
      const q = url.searchParams.get("q");
      fake.searches.push(q);
      if (fake.failNext > 0) { fake.failNext--; res.statusCode = 500; return res.end(JSON.stringify({ error: "Internal error" })); }
      fake.left--;
      const model = q.match(/"([^"]+)"/)[1];
      return res.end(JSON.stringify({ search_parameters: { api_key: KEY }, images_results: [
        { original: `https://img.shop.example/${model.toLowerCase()}.jpg`, link: `https://shop.example/p/${model.toLowerCase()}`, title: `${model} split AC`, source: "Shop" },
        { original: "https://img.shop.example/series-photo.jpg", link: "https://shop.example/series", title: `${model} series`, source: "Shop" },
        { original: "https://img.other.example/generic.jpg", link: "https://other.example/p", title: "Split air conditioner 1.5 ton", source: "Other" },
      ] }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("manifest: frozen from the audit; a different audit is shown and refused, and search will not run", async () => {
  const state = newState();
  assert.equal((await cli(state, ["targets"])).code, 0);
  const m = json(state, "target-manifest.json");
  assert.deepEqual(m.products.map((p) => p.id), ["t-1", "t-2", "t-3"], "only no-image / placeholder / broken products");
  assert.deepEqual(m.byClass, { NO_IMAGE: 2, PLACEHOLDER: 1, BROKEN: 0 });
  // A new audit finds one more target and one fewer.
  writeFileSync(path.join(state, "audit.json"), JSON.stringify({ auditedAt: new Date().toISOString(), products: [...PRODUCTS.filter((p) => p.id !== "t-3"), product("t-4", "Gree", "GR-NEW", "NO_IMAGE")] }));
  const r = await cli(state, ["targets"]);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /t-4/);
  assert.match(r.out, /manifest NOT changed/);
  assert.deepEqual(json(state, "target-manifest.json").products.map((p) => p.id), ["t-1", "t-2", "t-3"]);
  const before = fake.searches.length;
  const d = await cli(state, ["discover", "--source=search"]);
  assert.match(d.out, /search NOT run: the current audit differs/);
  assert.equal(fake.searches.length, before, "no request");
});

test("scope + budget: only manifest products are searched, one request each, cache reused, never past the limit", async () => {
  const state = newState();
  await cli(state, ["targets"]);
  fake.searches = []; fake.left = 250;
  let r = await cli(state, ["discover", "--source=search", "--batch=2"]);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(searchedModels(), ["GR-A100", "HSU-18X"], "batch of 2, manifest order");
  assert.match(fake.searches[0], /^Gree "GR-A100" Air Conditioning$/, "exact brand, quoted model, category");
  r = await cli(state, ["discover", "--source=search", "--batch=2"]);
  assert.deepEqual(searchedModels(), ["GR-A100", "HSU-18X", "DW-K9"], "only the remaining product costs a request");
  r = await cli(state, ["discover", "--source=search"]);
  assert.equal(fake.searches.length, 3, "everything cached: no request");
  const runs = json(state, "search-runs.json");
  assert.deepEqual(runs.map((x) => [x.requestsMade, x.cachedResultsReused]), [[2, 0], [1, 2], [0, 3]]);
  assert.ok(runs.every((x) => x.outsideManifestSearched === 0));
  assert.equal(runs[0].accountBefore.totalSearchesLeft, 250);
  assert.equal(runs[0].accountAfter.totalSearchesLeft, 248);
  assert.ok(!searchedModels().includes("LG-OK1") && !searchedModels().includes("LG-EXT1"), "products outside the manifest never searched");
  const c = json(state, "candidates.json");
  assert.equal(c["t-1"].candidates.length, 3);
  assert.ok(!c["ok-1"] && !c["ext-1"]);
  const ledger = json(state, "serpapi-ledger.json");
  assert.equal(ledger.requests.length, 3);
  assert.ok(ledger.requests.every((x) => x.status === "ok" && ["t-1", "t-2", "t-3"].includes(x.productId)));
  // --only cannot reach outside the manifest.
  const o = await cli(state, ["discover", "--source=search", "--only=ext-1"]);
  assert.match(o.out, /outside the manifest: ext-1/);
  assert.equal(fake.searches.length, 3);
  // The key is never written anywhere in the state directory.
  for (const f of readdirSync(state).filter((x) => x.endsWith(".json"))) assert.ok(!readFileSync(path.join(state, f), "utf8").includes(KEY), f);
  assert.ok(!JSON.stringify(runs).includes("owner@example.com"), "account details other than quota are not kept");
});

test("limits: the local request cap and the API quota stop the run before any request", async () => {
  const state = newState();
  await cli(state, ["targets"]);
  fake.searches = []; fake.left = 250;
  let r = await cli(state, ["discover", "--source=search"], { SERPAPI_REQUEST_LIMIT: "2" });
  assert.match(r.out, /search NOT run: pipeline request limit: 3 needed, 2 of 2 left/);
  assert.equal(fake.searches.length, 0);
  assert.equal(json(state, "quota-report.json").stopped, true);
  r = await cli(state, ["discover", "--source=search", "--batch=2"], { SERPAPI_REQUEST_LIMIT: "2" });
  assert.equal(fake.searches.length, 2);
  r = await cli(state, ["discover", "--source=search", "--batch=1"], { SERPAPI_REQUEST_LIMIT: "2" });
  assert.match(r.out, /0 of 2 left/);
  assert.equal(fake.searches.length, 2, "the cap holds across runs (ledger is never reset)");

  const state2 = newState();
  await cli(state2, ["targets"]);
  fake.left = 1;
  r = await cli(state2, ["discover", "--source=search", "--batch=2"]);
  assert.match(r.out, /insufficient SerpApi quota: 2 searches needed, 1 left/);
  assert.equal(fake.searches.length, 2, "no request when the account quota is short");
  fake.left = 250;
});

test("failures: counted, never retried automatically; retried once only with --retry-failed", async () => {
  const state = newState();
  await cli(state, ["targets"]);
  fake.searches = []; fake.failNext = 1;
  await cli(state, ["discover", "--source=search", "--batch=1"]);
  assert.equal(fake.searches.length, 1, "a 500 is not retried in the same run");
  let ledger = json(state, "serpapi-ledger.json");
  assert.deepEqual(ledger.requests.map((x) => x.status), ["failed"], "failed request counted");
  await cli(state, ["discover", "--source=search", "--batch=1"]);
  assert.deepEqual(searchedModels(), ["GR-A100", "HSU-18X"], "the failed query is skipped, the batch moves on");
  await cli(state, ["discover", "--source=search", "--batch=1", "--retry-failed"]);
  assert.deepEqual(searchedModels(), ["GR-A100", "HSU-18X", "GR-A100"], "explicit retry: one more request");
  ledger = json(state, "serpapi-ledger.json");
  assert.deepEqual(ledger.requests.map((x) => x.status), ["failed", "ok", "ok"]);
});

test("verification: search images are not downloaded without authorization; exact model required; series images rejected", async () => {
  const state = newState();
  await cli(state, ["targets"]);
  await cli(state, ["discover", "--source=search"]);
  const r = await cli(state, ["verify", "--no-vision"]);
  assert.equal(r.code, 0, r.out);
  const v = json(state, "verify.json");
  for (const id of ["t-1", "t-2", "t-3"]) {
    const res = v[id].results;
    assert.ok(res.every((x) => x.metadataOnly && x.inspection === null && !x.cacheFile), "nothing downloaded");
    const own = res.find((x) => x.image.url.includes(PRODUCTS.find((p) => p.id === id).model.toLowerCase()));
    assert.equal(own.confidence, "UNCERTAIN", "exact model, but no authorization and no file check → manual review");
    assert.match(own.reasons.join(" "), /no documented commercial-use authorization/);
    assert.equal(res.find((x) => x.image.url.endsWith("series-photo.jpg")).confidence, "REJECT");
    assert.match(res.find((x) => x.image.url.endsWith("series-photo.jpg")).reasons.join(" "), /series image/);
    assert.equal(res.find((x) => x.image.url.endsWith("generic.jpg")).confidence, "REJECT", "exact model not shown");
  }
  assert.equal(readdirSync(path.join(state, "cache")).length, 0, "no image file stored");
  const preview = await cli(state, ["review-import"]);
  const recs = json(state, "reviews-preview.json").records;
  assert.equal(recs.length, 3, preview.out);
  assert.ok(recs.every((x) => x.state === "needs_manual_verification" && x.candidate.technicallyValid === undefined && x.candidate.permissionStatus === "permission_pending"));
});
