// Contact sheets of the exact bytes the migration would upload (eligible) plus the manual-review items. Local only.
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json"); const sharp = require("sharp");
const M = "reports/product-image-supabase-migration-2026-10-30", C = process.env.MIGRATION_CACHE;
const plan = JSON.parse(readFileSync(`${M}/plan.json`, "utf8"));
mkdirSync(`${M}/review-sheets`, { recursive: true });
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
const rows = plan.rows.filter((r) => r.decision === "eligible" || r.decision === "manual-review").sort((a, b) => a.decision.localeCompare(b.decision) || a.brand.localeCompare(b.brand) || String(a.model).localeCompare(String(b.model)));
const CW = 200, CH = 170, LH = 34, COLS = 8, PER = 48;
for (let s = 0, n = 1; s < rows.length; s += PER, n++) {
  const comps = [];
  for (const [i, r] of rows.slice(s, s + PER).entries()) {
    const x = (i % COLS) * CW, y = Math.floor(i / COLS) * (CH + LH), f = `${C}/${createHash("sha256").update(r.url).digest("hex")}`;
    let tile = null; try { if (existsSync(f)) tile = await sharp(readFileSync(f)).rotate().resize(CW - 8, CH - 8, { fit: "contain", background: "#fff" }).flatten({ background: "#fff" }).png().toBuffer(); } catch {}
    tile ??= await sharp({ create: { width: CW - 8, height: CH - 8, channels: 3, background: "#fde2e2" } }).png().toBuffer();
    comps.push({ input: tile, left: x + 4, top: y + 4 });
    comps.push({ input: Buffer.from(`<svg width="${CW}" height="${LH}" xmlns="http://www.w3.org/2000/svg"><text x="3" y="13" font-size="11" font-family="Arial" font-weight="bold" fill="${r.decision === "eligible" ? "#0f172a" : "#b91c1c"}">${esc(r.brand.slice(0, 12))} ${esc(String(r.model).slice(0, 18))}</text><text x="3" y="27" font-size="9" font-family="Arial" fill="#64748b">${esc(r.decision === "eligible" ? `${r.width}x${r.height} ${r.host}` : "REVIEW: " + r.reason).slice(0, 44)}</text></svg>`), left: x, top: y + CH });
  }
  const slice = rows.slice(s, s + PER);
  await sharp({ create: { width: COLS * CW, height: Math.ceil(slice.length / COLS) * (CH + LH), channels: 3, background: "#e2e8f0" } }).composite(comps).png().toFile(`${M}/review-sheets/plan-${n}.png`);
  console.log(`plan-${n}.png`, slice.length);
}
