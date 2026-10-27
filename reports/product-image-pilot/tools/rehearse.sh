#!/usr/bin/env bash
# Pilot rehearsal on a COPY of the pipeline state (never --execute): fresh read-only audit, local + catalogue candidates for
# the 29 pilot products (replacement opt-in), verification without downloads or AI, review-queue preview, dry-run.
# Run from the project root. Writes only under reports/product-image-pilot/pipeline-rehearsal-state/.
set -euo pipefail
R=reports/product-image-pilot
export PIPELINE_STATE_DIR="$PWD/$R/pipeline-rehearsal-state"
export CATALOGUE_OCR=0 IMAGE_VISION_PROVIDER=none
IDS=$(node -e 'console.log(require("./'$R'/pilot-manifest.json").products.map(p=>p.pipelineProductId).join(","))')
ids_for() { node -e 'console.log(require("./'$R'/pilot-manifest.json").products.filter(p=>p.brand===process.argv[1]).map(p=>p.pipelineProductId).join(","))' "$1"; }
INC="--include-classes=EXTERNAL_NEEDS_VERIFICATION,SUPABASE_UNREVIEWED,VALID_VERIFIED"
# PRELOAD: optional DNS shim for machines whose resolver fails SRV/A lookups (see tools/public-dns-preload.mjs).
pp() { node --env-file=.env.local --import ./tests/support/register-ts.mjs ${PRELOAD:+--import "$PRELOAD"} scripts/product-images/pipeline.mjs "$@"; }

echo "== audit (read-only)";            pp audit | tail -12
echo "== discover: local files";        pp discover --source=local --local-candidates=$R/local-candidates.json --only=$IDS $INC | tail -1
for spec in "Mazaya|catalogues-source/MAZAYA CATALOGUE 2025.pdf" "Krome|catalogues-source/KROME CATALOG 25-26.pdf" "Super General|catalogues-source/superGeneral.pdf"; do
  brand=${spec%%|*}; pdf=${spec#*|}; bids=$(ids_for "$brand")
  echo "== catalogue: $brand";          pp catalogue "--pdf=$pdf" "--brand=$brand" --only=$bids $INC | grep -E '"(candidates|exactUnambiguousIdentity|sharedImage|needsReview|targetProducts|databaseWrites|storageWrites)"'
  echo "== discover: $brand";           pp discover --source=local --local-candidates=$R/local-candidates.json --only=$bids $INC | tail -1
done
echo "== verify (no download, no AI)";  pp verify --no-vision --no-download --only=$IDS $INC | tail -2
echo "== review-import (preview)";      pp review-import --only=$IDS $INC | tail -1
echo "== dry-run";                      pp dry-run --only=$IDS $INC | tail -1
