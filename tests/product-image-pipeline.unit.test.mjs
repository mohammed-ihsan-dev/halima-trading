// Product-image pipeline: permission policy, model checks, deterministic keys and file validation.
// Pure functions only — no network, database or storage access.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const { resolvePermission, filenameModelConflict, PERMISSION } = await import("../scripts/product-images/policy.mjs");
const { modelMatch } = await import("../scripts/product-images/sources.mjs");
const { deterministicUuid, inspect, sniff } = await import("../scripts/product-images/images.mjs");
const { isValidImageKey } = await import("@/lib/r2");

const register = {
  holders: {
    Pending: { domains: ["pending.example"], status: "permission_pending", summary: "copyright only", evidence: [{ url: "https://pending.example" }] },
    Denied: { domains: ["denied.example", "cdn.example/brand-folder"], status: "permission_denied", summary: "terms prohibit reuse", evidence: [] },
    ClaimedNoDoc: { domains: ["claimed.example"], status: "confirmed", grant: { grantedBy: "Brand", date: "2026-10-15", document: "does/not/exist.pdf" } },
  },
  products: {},
};

test("permission: unknown sources are pending, never confirmed", () => {
  const r = resolvePermission(register, { productId: "p", sourcePage: "https://unknown.example/x" });
  assert.equal(r.status, PERMISSION.PENDING);
  assert.equal(resolvePermission({}, { productId: "p", sourcePage: "https://brand.example/official" }).status, PERMISSION.PENDING, "official site alone is not permission");
});

test("permission: pending and denied records are applied by domain, subdomain and CDN folder", () => {
  assert.equal(resolvePermission(register, { sourcePage: "https://www.pending.example/product/a" }).status, PERMISSION.PENDING);
  assert.equal(resolvePermission(register, { sourcePage: "https://shop.denied.example/p" }).status, PERMISSION.DENIED);
  assert.equal(resolvePermission(register, { sourcePage: "https://other.example", imageUrl: "https://cdn.example/brand-folder/img.jpg" }).status, PERMISSION.DENIED);
  assert.equal(resolvePermission(register, { sourcePage: "https://other.example", imageUrl: "https://cdn.example/another-brand/img.jpg" }).status, PERMISSION.PENDING);
});

test("permission: 'confirmed' requires a complete written grant with a saved document", () => {
  assert.equal(resolvePermission(register, { sourcePage: "https://claimed.example/a" }).status, PERMISSION.PENDING);
  const dir = mkdtempSync(path.join(tmpdir(), "perm-"));
  writeFileSync(path.join(dir, "grant.pdf"), "grant");
  const ok = { holders: { Brand: { domains: ["claimed.example"], status: "confirmed", grant: { grantedBy: "Brand UAE", date: "2026-10-15", document: "grant.pdf" } } } };
  const r = resolvePermission(ok, { sourcePage: "https://claimed.example/a", root: dir });
  assert.equal(r.status, PERMISSION.CONFIRMED);
  assert.ok(r.evidence.some((e) => e.type === "grant"));
  const override = { ...ok, products: { p1: { status: "permission_denied", summary: "brand withdrew this image" } } };
  assert.equal(resolvePermission(override, { productId: "p1", sourcePage: "https://claimed.example/a", root: dir }).status, PERMISSION.DENIED, "a product override wins");
});

test("model checks: exact match only; file names of a different model are flagged", () => {
  assert.equal(modelMatch("GL-ICF350CGQ", "GL-ICF350CGQ Chest Freezer"), true);
  assert.equal(modelMatch("SGW 1056N", "https://www.supergeneral.com/product/10kg-twin-tub-washing-machine-sgw1056n"), true);
  assert.equal(modelMatch("GL-ICF350CGQ", "GL-ICF350CGQX"), false, "no partial-token matches");
  assert.equal(modelMatch("GACS2426PCUE", "GACS2426PCU"), false);
  assert.equal(filenameModelConflict("SG CL 50T3", "https://www.supergeneral.com/media/products/404/1668070715-sgcl80t3-1-1.webp"), "SGCL80T3");
  assert.equal(filenameModelConflict("SGW 1056N", "https://www.supergeneral.com/media/products/392/1668066971-sgw1056n-1.webp"), null);
  assert.equal(filenameModelConflict("GACS2426PCUE", "https://cdn.shopify.com/s/files/1/x/files/Artboard1_93ecb613-f240.jpg"), null, "unrelated hash-like names are not models");
});

