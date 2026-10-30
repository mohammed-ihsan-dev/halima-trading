# Supabase migration plan (read-only, 2026-10-30 11:26 UTC)

This is a plan only; nothing has been written. MongoDB was read, every candidate image was downloaded again through the SSRF-safe fetcher and decoded, and the exact bytes were viewed (`review-sheets/plan-*.png`).

| | Count |
|---|---:|
| Products inspected | 885 |
| Image references already in Supabase | 564 |
| Base64 images inside MongoDB (out of scope) | 12 |
| **External image references** | **326** (276 unique URLs) |
| **Eligible to migrate** | **167** references on 167 products; 154 unique images (15.1 MB) |
| Excluded: logos, including 6 broken General Line logo links | 55 |
| Skipped: wrong brand | 9 |
| Skipped: Google search thumbnails | 67 |
| Skipped: under 400 px | 13 |
| Skipped: watermark or promotional graphic | 2 |
| Download refused now (retry later) | 11 |
| Manual review | 2 |

**Eligible by brand:** Panasonic 25, Indesit 23, LG 23, Blue Star 19, Super General 19, Symphony 17, Aftron 14, Mitsubishi Electric 9, Geepas 4, Toshiba 3, Samsung 2, Krome 2, Gree 1, AFRA 1, Kenwood 1, Fagor 1, Yorker 1, Skill Tech 1, Westpoint 1

**Eligible by source:** m.media-amazon.com 27, www.lg.com 17, symphonylimited.com 16, pimcdn.sharafdg.com 12, bf1af2.akinoncloudcdn.com 10, www.supergeneral.com 10, rattanelect.com 8, www.alrayanservices.com 5, digitalassets-cdn.thron.com 5, panasonic.scene7.com 5, images-eu.ssl-images-amazon.com 3, 5.imimg.com 3, gecouae.com 3, cdn.prod.website-files.com 3, catalogue.geepas.com 3, www.fajtradingllc.com 3, electronicparadise.in 2, cdn-tp1.euw1.kibocommerce.com 2, mannaihome.com 1, rukminim2.flixcart.com 1, admin.safarimallonline.com 1, vivastore.qa 1, devr.fadalelect.com 1, anbisolutions.com 1, media-ik.croma.com 1, alemadigroup.store 1, www.globalbluestar.com 1, www.appliancesdirect.co.uk 1, urbancucine.com 1, abulawi.com 1, www.optimusgeneral.ae 1, cdn.media.amplience.net 1, images.samsung.com 1, tiimg.tistatic.com 1, z.nooncdn.com 1, f.nooncdn.com 1, static.jazp.com 1, cdn.sheeel.com 1, kariakoomall.co.tz 1, skilltechonline.com 1, uae.geepas.com 1, www.bzaaarz.com 1, cdn11.bigcommerce.com 1, www.unitco.ae 1, dasintergroup.com 1, www.acmartuae.com 1, toongheng.com 1, tamigstore.com 1

## Not migrated, one line per reference

