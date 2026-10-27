# Existing image pipeline: findings and the 29-product pilot

Prepared 2026-10-26. This was a review and dry run only. **Nothing was uploaded and no production data was written.**
- **MongoDB:** read-only (`find`).
- **Supabase:** read-only (an object listing in `dry-run`).
- **Pipeline state:** every pipeline command ran against a copy of its state files in `pipeline-rehearsal-state/`. The real `work/product-image-pipeline/` files are unchanged: their newest modification time is still 2026-10-19.

## 1. What the pipeline already supports

Script: `scripts/product-images/pipeline.mjs`. Its own documentation is at the top of the file and in `scripts/product-images/README.md`. Run it from the project root:

```
node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/product-images/pipeline.mjs <command> [options]
```

Options that apply to every command:
- `--only=id,id` limits the run to those products, using the product's `id` field, not its MongoDB `_id`.
- `--pilot` limits the run to the products in `pilot.json`.
- `--execute` is required for any write.
- `PIPELINE_STATE_DIR=<dir>` runs against a copy of the state, for rehearsals.

| Command | What it does | Reads | Writes | Production impact |
|---|---|---|---|---|
| `audit` | Checks every product's current images over HTTP and classifies each product as `NO_IMAGE`, `PLACEHOLDER`, `BROKEN`, `EXTERNAL_NEEDS_VERIFICATION`, `SUPABASE_UNREVIEWED`, `VALID_VERIFIED` or `EMBEDDED_PRESERVED` | MongoDB, images over HTTP, Supabase listing | State: `audit.json` / `audit.csv` | None |
| `targets [--accept-changes]` | Freezes the set of products to work on in `target-manifest.json` | State | State | None |
| `quota` | Checks the SerpAPI account's remaining searches (free) and the local request log | SerpAPI account | State | None; no search is made |
| `catalogue --pdf=… --brand=…` | Indexes a catalogue PDF, matches exact model headings, and crops one image per product with previews | PDF, MongoDB | State: `catalogue/<brand>/…`, `catalogue-candidates.json` | None. **Crops only for products classed `NO_IMAGE`, `PLACEHOLDER` or `BROKEN`.** |
| `discover [--source=local,brand,icecat,search] [--requested] [--batch=N]` | Finds candidates from earlier reviewed manifests, brand sites, Open Icecat and SerpAPI | State, the web, SerpAPI (uses paid quota) | State: `candidates.json` | None; the search source uses paid quota |
| `verify [--no-vision] [--no-download]` | Downloads and validates candidates, applies confidence rules, builds a contact sheet | State, candidate URLs, optional AI vision | State: `verify.json`, `cache/`, `review-sheet-*.png` | None. Without `--no-vision`, images are sent to the configured AI vision provider. |
| `pilot [--size=10..20]` | Picks a varied trial set | State | State: `pilot.json` | None |
| `review-import [--execute] [--allow-stale-audit]` | Builds admin review-queue records | State, plus MongoDB on `--execute` | Preview: `reviews-preview.json`/`.csv`. **`--execute`: inserts into the `product_image_reviews` collection** | Writes review records only, never products. Refuses an audit older than 24 h. |
| `review-rollback --run=<id> [--execute]` | Removes the records one import inserted, if no one has acted on them | MongoDB | `product_image_reviews` | Review records only |
| `dry-run` | Plans exactly which products would change, with the optimised image and storage key | State, MongoDB, Supabase listing | State: `plan.json` / `plan.csv` | **None. Prints `databaseWrites: 0, storageWrites: 0`.** |
| `upload --execute` | Uploads the planned images to Supabase | `plan.json`, MongoDB | **Supabase storage**; `progress.json` | Writes to storage |
| `apply --execute` | Sets the product images in MongoDB | `plan.json`, `progress.json` | **MongoDB `products.images`**; backup manifest | Writes product data |
| `rollback [--execute]` | Restores `images` from the per-product backups | `progress.json`, MongoDB | MongoDB, with `--execute` | Writes product data |
| `cleanup [--execute]` | Lists, or with `--execute` deletes, uploaded objects that no product uses | Supabase, MongoDB | **Supabase deletes**, with `--execute` | Deletes from storage |
| `report` | Summarises every stage | State | `report.md` | None |

