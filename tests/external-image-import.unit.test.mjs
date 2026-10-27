// External image URL → image storage import. Uses the real Supabase store code against the in-process fake
// Supabase Storage (no request reaches Supabase) and an injected downloader (no request reaches the internet).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import { startFakeSupabase } from "./support/fake-supabase-storage.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { importExternalImage, fetchFailureStatus, IMPORT_LIMITS } = await import("@/lib/external-image-import");
const { createSupabaseStore, getSupabaseStorageConfig } = await import("@/lib/supabase-storage");
const { checkFetchUrl, nextRedirect, safeFetchImage } = await import("@/lib/safe-image-fetch");
const { replaceImageInPlace, isExternalImage } = await import("@/lib/admin-gallery");
const { IMAGE_UPLOAD } = await import("@/lib/r2");

const SECRET = "sb_secret_test_only";
let fake, fakeUrl, storage, base;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const objects = async () => (await (await fetch(`${fakeUrl}/__objects`)).json()).map((k) => k.replace(/^product-images\//, ""));
const control = (path) => fetch(`${fakeUrl}${path}`, { method: "POST" });
const served = (buffer, kind = "jpeg", finalUrl = "https://cdn.brand.example/p/x.jpg") => async () => ({ ok: true, buffer, contentType: `image/${kind}`, kind, finalUrl, status: 200 });
const never = async () => { throw new Error("the downloader must not be called"); };
const deps = (over = {}) => {
  const records = [];
  return { records, d: { storage, importedBy: "admin@test", record: async (r) => { records.push(r); }, findPrevious: async () => null, ...over } };
};
let jpeg, png, gif, avif, big;

before(async () => {
  fake = await startFakeSupabase({ secret: SECRET });
  fakeUrl = `http://127.0.0.1:${fake.port}`;
  const cfg = getSupabaseStorageConfig({ NEXT_PUBLIC_SUPABASE_URL: fakeUrl, SUPABASE_SECRET_KEY: SECRET });
  assert.ok(cfg.ok, JSON.stringify(cfg));
  base = cfg.config.publicBaseUrl;
  storage = { provider: "supabase", store: createSupabaseStore(cfg.config), publicBaseUrl: base, publicUrlForKey: (k) => `${base}/${k}`, keyFromPublicUrl: (u) => (u.startsWith(`${base}/`) ? u.slice(base.length + 1) : null) };
  const raw = (w, h, seed) => Buffer.from(Array.from({ length: w * h * 3 }, (_, i) => (i * seed) % 251));
  jpeg = await sharp(raw(900, 600, 31), { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
  png = await sharp(raw(500, 400, 17), { raw: { width: 500, height: 400, channels: 3 } }).png().toBuffer();
  gif = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "latin1");
  avif = await sharp(raw(640, 480, 7), { raw: { width: 640, height: 480, channels: 3 } }).avif({ quality: 60 }).toBuffer();
  const noise = Buffer.from(Array.from({ length: 2600 * 2200 * 3 }, () => Math.floor(Math.random() * 256)));
  big = await sharp(noise, { raw: { width: 2600, height: 2200, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
  assert.ok(big.length > IMAGE_UPLOAD.maxBytes, "test image is over the storage limit");
});
after(() => fake.server.close());

test("success: stored under the product folder with a content-derived key, verified, publicly served, audited", async () => {
  const { d, records } = deps({ fetchImage: served(jpeg) });
  const r = await importExternalImage("https://cdn.brand.example/p/x.jpg", "WST-3617.TRK", d);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.key, /^products\/wst-3617-trk\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/);
  assert.equal(r.url, `${base}/${r.key}`);
  assert.deepEqual([r.reused, r.converted, r.format, r.width, r.height], [false, false, "image/jpeg", 900, 600]);
  const stored = Buffer.from(await (await fetch(r.url)).arrayBuffer());
  assert.equal(sha(stored), sha(jpeg), "JPEG within limits is stored byte-for-byte");
  assert.deepEqual(await objects(), [r.key]);
  assert.equal(records.length, 1);
  assert.deepEqual([records[0].sourceUrl, records[0].storageKey, records[0].sha256, records[0].importedBy, records[0].reused],
    ["https://cdn.brand.example/p/x.jpg", r.key, sha(jpeg), "admin@test", false]);
});

test("duplicates: identical content reuses the stored object; a previously imported source URL is not downloaded again", async () => {
  const before = await objects();
  const a = deps({ fetchImage: served(jpeg, "jpeg", "https://mirror.example/other.jpg") });
  const r = await importExternalImage("https://mirror.example/other.jpg", "WST-3617.TRK", a.d);
  assert.equal(r.reused, true);
  assert.deepEqual(await objects(), before, "no second copy");
  assert.equal(a.records[0].reused, true);

  const b = deps({ fetchImage: never, findPrevious: async () => ({ storageKey: r.key, publicUrl: r.url }) });
  const again = await importExternalImage("https://mirror.example/other.jpg", "WST-3617.TRK", b.d);
  assert.deepEqual([again.ok, again.reused, again.url], [true, true, r.url]);
  assert.equal(b.records.length, 1, "the reuse is still audited");
  // A different product never shares the object.
  const c = deps({ fetchImage: served(jpeg) });
  const other = await importExternalImage("https://cdn.brand.example/p/x.jpg", "SKU-OTHER", c.d);
  assert.notEqual(other.key, r.key);
  assert.match(other.key, /^products\/sku-other\//);
});

test("invalid URLs and blocked internal addresses are refused before any download", async () => {
  for (const url of ["", "not a url", "http://cdn.brand.example/a.jpg", "ftp://x.example/a.jpg", "https://localhost/a.jpg", "https://127.0.0.1/a.jpg",
    "https://10.0.0.5/a.jpg", "https://192.168.1.10/a.jpg", "https://169.254.169.254/latest/meta-data/", "https://[::1]/a.jpg", "https://[fd00::1]/a.jpg",
    "https://intranet/a.jpg", "https://printer.local/a.jpg", "https://user:pass@cdn.brand.example/a.jpg", "https://cdn.brand.example:8443/a.jpg", `https://x.example/${"a".repeat(IMPORT_LIMITS.maxUrlLength)}`]) {
    const { d, records } = deps({ fetchImage: never });
    const r = await importExternalImage(url, "SKU-1", d);
    assert.equal(r.ok, false, url);
    assert.equal(r.status, 400, url);
    assert.equal(records.length, 0);
  }
});

test("DNS answers and redirects are re-validated: private resolutions and internal redirect targets are blocked", async () => {
  // A public-looking host whose DNS answer is private (DNS rebinding) is refused at connect time.
  const toLoopback = (_h, _o, cb) => cb(null, [{ address: "127.0.0.1", family: 4 }]);
  const toMetadata = (_h, _o, cb) => cb(null, [{ address: "169.254.169.254", family: 4 }]);
  for (const resolve of [toLoopback, toMetadata]) {
    const res = await safeFetchImage("https://images.brand.example/p/a.jpg", { resolve, timeoutMs: 3000 });
    assert.equal(res.ok, false);
    assert.match(res.reason, /non-public/);
    assert.equal(fetchFailureStatus(res.reason, res.retryable), 400);
    const { d } = deps({ fetchImage: (u) => safeFetchImage(u, { resolve, timeoutMs: 3000 }) });
    assert.equal((await importExternalImage("https://images.brand.example/p/a.jpg", "SKU-1", d)).status, 400);
  }
  // Every redirect target goes through the same URL rules.
  for (const loc of ["http://169.254.169.254/latest/", "https://10.1.1.1/x.jpg", "https://localhost/x.jpg", "http://cdn.brand.example/x.jpg", "https://[::1]/x.jpg"]) {
    assert.equal(nextRedirect("https://cdn.brand.example/a.jpg", loc).ok, false, loc);
  }
  assert.equal(nextRedirect("https://cdn.brand.example/a.jpg", "/img/b.jpg").ok, true, "relative redirect on the same public host");
  assert.equal(nextRedirect("https://cdn.brand.example/a.jpg", undefined).ok, false);
  assert.equal(fetchFailureStatus("too many redirects"), 400);
  assert.equal(checkFetchUrl("https://cdn.brand.example/a.jpg").ok, true);
});

test("unsupported or fake image content is refused, whatever the URL extension or content type says", async () => {
  const cases = [
    [gif, "gif", /GIF images are not accepted/],
    [Buffer.from("<!doctype html><html><body>Not found</body></html>"), "jpeg", /not a JPEG, PNG, WebP or AVIF/],
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "svg+xml", /not a JPEG, PNG, WebP or AVIF/],
    [Buffer.from("just some bytes pretending to be a jpg file"), "jpeg", /not a JPEG, PNG, WebP or AVIF/],
    [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]), "jpeg", /cannot be decoded/],
  ];
  for (const [buffer, kind, msg] of cases) {
    const { d, records } = deps({ fetchImage: served(buffer, kind, "https://cdn.brand.example/fake.jpg") });
    const r = await importExternalImage("https://cdn.brand.example/fake.jpg", "SKU-1", d);
    assert.equal(r.ok, false);
    assert.equal(r.status, 415);
    assert.match(r.error, msg);
    assert.equal(records.length, 0);
  }
  // Download-level refusals map to clear statuses.
  assert.equal(fetchFailureStatus("served as text/html, not an image"), 415);
  assert.equal(fetchFailureStatus("SVG is not accepted"), 415);
  assert.equal(fetchFailureStatus("HTTP 404"), 422);
  assert.equal(fetchFailureStatus("HTTP 503", true), 502);
});

test("AVIF and oversized images are converted to JPEG within the storage limit; refused when no converter is available", async () => {
  const before = (await objects()).length;
  const a = deps({ fetchImage: served(avif, "avif") });
  const r1 = await importExternalImage("https://cdn.brand.example/p/a.avif", "SKU-AVIF", a.d);
  assert.deepEqual([r1.ok, r1.converted, r1.format], [true, true, "image/jpeg"], JSON.stringify(r1));
  assert.match(r1.key, /\.jpg$/);
  assert.equal(a.records[0].sourceFormat, "avif");
  assert.ok(a.records[0].sourceSha256, "the original's hash is kept when the stored bytes differ");

  const b = deps({ fetchImage: served(big) });
  const r2 = await importExternalImage("https://cdn.brand.example/p/huge.jpg", "SKU-BIG", b.d);
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.ok(r2.bytes <= IMAGE_UPLOAD.maxBytes && Math.max(r2.width, r2.height) <= IMPORT_LIMITS.convertMaxDimension, JSON.stringify(r2));
  assert.equal((await objects()).length, before + 2);

  for (const [buf, kind, status] of [[avif, "avif", 415], [big, "jpeg", 413]]) {
    const c = deps({ fetchImage: served(buf, kind), sharp: null });
    const r = await importExternalImage("https://cdn.brand.example/p/q", "SKU-NOSHARP", c.d);
    assert.deepEqual([r.ok, r.status], [false, status]);
    assert.match(r.error, /Upload File/);
  }
  // Source over the download limit: refused by the downloader.
  assert.equal(fetchFailureStatus(`file too large (> ${IMPORT_LIMITS.sourceMaxBytes} bytes)`), 413);
});

test("storage failures: failed upload, unreachable public URL or unreachable storage leave nothing behind and record nothing", async () => {
  const before = await objects();
  await control("/__fail-puts?count=1");
  let x = deps({ fetchImage: served(png, "png") });
  let r = await importExternalImage("https://cdn.brand.example/p/b.png", "SKU-FAIL", x.d);
  assert.deepEqual([r.ok, r.status], [false, 502]);
  assert.match(r.error, /refused the upload/);
  assert.deepEqual(await objects(), before);
  assert.equal(x.records.length, 0);

  await control("/__fail-public?count=1");
  x = deps({ fetchImage: served(png, "png") });
  r = await importExternalImage("https://cdn.brand.example/p/b.png", "SKU-FAIL", x.d);
  assert.deepEqual([r.ok, r.status], [false, 502]);
  assert.deepEqual(await objects(), before, "the object created by this import was removed");
  assert.equal(x.records.length, 0);

  const deadCfg = getSupabaseStorageConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SECRET_KEY: SECRET });
  const dead = { ...storage, store: createSupabaseStore(deadCfg.config) };
  x = deps({ fetchImage: served(png, "png"), storage: dead });
  r = await importExternalImage("https://cdn.brand.example/p/b.png", "SKU-FAIL", x.d);
  assert.deepEqual([r.ok, r.status], [false, 502]);
});

test("audit-log (MongoDB) failure: the new object is removed; an existing object is never deleted", async () => {
  const before = await objects();
  const failing = { record: async () => { throw new Error("MongoServerSelectionError"); } };
  let x = deps({ fetchImage: served(png, "png", "https://cdn.brand.example/p/c.png"), ...failing });
  let r = await importExternalImage("https://cdn.brand.example/p/c.png", "SKU-MONGO", x.d);
  assert.deepEqual([r.ok, r.status], [false, 500]);
  assert.deepEqual(await objects(), before, "nothing left behind");

  // Same image already stored for this product (from an earlier successful import) → the failure must not delete it.
  x = deps({ fetchImage: served(jpeg) });
  const ok = await importExternalImage("https://cdn.brand.example/p/x.jpg", "WST-3617.TRK", x.d);
  assert.equal(ok.reused, true);
  x = deps({ fetchImage: served(jpeg), ...failing });
  r = await importExternalImage("https://cdn.brand.example/p/x.jpg", "WST-3617.TRK", x.d);
  assert.equal(r.status, 500);
  assert.ok((await objects()).includes(ok.key), "an existing stored image is never deleted");
  // Audit lookup failure is not fatal (treated as "no earlier import").
  x = deps({ fetchImage: served(jpeg), findPrevious: async () => { throw new Error("down"); } });
  assert.equal((await importExternalImage("https://cdn.brand.example/p/x.jpg", "WST-3617.TRK", x.d)).ok, true);
});

test("gallery helpers: in-place replacement keeps every other image and the primary position; external detection", () => {
  const ext = "https://microless.com/cdn/products/a-hi.jpg", stored = `${"https://x.supabase.co/storage/v1/object/public/product-images"}/products/a/1.jpg`;
  assert.deepEqual(replaceImageInPlace([ext, "https://keep.example/2.jpg"], ext, stored), [stored, "https://keep.example/2.jpg"], "primary stays primary");
  assert.deepEqual(replaceImageInPlace(["/a.png", ext], ext, stored), ["/a.png", stored]);
  assert.deepEqual(replaceImageInPlace([ext, stored], ext, stored), [stored], "no duplicate when the copy is already present");
  assert.deepEqual(replaceImageInPlace(["https://other.example/1.jpg"], ext, stored), ["https://other.example/1.jpg"], "unknown image → unchanged");
  assert.deepEqual(replaceImageInPlace([ext, "/featured/hisense-window-ac.png"], ext, stored), [stored], "the display placeholder is never kept");
  const baseUrl = "https://x.supabase.co/storage/v1/object/public/product-images";
  assert.equal(isExternalImage(ext, baseUrl), true);
  assert.equal(isExternalImage(stored, baseUrl), false);
  assert.equal(isExternalImage("/featured/a.png", baseUrl), false);
  assert.equal(isExternalImage("http://insecure.example/a.jpg", baseUrl), false, "only https links can be imported");
});
