// Admin product gallery, end to end in real headless Chrome: file input → presign → PUT to storage → verify →
// saved to MongoDB → rendered (admin gallery, admin list, public product page), plus failure and recovery paths.
// Runs against a local app server whose storage is tests/support/fake-supabase-storage.mjs and whose database is
// an ISOLATED local test database. Nothing reaches Supabase or a production database.
//
// Env: TEST_E2E_BASE_URL (app, e.g. http://localhost:3917), TEST_FAKE_SUPABASE_URL (the fake it uses),
//      TEST_MONGODB_URI (local), TEST_MONGODB_DB (the app's test database; name must contain "test" or "e2e").
// Needs Google Chrome (or CHROME_PATH).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { CHROME, launch } from "./support/cdp.mjs";

const require = createRequire(import.meta.url);
const BASE = process.env.TEST_E2E_BASE_URL, FAKE = process.env.TEST_FAKE_SUPABASE_URL;
const uri = process.env.TEST_MONGODB_URI, dbName = process.env.TEST_MONGODB_DB;
const skip = !(BASE && FAKE && CHROME && uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri) && /test|e2e/i.test(dbName ?? "")) &&
  "set TEST_E2E_BASE_URL, TEST_FAKE_SUPABASE_URL, TEST_MONGODB_URI (local), TEST_MONGODB_DB (test db) and install Chrome";
const PUBLIC = `${FAKE}/storage/v1/object/public/product-images/`;
const sha = (b) => createHash("sha256").update(b).digest("hex");
let b, client, products, files = {};

const objects = async () => (await (await fetch(`${FAKE}/__objects`)).json());
const doc = (id) => products.findOne({ id }, { projection: { _id: 0 } });
const presignCalls = () => b.events.network.filter((n) => n.method === "POST" && /\/api\/admin\/uploads\/presign/.test(n.url)).length;
const STATE = `(() => {
  const g = document.querySelector("[data-gallery]"); if (!g) return null;
  const mainImg = g.querySelector('[data-testid="gallery-main"] img');
  return {
    main: mainImg ? { src: mainImg.getAttribute("src"), loaded: mainImg.complete && mainImg.naturalWidth > 0 } : null,
    mainFailed: !!g.querySelector('[data-testid="gallery-main"] [data-image-failed]'),
    thumbs: [...g.querySelectorAll("[data-thumb-kind]")].map((t) => ({ kind: t.dataset.thumbKind, src: t.querySelector("img")?.getAttribute("src") ?? null, loaded: !!t.querySelector("img")?.naturalWidth })),
    count: g.querySelector('[data-testid="gallery-count"]')?.innerText ?? "",
    error: g.querySelector('[data-testid="gallery-error"]')?.innerText ?? null,
    busy: !!g.querySelector('[data-testid="gallery-busy"]'),
    placeholderShown: [...g.querySelectorAll("img")].some((i) => (i.getAttribute("src") || "").includes("hisense-window-ac")),
  };
})()`;
const state = () => b.evaluate(STATE);
const idle = () => b.waitFor(`(() => { const g = document.querySelector("[data-gallery]"); return g && !g.querySelector('[data-testid="gallery-busy"]') && ![...g.querySelectorAll("[data-thumb-kind=pending]")].some((t) => !t.querySelector("svg.lucide-circle-alert, svg.lucide-alert-circle")); })()`, 30000);
const login = () => b.evaluate(`fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@halimatrading.com",password:"HalimaAdmin2026!"})}).then(r=>r.status)`);
const openEdit = async (id) => { await b.goto(`${BASE}/admin/products/${id}/edit`); assert.ok(await b.waitFor(`!!document.querySelector("[data-gallery] input[type=file]") && !/Loading product details/.test(document.body.innerText)`, 120000), "edit page loads"); await b.waitFor(`!/Checking image storage/.test(document.body.innerText)`, 15000); };
const clickThumb = (src) => b.evaluate(`[...document.querySelectorAll("[data-thumb-kind]")].find((t) => t.querySelector("img")?.getAttribute("src") === ${JSON.stringify(src)})?.click()`);
const clickButton = (re) => b.evaluate(`(() => { const el = [...document.querySelectorAll("[data-gallery] button")].find((x) => ${re}.test(x.innerText) || ${re}.test(x.title)); el?.click(); return !!el; })()`);
const objectBytes = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());