### How candidates are found and matched

- **Local sources.** `sources.mjs → localManifestCandidates()` reads earlier reviewed files:
  - `work/catalogue-images/manifest.json` (only rows marked `REVIEW_REQUIRED`);
  - `audit/pdf-extraction/gree-symphony-review.json`;
  - `batch4/manifest-akai.json`;
  - the Symphony official manifest;
  - `supplier-candidates.json` with `supplier-review.json`;
  - `catalogue-candidates.json`.
- **Brand sites and Icecat.** Brand-site adapters and Open Icecat need the model to match exactly. A SKU-only match is downgraded.
- **Catalogue PDFs** (`catalogue-match.mjs`). Only `IDENTICAL` or `CASE_SPACE` model matches count. Punctuation or OCR look-alikes are flagged, never accepted. A photo shared by several models (`SHARED_IMAGE`) can't identify a single model.
- **`verify` ratings.** It rates each candidate `HIGH`, `UNCERTAIN` or `REJECT`. It rejects:
  - series photos, meaning identical bytes offered for different models;
  - files whose name names another model;
  - non-images, GIFs, blank images, and anything under 400 px.
- **AI.** AI scores are advisory only and never raise confidence.

### How approval works

A person approves in **Admin → Products → Image Review** (`app/api/admin/product-image-reviews`). `lib/product-image-review.ts → approvalProblem()` refuses an approval unless all of these hold:
- the reviewer ticks "exact model confirmed";
- the image passed the technical checks;
- the candidate has an image the queue can show: a `url`, a `storageUrl`, or a catalogue `localPreview`;
- a catalogue crop is `EXACT_UNAMBIGUOUS`;
- an **authorization** is recorded. Its type is one of `written_permission`, `documented_licence` (which also needs `conditionsMet`), `client_supplied` or `own_photography`. It must name who granted it (`grantedBy`) and point to the evidence (`reference`).

The states are: `discovered` → `pending_review` / `needs_manual_verification` / `needs_manual_source` → `approved` / `rejected` → `uploaded`. Records are only ever approved by a person.

### How permissions are recorded

There are two paths:

1. **The register** (`work/product-image-pipeline/permissions.json`, read by `policy.mjs → resolvePermission`). A rights holder, matched by domain or catalogue filename, or a single product, counts as `confirmed` only when its `grant` has all three of `grantedBy`, `date`, and a `document` that exists on disk.
2. **An admin approval** in the review queue, with the authorization evidence described above.

The register as it stands now:

| Holder | Status |
|---|---|
| Mazaya | pending |
| Super General (also covers `superGeneral.pdf`) | pending |
| Nikai catalogue | pending |
| Krome catalogue | pending |
| Geepas | denied |
| Symphony | denied |
| Open Icecat | licensed, conditions not yet met |

No holder exists for Gree, LG, Toshiba, Daewoo, AKAI or Haier, and **no product has a confirmed permission**. Earlier permission statements in chat were never recorded in the register, so they don't count here.

### How images are uploaded

`upload --execute`:
1. Re-checks that the product is unchanged since the plan.
2. Re-checks either that the approval still stands, or that the register permission is still `confirmed`.
3. Optimises the image (`images.mjs → optimise`: auto-rotate, fit within 800×800 without enlarging, flatten onto white, centre on an 800×800 white square, WebP quality 82).
4. Uploads it to the key `products/<sku-segment>/<deterministic-uuid>.webp` with a presigned PUT. The deterministic key means a re-run never stores a second copy.
5. Checks the object (`verifyUploadedImage`), then re-downloads the public URL and compares its SHA-256.
6. Records progress after every product in `progress.json`.

### How MongoDB is updated

