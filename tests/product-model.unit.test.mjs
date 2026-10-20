// Customer-facing model rule: one model per product; combined records show "Model on request".
import assert from "node:assert/strict";
import test from "node:test";

const { isCombinedModel, customerModel, displayModel, MODEL_ON_REQUEST } = await import("@/lib/product-model");

test("two different models in one record are detected", () => {
  for (const m of ["ACMA-M12T3R4 / ACMA-M18T3R4", "HSU-18/24LPA03", "HSU-18/24LPB03", "RT38CG6404S9AE / RT50CG6404S9AE"]) {
    assert.equal(isCombinedModel(m), true, m);
    assert.equal(displayModel({ model: m }), MODEL_ON_REQUEST, m);
    assert.equal(customerModel({ model: m }), null, m);
  }
});

test("indoor/outdoor pairs, regional, colour and variant codes are one model", () => {
  for (const m of ["MS-GS13/MU-GS13", "MSY-GT13VF/MUY-GT13VF", "PEY-ZM18JAG / SUY-ZM18VA", "PEV-P200/PUV-P200", "CS/CU-FS18AKF-5", "AF-W-1269B/C-INV",
    "AF-W-18095BE/CE-S21", "AR24TRHQKWK / GU", "MG402MADXBB / SG", "ING-61S/BK", "IS67G1PCX/MEA", "HSU-18LPA03/T2(T3&T4)", "KR-FAC483PR-IN+OD", "MM-EG34P(BK)", "AXG18 AE"]) {
    assert.equal(isCombinedModel(m), false, m);
    assert.equal(displayModel({ model: m }), m, m);
  }
});

test("missing or placeholder models show the fallback", () => {
  for (const m of [undefined, null, "", "  ", "N/A", "n/a", "-", "Model on request"]) assert.equal(displayModel({ model: m }), MODEL_ON_REQUEST, String(m));
});
