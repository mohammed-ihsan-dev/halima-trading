# Product image acquisition: summary (2026-10-29)

This is an audit, local extraction and candidate discovery only.
- **Production:** nothing was written to MongoDB or Supabase, no image was uploaded, and nothing was committed or deployed.
- **Database:** all reads were read-only.
- **Pipeline state:** all pipeline commands ran on a copy in `pipeline-state/`.

## Current baseline

All figures come from this run, using a fresh check of every image URL.

| | Count |
|---|---|
| Products | **885** (873 active, 12 draft) |
| Brands (as written in the database) | **39** (37 distinct; "O GENERAL" and "BOSCH" are spelling variants) |
| Products with a suitable image | **519** (58.6%) |
| Products that need an image | **366** (41.4%) |
| · no image at all | 144 |
| · image loads but is unsuitable (Google thumbnail, logo, icon or under 400 px) | 159 |
| · broken (General Line logo, HTTP 403) | 6 |
| · stored in Supabase, but **imported from a Google search thumbnail or logo site** | 57 |
| Image references: Supabase / external / base64 | 398 / 339 / 12 |

**Changes since the 2026-10-26 audit.** 213 products changed images, all of them previously with no image. 196 of those changes came through the new URL importer: `product_image_imports` has 199 records, all by halimatradingest@gmail.com, totalling 11.5 MB.

## Findings that need fixing

1. **57 imported images are Google search thumbnails or logos.** The importer copied them into our own bucket, so the website no longer shows they were thumbnails. 49 of them are 447–554 px, which passes the size check. All 57 are in the replacement queue.
2. **194 of the 199 imports skipped full image decoding.** `sharp` was not loadable in the server that ran the importer, so it used its signature-only fallback. That is safe, but less thorough. Declaring `sharp` as a dependency fixes this; it needs your approval.
3. **Retailer images were imported.** Sources include Amazon (60), Akinon CDN, Kitchen King, Ice Cube and others. Usage rights for these are unknown. See `LICENSING-AND-RIGHTS-REVIEW.csv`.

## Candidates found for the 366 products

| Classification | Products | Main source |
|---|---|---|
| **Verified exact match** | **28** | Official pages: Haier 15, LG 9, Samsung 4. The exact model is printed on the page, and the official image is at least 400 px and downloadable. |
| Likely match | 24 | 4 LG pages with a regional-suffix model, 8 catalogue crops, 12 local files |
| Uncertain | 17 | Exact catalogue model but image under 400 px, or a series photo |
| No candidate found | 297 | Midea 91, Westpoint 39, Clivet 21, TCL 18, Indesit 17, Panasonic 13, … |

- **Catalogues (25 PDFs, 970 pages).** The pipeline's exact-model crop matcher ran on the 10 that are relevant. It produced only 4 exact single-model crops, and all are under 400 px. The other crops were series photos shared by several models, the catalogues didn't contain our models, or our model codes carry suffixes the catalogues never print (Gree `-IND`, LG `.UUAE`). The Midea PDF is a small-appliance catalogue: 0 of 64 matched.
- **Rights.** None of the 28 verified matches has a recorded licence. Samsung's site states it "grants you no license". LG's terms page returns 404. Haier's legal page could not be reached.

## What was done and what wasn't

| Completed (local, read-only) | Not done (needs your approval) |
|---|---|
| Fresh audit; brand inventory; change diff; flags for thumbnail imports | Any upload to Supabase |
| Catalogue extraction for 10 brands (pipeline crops, previews) | Any change to MongoDB `images` |
| Official-site probe (Haier, LG, Samsung, O General, Simfer) | Recording permissions |
| 3 review batches (`review/batch-01..03.html`, 69 products) | Declaring `sharp` as a dependency |

## Recommended next action

Ask the **Haier, LG and Samsung UAE distributors for written permission** to use their official product images. That unlocks 28 verified products, 4 of which replace a Haier thumbnail import, and the importer can do it automatically.

In parallel, ask **Midea, Westpoint and Clivet** for supplier image packs, with model codes for Clivet. No permitted automated source exists for these 151 products.

See `RECOMMENDED-NEXT-BATCHES.md`.

## Files in this folder

| File | Contents |
|---|---|
| `BRAND-INVENTORY.csv` | Per brand: products, suitable images, gaps, candidates, official source |
| `PRODUCT-IMAGE-STATUS.csv` | One row per product (885) |
| `CATALOGUE-INVENTORY.csv` | 25 PDFs with extraction results |
| `EXTRACTED-IMAGE-INVENTORY.csv` | Catalogue crops from this run, plus existing local candidate files |
| `MANUFACTURER-SOURCE-MATRIX.csv` | Per brand: official site, what was found, access, terms, rights |
| `IMAGE-CANDIDATE-MATCHES.csv` | Every candidate for the 366 products, ranked, with evidence |
| `LICENSING-AND-RIGHTS-REVIEW.csv` | Rights status per source, including the hosts already imported |
| `IMAGE-IMPORT-RESULTS.csv` | Proposed batch 1 (28). **No imports were performed in this run.** |
| `AUTOMATION-COVERAGE-AND-COST.md` | Coverage and storage estimate |
| `RECOMMENDED-NEXT-BATCHES.md` | Recommended order of work |
| `review/` | Batch review pages: approve, reject, search again or skip, with decisions exported as JSON |
| `tools/` | Every script used, re-runnable |
| `pipeline-state/` | Isolated pipeline copy with the catalogue crops and previews |
