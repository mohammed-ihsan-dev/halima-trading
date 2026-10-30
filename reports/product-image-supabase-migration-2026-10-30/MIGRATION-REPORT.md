# Product image migration to Supabase: final report (2026-10-30)

- **Plan:** `PLAN.md` lists 167 approved references.
- **Execution:** a 5-product test batch, then batches of 25.
- **Final audit:** a fresh, read-only scan of the live database and Supabase Storage, taken after the run.

| Metric | Final result |
|---|---:|
| Products inspected | 885 |
| Approved migration references | 167 |
| Successfully migrated | 163 |
| Existing Supabase objects reused | 15 |
| New Supabase uploads | 148 |
| Skipped (changed since plan / content changed) | 4 |
| Failed downloads | 0 |
| Failed uploads | 0 |
| Failed database updates | 0 |
| Orphaned storage objects | 0 |
| Logos preserved | 63 of 63 logo references (55 external + 8 already in Supabase) |
| External product image references remaining | 163 |
| Valid Supabase image references | 727 of 727 (713 unique objects verified: object exists and public URL serves the image) |
| Base64 images inside MongoDB (out of scope, unchanged) | 12 |

## Checks

Every product was compared before and after the run, using `tools/snapshot-before.json` and `tools/snapshot-after-all.json`.
- **Product data:** Every migrated product changed only at its planned image positions; gallery order and every other field are identical.
- **Other products:** No other product changed.
- **Logos:** 63 of 63 logo references are still exactly where they were.
- **Storage:** every migrated URL is a bucket object that exists and is publicly served. There are 0 duplicate uploads of the same content and 0 orphans.
- **Import log:** 149 `product_image_imports` records were written by this migration. Reused objects get no new record.

## Approved references not migrated

- Aftron AFW66100X (#1): **manual-review**. content changed since planning/visual review
- Indesit IS67G1PCX/MEA (#1): **manual-review**. content changed since planning/visual review
- LG GR-B479NUM (#1): **manual-review**. content changed since planning/visual review
- Panasonic CS/CU-PN30YKF-5 (#1): **manual-review**. content changed since planning/visual review

## Remaining external references (163), by reason

- skipped-thumbnail: 67
- excluded-logo: 55
- skipped-low-resolution: 13
- failed-download: 11
- skipped-wrong-brand: 9
- held back: 4
- skipped-unsuitable: 2
- manual-review: 2

Each reference is listed with its reason in `REMAINING-EXTERNAL-IMAGES.csv`.


## Files

| File | Contents |
|---|---|
| `MIGRATED-IMAGES.csv` | Each migrated image: product, previous URL, new URL, storage path, SHA-256, time |
| `NOT-MIGRATED-APPROVED.csv` | Approved references that were skipped or failed, with the reason |
| `REMAINING-EXTERNAL-IMAGES.csv` | Every external URL still in the database, with the reason |
| `state.json` | Migration state; makes the run resumable and idempotent |
| `backups/` | Each product document as it was before its update |
| `tools/` | Scripts, snapshots and verification output |