- **excluded-logo**: AKAI ACMA-M12T3R4 / ACMA-M18T3R4 (#1, logos-world.net): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Blue Star HW24CCYFAN3-01 (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Clivet 10-ton-package-ac (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-DGC-665BSF (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-DGC-S965HDFP (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-DCC-S664HF (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-DCD-8S15P (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-DCF-151D (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-DCF-221D (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-DW-T131WD (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-DW-T201WD (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-FR-250VSN (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-FR-380VSN (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-FR-559VSIN (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Daewoo DW-FR-624VSIN (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line GL-275CF (#1, genralline.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line GL-700CF (#1, genralline.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line GL-160CF (#1, genralline.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line GL-475CF (#1, genralline.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line GL-900CF (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line ME-5000AC (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line GL-800CF (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line GL-350CF (#1, genralline.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line ME-7000AC (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: General Line GL-550CF (#1, genralline.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree T4 MATIC-i60C3 (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-F4 MATIC-18C3-IND (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-I Airy32-18C3-IND (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-I2 Pro-12C3-IND (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-I2 Pro-18C3-IND (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-I2 Pro-24C3-IND (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-I2 Pro-30C3-IND (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-I2 Pro-36C3-IND (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-I4 Pro-12C3-IND (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-I4 Pro-18C3-IND (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Gree GR-ISAVE PLUS-P30H3-IND (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Haier HSU-18/24LPA03 (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Haier HCF-590S (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Krome KR-AWP18EZTT3 (#1, brewinggadgets.in): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Mazaya GL-24WTC (#1, play-lh.googleusercontent.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Mazaya GL-36WTC (#1, play-lh.googleusercontent.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Phoenix PH1019 (#1, cdn.vectorstock.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Phoenix PH2019 (#1, cdn.vectorstock.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Simfer SMF302IND (#1, www.simferglobal.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Simfer SMF604IND-H (#1, www.simferglobal.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Toshiba TD-T25BS110HWM(MG) (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Toshiba MM-EG34P(BK) (#1, images.seeklogo.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Toshiba GRA820U-X(BS) (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Westpoint WIT-2426.MTYH (#1, cdn.freebiesupply.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Westpoint WIT-2426PRO (#1, cdn.freebiesupply.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Westpoint WIT-3626.MTYH (#1, cdn.freebiesupply.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Westpoint WIT-1826PRO (#1, cdn.freebiesupply.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Westpoint WIT-1826.MTYH (#1, cdn.freebiesupply.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Westpoint WTX-617 (#1, cdn.freebiesupply.com): classified as a logo in the 2026-10-30 audit (viewed)
- **excluded-logo**: Westpoint WDV-5524.EDI (#1, encrypted-tbn0.gstatic.com): classified as a logo in the 2026-10-30 audit (viewed)
- **failed-download**: Aftron AF-W-1269B/C-INV (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: Aftron AF-W-36065B/C-S21 (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: Aftron AFW14600X (#1, images.snoonu.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: Aftron AFW20600X (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: Indesit IB-65B60NE (#1, indesituk.vtexassets.com): download failed now: HTTP 429
- **failed-download**: Indesit RIN9-EV820205XME (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: Krome KR-AWR24ST3 (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: LG T9586NDKVH (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: Samsung AR18TRHQKWKNGU (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: Samsung AR24TRHQKWKXGU (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **failed-download**: Super General SGS245FE (#1, pimcdn.sharafdg.com): download failed now: served as application/octet-stream, not an image
- **manual-review**: Krome KR-SAP24EZT3 (#1, m.media-amazon.com): unbranded outdoor unit; cannot be tied to Krome (zoomed 2026-10-30)
- **manual-review**: Nikai NSAC12432CP23 (#1, images.seeklogo.com): not part of the 2026-10-30 visual audit (added or changed since)
- **skipped-low-resolution**: Aftron AF1995E (#1, www.alrayanservices.com): low resolution 300x300
- **skipped-low-resolution**: Blue Star HW30HOYFBN3-01 (#1, d91ztqmtx7u1k.cloudfront.net): low resolution 268x268
- **skipped-low-resolution**: Blue Star WM24CLYFB3-01 (#1, www.alrayanservices.com): low resolution 300x300
- **skipped-low-resolution**: Blue Star HW18CCYFAN3-01 (#1, rukminim3.flixcart.com): low resolution 192x192
- **skipped-low-resolution**: Indesit TINF-701452XME (#1, digitalassets-cdn.thron.com): low resolution 320x320
- **skipped-low-resolution**: Indesit TINF-836353XME (#1, digitalassets-cdn.thron.com): low resolution 320x320
- **skipped-low-resolution**: Krome KR-SAP18EZT3 (#1, sbtraders.ae): low resolution 300x300
- **skipped-low-resolution**: LG A27TNC.UUAE2 (#1, cdn.media.amplience.net): low resolution 358x358
- **skipped-low-resolution**: LG GR-C345SLBB (#2, www.lg.com): low resolution 350x350
- **skipped-low-resolution**: Super General SGW 1056N (#1, m.media-amazon.com): low resolution 302x350
- **skipped-low-resolution**: Super General SGS181AE (#1, www.supergeneral.com): low resolution 275x330
- **skipped-low-resolution**: Super General SGS249AE (#1, www.supergeneral.com): low resolution 275x330
- **skipped-low-resolution**: Super General SG CL 50T3 (#1, 5.imimg.com): low resolution 250x250
- **skipped-thumbnail**: AFRA AF-0603TLWMW (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Aftron AF-W-30030B/C (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 300x300
- **skipped-thumbnail**: Aftron AF-W-3660B/C (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 300x300
- **skipped-thumbnail**: Blue Star HW18CYRFA3-01 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Blue Star HW30CYRFA3-01 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Blue Star HW24HOYFAN3-01 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Blue Star HW24HQYFAN3-01 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Blue Star BSWC 30 2T (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Daewoo DW-FRS-721VSIN (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Geepas GACSP188CA (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Geepas GACW18015SU (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit IGGSM-533G3 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit IHBS-6.5LMX (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit ING-61S/BK (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Indesit ING-922S/BK (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit IS-19Q30NE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit MTWE-81483SGCC (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Indesit RIN6-GGG23121XME (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Indesit THP-641WIXI (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit DFE-1B19XUK (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit MWI-125GXUK (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Indesit MWI-5213IXUK (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit BIINF695403ME (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 320x320
- **skipped-thumbnail**: Indesit INBUF011 (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit LI8-SN1EXUK (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Indesit BDE-964WSV-GCC (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Indesit XWDE-751480XSUK (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Kenwood MWM31.000BK (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Krome KR-AWP18ET3 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG DFB512FW (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG I23TCP.UUAE2 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG I38TCF.UUAE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG T36ZCA.UUAE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG MS5696HIT (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG MA3882QC (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG MA3884VC (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG GN-B432PQGB (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG GN-F782HFHL (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 350x350
- **skipped-thumbnail**: LG GR-B267JQYL (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG GR-C629HQCL (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG F4J3VYG6J (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: LG T1785NEHTE (#2, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric MS-GS13/MU-GS13 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric MS-GS18/MU-GS18 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric MS-GS24/MU-GS24 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric MS-GS30/MU-GS30 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric MSY-GT24VF/MUY-GT24VF (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric MSY-GT36VF/MUY-GT36VF (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric PEY-ZM24JAG / SUY-ZM24VA (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric PEY-ZM36JAG / PUY-ZM36VKA (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Mitsubishi Electric PEV-P200/PUV-P200 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic NA-W14XG1BRN (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic SDM-WD3438BG (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic SDM-WD3128TG (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Panasonic NR-TG353BUSU (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic NR-BK468BQKU (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Panasonic NR-WY720ZMMU (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Panasonic NR-BC833MSAE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic NR-BC535VSAE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic NR-BC641VSAE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic NP-FVK16XEAE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic NA-14MG1WAE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Panasonic NA-16MG1WAE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link); low resolution 225x225
- **skipped-thumbnail**: Panasonic NA-S956FR2BE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Super General SG AA 110T5 (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Super General SGR415IE (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-thumbnail**: Toshiba ML-EC42S(BS) (#1, encrypted-tbn0.gstatic.com): Google search thumbnail (external link)
- **skipped-unsuitable**: Ogera OG3010GC (#1, m.media-amazon.com): promotional graphic with marketing text (zoomed 2026-10-30)
- **skipped-unsuitable**: Super General SGP204T3 (#1, gkvjw0ooc9bgy90a.public.blob.vercel-storage.com): retailer watermark "SupplyVan" (zoomed 2026-10-30)
- **skipped-wrong-brand**: Aftron AF-W-1860BX/CX (#1, encrypted-tbn0.gstatic.com): wrong brand: Hisense (also a 300 px Google thumbnail); Google search thumbnail (external link); low resolution 300x300
- **skipped-wrong-brand**: Krome KR-AR24MT3 (#1, encrypted-tbn0.gstatic.com): wrong brand: Mitsubishi Electric unit (also a 300 px Google thumbnail); Google search thumbnail (external link); low resolution 300x300
- **skipped-wrong-brand**: Krome KR-AR30MT3 (#1, encrypted-tbn0.gstatic.com): wrong brand: Mitsubishi Electric unit (also a 300 px Google thumbnail); Google search thumbnail (external link); low resolution 300x300
- **skipped-wrong-brand**: Krome KR-SAC18IM (#1, 5.imimg.com): wrong brand: Carrier split unit
- **skipped-wrong-brand**: Krome KR-SAC24IM (#1, 5.imimg.com): wrong brand: "electro" multi-split units (zoomed 2026-10-30)
- **skipped-wrong-brand**: Krome KR-AWP24EZTT3 (#1, m.media-amazon.com): wrong brand: Westpoint window AC (zoomed 2026-10-30)
- **skipped-wrong-brand**: Krome KR-FAC483PR-IN+OD (#1, cpimg.tistatic.com): wrong brand: Voltas floor-standing unit
- **skipped-wrong-brand**: Krome KR-FAC603PR-IN+OD (#1, 5.imimg.com): wrong brand: Cruise floor-standing unit (zoomed 2026-10-30)
- **skipped-wrong-brand**: Super General SGS316AE (#1, www.icecubeuae.com): wrong brand: Gree split unit
