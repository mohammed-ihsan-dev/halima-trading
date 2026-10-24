// Customer and admin pages in real headless Chrome: empty admin login form, no stock quantities for customers,
// fixed delivery charge, and no horizontal overflow at representative viewport widths.
// Runs against a local app server whose database is an ISOLATED local test database (no Stripe keys).
//
// Env: TEST_E2E_BASE_URL (app, e.g. http://localhost:3917), TEST_MONGODB_URI (local),
//      TEST_MONGODB_DB (the app's test database; name must contain "test" or "e2e").
//      TEST_SCREENSHOT_DIR (optional) saves a screenshot of every page at every width.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test, { after, before } from "node:test";
import { CHROME, launch } from "./support/cdp.mjs";

const require = createRequire(import.meta.url);
const { MongoClient } = require("mongodb");
const BASE = process.env.TEST_E2E_BASE_URL;
const uri = process.env.TEST_MONGODB_URI, dbName = process.env.TEST_MONGODB_DB;
const SHOTS = process.env.TEST_SCREENSHOT_DIR;
const skip = !(BASE && CHROME && uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri) && /test|e2e/i.test(dbName ?? "")) &&
  "set TEST_E2E_BASE_URL, TEST_MONGODB_URI (local), TEST_MONGODB_DB (test db) and install Chrome";

const RUN = `rw${process.pid}`;
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1180, 1280, 1366, 1440, 1920];
const LONG = "Super General 1.5 Ton Inverter Split Air Conditioner with Wi-Fi Control, Turbo Cooling and Self-Cleaning Function";
const SEED_PASSWORD = readFileSync(new URL("../lib/repositories/users.ts", import.meta.url), "utf8").match(/rawPassword: "([^"]+)"/)[1];
let b, client, db;

const product = (n, fields = {}) => ({
  id: `${RUN}-${n}`, slug: `${RUN}-${n}`, sku: `${RUN.toUpperCase()}-${n}`, name: n === 1 ? LONG : `${RUN} Refrigerator ${n}`, brand: "Super General",
  model: n === 1 ? "SGS-195-FE-INVERTER-WIFI-T3-R410A-2026-EDITION" : `${RUN.toUpperCase()}${n}`, category: "Air Conditioning", categorySlug: "air-conditioning",
  subcategory: "Split Air Conditioners", description: "Reliable cooling for UAE homes.", features: ["Inverter compressor", "Quiet operation"],
  specifications: { Capacity: "1.5 Ton" }, price: 1000 + n, priceLabel: `${1000 + n} AED`,
  images: [n % 2 ? "/featured/hisense-window-ac.png" : "/featured/ogeneral-split-indoor.png"], inStock: true, stockCount: n === 2 ? 1 : 7,
  featured: true, status: "active", createdAt: new Date(Date.now() + n * 1000), updatedAt: new Date(), ...fields,
});

const setWidth = (width) => b.send("Emulation.setDeviceMetricsOverride", { width, height: width < 768 ? 800 : 900, deviceScaleFactor: 1, mobile: width < 768 });
/** Elements sticking out past the right edge of the viewport (the cause of horizontal scrolling). */
const OVERFLOW = `(() => {
  const vw = document.documentElement.clientWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (sw <= vw + 1) return null;
  const culprits = [...document.querySelectorAll("body *")].filter((el) => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const cs = getComputedStyle(el); if (cs.position === "fixed" || cs.visibility === "hidden") return false;
    return r.right > vw + 1;
  }).filter((el, _, all) => !all.some((o) => o !== el && el.contains(o)))
    .slice(0, 6).map((el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : "") + " right=" + Math.round(el.getBoundingClientRect().right));
  return { scrollWidth: sw, viewport: vw, culprits };
})()`;

/** Header navigation and action labels that wrap onto more than one line. */
const WRAPPED_HEADER = `[...document.querySelectorAll("header nav a, header .header-actions a, header .header-actions .btn")]
  .filter((el) => el.offsetParent !== null && el.innerText.trim())
  .filter((el) => {
    // Only the text's own line boxes count (icons sit at a different height); lines are > 4px apart.
    const tops = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const x of r.getClientRects()) if (x.width > 1) tops.push(x.top);
    }
    return tops.some((t) => Math.abs(t - tops[0]) > 4);
  })
  .map((el) => el.innerText.trim().replace(/\\s+/g, " "))`;