`apply --execute`:
1. Writes a full-document backup manifest (`backups/apply-<time>.json`), plus a backup for each product in `progress.json`, before the first write.
2. Sends `updateOne({ _id, id, images: <exact plan "before">, updatedAt: <unchanged> }, { $set: { images: [newUrl, ...existing images except the placeholder] } })`.
3. Writes only `images` and checks afterwards that every other field is unchanged.
4. Marks the review `uploaded`.

**Existing images are never removed. The new image becomes the main one, and a Google thumbnail would stay as the second image.**

### How rollback works

`rollback --execute` restores the backed-up `images`, but only for a product whose `images` still equals exactly what `apply` wrote. It also returns the review to the queue. The uploaded object is kept, and `cleanup` lists it. `review-rollback --run=<id> --execute` removes the review records from one import that no one has acted on.

## 2. The 29-product pilot, checked

- **Database:** all 29 products from `reports/product-image-audit/next-steps.md` were found by `_id`, and all 29 have exactly the images the audit recorded.
- **Candidates:** 41 in total. 25 are valid image files, 3 are under the pipeline's 400 px minimum, and 13 are catalogue pages that need a crop. No candidate file is missing.
- **Permission:** confirmed for **0 of 29**.

| Bucket (best candidate per product) | Products |
|---|---|
| Ready for human visual review | **4** (#22 Mazaya ME-45T3 p.4, crop needed; #27 Krome KR-AR24MT3 p.9, crop needed; #28 Krome KR-AR30MT3 p.10, crop needed; #29 Krome KR-AWP18ET3, extracted file 524×329) |
| Ambiguous model match | **24** |
| Invalid image | **1** (#15 Daewoo DW-FR-380VSN: the only file is a 376×376 AVIF, below the 400 px minimum) |
| Missing candidate file | 0 |
| No suitable candidate | 0 (at product level; one candidate, the GR-I2 Pro-30C3 ducted-unit photo, is not suitable) |
| Permission not confirmed | **29** (applies to every product, whatever its bucket) |

Why so many are ambiguous, with the evidence in `pilot-manifest.csv` and on the contact sheet:
- **Gree, 8 products (#2–#9).** The prepared images are series photos: one picture for all sizes. The I2 Pro file is byte-identical across 12/18/24/30/36. The `-IND` suffix never appears in the Gree catalogue. The existing pipeline's own `verify` already **rejected** these, and a 2026-10-20 run held them for manual review.
- **Gree #18 and #19.** The supplied files are byte-identical to files named for other models (T36C3/T48C3/N60C3, and GR-I4 Pro-18C3).
- **LG, 3 products (#10–#12).** The image is the base-model slide. A separate active product record exists for each base model (`lg-i23tcp`, `lg-i38tcf`, `lg-t36zca`, each with one image), so these `.UUAE` records may be duplicates.
- **Mazaya GL-24WTC / GL-36WTC (#13, #14).** The same picture is used for both capacities. Verify rejected it.
- **AKAI (#16) and Haier (#17).** Each product record combines two models. The Haier file is also byte-identical to the LPB03 series file.
- **Toshiba (#1).** There are two supplied photos for GRA820U-X(BS): a silver one and a dark-glass one. They contradict each other.
- **Mazaya ME-25T2/35T3/65T3/85T4 and Super General SG AA 110T5 / SG CL 50T3 (#20–#26).** The catalogue page shows 3–4 models of the same family, so a crop must be tied to the right model.

## 3. Dry run of the existing pipeline (isolated state copy)

Commands run, with output saved in `pipeline-rehearsal-state/`:

```
PIPELINE_STATE_DIR=$PWD/reports/product-image-pilot/pipeline-rehearsal-state \
node --env-file=.env.local --import ./tests/support/register-ts.mjs \
     --import ./reports/product-image-pilot/tools/public-dns-preload.mjs \
     scripts/product-images/pipeline.mjs <pilot|review-import|dry-run> --only=<29 pipeline ids>
```

The `public-dns-preload.mjs` file only works around this machine's DNS failures; it changes no project code. On a normal machine, leave it out.

| Command | Result |
|---|---|
| `pilot` | Picks 14 of the 29. Its week-old audit (2026-10-19, 529 products) still classes 16 of them as `NO_IMAGE` or `PLACEHOLDER`, because their Google thumbnails were added later. |
| `review-import` (preview, no `--execute`) | 16 records: 15 `needs_manual_source` and 1 `pending_review`. The `pending_review` one is AKAI, marked *"local file only — cannot be shown or approved in the admin queue"*. `auditAgeHours: 174`, so `--execute` would refuse. `databaseWrites: 0`. |
| `dry-run` | 1 item planned, `SKIP` (AKAI: "images changed since the audit"). Upload-and-set: 0. Storage before: 199 objects, 20.9 MB. `databaseWrites: 0, storageWrites: 0`. |

**What a real run would change.** For a candidate that is approved and authorized:
- **Storage:** one new 800×800 WebP object. `pilot-manifest.json` already gives each valid candidate its exact future key in `plannedUpload.key`, computed with the pipeline's own `optimise` and key code. For example, #29 would be `products/krawp18et3/86d6d21c-bd90-4bd1-aef2-00731a247be2.webp`.
- **MongoDB:** only `products.images`, set to `[newUrl, ...existing images]`.
- **Permission records:** stored in the review record's `authorization`, or in the register's `grant`.
- **Rollback:** as described in section 1.

## 4. Gaps and blockers

1. **The pipeline doesn't target these products.** Every stage (`pilot`, `discover`, `catalogue`, `review-import`, `dry-run`) works only on products with no image, a placeholder or a broken image. A fresh audit classes 24 of the 29 as `EXTERNAL_NEEDS_VERIFICATION` (a working Google thumbnail) and 5 as `SUPABASE_UNREVIEWED` (a tiny Supabase image), so it would skip **all 29**. The stale audit still includes 16, but `review-import --execute` refuses an audit more than 24 h old. `--allow-stale-audit` would bypass that check against out-of-date data, so it shouldn't be used.
2. **Local files can't be approved in the admin queue.** The queue shows only a `url`, a `storageUrl` or a catalogue `localPreview`. The preview route accepts only `catalogue/<brand>/(previews|highlights)/<hex>.(webp|jpg)`. Most pilot candidates are local files, such as `catalogues-source/*` and the prepared Gree, LG and Mazaya images.
3. **No crops for these products.** `catalogue` crops only for the target classes in gap 1, so the 13 catalogue-page candidates get no crops.
4. **Old images are kept.** `apply` keeps existing images. To actually *replace* a Google thumbnail, a decision is needed: keep it as a second image (current behaviour), or remove it with an explicit opt-in.
5. **No permissions.** None is confirmed for any pilot brand or product. Without one, `upload` refuses.
6. **Stale state.** The pipeline state covers 529 products; the catalogue now has 885. `audit` should be re-run (it is read-only) before any import.

### Smallest safe changes

These are proposed only, not implemented. They all extend the pipeline; nothing is replaced.

- **A. Explicit opt-in to more classes.** Add `--include-classes=EXTERNAL_NEEDS_VERIFICATION,SUPABASE_UNREVIEWED`, accepted only together with `--only` or `--pilot`, and used where `TARGET` is checked (`pilot`, `discover`, `catalogue`, `review-import`, `dry-run`). By default `TARGET` stays exactly as it is now.
- **B. Previews for local files.** Write each local candidate's preview to the state directory as `catalogue/pilot/previews/<sha>.webp`, a path the existing preview route already accepts. Then add the reviewed pilot manifest as one more source in `localManifestCandidates()` with `localPreview` set. The admin queue can then show and approve local files, using the same `approvalProblem` rules.
- **C. Opt-in removal of an old image.** Add a reviewer-confirmed `removeRefs` list to the plan item, so `apply` drops only the named old image, such as the Google thumbnail. The backup and rollback already restore the full previous list.

Until these exist, the review can proceed offline with the contact sheet and the decision template. No code change is needed for that.
