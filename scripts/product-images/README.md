# Product image pipeline

`node --env-file=.env.local --import ./tests/support/register-ts.mjs scripts/product-images/pipeline.mjs <command>`

Commands, safeguards and state files are described at the top of `pipeline.mjs`. Every command that writes
(`review-import`, `review-rollback`, `upload`, `apply`, `rollback`, `cleanup`) only previews unless `--execute` is passed.

## Enabling image search (SerpAPI)

Search results are leads only. They never establish exact-model identity or commercial-use rights: each candidate
still needs an admin to confirm the model and record documented authorization in **Admin → Products → Image Review**.

1. Create a key at <https://serpapi.com/manage-api-key> (an account owner's own key; check the plan's monthly search quota —
   the pipeline makes up to 2–3 searches per product, so the 88 current targets need roughly 180–270 searches).
2. Add it to `.env.local` on the machine that runs the pipeline (this file is git-ignored — never put the key in
   `.env.example`, code, commits, tickets or chat):

   ```
   IMAGE_SEARCH_PROVIDER=serpapi
   SERPAPI_API_KEY=<your key>
   # optional tuning
   IMAGE_CANDIDATES_PER_PRODUCT=5
   IMAGE_SEARCH_COUNTRY=ae
   IMAGE_SEARCH_MIN_INTERVAL_MS=1200
   ```

   Open the file in an editor rather than using `echo … >> .env.local`, so the key does not land in shell history.
3. Check that the variable is set without printing it:

   ```
   grep -q '^SERPAPI_API_KEY=..' .env.local && echo "SERPAPI_API_KEY is set"
   ```

4. Freeze the target set, check the quota, then search in small batches:

   ```
   … pipeline.mjs audit                                   # read-only
   … pipeline.mjs targets                                 # creates target-manifest.json (or diffs a new audit against it)
   … pipeline.mjs quota                                   # remaining monthly searches (free check) + local ledger; no search
   … pipeline.mjs discover --source=search --batch=10     # at most 10 new requests, manifest products only
   … pipeline.mjs verify --no-vision                      # search images are NOT downloaded without documented authorization
   … pipeline.mjs review-import                           # preview; --execute only after approval
   ```

### Quota protection

- Only products in `target-manifest.json` can be searched. If a later audit differs, `targets` shows the differences and
  exits without changing the manifest; search refuses to run until `targets --accept-changes` is run deliberately.
- `SERPAPI_REQUEST_LIMIT` (default 200) caps the total requests the pipeline will ever make. Every request is written to
  `serpapi-ledger.json` before it is sent, failed ones included. The pipeline never resets this file.
- Before a batch, the account's remaining searches and the ledger must both cover the batch, otherwise nothing is searched
  and `quota-report.json` explains why.
- Pass 1 is one request per product (`Brand "MODEL" Category`). Manufacturer `site:` queries run only with
  `--search-pass=2`, which the operator must request explicitly.
- Results are cached by exact query (`serpapi-cache.json`, 30 days); cached queries cost nothing.
- Failed requests are never retried automatically; `--retry-failed` retries them once, within the same limits.
- Each run is summarised in `search-runs.json` (requests made, cache reuse, quota before/after, per-product results).

The key is used only server-side in the request to serpapi.com. It is never written to state files, logs or review
records. The app itself (Next.js) does not read it, so it does not need to be added to Vercel.

## Brand catalogue PDFs

```
… pipeline.mjs catalogue --pdf=catalogues-source/superGeneral.pdf --brand="Super General"
```

PyMuPDF reads every page (native text, embedded image placements and their transparency masks); pages whose text is
drawn as outlines are OCR'd with macOS Vision (`scripts/product-images/ocr/vision_ocr.swift`, compiled on first use;
`CATALOGUE_OCR=0` disables OCR). `catalogue-match.mjs` then matches exact model codes (identical, or differing only in
case/whitespace — never punctuation or OCR look-alikes) and associates each photo with the first heading row below it.
Rows with several models, "ALSO AVAILABLE" lists and images reused for other models are shared series photos and cannot
be approved. Crops are rendered at the photo's native density (never upsampled) and flagged when under 400 px.
Outputs (local only): `catalogue/<brand>/` (index, page previews, original assets, crops, 800×800 previews, highlighted
pages), `catalogue-candidates.json`, `catalogue-report.md` and `catalogue-report.html`. Discovery picks the candidates up as
the `catalogue-pdf` source. An official catalogue is not permission to reuse its images.

## Optional AI ranking

`IMAGE_VISION_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (and `npm install @anthropic-ai/sdk`). Scores are advisory:
they are shown to the reviewer and break ties in ranking, but are never used to approve an image.
