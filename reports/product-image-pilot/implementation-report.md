# Image pipeline: three safe extensions (implementation report)

2026-10-26. No images were uploaded and no production records were written.
- **Product records:** MongoDB `products` was only read.
- **Review queue:** `product_image_reviews` was not written.
- **Storage:** Supabase was only listed.
- **Pipeline state:** the real files in `work/product-image-pipeline/` are unchanged; their newest modification time is still 2026-10-19.

## What changed

| File | Change |
|---|---|
| `scripts/product-images/replacement.mjs` (new) | Pure rules for replacements:<br>• **Eligibility:** every usable image must be a Google search thumbnail or under 400 px.<br>• **`--include-classes` parsing:** only replaceable classes are accepted, and only together with `--only` or `--pilot`.<br>• **`replacedImages()`:** the new image goes first, only the approved references are removed, everything else is kept, and nothing is planned if the product has changed. |
| `scripts/product-images/pipeline.mjs` | **Change 1, opt-in targets.** An `isTarget` check replaces the fixed list of target classes in `pilot`, `discover`, `catalogue`, `review-import` and `dry-run`. Without `--include-classes` it is the same as before.<br>**Replacement records.** The review record stores `candidate.replaces` (the exact references to remove) and shows a "REPLACEMENT" note.<br>**Planning a replacement.** `dry-run` plans a replacement only from an admin-approved review. A register or confidence-based candidate for a replaceable product gets `SKIP`.<br>**Change 2, local files.** `verify` treats `local-file` candidates as `UNCERTAIN`, never `HIGH`. It writes an optimised 800×800 preview to `catalogue/local/previews/<sha>.webp`, a path the existing preview route already serves. |
| `scripts/product-images/sources.mjs` | `localManifestCandidates(root, { stateDir, localCandidatesFile })`:<br>• new `local-file` source, read from `--local-candidates=<json>` or `<state>/local-candidates.json`;<br>• supplier and catalogue candidates are now read from the active state directory, so rehearsals with `PIPELINE_STATE_DIR` use their own crops. The default directory is unchanged. |
| `lib/product-image-review.ts` | Adds the optional type field `CandidateImage.replaces`. The approval rules are unchanged. |
| `app/admin/products/image-review/page.tsx` | When a candidate would replace images, the review card shows a highlighted line listing exactly what would be removed. |
| `tests/product-image-replacement.unit.test.mjs` (new), `tests/product-image-replacement.db.test.mjs` (new) | 12 focused tests (listed below). |

**Change 3 (catalogue crops)** reuses the existing `catalogue` command. Explicitly included replacement products now get crops, previews and page highlights. The same identity rules apply: a shared or ambiguous series photo can't be approved.

### Replacement rules as implemented

1. **Explicit opt-in.** A product enters only if three things hold:
   - `--include-classes=EXTERNAL_NEEDS_VERIFICATION,SUPABASE_UNREVIEWED,VALID_VERIFIED` is given together with `--only` or `--pilot`;
   - its class is one of those;
   - **every** usable image is a Google thumbnail or under 400 px.

   A product with any other usable image is never a target. Logos (seeklogo, logos-world, Play Store icons) are out of the approved scope and stay excluded.
2. **Approval.** Only an admin approval in the review queue can replace an image. It requires the exact model to be confirmed, plus an authorization with its type, who granted it, and where the proof is kept. These are the existing `approvalProblem` rules, unchanged.
3. **Order of operations.** `apply` acts only after `upload --execute` has stored the image and verified it (object check plus a public-URL SHA-256 check). The thumbnail is removed in the same single conditional `updateOne` that adds the new image. That write requires the product's `images` and `updatedAt` to be unchanged since the plan. So a failed upload or a failed write leaves the previous image in place.
4. **Backups.** The full previous document and the previous `images` (including the thumbnail) are saved before the write: in the apply manifest and in `progress.json → backup`. `rollback --execute` restores them.

## Tests

Command: `TEST_MONGODB_URI=mongodb://127.0.0.1:27017 node --import ./tests/support/register-ts.mjs --test --test-concurrency=1 <files>`, using a local MongoDB and the in-process fake Supabase.

**Result: 60 of 60 passed.** That is the existing `test:images` set (pipeline unit, approval unit, SerpAPI quota, catalogue match, approval DB) plus the 12 new tests. TypeScript (`tsc --noEmit`) and ESLint on the changed files: clean.

| Required test | Where |
|---|---|
| Replacement eligibility | unit "eligibility…", unit "--include-classes…", DB "default workflow unchanged…" |
| Local image preview and validation | unit "local files…", DB "opt-in: local candidates… reviewable preview" |
| Catalogue crop generation | DB "catalogue crops: only explicitly included replacement products get crops" |
| Permission enforcement | unit "permission enforcement…", DB "permission enforcement and --execute…" |
| `--execute` enforcement | DB "permission enforcement and --execute…" (upload and apply refuse without it) |
| Preservation of existing usable images | unit "replaced images…", unit "eligibility…" (a product with a good image is never a target), DB "approved replacement…" (a broken reference is kept, other fields unchanged) |
| Rollback after a failed upload or database update | DB "failed upload, then failed conditional update…" and "approved replacement… rollback restores it" |

## Dry run on a copy of the pipeline state

