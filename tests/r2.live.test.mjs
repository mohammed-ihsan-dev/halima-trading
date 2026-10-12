// OPT-IN live round trip against the real R2 bucket. Skipped unless R2_LIVE_TEST=1.
// Uploads one tiny PNG under products/…, verifies it, checks rejections, then deletes it.
//   R2_LIVE_TEST=1 node --env-file=.env.local --import ./tests/support/register-ts.mjs --test tests/r2.live.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

const live = process.env.R2_LIVE_TEST === "1";
const r2 = await import("@/lib/r2");
const cfg = r2.getR2Config();
const skip = !live ? "set R2_LIVE_TEST=1 to run against the real bucket" : !cfg.ok ? `R2 not configured: ${[...cfg.missing, ...cfg.invalid].join(", ")}` : false;

// 1×1 transparent PNG
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));

test("presign → browser-style PUT → verify → public URL → delete", { skip, timeout: 60_000 }, async () => {
  const store = r2.createR2Store(cfg.config);
  const key = r2.createImageKey("image/png");
  try {
    const url = await store.presignPut(key, "image/png", PNG.byteLength);
    const put = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png", "Cache-Control": r2.IMAGE_UPLOAD.cacheControl }, body: PNG });
    assert.equal(put.status, 200, await put.text());
    assert.deepEqual(await r2.verifyUploadedImage(store, key), { ok: true, contentType: "image/png", size: PNG.byteLength });
    if (process.env.R2_LIVE_PUBLIC_CHECK === "1") {
      const pub = await fetch(r2.publicUrlForKey(cfg.config.publicBaseUrl, key));
      assert.equal(pub.status, 200, "public URL is not serving the object — check the bucket's public domain");
    }
  } finally {
    await store.delete(key);
  }
  assert.equal(await store.head(key), null, "test object removed");
});

test("R2 rejects uploads that do not match the signed type or size", { skip, timeout: 60_000 }, async () => {
  const store = r2.createR2Store(cfg.config);
  const key = r2.createImageKey("image/png");
  try {
    const url = await store.presignPut(key, "image/png", PNG.byteLength);
    const wrongType = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/svg+xml", "Cache-Control": r2.IMAGE_UPLOAD.cacheControl }, body: PNG });
    assert.equal(wrongType.status, 403);
    const wrongSize = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png", "Cache-Control": r2.IMAGE_UPLOAD.cacheControl }, body: new Uint8Array(PNG.byteLength + 10) });
    assert.ok(wrongSize.status >= 400, `oversized body accepted (${wrongSize.status})`);
  } finally {
    await store.delete(key);
  }
});