before(async () => {
  if (skip) return;
  const sharp = require("sharp");
  const dir = mkdtempSync(path.join(tmpdir(), "gallery-e2e-"));
  const raw = Buffer.alloc(900 * 600 * 3); for (let i = 0; i < raw.length; i += 3) { const p = i / 3; raw[i] = 180; raw[i + 1] = (p % 900) % 256; raw[i + 2] = Math.floor(p / 900) % 256; }
  files.jpg = path.join(dir, "photo.jpg"); await sharp(raw, { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 88 }).toFile(files.jpg);
  files.jpg2 = path.join(dir, "photo2.jpg"); await sharp(raw, { raw: { width: 900, height: 600, channels: 3 } }).rotate(90).jpeg({ quality: 80 }).toFile(files.jpg2);
  files.png = path.join(dir, "photo.png"); await sharp({ create: { width: 640, height: 480, channels: 4, background: { r: 20, g: 120, b: 200, alpha: 0.6 } } }).png().toFile(files.png);
  files.big = path.join(dir, "big.png"); await sharp({ create: { width: 3000, height: 3000, channels: 3, background: "#777" } }).png({ compressionLevel: 0 }).toFile(files.big);
  files.txt = path.join(dir, "notes.txt"); writeFileSync(files.txt, "not an image");
  const { MongoClient } = require("mongodb");
  client = await new MongoClient(uri).connect();
  products = client.db(dbName).collection("products");
  await products.deleteMany({ id: { $in: ["e2e-upload-test", "e2e-noimage"] } });
  const now = new Date("2026-10-01T00:00:00Z");
  const base = { brand: "Gree", brandSlug: "gree", category: "Air Conditioning", categorySlug: "air-conditioning", features: ["Quiet"], currency: "AED", featured: false, createdAt: now, updatedAt: now };
  await products.insertMany([
    { ...base, id: "e2e-upload-test", slug: "e2e-upload-test", sku: "E2E-UPLOAD-1", name: "E2E Upload Test Split AC", model: "E2E-MODEL-1", subcategory: "Split Air Conditioners", description: "draft", specifications: { Capacity: "1.5 Ton", Note: "value: with colon" }, price: 1234, priceLabel: "1234 AED", images: ["/featured/ogeneral-split-indoor.png"], inStock: true, stockCount: 7, deliveryRate: 25, status: "draft" },
    { ...base, id: "e2e-noimage", slug: "e2e-noimage", sku: "E2E-NOIMG-1", name: "E2E No Image Fridge", brand: "LG", brandSlug: "lg", model: "E2E-NOIMG", category: "Refrigeration", categorySlug: "refrigeration", subcategory: "General", description: "", specifications: {}, price: 999, priceLabel: "999 AED", images: [], inStock: true, stockCount: 3, deliveryRate: 0, status: "active" },
  ]);
  b = await launch();
  await b.goto(`${BASE}/`);
  assert.equal(await login(), 200);
});
after(async () => {
  if (skip) return;
  b?.close();
  await client?.close();
});

test("a product without images shows an empty gallery — the placeholder is not presented as an image", { skip }, async () => {
  await openEdit("e2e-noimage");
  const s = await state();
  assert.deepEqual(s.thumbs, []);
  assert.equal(s.main, null);
  assert.match(s.count, /^0 images saved/);
  assert.equal(s.placeholderShown, false);
});

test("JPEG upload: instant local preview, then the real storage URL — saved to MongoDB without clicking Save; original bytes stored", { skip }, async () => {
  const objectsBefore = await objects();
  await b.intercept(["*/storage/v1/object/upload/sign/*"], () => ({ delay: 2500 })); // slow storage so the in-progress state is observable
  await b.setFiles("[data-gallery] input[type=file]", [files.jpg]);
  assert.ok(await b.waitFor(`!!document.querySelector('[data-testid="gallery-busy"]')`, 5000), "loading indicator shown");
  const during = await state();
  assert.match(during.main.src, /^blob:/, "the selected file is previewed immediately");
  assert.equal(during.placeholderShown, false, "no default image while uploading");
  await b.intercept(null);
  assert.ok(await idle(), "upload finishes");
  const s = await state();
  assert.equal(s.error, null);
  assert.ok(s.main.src.startsWith(PUBLIC + "products/e2e-noimg-1/") && s.main.src.endsWith(".jpg"), `main preview uses the storage URL (${s.main.src})`);
  assert.ok(s.main.loaded, "the stored image actually loads");
  assert.equal(s.placeholderShown, false);
  const d = await doc("e2e-noimage");
  assert.deepEqual(d.images, [s.main.src], "saved immediately, real URL only, no placeholder");
  const added = (await objects()).filter((o) => !objectsBefore.includes(o));
  assert.equal(added.length, 1);
  assert.equal(sha(await objectBytes(s.main.src)), sha(readFileSync(files.jpg)), "the original file was stored unchanged");
});

