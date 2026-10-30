# Recommended image replacement priority

The order puts customer harm first, then effort. Nothing below has been done; each batch needs approval and should go through the existing importer, which keeps a backup and saves conditionally.

| # | Fix | Products | Brands | Where to get images |
|---|---|---|---|---|
| 1 | **Wrong-brand, stock or generic images** | 30 | Nikai 21, Krome 4, TCL 2, Aftron 1, Super General 1, Clivet 1 | Nikai's UAE distributor or nikaigroup.com; Krome, TCL, Super General and Clivet official pages. Until then, removing the wrong image is safer than keeping it. |
| 2 | **Logo instead of product** | 57 | Daewoo 12, Gree 11, Westpoint 7, Haier 4, Pro General 4, General Line 4, Toshiba 3, Mazaya 2, Phoenix 2, Midea 2, Simfer 2, AKAI 1, Blue Star 1, Krome 1, Clivet 1 | Haier (haier.com/ae), Toshiba, Gree, Simfer and Daewoo publish official product pages; exact-model availability was not re-checked in this audit. Westpoint, Pro General, Mazaya, Phoenix and Akai need supplier packs. |
| 3 | **Broken links** | 6 | General Line 6 | Ask General Line for product photos. The current link is a logo and returns 403. |
| 4 | **No image** | 10 | Midea 8, Whirlpool 2 | Midea UAE media pack; Whirlpool's official DAM (digitalassets-cdn.thron.com already supplies Indesit). |
| 5 | **Google thumbnails** | 147 | Midea 41, Indesit 15, Panasonic 13, Westpoint 13, Clivet 13, Mitsubishi Electric 9, O General 8, Blue Star 5, LG 5, Geepas 5, TCL 5, Aftron 2, Super General 2, Kenwood 2, Toshiba 2, Haier 2, AFRA 1, Krome 1, Daewoo 1, Whirlpool 1, Simfer 1 | Official manufacturer pages (LG, Haier, Panasonic, Mitsubishi Electric, Indesit) or supplier packs (Midea, Westpoint, Clivet) |
| 6 | **Under 400 px** | 53 | Mazaya 16, Midea 7, Samsung 6, Westpoint 5, Super General 4, Blue Star 3, Simfer 3, Indesit 2, TCL 2, Aftron 1, LG 1, Black+Decker 1, Krome 1, Toshiba 1 | Ask Mazaya for originals; Samsung's official gallery (images.samsung.com) |
| 7 | **Watermarked or defective** | 9 | O General 5, TCL 2, Haier 1, Westpoint 1 | Clean official images. O General ARGH composites: check whether ogeneralac.com has plain product images. |
| 8 | **Gallery clean-up** | 13 | | Remove thumbnails from second positions (LG and others). This is lower priority because the primary image is already fine. |
| 9 | **Move base64 images to Supabase** | 12 | O General | Technical change only; the images themselves are fine. |

**Fastest wins**
- Priority 2 for Haier, Toshiba, Gree and Simfer (20 products), because these brands publish official product pages.
- The 4 Samsung gallery images found on 2026-10-29 (images.samsung.com, exact model folders) are still not imported. They cover the 4 undersized Samsung washers and dryers.

**Supplier requests (one email each)**
- Nikai
- Midea
- Westpoint
- Mazaya
- Clivet (also ask for the real model codes)
- General Line
- Pro General

Together these cover about 152 of the 312 products that need work.

