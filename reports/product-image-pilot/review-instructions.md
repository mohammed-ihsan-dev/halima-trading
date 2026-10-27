# Image pilot: how to review

These instructions are for the person at Halima Trading authorized to approve product images and confirm usage rights. Reviewing changes nothing on the website. An upload happens only later, after a separate instruction.

## What to open

1. **`candidate-contact-sheet.html`.** Open this in a browser. There is one section per product, showing the current image, every candidate with its source, size and match evidence, and earlier review notes. The frame colour shows the bucket:
   - green: ready for visual review;
   - amber: ambiguous match;
   - red: invalid or missing;
   - grey: not suitable.
   Click a candidate to see it full size. Catalogue pages appear with the model number outlined in green.
2. **`candidate-contact-sheet-1.png` / `-2.png`.** The same candidates as a quick overview.
3. **`review-decisions-template.csv`.** Fill this in, one row per candidate. The `candidateId` values match `pilot-manifest.csv` and `pilot-manifest.json`.

## What to decide for each candidate

Fill in these columns:

| Column | What to enter |
|---|---|
| `decision` | `approve`, `reject`, `needs-crop` (right product, but only a catalogue page or group shot is available) or `needs-source` (no usable image here) |
| `exactModelConfirmed` | `yes` only if you are sure the picture shows **this exact model**, not just the same series or a different capacity |
| `authorizationType` | `written_permission`, `documented_licence`, `client_supplied` or `own_photography` |
| `grantedBy` | Who gave permission (brand, distributor or supplier name) |
| `evidenceReference` | Where the proof is kept: email subject and date, document file path, or licence URL |
| `reviewerName`, `reviewDate`, `notes` | Your name, the date, and anything the next step needs to know, such as "use the silver photo" |

The pipeline refuses an approval that lacks any of: exact model confirmed, `authorizationType`, `grantedBy` or `evidenceReference`. Leave those blank rather than guessing.

## Checks by bucket

- **Ready for visual review (4 products)**
  - **#29 Krome KR-AWP18ET3:** an extracted file. Check that it's the window unit, and note whether 524×329 is acceptable.
  - **#22 Mazaya ME-45T3 p.4, #27 Krome KR-AR24MT3 p.9, #28 Krome KR-AR30MT3 p.10:** whole catalogue pages. Confirm the photo next to the outlined model is the right product. A crop will be prepared afterwards, so mark them `needs-crop` if correct.
  - **Pages 9 and 10:** an earlier extraction found "no product-sized image" on these pages. Their largest embedded picture is 551×181.
- **Ambiguous match (24 products).** For each, the reason appears in amber on the contact sheet.
  - **Gree I2 Pro / I4 Pro / i Airy32 (#2–#9):** one series photo for all sizes. Approve only if a series photo is acceptable for each size, and confirm that the `-IND` models are the same units as in the catalogue.
  - **LG `.UUAE` / `.UUAE2` (#10–#12):** a separate product record already exists for the base model. First decide whether these are duplicate products.
  - **Mazaya GL-24WTC / GL-36WTC (#13, #14):** the same picture for two capacities.
  - **AKAI and Haier (#16, #17):** each record holds two models. The picture can only be approved if it fits both, or after the record is split.
  - **Toshiba GRA820U-X(BS) (#1):** two supplied photos (silver and dark glass) contradict each other. Pick the correct one or reject both.
  - **Gree T4 MATIC-i60C3 (#18), GR-ISAVE PLUS-P30H3 (#19):** the supplied file is identical to files named for other models.
  - **Mazaya ME-25T2/35T3/65T3/85T4, Super General SG AA 110T5 / SG CL 50T3 (#20–#26):** a page shows several models of the same family. Identify which photo belongs to this model, or mark `needs-crop` / `reject`.
- **Invalid image (#15 Daewoo DW-FR-380VSN).** At 376×376, the only file is below the 400 px minimum. Mark it `needs-source`.

## Permission

No pilot brand or product has a recorded permission. For any approval, `evidenceReference` must point to a document or email that someone can open later. A catalogue or a supplier's website is not a licence on its own. If permission comes from a brand or supplier for all their images, say so in `notes`. It can then be recorded once for that rights holder in `work/product-image-pipeline/permissions.json`, as `grant` with `grantedBy`, `date` and a saved `document`.

## After the review

Return the filled-in `review-decisions-template.csv`. Nothing is uploaded until you give explicit approval for that step. The next step will:
1. confirm the changes listed in `pipeline-findings.md` §4 (or choose the offline route);
2. re-run the read-only `audit`;
3. prepare a dry-run plan for the approved candidates only, showing exactly which `images` change and which storage keys are created.
