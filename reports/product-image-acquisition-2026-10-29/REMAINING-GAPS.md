# Remaining image gaps after import batch 01 (2026-10-29)

- **Before batch 01:** 366 products needed an image.
- **Batch 01:** imported 24.
- **Still needing an image:** **342**, including **53** in the thumbnail/logo replacement queue (originally 57; 4 were replaced in batch 01).

| Classification | Products |
|---|---|
| no candidate found | 294 |
| likely match | 28 |
| uncertain | 16 |
| verified exact match | 4 |

## Ready for the next batch: 4 verified exact matches

The Samsung audit candidates were the Samsung logo, which the page's og:image points to. The follow-up search found each model's official gallery photo on images.samsung.com, in a folder named by the exact model. All were viewed and are 1920×1280. These are listed in `NEXT-BATCH-CANDIDATES.csv`, and the batch script can import them the same way as batch 01.

## Needs a person to confirm: 28 likely matches

- **LG `.UUAE` / `.UUAE2` models:** the official page shows the base model.
- **Haier variant codes:** HD100-A5979SU1 vs S8U1, and HCF-590V vs S.
- **Catalogue crops and local files.**

These are not imported automatically.

## No freely accessible exact source (294)

| Brand | Remaining |
|---|---|
| Midea | 91 |
| Westpoint | 39 |
| Clivet | 21 |
| TCL | 20 |
| Mazaya | 18 |
| Indesit | 17 |
| Panasonic | 13 |
| Daewoo | 13 |
| Gree | 11 |
| General Line | 10 |
| Blue Star | 9 |
| Mitsubishi Electric | 9 |
| Geepas | 8 |
| O General | 8 |
| Haier | 7 |
| Toshiba | 6 |
| LG | 6 |
| Samsung | 6 |
| Super General | 6 |
| Aftron | 4 |
| Krome | 4 |
| Simfer | 4 |
| Whirlpool | 3 |
| Kenwood | 2 |
| Phoenix | 2 |
| Nikai | 2 |
| AKAI | 1 |
| AFRA | 1 |
| Black+Decker | 1 |

This run searched these sources:
- all 25 PDFs, using exact-model crops (only 4 exact crops, all under 400 px);
- official sitemaps for Haier, LG, Samsung, O General and Simfer;
- sitemap checks for Midea, TCL, Indesit, Panasonic, Mitsubishi Electric and Whirlpool (none, 404 or 403);
- web searches for sample models of every brand with gaps.

For Midea (the largest gap), Westpoint and Clivet, no official model pages exist. The only images online are retailer listings, and the rules say not to use those as product images. An image pack named by model, from whoever supplies these products, can be loaded with the pipeline's `--local-candidates` source in one step.

## Replacement queue (53)

These products show an image that was imported from a Google search thumbnail or a logo site. A verified replacement exists for the Samsung products listed above. The rest have no exact-model source yet.

| Brand | In queue |
|---|---|
| Midea | 29 |
| O General | 8 |
| Westpoint | 8 |
| Haier | 3 |
| Whirlpool | 1 |
| Geepas | 1 |
| Simfer | 1 |
| Toshiba | 1 |
| Kenwood | 1 |

