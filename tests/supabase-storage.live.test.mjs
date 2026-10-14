// OPT-IN round trip against the REAL Supabase bucket. Skipped unless SUPABASE_LIVE_TEST=1.
// Uploads one tiny JPEG under products/live-test/…, verifies it and its public URL, checks that
// the publishable key cannot upload or delete, then deletes the object.
//   SUPABASE_LIVE_TEST=1 node --env-file=.env.local --import ./tests/support/register-ts.mjs --test tests/supabase-storage.live.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

const live = process.env.SUPABASE_LIVE_TEST === "1";
const sb = await import("@/lib/supabase-storage");
const r2 = await import("@/lib/r2");
const cfg = sb.getSupabaseStorageConfig();
const skip = !live ? "set SUPABASE_LIVE_TEST=1 to run against the real bucket" : !cfg.ok ? `Supabase not configured: ${[...cfg.missing, ...cfg.invalid].join(", ")}` : false;
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

test("signed upload → verify → public URL → delete", { skip, timeout: 60_000 }, async () => {
  const store = sb.createSupabaseStore(cfg.config);
  const key = r2.createImageKey("image/jpeg", undefined, undefined, "live-test");
  try {
    const url = await store.presignPut(key, "image/jpeg", JPEG.length);
    const put = await fetch(url, { method: "PUT", headers: store.uploadHeaders("image/jpeg"), body: JPEG });
    assert.equal(put.status, 200, await put.text());
    assert.deepEqual(await r2.verifyUploadedImage(store, key), { ok: true, contentType: "image/jpeg", size: JPEG.length });
    const pub = await fetch(`${cfg.config.publicBaseUrl}/${key}`);
    assert.equal(pub.status, 200, "public URL is not serving the object — is the bucket public?");
    assert.match(pub.headers.get("content-type") ?? "", /image\/jpeg/);
    const again = await fetch(url, { method: "PUT", headers: store.uploadHeaders("image/jpeg"), body: JPEG });
    assert.ok(again.status >= 400, `a signed URL must not overwrite (got ${again.status})`);
  } finally {
    await store.delete(key);
  }
  assert.equal(await store.head(key), null, "test object removed");
});

test("the publishable key cannot upload, overwrite or delete objects", { skip: skip || (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && "set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), timeout: 60_000 }, async () => {
  const pk = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const headers = { apikey: pk, Authorization: `Bearer ${pk}` };
  const key = r2.createImageKey("image/jpeg", undefined, undefined, "live-test");
  const base = `${cfg.config.url}/storage/v1/object/${cfg.config.bucket}`;
  const upload = await fetch(`${base}/${key}`, { method: "POST", headers: { ...headers, "Content-Type": "image/jpeg" }, body: JPEG });
  assert.ok(upload.status >= 400, `anonymous upload must be refused (got ${upload.status})`);
  const sign = await fetch(`${cfg.config.url}/storage/v1/object/upload/sign/${cfg.config.bucket}/${key}`, { method: "POST", headers });
  assert.ok(sign.status >= 400, `anonymous signed-URL creation must be refused (got ${sign.status})`);
  const del = await fetch(base, { method: "DELETE", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [key] }) });
  const removed = del.ok ? await del.json() : [];
  assert.equal(Array.isArray(removed) ? removed.length : 0, 0, "anonymous delete must remove nothing");
  const store = sb.createSupabaseStore(cfg.config);
  assert.equal(await store.head(key), null, "nothing was created");
});
