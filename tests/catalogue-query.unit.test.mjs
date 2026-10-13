// Offline tests for catalogue URL state (lib/catalogue-query.ts) and shop page numbering. No network.
import assert from "node:assert/strict";
import test from "node:test";

const q = await import("@/lib/catalogue-query");

test("page and page size are validated and capped; invalid values fall back to defaults", () => {
  const parse = (s) => q.parseCatalogueParams(new URLSearchParams(s));
  assert.deepEqual(parse(""), q.DEFAULT_CATALOGUE_STATE);
  assert.equal(parse("page=7").page, 7);
  for (const bad of ["page=0", "page=-3", "page=abc", "page=1.5", "page=9999999"]) assert.equal(parse(bad).page, 1, bad);
  assert.equal(parse("limit=24").pageSize, 24);
  for (const bad of ["limit=1000", "limit=0", "limit=13", "limit=x"]) assert.equal(parse(bad).pageSize, 12, bad);
  assert.ok(q.MAX_PAGE_SIZE <= 48);
  assert.equal(parse("sort=low").sort, "low");
  assert.equal(parse("sort=$where").sort, "newest");
  assert.equal(parse(`q=${"x".repeat(500)}`).q.length, 100);
  assert.equal(parse("category=All").category, "", '"All" means no category filter');
  // Repeated keys: the first wins, never an array.
  assert.equal(q.parseCatalogueParams({ page: ["3", "9"] }).page, 3);
});

test("query strings are canonical: fixed order, defaults omitted, no duplicates", () => {
  assert.equal(q.catalogueHref("/shop", {}), "/shop");
  assert.equal(q.catalogueHref("/shop", { page: 1 }), "/shop");
  assert.equal(
    q.catalogueHref("/shop", { page: 7, pageSize: 24, q: "split ac", category: "Air Conditioning", sort: "az" }),
    "/shop?q=split+ac&category=Air+Conditioning&sort=az&limit=24&page=7"
  );
  const state = q.parseCatalogueParams(new URLSearchParams("page=7&page=8&category=Refrigeration&utm=x"));
  assert.equal(q.catalogueHref("/shop", state), "/shop?category=Refrigeration&page=7");
});

test("return paths: only the internal listing path is accepted, rebuilt from known parameters", () => {
  const ok = (v) => q.safeCatalogueReturnPath(v, "/shop");
  assert.equal(ok("/shop?page=7&category=Refrigeration&sort=low"), "/shop?category=Refrigeration&sort=low&page=7");
  assert.equal(ok("/shop"), "/shop");
  for (const bad of [
    "https://evil.example/shop?page=7", "//evil.example/shop", "/\\evil.example", "/shop/../admin", "/shopping?page=2",
    "/shop/some-product", "javascript:alert(1)", "/shop?page=7\n", "", null, 42, "/admin/products?page=2", "/shop@evil.example",
    `/shop?q=${"a".repeat(700)}`,
  ]) {
    assert.equal(ok(bad), null, JSON.stringify(bad));
  }
  // Unknown or hostile parameters are dropped, not passed through.
  assert.equal(ok("/shop?page=2&redirect=https://evil.example&from=/x"), "/shop?page=2");
  assert.equal(q.safeCatalogueReturnPath("/admin/products?page=7&q=lg", "/admin/products"), "/admin/products?q=lg&page=7");
  assert.equal(q.safeCatalogueReturnPath("/shop?page=7", "/admin/products"), null);
});

test("product links carry the return path only when it is not the default listing", () => {
  assert.equal(q.withReturnPath("/shop/lg-fridge", "/shop", "/shop"), "/shop/lg-fridge");
  assert.equal(q.withReturnPath("/shop/lg-fridge", undefined, "/shop"), "/shop/lg-fridge");
  const href = q.withReturnPath("/shop/lg-fridge", "/shop?category=A+B&page=7", "/shop");
  assert.equal(href, "/shop/lg-fridge?from=%2Fshop%3Fcategory%3DA%2BB%26page%3D7");
  const from = new URL(href, "http://x").searchParams.get("from");
  assert.equal(q.safeCatalogueReturnPath(from, "/shop"), "/shop?category=A+B&page=7", "round-trips without double encoding");
});

test("search words are lower-cased and bounded", () => {
  assert.deepEqual(q.searchTokens("  LG  Split\tAC "), ["lg", "split", "ac"]);
  assert.equal(q.searchTokens("a b c d e f g h i j").length, 8);
});

test("shop page numbers show neighbours of the current page with gaps", () => {
  assert.deepEqual(q.pageNumbers(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(q.pageNumbers(7, 31), [1, "gap", 6, 7, 8, "gap", 31]);
  assert.deepEqual(q.pageNumbers(1, 31), [1, 2, "gap", 31]);
  assert.deepEqual(q.pageNumbers(31, 31), [1, "gap", 30, 31]);
});

test("availability and price filters: only known values are accepted, and they appear in canonical URLs", () => {
  const parse = (s) => q.parseCatalogueParams(new URLSearchParams(s));
  assert.equal(parse("availability=in-stock").availability, "in-stock");
  assert.equal(parse("availability=on-request").availability, "on-request");
  assert.equal(parse("price=1000-3000").price, "1000-3000");
  for (const bad of ["availability=yes", "availability=", "price=0-999999", "price=__proto__", "price=constructor", "price=toString"]) {
    const s = parse(bad);
    assert.equal(s.availability + s.price, "", bad);
  }
  assert.equal(
    q.catalogueHref("/shop", { q: "lg", category: "Refrigeration", availability: "in-stock", price: "under-1000", sort: "low", page: 3 }),
    "/shop?q=lg&category=Refrigeration&availability=in-stock&price=under-1000&sort=low&page=3"
  );
  assert.equal(q.safeCatalogueReturnPath("/shop?price=over-3000&availability=on-request&page=2", "/shop"), "/shop?availability=on-request&price=over-3000&page=2");
  for (const range of Object.values(q.PRICE_RANGES)) {
    assert.ok((range.gt ?? range.gte) >= 0 && !("gte" in range && range.gte === 0), "no range can include a price of 0");
  }
});

test("stock rule matches checkout; admin price text never invents an amount", async () => {
  const { isInStock, adminPriceLabel } = await import("@/lib/pricing");
  assert.equal(isInStock({ inStock: true, stockCount: 5 }), true);
  assert.equal(isInStock({ inStock: true }), true, "no stock count is not a limit");
  assert.equal(isInStock({ inStock: true, stockCount: 0 }), false);
  assert.equal(isInStock({ inStock: false, stockCount: 9 }), false);
  assert.equal(adminPriceLabel({ price: 2000 }), "AED 2,000");
  assert.equal(adminPriceLabel({ price: 1499.5 }), "AED 1,499.5");
  for (const price of [0, null, undefined, -5, Number.NaN]) assert.equal(adminPriceLabel({ price }), "Contact for Price", String(price));
});
