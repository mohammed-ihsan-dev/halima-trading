# Product image audit: current database (2026-10-30)

This was a **read-only** audit:
- MongoDB was only read.
- Supabase was only read, using metadata lookups.
- Nothing was uploaded, replaced, deleted, committed or deployed.

All figures come from a fresh read of the production `products` collection and a fresh check of every image reference on 2026-10-30. No earlier audit numbers were reused.

## Totals

| | Count |
|---|---|
| Products | **885** (873 active, 12 draft) |
| Brands, as written in the database | **39**. Two spelling pairs: "O General" (39) and "O GENERAL" (1), "Bosch" (7) and "BOSCH" (1). Not merged. |
| Image references | 892 (831 unique URLs) |
| Image-array length (products) | 0: 10 · 1: 858 · 2: 17 |
| Products with 1 image | 858 |
| Products with 2 or more images | 17 (maximum 2) |
| Products with no image | 10 |

## Primary image classification

Every product is counted once, by its **first image**, which is the one the storefront and listings show.

| Category | Products | % |
|---|---|---|
| A. Suitable | **573** | 64.7% |
| B. No Image | **10** | 1.1% |
| C. Logo Only | **57** | 6.4% |
| D. Placeholder / Generic | **0** | 0% |
| E. Broken | **6** | 0.7% |
| F. Low-Quality / Unsuitable | **239** | 27% |
| **Total** | **885** | 100% |

Active products only: 563 of 873 (64.5%) have a suitable image.

**Low-Quality / Unsuitable (239) breaks down as:**
- **147** Google search thumbnails. Some are linked directly; others were imported into Supabase, where they look like our own files.
- **53** images under 400 px.
- **30** show **another brand's product, a stock photo or a generic graphic**: Nikai 21, Krome 4, TCL 2, Aftron 1, Super General 1, Clivet 1.
- **9** other: watermarked composites, baked-in transparency checkerboards, a product lost in the frame.

10 of these need a person to confirm; they are marked `needs-confirmation`.

**Logo Only (57):** 21 logo library (seeklogo / logos-world / freebiesupply / VectorStock); 27 Google search thumbnail of the logo; 2 app icon (Google Play); 4 logo stored in our Supabase bucket; 3 manufacturer site logo. 8 of these logos are files in our own Supabase bucket: 4 Pro General uploads, plus 2 Haier and 2 Midea imports. A URL or size check alone would not flag them; the Pro General logos are 2000×2000.

**Broken (6):** the General Line freezers link to the General Line logo on genralline.com, which now returns HTTP 403.

**Placeholder / Generic (0):** no generic placeholder image was found in the database. The storefront's display fallback is not stored on products.

## Brands with the most problems

| Brand | Total | Suitable | No image | Logo | Broken | Low quality | Suitable % |
|---|---|---|---|---|---|---|---|
| Midea | 137 | 79 | 8 | 2 | 0 | 48 | 57.7% |
| Westpoint | 75 | 49 | 0 | 7 | 0 | 19 | 65.3% |
| Nikai | 21 | 0 | 0 | 0 | 0 | 21 | 0% |
| Mazaya | 55 | 37 | 0 | 2 | 0 | 16 | 67.3% |
| Indesit | 45 | 28 | 0 | 0 | 0 | 17 | 62.2% |
| Clivet | 21 | 6 | 0 | 1 | 0 | 14 | 28.6% |
| Daewoo | 15 | 2 | 0 | 12 | 0 | 1 | 13.3% |
| Panasonic | 38 | 25 | 0 | 0 | 0 | 13 | 65.8% |
| O General | 39 | 26 | 0 | 0 | 0 | 13 | 66.7% |
| TCL | 20 | 9 | 0 | 0 | 0 | 11 | 45% |

The full table is in `BRAND-WISE-IMAGE-REPORT.csv`.

## Storage

| | Supabase | External URL | Base64 inside MongoDB | No image |
|---|---|---|---|---|
| Products, by primary image | 527 | 336 | 12 | 10 |
| Image references | 534 | 346 | 12 | — |

- **Supabase:** all **534** unique objects exist. The stored size and content type match the bytes served at the URL held in MongoDB, and every key follows the bucket's naming rule.
  - Where they came from: 203 direct upload (no import record), 53 manufacturer, 178 retailer / third-party shop, 93 other host — image search / logo library, 7 other host, based on the `product_image_imports` log.
  - **Being in Supabase does not make an image suitable.** It holds 91 references imported from Google thumbnails, 8 logos used as primary images, and several wrong-brand photos.
- **External:** 346 references. 6 are broken (HTTP 403) and 0 redirects were recorded.
  - Sources: 70 manufacturer, 146 retailer / third-party shop, 117 other host — image search / logo library, 7 other host.
  - A retailer image depends on someone else's site staying up, and its usage rights are unknown.

## Recommendation

Replace images in this order. Details are in `RECOMMENDED-IMAGE-REPLACEMENT-PRIORITY.md`.
1. **Wrong-brand, stock or generic images (30).** These are the most harmful: they show a competitor's product, and Nikai is entirely affected.
2. **Logos and broken links (63).** They are highly visible. Haier, Toshiba, Gree and Simfer publish official product pages (exact-model availability was not re-checked in this audit).
3. **Products with no image (10).** Mostly Midea.
4. **Google thumbnails and images under 400 px (200).** Swap each for an official ≥ 800 px image, Midea, Westpoint, Mazaya and Clivet first.

Nothing has been changed. Each batch needs your approval.

## Files

| File | Contents |
|---|---|
| `PRODUCT-IMAGE-CLASSIFICATION.csv` | One row per product (885): category, reason, confidence, source, gallery issues, contact-sheet cell |
| `BRAND-WISE-IMAGE-REPORT.csv` | Per brand: counts per category, storage, coverage % |
| `PRODUCTS-WITHOUT-IMAGES.csv` | 10 products |
| `PRODUCTS-USING-LOGOS.csv` | 63 logo references (primary and gallery), plus the 6 broken General Line logo links |
| `PRODUCTS-WITH-BROKEN-IMAGES.csv` | 6 broken references |
| `PRODUCTS-WITH-LOW-QUALITY-IMAGES.csv` | 252 references (primary and gallery), each with its reason and confidence |
| `PRODUCT-IMAGE-SOURCE-REPORT.csv` | One row per image reference (892): domain, source type, original import source, HTTP result, Supabase object check |
| `IMAGE-AUDIT-CONTACT-SHEETS/` | 45 sheets grouped by brand; see its README |
| `DATA-QUALITY-FINDINGS.md` | Issues beyond image suitability |
| `RECOMMENDED-IMAGE-REPLACEMENT-PRIORITY.md` | What to fix first and where to get images |
| `tools/` | The scripts used and their raw outputs; all can be re-run read-only |

## Reconciliation

- ✅ categoriesSumToTotal
- ✅ brandTotalsSumToTotal
- ✅ brandCategorySumsMatch
- ✅ everyProductOnce
- ✅ storageSplitMatches
- ✅ allImagesOnSheets
- ✅ supabaseAllVerified

