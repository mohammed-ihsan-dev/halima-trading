# Halima Trading — product image & catalogue audit

Audit run: 2026-10-26. **Audit only.** Nothing in MongoDB, Supabase, `public/`, `catalogues-source/` or `work/` was changed. Every database operation was a read (`find`, `listCollections`, `countDocuments`).

## Executive summary

- **885 products** were audited (873 active, 12 draft). That is every document in the `products` collection.
- **407 products (46.0%) have a working, usable image.** Of those 407 images:
  - 186 are on Supabase;
  - 209 are linked from other websites;
  - 12 are embedded directly in MongoDB as base64.
- **478 products (54.0%) have no usable image:**

  | Situation | Products | Share |
  |---|---|---|
  | No image at all | 357 | 40.3% |
  | Image loads but is unsuitable | 113 | 12.8% |
  | Broken image | 7 | 0.8% |
  | Could not be verified | 1 | 0.1% |

  - **No image at all (357).** All of these come from recent catalogue imports, mostly Midea (137), Westpoint (75), Haier (42), Clivet (21), TCL (20), O General (20) and Kenwood (5). The 12 draft products are among them.
  - **Unsuitable (113).** These are mostly Google search thumbnails (89), images under 300 px (21), and logos or stock graphics (14). One product can have more than one of these problems.
  - **Broken (7).** These are 5 Blue Star and 2 Aftron products. Their images are on alrayanservices.com, whose security certificate has expired, so browsers refuse to load them.
- **Images already on hand cover few of the 478 products.** Local files and catalogues give a high-confidence candidate for 15 of them and a medium-or-better candidate for 31; 2 of those 31 files are just copies of the product's current image, which leaves 29 real candidates. Any candidate at all exists for 128. **About 447 products need images from elsewhere.** The reason is that the products with no image at all have no matching catalogue on disk. For example, the Midea PDF here covers small home appliances, not the Midea air conditioners.
- **The image infrastructure is already in place** and can be reused:
  - Supabase upload and verification;
  - a review and approval workflow;
  - an image pipeline with rollback.

## Scope and method

| Phase | What was done |
|---|---|
| Project structure | Scanned the repository, excluding `node_modules`, `.next`, `.git`, `.pnpm-store` and `reports`. Read the product repository, the image and storage modules, the API routes, and the names of the environment variables (not their values). |
| Database | Read all 885 product documents. Took the image fields from the real data: `images: string[]` is the only image field, and the first entry is the main image. Checked all 10 collections. |
| Image checks | Checked 489 unique image addresses. Each outside image got one request for its first 64 KB, with a 12 s timeout and one retry. Supabase images were downloaded in full (up to 15 MB) to get a fingerprint (SHA-256) and the pixel size. The 12 base64 images were decoded and checked. |
| Local files | Scanned 1,637 image files under `public/`, `catalogues-source/`, `work/`, `data/` and `examples/`. Each got a fingerprint and its pixel size, and its filename was compared with every product's SKU and model. Each was checked against the site code and against the Supabase image fingerprints. |
| Catalogues | Read 25 PDFs (970 pages) with PyMuPDF. For each page it recorded the amount of text, the embedded images, words that suggest spec tables, and anything that looks like a model number. Those were matched against product SKUs and models. |
| Matching | Filename and catalogue-text matches are leads only. None was assigned to a product. |
| Quality | Looked for duplicate SKUs, models, ids, slugs and names; brand spelling variants; the same image on several products; identical files; images whose filename names another model; and missing data. |

Tools are in `tools/`: `audit.mjs` (Node, read-only) and `pdf_audit.py` (PyMuPDF). Cached check results are in `tools/cache/`. Run them from the project root:
`python3 reports/product-image-audit/tools/pdf_audit.py reports/product-image-audit/tools/cache/pdf-audit.json <pdfs…>` and then
`node --env-file=.env.local --import ./tests/support/register-ts.mjs reports/product-image-audit/tools/audit.mjs`.

## Limits on what could be checked