test("storage keys: deterministic, valid for the app's key rules, different per product and per image", () => {
  const a = deterministicUuid("p1", "abc"), b = deterministicUuid("p1", "abc");
  assert.equal(a, b);
  assert.notEqual(a, deterministicUuid("p2", "abc"));
  assert.notEqual(a, deterministicUuid("p1", "abd"));
  assert.ok(isValidImageKey(`products/gl-icf350cgq/${a}.webp`), a);
});

test("file validation: HTML disguised as an image, tiny and blank images are rejected", async () => {
  assert.equal(sniff(Buffer.from("<!doctype html><html><body>blocked</body></html>")), "markup");
  assert.equal((await inspect(Buffer.from("<html><script>x</script></html>"))).ok, false);
  const sharp = (await import("node:module")).createRequire(import.meta.url)("sharp");
  const tiny = await sharp({ create: { width: 120, height: 120, channels: 3, background: "#336699" } }).png().toBuffer();
  assert.match((await inspect(tiny)).reason, /too small/);
  const blank = await sharp({ create: { width: 900, height: 900, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
  assert.match((await inspect(blank)).reason, /blank/);
  const noise = await sharp(Buffer.from(Array.from({ length: 600 * 600 * 3 }, (_, i) => (i * 37) % 251)), { raw: { width: 600, height: 600, channels: 3 } }).jpeg().toBuffer();
  const ok = await inspect(noise, "image/jpeg");
  assert.equal(ok.ok, true);
  assert.equal(ok.kind, "jpeg");
});

test("permission: supplier documents (catalogue PDFs) are matched by file name and stay pending without a grant", () => {
  const reg = { holders: { Nikai: { domains: [], documents: ["Nikai Cataloge 2025 26-03-25.pdf"], status: "permission_pending", summary: "no usage terms" } } };
  const r = resolvePermission(reg, { productId: "x", sourcePage: "Nikai Cataloge 2025 26-03-25.pdf p.92" });
  assert.equal(r.status, PERMISSION.PENDING);
  assert.equal(r.holder, "Nikai");
  assert.equal(resolvePermission(reg, { productId: "x", sourcePage: "Some Other Catalogue.pdf p.1" }).holder, null);
});

test("icecat: content token is stripped before storing and only added in memory for Icecat image hosts", async () => {
  const { stripToken, withContentToken } = await import("../scripts/product-images/sources.mjs");
  assert.equal(stripToken("https://images.icecat.biz/img/gallery/a.jpg?content_token=SECRET"), "https://images.icecat.biz/img/gallery/a.jpg");
  const prev = process.env.ICECAT_CONTENT_TOKEN;
  process.env.ICECAT_CONTENT_TOKEN = "test-token";
  try {
    assert.equal(withContentToken("https://images.icecat.biz/img/gallery/a.jpg"), "https://images.icecat.biz/img/gallery/a.jpg?content_token=test-token");
    assert.equal(withContentToken("https://example.com/a.jpg"), "https://example.com/a.jpg", "never sent to other hosts");
  } finally {
    if (prev === undefined) delete process.env.ICECAT_CONTENT_TOKEN; else process.env.ICECAT_CONTENT_TOKEN = prev;
  }
});

test("permission: a published licence counts only once its conditions are met", () => {
  const holder = (met) => ({ holders: { Icecat: { domains: ["images.icecat.biz"], status: "licensed", licence: "OPL", conditionsMet: met, conditions: ["notice", "AS IS"] } } });
  const q = { productId: "p", sourcePage: "https://live.icecat.biz/api?icecat_id=1", imageUrl: "https://images.icecat.biz/img/gallery/a.jpg" };
  const pending = resolvePermission(holder(false), q);
  assert.equal(pending.status, PERMISSION.PENDING);
  assert.match(pending.reason, /conditions are not yet met/);
  assert.equal(resolvePermission(holder(true), q).status, PERMISSION.CONFIRMED);
});
