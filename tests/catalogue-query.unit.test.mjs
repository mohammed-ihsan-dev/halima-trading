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
  // Parsed the way the shop parses it (its default sort is "featured").
  const state = q.parseCatalogueParams(new URLSearchParams("page=7&page=8&category=Refrigeration&utm=x"), q.defaultSortFor("/shop"));
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

// A product matches when every query word matches one of its fields (here: one joined string).
const finds = (query, text) => q.searchWordPatterns(query).every((p) => new RegExp(p, "i").test(text));

test("model numbers match with or without hyphens, slashes and spaces", () => {
  for (const query of ["HW80-BP12929", "HW80BP12929", "hw80 bp12929", "hw80bp12929("]) assert.ok(finds(query, "Haier 8kg Front Load Washing Machine HW80-BP12929"), query);
  assert.ok(finds("HSU18", "Haier LPB Series HSU-18/24LPB03"));
  assert.ok(finds("MFOMG36LESS", "Midea Gas Cooker MFO-MG36LE-SS"));
  assert.ok(finds("GRI4PRO24C3", "Gree High Wall Split AC GR-I4 Pro-24C3-IND"));
  assert.ok(finds("supergeneral", "Super General Chest Freezer"));
  assert.ok(finds("lg 8kg", "LG 8 Kg Front Load Washer"));
  assert.ok(!finds("HW80BP12930", "Haier HW80-BP12929"), "a different model does not match");
});

test("plurals, synonyms and whole-word short terms", () => {
  assert.ok(finds("washing machines", "Haier 8kg Front Load Washing Machine"));
  assert.ok(finds("chest freezers", "Midea 418L Chest Freezer"));
  assert.ok(finds("midea fridge", "Midea 346L Top Mount Refrigerator"));
  assert.ok(finds("refrigerators", "Haier 42L Single Door Mini Fridge"));
  assert.ok(finds("ac", "Gree Split AC GR-I4"));
  assert.ok(finds("aircon", "Super General Split Air Conditioner"));
  assert.ok(finds("haier washer", "Haier 12kg Top Load Washing Machine"));
  assert.ok(!finds("ac", "LG Black Refrigerator"), '"ac" must not match inside "black"');
  assert.ok(finds("lg", "LG Washer") && !finds("lg", "Bulgarian Oven"), "two-letter brand names match whole words only");
  assert.ok(finds("glass", "Black Glass T-Door Refrigerator"), "words ending in ss are not shortened");
});

test("search patterns are bounded and ignore punctuation-only words", () => {
  assert.equal(q.searchWordPatterns("a b c d e f g h i j").length, 8);
  assert.deepEqual(q.searchWordPatterns("  [  (  "), []);
  assert.ok(q.searchWordPatterns("(.*)+ ^$").length <= 2, "regex characters never reach the pattern unescaped");
  assert.equal(q.searchRankPattern("ac"), null);
  assert.ok(new RegExp(`^${q.searchRankPattern("hw80bp12929")}$`, "i").test("HW80-BP12929"));
  assert.ok(!new RegExp(`^${q.searchRankPattern("hw80bp12929")}$`, "i").test("HW80-BP12929S6"));
});

test("shop default sort is 'featured' (AC first, then A–Z); other listings keep 'newest'", () => {
  assert.equal(q.defaultSortFor("/shop"), "featured");
  assert.equal(q.defaultSortFor("/admin/products"), "newest");
  // The shop parses with its own default; an explicit choice (including "newest") is kept in the URL.
  assert.equal(q.parseCatalogueParams(new URLSearchParams(""), "featured").sort, "featured");
  assert.equal(q.parseCatalogueParams(new URLSearchParams("sort=newest"), "featured").sort, "newest");
  assert.equal(q.parseCatalogueParams(new URLSearchParams("sort=bogus"), "featured").sort, "featured");
  assert.equal(q.catalogueHref("/shop", { sort: "featured" }), "/shop");
  assert.equal(q.catalogueHref("/shop", {}), "/shop");
  assert.equal(q.catalogueHref("/shop", { sort: "newest" }), "/shop?sort=newest");
  assert.equal(q.catalogueHref("/shop", { sort: "featured", category: "Refrigeration", page: 2 }), "/shop?category=Refrigeration&page=2");
  // Admin URLs are unchanged: "newest" is still their default and stays out of the URL.
  assert.equal(q.catalogueHref("/admin/products", { sort: "newest", page: 2 }), "/admin/products?page=2");
  assert.equal(q.safeCatalogueReturnPath("/shop?sort=newest&page=3", "/shop"), "/shop?sort=newest&page=3");
  assert.equal(q.safeCatalogueReturnPath("/shop?page=3", "/shop"), "/shop?page=3");
});
