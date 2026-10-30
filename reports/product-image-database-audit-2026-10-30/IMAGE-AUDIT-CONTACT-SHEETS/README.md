# Contact sheets

The sheets are grouped by brand as written in the database, and products within a brand are sorted by model. Each sheet holds up to 48 cells.

**Each cell shows:**
- **Line 1:** the cell code and the model. Codes are the brand prefix plus the product number; a letter is added for the 2nd and later gallery images.
- **Line 2:** size and storage, or the automatic warning hints in red.
- **Line 3:** the source host, or for Supabase files the site the image was imported from.

A **pink cell** means the image could not be downloaded.

**`FLAGGED-*.png`** sheets show only products whose primary image is not suitable, grouped by verdict (logo, broken, wrong brand / stock / defect, Google thumbnail, under 400 px). The verdict and reason are printed under each image; a red "CONFIRM:" label marks a classification that needs a person to check it. They are made by `../tools/flagged-sheets.mjs`.

**Red hints are only pointers, not verdicts.**
- "flat graphic (logo?)" fires on plain white air-conditioners too.
- Every verdict was made by looking at the image; see `../tools/visual-decisions.json`.
- `PRODUCT-IMAGE-CLASSIFICATION.csv` maps every product to its cell code and sheet.

**Need a person to confirm** (`needs-confirmation` in the CSVs):
- NIKA-002: probably another brand's floor-standing unit; logo not legible
- NIKA-004: generic portable AC, other brand mark (not Nikai)
- NIKA-011: generic, distorted low-quality AC graphic
- OGEN-010: official marketing composite with a diagonal www.ogeneralac.com watermark and icons
- OGEN-013: official marketing composite with a diagonal www.ogeneralac.com watermark and icons
- OGEN-014: official marketing composite with a diagonal www.ogeneralac.com watermark and icons
- OGEN-015: official marketing composite with a diagonal www.ogeneralac.com watermark and icons
- OGEN-016: official marketing composite with a diagonal www.ogeneralac.com watermark and icons
- WEST-009: retailer watermark (nidadanish) across the product
- HAIE-008: product fills only a small part of the frame (tiny cooker on a 1910x1000 canvas)

| Sheet | Brand | Cells |
|---|---|---|
| 01-AFRA.png | AFRA | 2 |
| 02-Aftron.png | Aftron | 22 |
| 03-AKAI.png | AKAI | 2 |
| 04-Black-Decker.png | Black+Decker | 6 |
| 05-Blue-Star.png | Blue Star | 28 |
| 06-Bosch.png | Bosch | 7 |
| 07-BOSCH.png | BOSCH | 1 |
| 08-Clivet.png | Clivet | 21 |
| 09-Daewoo.png | Daewoo | 15 |
| 10-Fagor.png | Fagor | 1 |
| 11-Geepas.png | Geepas | 17 |
| 12-General-Line.png | General Line | 10 |
| 13-Gree.png | Gree | 32 |
| 14-Haier.png | Haier | 46 |
| 15-Indesit.png | Indesit | 46 |
| 16-Kenwood.png | Kenwood | 7 |
| 17-Krome.png | Krome | 14 |
| 18-LG-1.png | LG | 48 |
| 19-LG-2.png | LG | 48 |
| 20-LG-3.png | LG | 10 |
| 21-Mazaya-1.png | Mazaya | 48 |
| 22-Mazaya-2.png | Mazaya | 10 |
| 23-Midea-1.png | Midea | 48 |
| 24-Midea-2.png | Midea | 48 |
| 25-Midea-3.png | Midea | 33 |
| 26-Mitsubishi-Electric.png | Mitsubishi Electric | 18 |
| 27-Nest.png | Nest | 1 |
| 28-Nikai.png | Nikai | 21 |
| 29-O-General.png | O General | 42 |
| 30-O-GENERAL.png | O GENERAL | 1 |
| 31-Ogera.png | Ogera | 1 |
| 32-Panasonic.png | Panasonic | 38 |
| 33-Phoenix.png | Phoenix | 2 |
| 34-Pro-General.png | Pro General | 4 |
| 35-Samsung.png | Samsung | 12 |
| 36-Simfer.png | Simfer | 8 |
| 37-Skill-Tech.png | Skill Tech | 1 |
| 38-Super-General.png | Super General | 48 |
| 39-Symphony.png | Symphony | 17 |
| 40-TCL.png | TCL | 20 |
| 41-Toshiba.png | Toshiba | 10 |
| 42-Westpoint-1.png | Westpoint | 48 |
| 43-Westpoint-2.png | Westpoint | 28 |
| 44-Whirlpool.png | Whirlpool | 1 |
| 45-Yorker.png | Yorker | 1 |

