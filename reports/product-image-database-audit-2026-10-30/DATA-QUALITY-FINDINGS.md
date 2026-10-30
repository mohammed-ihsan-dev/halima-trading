# Data-quality findings (2026-10-30)

These findings come from the same read-only data as the image audit. None of them was fixed.

## 1. Wrong-brand product images (30 products)

Every Nikai product (21 of 21) shows another manufacturer's unit, a stock photo or a generic graphic. The brands shown include Blue Star, Voltas, Samsung, Panasonic, LG, Haier, O General, Cruise and Gratus, and one image carries a Dreamstime watermark. The images come from IndiaMART (imimg.com), TradeIndia (tistatic.com) and similar listing sites.

Other wrong-brand images:
- **Krome:** KR-SAC18IM (Carrier), KR-FAC483PR-IN+OD (Voltas), KR-AR24MT3 and KR-AR30MT3 (Mitsubishi Electric).
- **TCL:** TAC-24CWAU/UJETI (Super General), TAC-30CSD/ZGI (Whirlpool).
- **Super General:** SGS316AE (Gree).
- **Clivet:** 8.5-ton-package-ac (Carrier).
- **Aftron:** AF-W-1860BX/CX (Hisense).

A customer sees a competitor's logo on our product, so these are the most damaging images in the catalogue.

## 2. Thumbnails and logos copied into Supabase

91 Supabase image references were imported from `encrypted-tbn0.gstatic.com`, which is a Google Images thumbnail.
- Several of these are brand logos: two Haier images imported from seeklogo.com, two Midea images imported from Google thumbnails, and four Pro General logos uploaded at 2000×2000.
- Inside our bucket they look like first-party files, and many pass the 400 px size rule. Only the import log (`product_image_imports.sourceUrl`) or a visual check reveals them.

## 3. Images stored as base64 inside MongoDB (12 products)

O General AXG18 AE, O General ASG18CMTA, O General ASGG24CMTB, O General ASGG30CMTA, O General ASGG36CMTA, O General ASGA18FD, O General ASGA24FD, O General ASGA30FUT, O General ASGA36FE, O General ASGAFUTB, O General ARGA18, O GENERAL ARGA25.

The pictures are fine, but storing them inside the database makes the documents larger and every product query slower. They should be moved to Supabase in a separate, approved change.

## 4. Brand spelling variants

"O General" (39) and "O GENERAL" (1) and "Bosch" (7) and "BOSCH" (1) are listed as separate brands. As a result, brand filters and brand pages split these products. They were not merged in this audit.

## 5. Model field holds a description (Clivet, 21 products)

Clivet records use descriptions such as `5-ton-scroll-floor-stand-ac` instead of manufacturer model codes. Exact-model image matching is impossible until the real codes are recorded.

## 6. Same image on many products (206 products share at least one image URL with another product)

Sharing is acceptable for colour or size variants of one unit. It is wrong when the shared file is a logo: the Daewoo, Gree, Westpoint, General Line and Pro General logo files are each reused across several products.

No product lists the same URL twice in its own gallery.

## 7. Gallery (secondary image) issues: 13 products

- **Weak second image:** some products have a good primary image but a Google thumbnail as their second image (by brand: LG 9, Mazaya 3, Indesit 1); see `galleryIssues` in `PRODUCT-IMAGE-CLASSIFICATION.csv`.
- **Better image further down:** no product has a suitable image hidden behind an unsuitable primary.

## 8. Undersized supplier images (Mazaya)

Most Mazaya photos on Supabase are 150–400 px wide. Their longest side is often just over 400, so many pass, but they look soft on product pages. The ones under 400 px are counted as low quality.

## 9. Products with no image

- **Total:** 10 products, 1 of them draft. They are mostly Midea (dishwashers, freezers and a hood) and Whirlpool.

## 10. Rights

146 references link directly to retailer sites, including Amazon, Sharaf DG, Flipkart, IndiaMART, TradeIndia and noon. 178 more were copied from retailers into Supabase. The rights for these are unknown, and the files can change or disappear at any time.