test("PNG upload keeps existing images, stores the original PNG and becomes the shown image", { skip }, async () => {
  await openEdit("e2e-upload-test");
  assert.equal((await state()).thumbs.length, 1);
  await b.setFiles("[data-gallery] input[type=file]", [files.png]);
  assert.ok(await idle());
  const s = await state();
  assert.ok(s.main.src.startsWith(PUBLIC + "products/e2e-upload-1/") && s.main.src.endsWith(".png"));
  assert.ok(s.main.loaded);
  const d = await doc("e2e-upload-test");
  assert.deepEqual(d.images, ["/featured/ogeneral-split-indoor.png", s.main.src], "existing image preserved, new one appended");
  assert.equal(sha(await objectBytes(s.main.src)), sha(readFileSync(files.png)), "PNG stored as uploaded (transparency kept)");
});

test("uploaded images survive a page reload and a logout/login", { skip }, async () => {
  const saved = (await doc("e2e-upload-test")).images;
  await openEdit("e2e-upload-test");
  let s = await state();
  assert.deepEqual(s.thumbs.map((t) => t.src), saved);
  assert.ok(await b.waitFor(`[...document.querySelectorAll("[data-thumb-kind] img")].every((i) => i.complete && i.naturalWidth > 0)`, 10000), "all thumbnails load");
  await b.evaluate(`fetch("/api/admin/logout",{method:"POST"}).then(r=>r.status)`);
  assert.equal(await login(), 200);
  await openEdit("e2e-upload-test");
  s = await state();
  assert.deepEqual(s.thumbs.map((t) => t.src), saved);
});

test("set primary reorders without dropping images; remove saves immediately and deletes only that unreferenced object", { skip }, async () => {
  const [local, png] = (await doc("e2e-upload-test")).images;
  await clickThumb(png);
  assert.ok(await clickButton(/Set as Primary/), "set-primary button");
  assert.ok(await b.waitFor(`!document.querySelector('[data-testid="gallery-busy"]')`, 10000));
  assert.deepEqual((await doc("e2e-upload-test")).images, [png, local]);
  assert.equal((await state()).main.src, png);
  const key = png.slice(PUBLIC.length);
  assert.ok((await objects()).includes(`product-images/${key}`));
  await clickThumb(png);
  assert.ok(await clickButton(/Remove Image/), "remove button");
  assert.ok(await b.waitFor(`!document.querySelector('[data-testid="gallery-busy"]')`, 10000));
  assert.ok(b.events.dialogs.some((m) => /Remove this image/.test(m)), "removal asks for confirmation");
  assert.deepEqual((await doc("e2e-upload-test")).images, [local]);
  assert.ok(!(await objects()).includes(`product-images/${key}`), "the removed, now unreferenced object was released");
  assert.equal((await state()).main.src, local);
});

test("invalid file types and files over 5 MB are refused before any upload", { skip }, async () => {
  const before = presignCalls(), imgs = (await doc("e2e-upload-test")).images;
  await b.setFiles("[data-gallery] input[type=file]", [files.txt]);
  await b.waitFor(`!!document.querySelector('[data-testid="gallery-error"]')`, 5000);
  assert.match((await state()).error, /only JPEG, PNG, WebP and AVIF/);
  await b.setFiles("[data-gallery] input[type=file]", [files.big]);
  await b.waitFor(`/limit is 5 MB/.test(document.querySelector('[data-testid="gallery-error"]')?.innerText || "")`, 5000);
  assert.match((await state()).error, /is \d+(\.\d)? MB — the limit is 5 MB/);
  assert.equal(presignCalls(), before, "nothing was sent to storage");
  assert.deepEqual((await doc("e2e-upload-test")).images, imgs);
});

test("a failed storage upload shows an error and saves nothing (no default image presented as success)", { skip }, async () => {
  await clickButton(/^$/); // dismiss nothing; keep state
  const imgs = (await doc("e2e-upload-test")).images, objs = await objects();
  await fetch(`${FAKE}/__fail-puts?count=1`, { method: "POST" });
  await b.setFiles("[data-gallery] input[type=file]", [files.jpg2]);
  assert.ok(await b.waitFor(`/rejected by image storage/.test(document.querySelector('[data-testid="gallery-error"]')?.innerText || "")`, 20000));
  const s = await state();
  assert.ok(s.thumbs.some((t) => t.kind === "pending"), "failed file stays visible as failed");
  assert.equal(s.placeholderShown, false);
  assert.deepEqual((await doc("e2e-upload-test")).images, imgs, "product unchanged");
  assert.deepEqual(await objects(), objs, "nothing stored");
  await clickButton(/Dismiss/);
});

