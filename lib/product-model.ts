/**
 * Customer-facing model number rules.
 *
 * A product record must show exactly one model. Some records combine two different models in the
 * model field (e.g. "ACMA-M12T3R4 / ACMA-M18T3R4" or the capacity shorthand "HSU-18/24LPA03").
 * We cannot know which one the customer is looking at, so those show "Model on request" instead of
 * an arbitrary choice. These are NOT combined models and are shown as stored:
 *   - indoor/outdoor pairs of one unit:   "MS-GS13/MU-GS13", "CS/CU-FS18AKF-5", "AF-W-1269B/C-INV"
 *   - regional, colour or variant codes:  "AR24TRHQKWK / GU", "ING-61S/BK", "HSU-18LPA03/T2(T3&T4)"
 */
export const MODEL_ON_REQUEST = "Model on request";

const alnum = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
/** Letters before the first digit, e.g. "ACMA-M12T3R4" → "ACMAM". */
const letterPrefix = (s: string) => (alnum(s).match(/^[A-Z]*/) ?? [""])[0];
const digitRuns = (s: string) => (alnum(s).match(/\d+/g) ?? []).join(",");
const isFullModelCode = (s: string) => {
  const a = alnum(s);
  return a.length >= 8 && /[A-Z]/.test(a) && /\d/.test(a);
};

/** True when the model field holds two or more different models of the same family. */
export function isCombinedModel(model: string | null | undefined): boolean {
  if (typeof model !== "string") return false;
  const parts = model.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  for (let i = 0; i + 1 < parts.length; i++) {
    const a = parts[i];
    const b = parts[i + 1];
    // Capacity shorthand: "HSU-18/24LPA03" = HSU-18LPA03 and HSU-24LPA03.
    if (/\d{2,}$/.test(a) && /^\d{2,}/.test(b)) return true;
    // Two complete codes of the same family that differ in their numbers: "RT38CG6404S9AE / RT50CG6404S9AE".
    if (isFullModelCode(a) && isFullModelCode(b) && letterPrefix(a) === letterPrefix(b) && letterPrefix(a) !== "" && digitRuns(a) !== digitRuns(b)) {
      return true;
    }
  }
  return false;
}

const PLACEHOLDER_MODELS = /^(n\/?a|na|-+|none|tbc|tba|model on request)$/i;

/** The single model number to show a customer, or null when it cannot be shown reliably. */
export function customerModel(product: { model?: string | null }): string | null {
  const model = typeof product.model === "string" ? product.model.trim() : "";
  if (!model || PLACEHOLDER_MODELS.test(model) || isCombinedModel(model)) return null;
  return model;
}

/** Model text for display: the model number, or "Model on request". */
export function displayModel(product: { model?: string | null }): string {
  return customerModel(product) ?? MODEL_ON_REQUEST;
}
