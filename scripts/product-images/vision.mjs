// Optional visual assessment of candidate images — ADVISORY ONLY. Scores rank candidates for the reviewer;
// they never approve an image, never change a candidate's confidence to HIGH and are not consulted by the
// approval rules (lib/product-image-review.ts).
//
//   IMAGE_VISION_PROVIDER=anthropic   ANTHROPIC_API_KEY=…   IMAGE_VISION_MODEL=claude-opus-5-5 (default)
//
// Requires the official SDK (`npm install @anthropic-ai/sdk`); without it, or without a key, the provider is
// reported as unavailable and verification continues without AI ranking.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const ASSESSMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isSameProductType", "brandVisibleOrConsistent", "modelVisible", "cleanProductPhoto", "hasWatermarkOrOverlay", "showsMultipleProducts", "score", "issues", "summary"],
  properties: {
    isSameProductType: { type: "boolean", description: "The photo shows the product category described (e.g. a chest freezer)." },
    brandVisibleOrConsistent: { type: "boolean", description: "A visible brand mark matches, or nothing contradicts the brand." },
    modelVisible: { type: "boolean", description: "The exact model code is legible in the image itself." },
    cleanProductPhoto: { type: "boolean", description: "A clean product shot: plain background, product fully visible, no lifestyle clutter." },
    hasWatermarkOrOverlay: { type: "boolean", description: "Watermarks, prices, badges, stickers or promotional text overlaid." },
    showsMultipleProducts: { type: "boolean", description: "Several products or a range/family shown together." },
    score: { type: "integer", description: "0-100 suitability as this product's main catalogue photo." },
    issues: { type: "array", items: { type: "string" } },
    summary: { type: "string", description: "One sentence." },
  },
};

export function visionConfig(env = process.env) {
  const provider = (env.IMAGE_VISION_PROVIDER || "none").toLowerCase();
  if (provider === "none") return { enabled: false, reason: "IMAGE_VISION_PROVIDER is not set" };
  if (provider !== "anthropic") return { enabled: false, reason: `unknown vision provider "${provider}"` };
  if (!env.ANTHROPIC_API_KEY) return { enabled: false, reason: "ANTHROPIC_API_KEY is not set" };
  return { enabled: true, provider, model: env.IMAGE_VISION_MODEL || "claude-opus-5-5", timeoutMs: Number(env.IMAGE_VISION_TIMEOUT_MS) || 60_000 };
}

const prompt = (p) => `You are checking a candidate catalogue photo for an appliance retailer.
Product: ${p.brand} ${p.model}${p.name ? ` — ${p.name}` : ""}${p.category ? ` (category: ${p.category})` : ""}.
Assess only what is visible in the image. Do not assume the model matches because the product type matches; report modelVisible=true only if the exact model code is legible.
Return the assessment as JSON matching the schema.`;

/**
 * Returns a provider `{ name, assess(buffer, product) }` or `{ unavailable: reason }`.
 * `client` lets tests inject a fake Anthropic client.
 */
export async function createVisionProvider({ env = process.env, client } = {}) {
  const cfg = visionConfig(env);
  if (!cfg.enabled && !client) return { unavailable: cfg.reason };
  let anthropic = client;
  if (!anthropic) {
    let Anthropic;
    try {
      Anthropic = (await import("@anthropic-ai/sdk")).default;
    } catch {
      return { unavailable: "the @anthropic-ai/sdk package is not installed (npm install @anthropic-ai/sdk)" };
    }
    anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: cfg.timeoutMs, maxRetries: 2 });
  }
  const model = cfg.model ?? "claude-opus-5-5";
  const sharp = require("sharp");
  return {
    name: `anthropic:${model}`,
    async assess(buffer, product) {
      try {
        const jpeg = await sharp(buffer).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
        const response = await anthropic.messages.create({
          model,
          max_tokens: 4000,
          output_config: { effort: "low", format: { type: "json_schema", schema: ASSESSMENT_SCHEMA } },
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
            { type: "text", text: prompt(product) },
          ] }],
        });
        if (response.stop_reason === "refusal") return { provider: this.name, error: "assessment declined" };
        const text = response.content.find((b) => b.type === "text")?.text;
        const a = JSON.parse(text ?? "null");
        if (!a || typeof a.score !== "number") return { provider: this.name, error: "no assessment returned" };
        return { provider: this.name, score: Math.max(0, Math.min(100, Math.round(a.score))), ...a, advisoryOnly: true };
      } catch (e) {
        return { provider: this.name, error: `assessment failed (${e?.status ?? e?.name ?? "error"})` };
      }
    },
  };
}

/** Rule-side interpretation of an assessment: problems a reviewer should look at. Never raises confidence. */
export function assessmentFlags(a) {
  if (!a || a.error) return [];
  const f = [];
  if (a.isSameProductType === false) f.push("AI: does not look like this product type");
  if (a.brandVisibleOrConsistent === false) f.push("AI: brand mark contradicts the product brand");
  if (a.hasWatermarkOrOverlay) f.push("AI: watermark, price or promotional overlay");
  if (a.showsMultipleProducts) f.push("AI: several products shown");
  if (a.cleanProductPhoto === false) f.push("AI: not a clean product photo");
  return f;
}
