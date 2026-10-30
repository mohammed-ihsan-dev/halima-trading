# Automation coverage and cost (2026-10-29)

All numbers are verified counts from this run. Duplicates, generic stock images, thumbnails and unverified matches are excluded from the "verified" rows.

## Coverage of the 366 products that need an image

| Route | Products | Share of 366 | Automation |
|---|---|---|---|
| Official manufacturer pages, exact model (Haier, LG, Samsung) | 28 | 7.7% | Fully automatable once rights are confirmed: sitemap → page → model check → official image → importer |
| Official pages, regional-suffix model (LG `.UUAE`) | 4 | 1.1% | Automatable after a person confirms the suffix |
| Catalogue crops (pipeline) | 8 likely + 12 uncertain | 5.5% | Needs a visual check; most are series photos or under 400 px |
| Local supplied files | 12 likely + 5 uncertain | 4.6% | Needs a visual check; earlier reviews found several were series or duplicate photos |
| **No permitted automated source** | **297** | **81.1%** | Needs supplier image packs or manual sourcing |

**Realistic automation from sources available today: about 9%** of the gap (32 products), and only after permission. Catalogue extraction adds a few more after visual review. Even if all 69 products with any candidate were approved, coverage would reach 19%.

## Why the rest is not automatable

| Brand | Products | Reason (evidence in `MANUFACTURER-SOURCE-MATRIX.csv`) |
|---|---|---|
| Midea | 91 | No official UAE model pages (the sitemap returns HTML); the catalogue is small appliances; only retailer listings exist |
| Westpoint | 39 | No official website (westpointuae.com is an unrelated company); retailer listings only |
| Clivet | 21 | Our records have no manufacturer model numbers, so exact matching is impossible |
| TCL | 20 | tcl.com/ae has no sitemap; the 2025 catalogue covers 2 of the 20 |
| Indesit | 17 | UAE models are not addressable on indesit.com |
| Panasonic, Whirlpool, Phoenix | 18 | Their sites return HTTP 403 to automated requests (not bypassed) |
| Geepas | 8 | Its terms prohibit automated access |
| Daewoo, Blue Star | 22 | The exact models don't appear anywhere online |

## Cost

- **Money:** none. Only free, public, permitted sources were used; there were no paid APIs or subscriptions. SerpAPI was not used.
- **Storage:** the 198 imported objects average 58 KB each.
  - Batch 1 (28 products): about 1.6 MB.
  - All 366 products: about 21 MB.
  - The bucket currently holds roughly 398 referenced images. Both figures are far below Supabase limits.
- **Requests:** the official-site probe made about 130 page and image requests at one per second, and the results are cached in `tools/cache/official-probe.json`, so a re-run makes no new requests.
- **Effort:**
  - Batch 1 needs one permission email per brand (3) and about 15 minutes of visual review on `review/batch-01.html`.
  - The 297 products without a source need supplier packs; searching manually would cost far more.

## Duplicates and quality avoided

- **Shared photos:** 16 identical files had been imported for several different products. Series photos shared by several catalogue models were rejected, as the pipeline rules require.
- **Thumbnails and logos:** 57 thumbnail or logo imports were detected and moved into the replacement queue rather than counted as covered.