async function settle(url) {
  await b.goto(url);
  await b.waitFor(`document.readyState === "complete"`, 30000);
  await new Promise((r) => setTimeout(r, 600));
}

before(async () => {
  if (skip) return;
  client = await new MongoClient(uri).connect();
  db = client.db(dbName);
  await db.collection("products").insertMany(Array.from({ length: 8 }, (_, i) => product(i + 1)));
  b = await launch();
});
after(async () => {
  if (skip) return;
  b?.close();
  await db.collection("products").deleteMany({ id: { $regex: `^${RUN}-` } });
  await client.close();
});

test("the admin login form starts empty, has clear placeholders and never auto-fills credentials", { skip }, async () => {
  await setWidth(1280);
  await settle(`${BASE}/admin/login`);
  await new Promise((r) => setTimeout(r, 1000)); // after hydration and any effects
  const form = await b.evaluate(`(() => {
    const e = document.querySelector("#admin-email"), p = document.querySelector("#admin-password");
    return { email: e?.value, password: p?.value, emailPh: e?.placeholder, passwordPh: p?.placeholder, passwordType: p?.type,
      emailAuto: e?.autocomplete, passwordAuto: p?.autocomplete, emailLabel: document.querySelector('label[for="admin-email"]')?.innerText,
      passwordLabel: document.querySelector('label[for="admin-password"]')?.innerText,
      demoButton: [...document.querySelectorAll("button")].some((x) => /demo|auto-?fill/i.test(x.innerText)),
      pageText: document.body.innerText };
  })()`);
  assert.equal(form.email, "");
  assert.equal(form.password, "");
  assert.equal(form.emailPh, "Enter Your Email");
  assert.equal(form.passwordPh, "Enter Your Password");
  assert.equal(form.passwordType, "password", "masked by default");
  assert.equal(form.emailAuto, "username");
  assert.equal(form.passwordAuto, "current-password", "password managers keep working");
  assert.match(form.emailLabel, /Email/);
  assert.match(form.passwordLabel, /Password/);
  assert.equal(form.demoButton, false);
  assert.equal(form.pageText.includes(SEED_PASSWORD), false);
  // Show/hide toggle works and is labelled.
  await b.evaluate(`document.querySelector('[aria-label="Show password"]').click()`);
  assert.equal(await b.evaluate(`document.querySelector("#admin-password").type`), "text");
  // A wrong password shows a clear error and does not sign in.
  await b.evaluate(`(() => { const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(document.querySelector("#admin-email"), "admin@halimatrading.com"); set(document.querySelector("#admin-password"), "wrong-password");
    document.querySelector("form").requestSubmit(); })()`);
  assert.ok(await b.waitFor(`!!document.querySelector('[role="alert"]')`, 15000), "error message shown");
  assert.match(await b.evaluate("location.pathname"), /\/admin\/login/);
});

test("signed-out visitors cannot reach admin pages", { skip }, async () => {
  await b.send("Network.clearBrowserCookies");
  await settle(`${BASE}/admin/products`);
  await b.waitFor(`location.pathname.startsWith("/admin/login")`, 15000);
  assert.match(await b.evaluate("location.pathname"), /^\/admin\/login/);
});

test("customers see availability but never a stock quantity; delivery is AED 75 per order", { skip }, async () => {
  await setWidth(1280);
  for (const n of [1, 2]) {
    await settle(`${BASE}/shop/${RUN}-${n}`);
    const text = await b.evaluate("document.body.innerText");
    assert.match(text, /In stock/i);
    assert.doesNotMatch(text, /stock\s*:?\s*\d|\b\d+\s+(items?|units?|pcs)\s+(in stock|left|available)|available quantity/i, `product ${n}`);
    assert.match(text, /Delivery: AED\s?75 per order/);
    assert.doesNotMatch(text, /FREE DELIVERY/);
  }
  // Add to cart, then the cart shows one AED 75 delivery charge for the order.
  await settle(`${BASE}/shop/${RUN}-1`);
  await b.evaluate(`[...document.querySelectorAll("button")].find((x) => /add to cart/i.test(x.innerText))?.click()`);
  await new Promise((r) => setTimeout(r, 500));
  await settle(`${BASE}/shop/${RUN}-3`);
  await b.evaluate(`[...document.querySelectorAll("button")].find((x) => /add to cart/i.test(x.innerText))?.click()`);
  await new Promise((r) => setTimeout(r, 500));
  await settle(`${BASE}/cart`);
  const summary = await b.evaluate(`document.querySelector(".summary")?.innerText ?? ""`);
  assert.match(summary, /Delivery Charge\s*AED\s?75/);
  assert.doesNotMatch(await b.evaluate("document.body.innerText"), /FREE DELIVERY|stock\s*:?\s*\d/i);
});

