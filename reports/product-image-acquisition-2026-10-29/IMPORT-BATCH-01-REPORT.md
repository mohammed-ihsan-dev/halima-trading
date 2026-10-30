# Import batch 01: verified official images (2026-10-29)

This batch was authorised by the owner, who confirmed permission to use these images. It covered verified exact-model matches from official manufacturer pages only.

| Result | Products |
|---|---|
| Imported and linked | **24** (Haier 15, LG 9) |
| Thumbnail replaced in place (Haier) | 4 |
| Skipped | 4 (Samsung: the audit candidate was the Samsung logo, not a product photo) |
| Failed | 0 |

## Checks

- **Full decoding:** every image was decoded with `sharp`, at 1100×730 (LG JPEG) or 1200×628 (Haier WebP).
- **Storage:** content-addressed keys, no duplicate uploads; 354385 bytes in total.
- **Upload verified:** each object was verified, and its public URL answered 200/206.
- **Audit log:** each import was recorded in `product_image_imports`.
- **Database:** a backup of each product was written to `import-batch-01/backups/` before any change. Each update was conditional and changed only `images` and `updatedAt`; every other field was checked unchanged (24/24).
- **Recheck:** MongoDB and storage match 24/24. The live site shows the new image on 22/22 public pages; HW70-BP12929A and HW90-B14979S8U1 are drafts, which are not shown publicly.
- **Nothing deleted:**
  - The 4 replaced thumbnail objects stay in storage, now unreferenced.
  - 9 LG products keep their old Google thumbnail as the second image, because the rules forbid deleting automatically. Removing them is a separate, explicit step.
- **Resumable:** `tools/import-verified-batch.mjs` skips products already imported.

## Imported

