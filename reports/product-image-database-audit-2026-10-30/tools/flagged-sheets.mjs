// Flagged-only contact sheets: every product whose PRIMARY image is not suitable, grouped by verdict, with the
// verdict and reason printed under the image. A red label marks a classification that needs a person to confirm.
// Local only (uses the image cache from visual.mjs).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const sharp = require("sharp"); const Papa = require("papaparse");
const A = "reports/product-image-database-audit-2026-10-30", IMG = process.env.AUDIT_IMAGE_CACHE;
const rows = Papa.parse(readFileSync(`${A}/PRODUCT-IMAGE-CLASSIFICATION.csv`, "utf8"), { header: true, skipEmptyLines: true }).data;
const manifest = JSON.parse(readFileSync(`${A}/tools/cache/visual-manifest.json`, "utf8"));
const prim = new Map(manifest.filter((m) => m.imageIndex === 0).map((m) => [m.productId, m]));
const key = (s) => createHash("sha256").update(s).digest("hex").slice(0, 32);
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
const GROUPS = [["C", "logo-only"], ["E", "broken"], ["F-wrong", "wrong-brand-stock-or-defect"], ["F-thumb", "google-thumbnail"], ["F-small", "under-400px"]];
const group = (r) => r.primaryCategory[0] !== "F" ? r.primaryCategory[0] : /wrong brand|another brand|other brand|stock photo|generic|checkerboard|watermark|small part of the frame/.test(r.reason) ? "F-wrong" : /thumbnail/.test(r.reason) ? "F-thumb" : "F-small";
const CW = 200, CH = 170, LH = 46, COLS = 8, PER = 48; let n = 0;
for (const [g, name] of GROUPS) {
  const list = rows.filter((r) => r.primaryCategory[0] !== "A" && r.primaryCategory[0] !== "B" && group(r) === g);
  for (let s = 0; s < list.length; s += PER) {
    const slice = list.slice(s, s + PER), comps = [];
    for (const [i, r] of slice.entries()) {
      const x = (i % COLS) * CW, y = Math.floor(i / COLS) * (CH + LH), m = prim.get(r.productId);
      let tile = null;
      try { tile = await sharp(readFileSync(`${IMG}/${key(m.ref)}`)).rotate().resize(CW - 8, CH - 8, { fit: "contain", background: "#fff" }).flatten({ background: "#fff" }).png().toBuffer(); } catch {}
      if (!tile) tile = await sharp({ create: { width: CW - 8, height: CH - 8, channels: 3, background: "#fde2e2" } }).png().toBuffer();
      comps.push({ input: tile, left: x + 4, top: y + 4 });
      const needs = r.confidence === "needs-confirmation";
      comps.push({ input: Buffer.from(`<svg width="${CW}" height="${LH}" xmlns="http://www.w3.org/2000/svg"><text x="3" y="13" font-size="11" font-family="Arial" font-weight="bold">${esc(r.code)} ${esc(String(r.model).slice(0, 20))}</text><text x="3" y="27" font-size="10" font-family="Arial" fill="${needs ? "#b91c1c" : "#334155"}">${esc((needs ? "CONFIRM: " : "") + (r.reason || r.primaryCategory).slice(0, 40))}</text><text x="3" y="40" font-size="9" font-family="Arial" fill="#64748b">${esc(r.brand)} · ${esc(r.primaryCategory.slice(3))}</text></svg>`), left: x, top: y + CH });
    }
    const file = `FLAGGED-${String(++n).padStart(2, "0")}-${name}${list.length > PER ? `-${s / PER + 1}` : ""}.png`;
    await sharp({ create: { width: COLS * CW, height: Math.ceil(slice.length / COLS) * (CH + LH), channels: 3, background: "#e2e8f0" } }).composite(comps).png().toFile(`${A}/IMAGE-AUDIT-CONTACT-SHEETS/${file}`);
    console.log(file, slice.length);
  }
}