test("shop search finds a model typed without punctuation, on Enter, and the header icon focuses the box", { skip }, async () => {
  await setWidth(1280);
  await settle(`${BASE}/shop`);
  // Product 1's SKU is "<RUN>-1"; typed without the hyphen. (Unique per run, so the shop's cache never answers.)
  await b.evaluate(`(() => { const i = document.querySelector("#shop-search");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "${RUN}1");
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`);
  assert.ok(await b.waitFor(`location.search.includes("q=${RUN}1")`, 5000), "Enter searches without waiting for the pause");
  assert.ok(await b.waitFor(`[...document.querySelectorAll("article")].some((a) => a.innerText.includes(${JSON.stringify(LONG.slice(0, 40))}))`, 20000), "the product is found");
  assert.ok(await b.evaluate(`!!document.querySelector('.product-grid a[href*="/shop/${RUN}-1"]')`), "it is this run's product");
  // The header search icon opens the shop with the cursor in the search box.
  await settle(`${BASE}/`);
  await b.evaluate(`document.querySelector('header a[aria-label="Search products"]').click()`);
  assert.ok(await b.waitFor(`location.pathname === "/shop" && document.activeElement?.id === "shop-search"`, 20000));
});

test("product cards have no dead wishlist control", { skip }, async () => {
  for (const width of [375, 1280]) {
    await setWidth(width);
    await settle(`${BASE}/shop?q=${RUN}`);
    assert.ok(await b.waitFor(`document.querySelectorAll(".product-card, article").length > 0`, 20000), "product cards render");
    const dead = await b.evaluate(`[...document.querySelectorAll("button, a")].filter((el) => /wish/i.test((el.getAttribute("aria-label") || "") + el.innerText)).length`);
    assert.equal(dead, 0, `${width}px`);
    assert.equal(await b.evaluate(`document.querySelectorAll(".product-img > button, svg.lucide-heart").length`), 0);
  }
});

test("no page scrolls sideways at any viewport width", { skip }, async () => {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const login = await (await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@halimatrading.com", password: SEED_PASSWORD }) }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0].split("=");
  const customerPages = ["/", "/shop", `/shop/${RUN}-1`, "/cart", `/checkout/order-details?productId=${RUN}-1&quantity=1`, "/categories", "/brands", "/my-orders", "/contact", "/about", "/quote", "/admin/login"];
  const adminPages = ["/admin", "/admin/products", `/admin/products/${RUN}-1/edit`, "/admin/products/add", "/admin/orders", "/admin/users", "/admin/settings"];
  const problems = [];
  for (const [pages, signedIn] of [[customerPages, false], [adminPages, true]]) {
    if (signedIn) await b.send("Network.setCookie", { name: cookie[0], value: cookie.slice(1).join("="), url: BASE, httpOnly: true });
    for (const page of pages) {
      for (const width of WIDTHS) {
        await setWidth(width);
        await settle(`${BASE}${page}`);
        if (signedIn) await b.waitFor(`!/Loading Admin/i.test(document.body.innerText)`, 20000);
        const overflow = await b.evaluate(OVERFLOW);
        if (overflow) problems.push(`${page} @${width}px: page is ${overflow.scrollWidth}px wide → ${overflow.culprits.join(", ")}`);
        if (!signedIn) {
          const wrapped = await b.evaluate(WRAPPED_HEADER);
          if (wrapped.length) problems.push(`${page} @${width}px: header labels wrap onto two lines → ${wrapped.join(", ")}`);
        }
        if (SHOTS) await b.screenshot(path.join(SHOTS, `${page.replace(/[^a-z0-9]+/gi, "_") || "home"}-${width}.png`));
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
