# Next steps: building the image automation

This plan is based on the audit of 2026-10-26. The figures come from `image-summary.json`. Nothing below has been started yet.

## What already exists (reuse it, don't rebuild it)

- **Storage.** `lib/image-storage.ts` picks Supabase first, then R2. Supabase uses the `product-images` bucket. Uploads go through presign, complete and discard, and they're checked with `verifyUploadedImage`. Orphaned files are found with `scripts/find-storage-orphans.mjs`.
- **Rules.** `lib/product-images.ts` sets the limits: at most 20 images, https or site paths only, and no new base64 images once storage is configured.
- **Review and approval.** `lib/product-image-review.ts` and the API `app/api/admin/product-image-reviews` hold review states and an evidence record for permission to use each image (`written_permission`, `documented_licence`, `client_supplied`, `own_photography`). The review collection doesn't exist yet in MongoDB. It is created when the first review is imported.
- **Pipeline.** `scripts/product-images/pipeline.mjs` already runs audit → targets → discover (catalogue / SerpAPI) → verify → review-import → upload/apply, with rollback. Every write step needs `--execute`.

## Recommended order

1. **Fix the 7 broken products.** These are 5 Blue Star and 2 Aftron products whose images are on alrayanservices.com, where the certificate has expired. Either renew access on that host or replace the images, then copy them into Supabase. This is small and visible to customers.
2. **Pilot: 29 products with a candidate image already on disk** (list below). Every one of them currently shows a Google thumbnail. Process them through the existing review workflow:
   - check visually that the picture shows the exact model;
   - record the permission to use it;
   - upload it to Supabase;
   - apply it, with a backup and rollback.
   Measure how long the review takes and how many candidates are rejected.
3. **Replace the remaining 84 unsuitable images.** In total there are 113 products with unsuitable images: Google thumbnails, logos or stock graphics, or images under 300 px. The 29 pilot products are among them. The remaining 84 have no high or medium candidate on disk. Use the next tier of catalogue matches (low-confidence pages in `candidate-image-matches.csv`), then supplier packs or search.
4. **Catalogue extraction, wider.**
   - Add looser model matching that handles family prefixes and region or colour suffixes. Gree writes "AIRY32" and TCL writes "TAC30CSA" where the site has "TAC-30CSA/ZGT", for example.
   - Crop images per product from the catalogues that matched most: LG, Mazaya, Nikai, Krome, TCL, Super General, Bosch and B+D. `scripts/product-images/catalogue_extract.py` already does PDF image extraction.
   - Inspect these first: `LG HA & RAC (PS)PPT.pdf` (58 exact), `MAZAYA CATALOGUE 2025.pdf` (43), `Nikai Cataloge 2025 26-03-25.pdf` (13), `KROME CATALOG 25-26.pdf` (10), `TCL-UAE_AC Catalogue-2025.pdf` (10), `superGeneral.pdf` (7), `B+D_Heaters_Product_Details (002).pdf` (6).
5. **Copy usable outside images into Supabase.** 209 products have a usable image linked from another website. Once the right to use each is confirmed, copy it into Supabase so the site no longer depends on those hosts.
6. **Move the 12 base64 images** (all O General) into Supabase, then remove the base64 data.
7. **The 357 products with no image at all.** These include Midea 137, Westpoint 75, Haier 42, Clivet 21, TCL 20, O General 20, Geepas 11, General Line 10, Simfer 8, Kenwood 5, Toshiba 3 and Whirlpool 3. The catalogues on disk don't cover them. The Midea PDF is a small-appliance catalogue, not an AC catalogue. Ask the suppliers for image packs first, which are the cleanest source for permission. After that, use the SerpAPI search in the pipeline, keeping its quota limits. Each candidate still goes through review and permission recording.
8. **Clean up afterwards.**
   - Fix the 5 images whose filename names a different model.
   - Review the 23 image addresses and 14 identical Supabase image sets shared across products.
   - Standardise the brand spelling (O GENERAL → O General, BOSCH → Bosch).
   - Add `air-coolers-fans` to the `categories` collection, or keep it set in code but document that.

## Pilot list: 29 products with a high or medium candidate on disk

All of these are active and currently show only an unsuitable image, mostly Google thumbnails. Every candidate still needs a visual check that it's the exact model, plus recorded permission to use it. Two other medium matches are left out because their files (`work/catalogue-images/audit/external-images/current-*`) are copies of the product's current outside image: Kenwood MWM31.000BK and Skill Tech SH MS05FS.