test("upload succeeds but saving fails: kept as 'not saved', and Retry saves it without uploading again", { skip }, async () => {
  const imgs = (await doc("e2e-upload-test")).images;
  let failed = 0;
  await b.intercept(["*/api/admin/products/images"], () => (failed++ === 0 ? { status: 500, body: { error: "Simulated database outage" } } : undefined));
  await b.setFiles("[data-gallery] input[type=file]", [files.jpg2]);
  assert.ok(await b.waitFor(`/Simulated database outage/.test(document.querySelector('[data-testid="gallery-error"]')?.innerText || "")`, 20000));
  let s = await state();
  const unsaved = s.thumbs.find((t) => t.kind === "unsaved");
  assert.ok(unsaved && unsaved.src.startsWith(PUBLIC), "uploaded URL kept as not saved");
  assert.deepEqual((await doc("e2e-upload-test")).images, imgs, "nothing written while the save failed");
  const presigns = presignCalls();
  assert.ok(await clickButton(/Retry saving/), "retry button");
  assert.ok(await b.waitFor(`!document.querySelector("[data-thumb-kind=unsaved]") && !document.querySelector('[data-testid="gallery-busy"]')`, 10000));
  await b.intercept(null);
  assert.equal(presignCalls(), presigns, "no second upload");
  assert.deepEqual((await doc("e2e-upload-test")).images, [...imgs, unsaved.src]);
  s = await state();
  assert.equal(s.main.src, unsaved.src);
});

test("the main form Save keeps the gallery and every other field unchanged", { skip }, async () => {
  const before = await doc("e2e-upload-test");
  await b.evaluate(`[...document.querySelectorAll("button[type=submit]")].find((x) => /save/i.test(x.innerText))?.click()`);
  assert.ok(await b.waitFor(`/updated successfully/.test(document.body.innerText)`, 20000));
  const after = await doc("e2e-upload-test");
  for (const k of Object.keys(before).filter((k) => k !== "updatedAt")) assert.deepEqual(after[k], before[k], `field ${k} unchanged`);
});

test("the uploaded image renders on the public product page and in the admin product list", { skip }, async () => {
  const [url] = (await doc("e2e-noimage")).images;
  await b.goto(`${BASE}/shop/e2e-noimage`);
  assert.ok(await b.waitFor(`[...document.images].some((i) => i.getAttribute("src") === ${JSON.stringify(url)} && i.complete && i.naturalWidth > 0)`, 60000), "public product page shows the stored image");
  await b.goto(`${BASE}/admin/products`);
  assert.ok(await b.waitFor(`[...document.images].some((i) => i.getAttribute("src") === ${JSON.stringify(url)})`, 60000), "admin list thumbnail uses the stored image");
});

test("Add Product: an uploaded image is saved with the new product, never the placeholder", { skip }, async () => {
  await b.goto(`${BASE}/admin/products/add`);
  assert.ok(await b.waitFor(`!!document.querySelector("[data-gallery] input[type=file]")`, 120000));
  await b.waitFor(`!/Checking image storage/.test(document.body.innerText)`, 15000);
  await b.evaluate(`(() => {
    const set = (el, v) => { const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
    const byPlaceholder = (p) => document.querySelector('input[placeholder^="' + p + '"]');
    set(byPlaceholder("e.g. Samsung 1.5 Ton"), "E2E Added Product");
    set(byPlaceholder("e.g. Samsung, Super General"), "Gree");
    set(byPlaceholder("e.g. AR18TYHYEWKN"), "E2E-ADD-1");
    set(byPlaceholder("e.g. 1899"), "1500");
    set(byPlaceholder("e.g. 12"), "4");
    set(byPlaceholder("0 for Free Delivery"), "0");
    const category = document.querySelector("select[required]"); set(category, [...category.options].find((o) => o.value).value);
  })()`);
  await b.setFiles("[data-gallery] input[type=file]", [files.jpg]);
  assert.ok(await idle());
  const url = (await state()).main.src;
  assert.ok(url.startsWith(PUBLIC));
  await b.evaluate(`[...document.querySelectorAll("button[type=submit]")].find((x) => /save/i.test(x.innerText))?.click()`);
  assert.ok(await b.waitFor(`/created successfully/.test(document.body.innerText)`, 20000));
  const created = await products.findOne({ name: "E2E Added Product" });
  assert.deepEqual(created.images, [url]);
  await products.deleteOne({ name: "E2E Added Product" });
});

test("no uncaught page errors during the whole flow", { skip }, async () => {
  assert.deepEqual(b.events.exceptions, []);
  const appErrors = b.events.console.filter((m) => !/Failed to load resource|favicon|webpack-hmr|Download the React DevTools/i.test(m));
  assert.deepEqual(appErrors, []);
});