| Brand | Model | Product ID | Change | Source page | Supabase key |
|---|---|---|---|---|---|
| LG | DFB512FW | `6aca2e64df911910339b3da6` | add as primary (existing images kept after it) | https://www.lg.com/ae/dishwashers/lg-dfb512fw-uae | `products/dfb512fw/286f5d57-14ae-4f0f-9178-b7c0342130d8.jpg` |
| LG | MS5696HIT | `6aca2e64df911910339b3dde` | add as primary (existing images kept after it) | https://www.lg.com/ae/cooking-appliances/lg-ms5696hit | `products/ms5696hit/16b1dbca-7545-4ee8-a259-1d6627b6e0d1.jpg` |
| LG | MA3884VC | `6aca2e64df911910339b3de2` | add as primary (existing images kept after it) | https://www.lg.com/ae/cooking-appliances/lg-MA3884VC-uae | `products/ma3884vc/8622427e-15e4-46f1-9d57-69553089682e.jpg` |
| LG | GN-B432PQGB | `6aca2e64df911910339b3de7` | add as primary (existing images kept after it) | https://www.lg.com/ae/refrigerators/lg-gn-b432pqgb-uae | `products/gn-b432pqgb/852841b5-bf92-46db-a72d-e429fe26308f.jpg` |
| LG | GR-B267JQYL | `6aca2e64df911910339b3def` | add as primary (existing images kept after it) | https://www.lg.com/ae/refrigerators/lg-gr-b267jqyl-uae | `products/gr-b267jqyl/8bc05b32-b51a-4a81-b793-56a72b1948da.jpg` |
| LG | GR-C345SLBB | `6aca2e64df911910339b3df7` | add as primary (existing images kept after it) | https://www.lg.com/ae/refrigerators/lg-gr-c345slbb-uae | `products/gr-c345slbb/ce9ea887-f9f2-4624-9bd0-7b47fb8ba6eb.jpg` |
| LG | GR-C629HQCL | `6aca2e64df911910339b3df9` | add as primary (existing images kept after it) | https://www.lg.com/ae/refrigerators/lg-gr-c629hqcl | `products/gr-c629hqcl/92616b7c-1151-42dc-9418-00b35a1b13d8.jpg` |
| LG | F4J3VYG6J | `6aca2e64df911910339b3e0d` | add as primary (existing images kept after it) | https://www.lg.com/ae/washing-machines/lg-f4j3vyg6j-uae | `products/f4j3vyg6j/42edb5c3-a11f-457b-a254-0f2ad1053dcb.jpg` |
| LG | T1785NEHTE | `6aca2e64df911910339b3e16` | add as primary (existing images kept after it) | https://www.lg.com/ae/washing-machines/lg-t1785nehte | `products/t1785nehte/27d758e6-2ce8-450b-8ae9-275e613e29f4.jpg` |
| Haier | HW70-BP12929A | `6adb4feb12e90be677835dd0` | first image | https://www.haier.com/ae/washing-machines/hw70-bp12929a.shtml | `products/hw70-bp12929a/e0c8ea46-47f1-420a-9b76-5a35eee99724.webp` |
| Haier | HWD110-BD14397SU1 | `6adb4feb12e90be677835dd8` | first image | https://www.haier.com/ae/washing-machines/hwd110-bd14397su1.shtml | `products/hwd110-bd14397su1/92db4da9-59e8-4224-9cdd-13fc01c99fc5.webp` |
| Haier | HW90-B14979S8U1 | `6adb4feb12e90be677835dd6` | first image | https://www.haier.com/ae/washing-machines/hw90-b14979s8u1.shtml | `products/hw90-b14979s8u1/4dfcc0b3-b75f-450e-8f83-05ddc596d49c.webp` |
| Haier | HW80-BP12929S6 | `6adb4feb12e90be677835dd2` | first image | https://www.haier.com/ae/washing-machines/hw80-bp12929s6.shtml | `products/hw80-bp12929s6/d60897c3-aa27-4b5b-bf56-cb67ecb919c4.webp` |
| Haier | HCR9060GT1 | `6adb4feb12e90be677835dcb` | replace thumbnail import in place | https://www.haier.com/ae/cooktops/hcr9060gt1.shtml | `products/hcr9060gt1/4c208021-207c-4482-926b-48ca121a549b.webp` |
| Haier | HW80-BP12929 | `6adb4feb12e90be677835dd1` | first image | https://www.haier.com/ae/washing-machines/hw80-bp12929.shtml | `products/hw80-bp12929/9632cdaa-1baa-415a-a6e6-49921f6c735a.webp` |
| Haier | HCR6060ET1 | `6adb4feb12e90be677835dcd` | replace thumbnail import in place | https://www.haier.com/ae/cooktops/hcr6060et1.shtml | `products/hcr6060et1/178c9411-5389-4ab6-ac95-b50b105f0c24.webp` |
| Haier | HWM120-B1678S8 | `6adb4feb12e90be677835dda` | first image | https://www.haier.com/ae/washing-machines/hwm120-b1678s8.shtml | `products/hwm120-b1678s8/e9b2b7fd-29ef-4426-a316-0b73de792787.webp` |
| Haier | HWM215-1128S-N | `6adb4feb12e90be677835ddb` | first image | https://www.haier.com/ae/washing-machines/hwm215-1128s-n.shtml | `products/hwm215-1128s-n/9b95eda3-9ebd-4006-800f-6a5dd5bc651d.webp` |
| Haier | HW75-BP12337S | `6adb4feb12e90be677835dcf` | first image | https://www.haier.com/ae/washing-machines/hw75-bp12337s.shtml | `products/hw75-bp12337s/133fba84-ef72-4ac4-82fa-de18d1b869f7.webp` |
| Haier | HRF-700TS | `6adb4feb12e90be677835dc2` | replace thumbnail import in place | https://www.haier.com/ae/refrigerators/hrf-700ts.shtml | `products/hrf-700ts/81dd1a3f-d5ae-4ba3-854f-ca33fb46169a.webp` |
| Haier | HWD90-BP14929S6 | `6adb4feb12e90be677835dd7` | first image | https://www.haier.com/ae/washing-machines/hwd90-bp14929s6.shtml | `products/hwd90-bp14929s6/6991e6ba-a5cc-4d37-86b2-1b1e4d4a7592.webp` |
| Haier | HRF-525SS | `6adb4feb12e90be677835dc1` | replace thumbnail import in place | https://www.haier.com/ae/refrigerators/hrf-525ss.shtml | `products/hrf-525ss/69092095-2384-465c-8542-8b28f15fd960.webp` |
| Haier | HW110-BD14387SU1 | `6adb4feb12e90be677835dd4` | first image | https://www.haier.com/ae/washing-machines/hw110-bd14387su1.shtml | `products/hw110-bd14387su1/b5650f6b-d668-4189-b788-395e1ec38a51.webp` |
| Haier | HW110-BD14697GNU1 | `6adb4feb12e90be677835dd5` | first image | https://www.haier.com/ae/washing-machines/hw110-bd14697gnu1.shtml | `products/hw110-bd14697gnu1/a75a7ba1-6853-4aef-b743-dac2ece37e1b.webp` |

## Skipped

- Samsung DV90CGC2A0ABGU (`6aca2e64df911910339b3e55`): candidate image is the manufacturer logo (og:image), not a product photo
- Samsung WW11BB944DGBGU (`6aca2e64df911910339b3e56`): candidate image is the manufacturer logo (og:image), not a product photo
- Samsung WW70T3020WW / GU (`6aca2e64df911910339b3e59`): candidate image is the manufacturer logo (og:image), not a product photo
- Samsung WW90TA046AE / GU (`6aca2e64df911910339b3e5d`): candidate image is the manufacturer logo (og:image), not a product photo

See `REMAINING-GAPS.md` for the next batch: the 4 Samsung products now have verified gallery images.