| # | Confidence | productId | Brand | Model | Candidate |
|---|---|---|---|---|---|
| 1 | high | 6ac8beebd467feb0e4adfa9d | Toshiba | GRA820U-X(BS) | catalogues-source/GRA820U-X(BS).jpg |
| 2 | high | 6aca2e64df911910339b3db2 | Gree | GR-I Airy32-18C3-IND | work/catalogue-images/prepared/gr-i-airy32-18c3-ind.png |
| 3 | high | 6aca2e64df911910339b3db5 | Gree | GR-I2 Pro-12C3-IND | work/catalogue-images/prepared/gr-i2-pro-12c3-ind.png |
| 4 | high | 6aca2e64df911910339b3db6 | Gree | GR-I2 Pro-18C3-IND | work/catalogue-images/prepared/gr-i2-pro-18c3-ind.png |
| 5 | high | 6aca2e64df911910339b3db7 | Gree | GR-I2 Pro-24C3-IND | catalogues-source/GR-I2-PRO-24C3-IND-GREE.png |
| 6 | high | 6aca2e64df911910339b3db8 | Gree | GR-I2 Pro-30C3-IND | work/catalogue-images/prepared/gr-i2-pro-30c3-ind.png |
| 7 | high | 6aca2e64df911910339b3db9 | Gree | GR-I2 Pro-36C3-IND | work/catalogue-images/prepared/gr-i2-pro-36c3-ind.png |
| 8 | high | 6aca2e64df911910339b3dba | Gree | GR-I4 Pro-12C3-IND | work/catalogue-images/prepared/gr-i4-pro-12c3-ind.png |
| 9 | high | 6aca2e64df911910339b3dbb | Gree | GR-I4 Pro-18C3-IND | catalogues-source/GR-I4-PRO-18C3-IND-GREE.png |
| 10 | high | 6aca2e64df911910339b3dc9 | LG | I23TCP.UUAE2 | work/catalogue-images/prepared/i23tcp-uuae2.jpg |
| 11 | high | 6aca2e64df911910339b3dcf | LG | I38TCF.UUAE | work/catalogue-images/prepared/i38tcf-uuae.jpg |
| 12 | high | 6aca2e64df911910339b3dd8 | LG | T36ZCA.UUAE | work/catalogue-images/prepared/t36zca-uuae.jpg |
| 13 | high | 6aca2e64df911910339b3e45 | Mazaya | GL-24WTC | catalogues-source/GL-24WTC.png |
| 14 | high | 6aca2e64df911910339b3e46 | Mazaya | GL-36WTC | catalogues-source/GL-36WTC.png |
| 15 | high | 6ad07fd6f9be311bced6d56d | Daewoo | DW-FR-380VSN | catalogues-source/DW-FR-380VSN.avif |
| 16 | medium | 6ac89d25d467feb0e4adf3e1 | AKAI | ACMA-M12T3R4 / ACMA-M18T3R4 | catalogues-source/ACMA-M12T3R4 : ACMA-M18T3R4.jpg (combined two-model record) |
| 17 | medium | 6ac9c5aad467feb0e4ae48cf | Haier | HSU-18/24LPA03 | catalogues-source/HSU-18:24LPA03.jpeg (combined two-model record) |
| 18 | medium | 6aca2e64df911910339b3d70 | Gree | T4 MATIC-i60C3 | catalogues-source/Gree Floor Standing AC T4 MATIC-i60C3 – 5.0 Ton … .webp |
| 19 | medium | 6aca2e64df911910339b3dbf | Gree | GR-ISAVE PLUS-P30H3-IND | catalogues-source/Gree High Wall Split AC GR-ISAVE PLUS-P30H3-IND … .png |
| 20 | medium | 6aca2e64df911910339b3e4c | Mazaya | ME-25T2 | MAZAYA CATALOGUE 2025.pdf p.5 |
| 21 | medium | 6aca2e64df911910339b3e4d | Mazaya | ME-35T3 | MAZAYA CATALOGUE 2025.pdf p.5 |
| 22 | medium | 6aca2e64df911910339b3e4e | Mazaya | ME-45T3 | MAZAYA CATALOGUE 2025.pdf p.4 |
| 23 | medium | 6aca2e64df911910339b3e50 | Mazaya | ME-65T3 | MAZAYA CATALOGUE 2025.pdf p.5 |
| 24 | medium | 6aca2e64df911910339b3e51 | Mazaya | ME-85T4 | MAZAYA CATALOGUE 2025.pdf p.6 |
| 25 | medium | 6acdf1597a4c8a2cb51006bf | Super General | SG AA 110T5 | superGeneral.pdf p.91 |
| 26 | medium | 6acdf1597a4c8a2cb51006c5 | Super General | SG CL 50T3 | superGeneral.pdf p.89 |
| 27 | medium | 6ad07fd5f9be311bced6d544 | Krome | KR-AR24MT3 | KROME CATALOG 25-26.pdf p.9 |
| 28 | medium | 6ad07fd5f9be311bced6d545 | Krome | KR-AR30MT3 | KROME CATALOG 25-26.pdf p.10 |
| 29 | medium | 6ad07fd5f9be311bced6d54c | Krome | KR-AWP18ET3 | KROME CATALOG 25-26.pdf p.18 |

What the pilot will show:
- **Local files (rows 1–19).** These test the upload and apply path end to end.
- **Catalogue pages (rows 20–29).** These test cropping one product's image from a page that shows several products.
- **Two combined two-model records (rows 16–17).** These test how a product that holds two model numbers is handled.

## Check before any write

- Back up every product document before changing its `images` (the pipeline already does this).
- Never let the placeholder `/featured/hisense-window-ac.png` be saved into `images`.
- Check every upload by downloading it again (`verifyUploadedImage`) before updating MongoDB.
- Recheck the live site after the cache refreshes, which takes about 60–120 s.