- **DNS on the audit machine.** This machine's DNS blocks some hosts, so Node and curl failed on supergeneral.com, thron.com, geepas.com and others. Those addresses were rechecked through public DNS (1.1.1.1 / 8.8.8.8) and all of them loaded. The first run had wrongly reported 50 of them as broken.
- **Outside images were not downloaded in full.** So the audit can't tell when two different outside addresses are the same picture. Fingerprint comparison covers Supabase images and local files only.
- **"Unsuitable" is a rule of thumb.** It means a Google thumbnail, a logo or stock site, or an image under 300 px. The audit didn't judge whether a picture shows the correct model, and it didn't assess usage rights for any existing outside image.
- **Not every model number could be matched.** Model numbers in catalogues are matched only when they come out of the PDF text. Scanned or image-only catalogues give no model numbers: SAMSUNG.pdf, symphony.pdf, the AKAI single sheet and the Halima brochure. Catalogues that write model numbers differently, such as Gree's "AIRY32", need looser matching. That would be a next step.
- **One URL couldn't be verified.** skilltechonline.com timed out on both tries. A manual curl through public DNS returned 200 image/jpeg, so the product (Skill Tech SH MS05FS) is marked unverified, not broken.

## Main findings

1. **Storage is mixed.**
   - **Supabase (199 references on 193 products).** All 199 load.
   - **Outside websites (324 references on 323 products, from about 65 hosts).** The main hosts are Google thumbnails (90), Amazon (36), Sharaf DG (21), LG (18) and Symphony (16). Hot-linked outside images can disappear or be blocked at any time, and their usage rights are unknown.
   - **Base64 in MongoDB (12 references on 12 O General products).** These make the documents much larger. They are still accepted only so that older products can be edited.
   - No R2, local-path or malformed references were found.
2. **Duplicates.**
   - 23 image addresses are shared by more than one product, and 14 sets of Supabase images are byte-identical across products. Together these affect 101 products. Some sharing is fine, such as colour variants or the same unit in different sizes. Some is wrong; see `duplicate-and-data-quality-report.csv`.
   - 5 images have a filename that names a different model. For example, the Mitsubishi MS-GS36 uses `MS-gs-30.png`, and the Geepas GACW1878CU uses `GACW1878TCU1.jpg`.
3. **Data quality.**
   - No duplicate SKUs, models, ids or slugs were found.
   - There are 20 duplicate product names, which are separate models with the same descriptive name.
   - There are 2 brand-spelling variant groups: "O General" vs "O GENERAL", and "Bosch" vs "BOSCH". Each pair already shares the same brand slug.
   - 324 products have the subcategory "General".
   - 24 products use the Air Coolers & Fans category. Its slug `air-coolers-fans` is set in the site code, not in the `categories` collection.
4. **Local files.**
   - Of the 1,637 image files, 217 are byte-identical copies of images already on Supabase. These were uploaded by earlier batches.
   - Breakdown: 255 have a product code in the filename, 1,311 are working files from the earlier image pipeline, 47 are website graphics, 17 are logos and 7 are unclassified.
   - There are 115 groups of identical files.
5. **Catalogues.**
   - There are 25 PDFs (970 pages). 19 are product catalogues, 2 are Halima's own documents, and 4 are unclear: scanned or image-only, or with no model numbers matching the site.
   - All 25 opened, and none is password-protected.
   - Ranked by how many site models they contain exactly: the Halima catalogue (483, but generated from the database, so not a source), LG (58), Mazaya (43), Nikai (13), Krome (10), TCL (10 partial), Super General (7) and B+D (6).

## Where everything is

| File | Contents |
|---|---|
| `README.md` | This summary |
| `project-structure.json` | Technology, directories (file count, size, PDFs, images, purpose), code paths, environment variable names, product fields as seen in the data |
| `product-image-inventory.csv` / `.json` | One row per product (885), keyed on `productId` (the MongoDB `_id`) |
| `image-summary.json` | Totals, percentages, storage split, check results, hosts, matchability, limits |
| `local-image-assets.csv` | 1,637 local image files with size, pixel size, fingerprint, type, product-code matches and references |
| `catalogue-inventory.csv` | 25 PDFs: pages, brand, year, whether text can be selected, whether scanned, embedded images, spec pages, model matches |
| `candidate-image-matches.csv` | 981 product-to-file and product-to-catalogue-page leads with evidence and confidence; all need manual review |
| `duplicate-and-data-quality-report.csv` | 539 issues: exact vs suspected |
| `next-steps.md` | Recommended order for building the automation |

All files join on `productId`. They are UTF-8, and `reports/` is not part of the deployed site.

## Recommended next steps (short version)

1. **Fix the 7 broken products.** Their image host's certificate has expired.
2. **Replace the 89 products that show Google thumbnails.** Start with the 29-product pilot in `next-steps.md`, which already has an image on disk.
3. **Copy usable outside images into Supabase** before they disappear, after confirming the rights.
4. **Move the 12 base64 images into Supabase.**
5. **Source images for the 357 products with none.** This needs supplier image packs or the existing search pipeline, because none of the catalogues on disk cover them.

See `next-steps.md` for the full order and the pilot list.