Script: `bash reports/product-image-pilot/tools/rehearse.sh`. Full log: `rehearsal-log.txt`; state copy: `pipeline-rehearsal-state/`. On this machine it ran with `PRELOAD=./reports/product-image-pilot/tools/public-dns-preload.mjs`, a workaround for the local DNS failures that changes no project code. It never passes `--execute`.

1. `audit` (fresh, read-only): 885 products.
2. `discover`, `catalogue` (Mazaya, Krome, Super General), `verify --no-vision --no-download`, `review-import` (preview), `dry-run`.

**Result:**
- **Targets:** 19 of the 29 pilot products entered the replacement review.
- **Review preview:** 22 records:
  - 6 `needs_manual_verification`;
  - 3 `pending_review`;
  - 13 `needs_manual_source`.
- **Dry run:** 0 uploads planned, `databaseWrites: 0, storageWrites: 0`. Krome KR-AWP18ET3 was correctly `SKIP`ped. Its earlier assistant "approve" note isn't an admin approval, so it can't trigger a replacement.

| Outcome | Pilot products |
|---|---|
| **Reviewable in the queue, with a preview and a replacement note** | #1 Toshiba GRA820U-X(BS) (two supplied photos), #5 Gree GR-I2 Pro-24C3 (supplied photo), #10–#12 LG `.UUAE` (catalogue slide images), #29 Krome KR-AWP18ET3 (extracted image; its two catalogue crops are `NEEDS_REVIEW` and can't be approved) |
| Entered, but every candidate was rejected by the existing rules → `needs_manual_source` | #2–#4 Gree (series photos or unresolved earlier review), #15 Daewoo (376 px), #20–#24 Mazaya ME series (crops 150–241 px, or series photo), #25–#26 Super General (crops 161×169 and 113×182), #27–#28 Krome KR-AR (crop 314×234, series photo) |
| Not a target: the current image is a **logo**, which is outside the approved scope | #6–#9 and #18–#19 Gree, #13–#14 Mazaya GL-24/36WTC, #16 AKAI, #17 Haier |

## Limitations

- **Logos.** Only Google thumbnails and images under 400 px count as unsuitable. The 10 products showing a brand logo need a scope decision before they can enter.
- **Previews are local.** They live in the pipeline state directory, as catalogue previews already do. The admin queue can show them only where the pipeline ran, for example the site running locally, not on Vercel.
- **One catalogue at a time.** `catalogue-candidates.json` holds one PDF at a time (existing design). Run `discover` for a brand's products right after that brand's `catalogue` run, as `rehearse.sh` does.
- **No permissions yet.** None is recorded for any pilot product, so nothing can be approved until the reviewer supplies the authorization evidence.
- **DNS on this machine.** Its resolver fails some lookups. The preload workaround is needed here only.

## Commands for the next step (human review)

Read-only preparation on the real state (these write only to `work/product-image-pipeline/`):

```
P="node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/product-images/pipeline.mjs"
INC=--include-classes=EXTERNAL_NEEDS_VERIFICATION,SUPABASE_UNREVIEWED,VALID_VERIFIED
IDS=$(node -e 'console.log(require("./reports/product-image-pilot/pilot-manifest.json").products.map(p=>p.pipelineProductId).join(","))')
$P audit
$P discover --source=local --local-candidates=reports/product-image-pilot/local-candidates.json --only=$IDS $INC
$P catalogue "--pdf=catalogues-source/KROME CATALOG 25-26.pdf" --brand=Krome --only=<Krome ids> $INC   # then discover again for those ids
$P verify --no-vision --no-download --only=$IDS $INC
$P review-import --only=$IDS $INC            # preview: reviews-preview.csv
```

**These need your explicit approval before they run:**
- `$P review-import --execute --only=$IDS $INC` writes review records (not products) to `product_image_reviews`. It can be undone with `review-rollback --run=<id> --execute`.
- After the admin approves in **Admin → Products → Image Review**, run `dry-run`, read `plan.csv`, then `upload --execute` and `apply --execute`.

## Addendum: logos, app icons and placeholders (2026-10-26)

**Change.** Only `unsuitableReason()` in `scripts/product-images/replacement.mjs` changed. Detection is conservative and uses the URL only; image content is never inspected. An image counts as unsuitable when it comes from:
- a logo-library site (seeklogo, logos-world, 1000logos, worldvectorlogo, logowik, logo.wine, …);
- Vectorstock, **only** when the file itself is named "…logo…";
- Google Play icons (`play-lh.googleusercontent.com`) or App Store app artwork (`mzstatic …/Purple…`);
- a placeholder service (via.placeholder, placehold.co, dummyimage);
- a file explicitly named as a placeholder ("no-image", "image-not-available", "coming-soon", "placeholder.png", …).

A product photo on a brand or shop site is never flagged, even when "logo" appears in its URL.

**Unchanged.**
- The opt-in flags, the rule that *every* usable image must be unsuitable, and admin-only approval with permission evidence.
- Backup, rollback and the default behaviour.
- Undersized images stay eligible for explicit review only. They are never approved or replaced automatically.

**Tests.** A new unit test checks 9 flagged and 7 not-flagged URLs; the logo eligibility assertions were updated. The image suite passes 61 of 61.

**Effect.** This was checked offline against the rehearsal audit; nothing was re-audited and nothing was written.
- **Pilot:** all 29 products are now eligible when explicitly selected (previously 19).
- **Whole catalogue:** 138 products would be eligible if explicitly selected. Their unsuitable images are 89 Google thumbnails, 38 undersized images, 10 brand logos, 2 app icons and 2 logo graphics.
