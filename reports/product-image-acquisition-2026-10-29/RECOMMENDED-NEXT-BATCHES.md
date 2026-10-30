# Recommended next batches

They are ordered by the number of products covered per unit of effort. Nothing below has been executed.

## 1. Haier + LG + Samsung official images: 28 products, ready now

- **Products:** listed in `IMAGE-IMPORT-RESULTS.csv`; visual check on `review/batch-01.html`.
  - Haier: 15 (washing machines, washer dryers, cooktops, refrigerators).
  - LG: 9 (dishwasher, microwaves, refrigerators, washing machines).
  - Samsung: 4 (dryer, washing machines).
- **Evidence:** the exact model is printed on the official UAE product page, and the image comes from that page (`og:image`), at least 400 px and downloadable.
- **Blocker:** usage rights. Get written permission from each brand's UAE distributor and record it (who granted it, the date, and where the email is saved).
- **Then:**
  1. Approve the batch in `review/batch-01.html` and export the decisions.
  2. Import using the existing URL importer, or a small script that calls the same `importExternalImage`.
  3. Update `images` through the existing conditional save.
- **Storage:** about 1.6 MB.
- **Includes 4 Haier products** (HCR9060GT1, HCR6060ET1, HRF-700TS, HRF-525SS) whose current Supabase image is a Google thumbnail import. For these, approving replaces the thumbnail in place, keeping the same position.

## 2. LG regional-suffix models: 4 products

A27TNC.UUAE2, I23TCP.UUAE2, I38TCF.UUAE, T36ZCA.UUAE. The official page shows the base model. Confirm the `.UUAE` unit is the same product, and check whether separate base-model products already exist; the 26 Oct audit found `lg-i23tcp` and others. These are in `review/batch-02.html`.

## 3. Supplier image packs: 151 products with no automatable source

| Brand | Products | Ask for |
|---|---|---|
| Midea | 91 | UAE dealer media pack (ACs, dishwashers, freezers, hoods) |
| Westpoint | 39 | Product photo pack keyed by model code |
| Clivet | 21 | Images **and** real model codes (our records hold descriptions such as `5-ton-scroll-floor-stand-ac`) |

A pack of files named by model can be loaded with the pipeline's existing `--local-candidates` source, which comes with previews and the review queue. That is about 41% of the gap from three emails.

## 4. Replace the 57 thumbnail and logo imports

These are flagged in `PRODUCT-IMAGE-STATUS.csv` (column `importedFrom`). 4 are covered by batch 1. Most of the rest belong to Midea (29), Westpoint (8), O General (8) and Haier (3). Use the supplier packs from step 3; don't import more thumbnails.

## 5. Catalogue crops needing visual review: 20 products

Mazaya, Gree, Krome, TCL, Daewoo and Toshiba candidates, in `review/batch-02.html` and `batch-03.html`. Most are series photos or under 400 px, so expect few approvals.

## 6. Housekeeping

- **Declare `sharp` as a dependency** (needs approval). Then the importer fully decodes images and converts AVIF and oversized files. Today 194 of 199 imports skipped full decoding.
- **Retailer-sourced images:** decide on the 60 Amazon images and other retailer imports listed in `LICENSING-AND-RIGHTS-REVIEW.csv`.
- **General Line:** the 6 freezers link to a logo that now returns HTTP 403.
