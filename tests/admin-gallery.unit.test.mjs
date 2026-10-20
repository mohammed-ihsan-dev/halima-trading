// Admin product gallery rules: image-list updates, primary selection, placeholder handling, upload validation,
// server-side URL rules and the repository default. Pure functions only — no network, database or storage.
import assert from "node:assert/strict";
import test from "node:test";

const g = await import("@/lib/admin-gallery");
const { checkImageFile } = await import("@/lib/admin-image-upload");
const { validateProductImages } = await import("@/lib/product-images");
const { buildProductDocument } = await import("@/lib/repositories/products");

const SB = "https://x.supabase.co/storage/v1/object/public/product-images";
const a = `${SB}/products/sku-1/11111111-1111-4111-8111-111111111111.jpg`;
const b = `${SB}/products/sku-1/22222222-2222-4222-8222-222222222222.png`;
const c = `${SB}/products/sku-1/33333333-3333-4333-8333-333333333333.webp`;

test("the placeholder is never a gallery image; empty and non-string entries are dropped", () => {
  assert.deepEqual(g.realImages([g.PLACEHOLDER_IMAGE_PATH]), []);
  assert.deepEqual(g.realImages([g.PLACEHOLDER_IMAGE_PATH, a, "", "  ", null, 5]), [a]);
  assert.deepEqual(g.realImages(undefined), []);
});

test("appending uploads keeps existing images, skips duplicates and selects the first new image", () => {
  assert.deepEqual(g.appendImages([a], [b, c]), { images: [a, b, c], select: b });
  assert.deepEqual(g.appendImages([a, b], [b]), { images: [a, b], select: a }, "a duplicate is not added twice");
  assert.deepEqual(g.appendImages([g.PLACEHOLDER_IMAGE_PATH], [a]), { images: [a], select: a }, "a real image replaces the placeholder");
  assert.deepEqual(g.appendImages([], [a, a]), { images: [a], select: a });
});

test("set primary moves one image to the front without dropping or duplicating others", () => {
  assert.deepEqual(g.makePrimary([a, b, c], c), [c, a, b]);
  assert.deepEqual(g.makePrimary([a, b, c], a), [a, b, c]);
  assert.deepEqual(g.makePrimary([a, b], "https://unknown.example/x.jpg"), [a, b], "unknown image: unchanged");
});

test("remove drops exactly one image and selects its neighbour", () => {
  assert.deepEqual(g.removeImage([a, b, c], b), { images: [a, c], select: c });
  assert.deepEqual(g.removeImage([a, b, c], c), { images: [a, b], select: b });
  assert.deepEqual(g.removeImage([a], a), { images: [], select: null });
});

test("only permanent image addresses are accepted from the URL field", () => {
  for (const bad of ["blob:http://localhost:3000/5d0e-…", "C:\\fakepath\\photo.png", "file:///Users/me/photo.png", "D:/photos/a.jpg", "\\\\server\\share\\a.jpg", "http://cdn.example/a.jpg", "photo.png", ""]) {
    assert.ok(g.permanentImageProblem(bad), `rejected: ${bad}`);
  }
  for (const ok of [a, "/featured/midea-window-ac.png", "https://cdn.example.com/a.webp"]) assert.equal(g.permanentImageProblem(ok), null, ok);
});

test("upload validation: supported types only, nothing empty, nothing over the configured limit", () => {
  const config = { enabled: true, maxBytes: 5 * 1024 * 1024, allowedTypes: ["image/jpeg", "image/png", "image/webp"] };
  assert.equal(checkImageFile({ name: "a.jpg", type: "image/jpeg", size: 200_000 }, config), null);
  assert.equal(checkImageFile({ name: "a.avif", type: "image/avif", size: 200_000 }, config), null, "AVIF is accepted (converted to JPEG in the browser)");
  assert.match(checkImageFile({ name: "a.gif", type: "image/gif", size: 1000 }, config), /only JPEG, PNG, WebP and AVIF/);
  assert.match(checkImageFile({ name: "a.svg", type: "image/svg+xml", size: 1000 }, config), /only JPEG, PNG, WebP and AVIF/);
  assert.match(checkImageFile({ name: "notes.txt", type: "text/plain", size: 10 }, config), /only JPEG/);
  assert.match(checkImageFile({ name: "e.png", type: "image/png", size: 0 }, config), /empty/);
  assert.match(checkImageFile({ name: "big.png", type: "image/png", size: 6 * 1024 * 1024 }, config), /is 6 MB — the limit is 5 MB/);
});

test("server rules refuse temporary browser references and local file paths, with a clear message", () => {
  const ctx = { storageEnabled: true, storageBaseUrl: SB, storedImages: [] };
  for (const bad of ["blob:https://halimatrading.com/0f1e", "C:\\fakepath\\image.png", "file:///tmp/a.png", "D:\\images\\a.jpg"]) {
    assert.match(validateProductImages([bad], ctx), /temporary or local file reference/, bad);
  }
  assert.equal(validateProductImages([a, b, "/featured/midea-window-ac.png"], ctx), null);
  assert.match(validateProductImages(["data:image/png;base64,iVBORw0KGgo="], ctx), /must be uploaded to image storage/, "no new embedded images when storage is configured");
});

test("a product created without images stores an empty list, not the placeholder", () => {
  assert.deepEqual(buildProductDocument({ name: "No image", sku: "NI-1" }).images, []);
  assert.deepEqual(buildProductDocument({ name: "With image", sku: "WI-1", images: [a] }).images, [a]);
});

test("one display resolver: first real image is primary; placeholder only when there is no real image", async () => {
  const d = await import("@/lib/product-image-display");
  assert.equal(d.primaryProductImage([a, b]), a);
  assert.equal(d.primaryProductImage([g.PLACEHOLDER_IMAGE_PATH, a]), a, "a stored placeholder never hides a real image");
  assert.equal(d.primaryProductImage(["", null, b]), b);
  assert.equal(d.primaryProductImage([]), g.PLACEHOLDER_IMAGE_PATH);
  assert.equal(d.primaryProductImage(undefined), g.PLACEHOLDER_IMAGE_PATH);
  assert.deepEqual(d.productImageList([g.PLACEHOLDER_IMAGE_PATH, a, b]), [a, b]);
  assert.equal(d.hasRealImage([g.PLACEHOLDER_IMAGE_PATH]), false);
});

test("public image fallback reports the failure once and never loops on the placeholder", async () => {
  const d = await import("@/lib/product-image-display");
  const warn = console.warn; const warnings = []; console.warn = (m) => warnings.push(m);
  try {
    const img = { dataset: {}, _src: a, getAttribute() { return this._src; }, set src(v) { this._src = v; }, get src() { return this._src; } };
    const onError = d.fallbackToPlaceholder("test");
    onError({ currentTarget: img });
    assert.equal(img.src, g.PLACEHOLDER_IMAGE_PATH);
    assert.equal(img.dataset.failed, a);
    onError({ currentTarget: img }); // the placeholder itself failing must not loop or re-report
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /failed to load in test/);
  } finally { console.warn = warn; }
});
