#!/usr/bin/env bash
# Catalogue extraction for products that still need an image, on a COPY of the pipeline state (never --execute).
# Writes only under reports/product-image-acquisition-2026-10-29/pipeline-state/.
set -uo pipefail
R=reports/product-image-acquisition-2026-10-29
export PIPELINE_STATE_DIR="$PWD/$R/pipeline-state" CATALOGUE_OCR=0 IMAGE_VISION_PROVIDER=none
INC="--include-classes=EXTERNAL_NEEDS_VERIFICATION,SUPABASE_UNREVIEWED,VALID_VERIFIED"
pp() { node --env-file=.env.local --import ./tests/support/register-ts.mjs ${PRELOAD:+--import "$PRELOAD"} scripts/product-images/pipeline.mjs "$@"; }
need_ids() { node -e 'console.log(require("./'$R'/tools/baseline/product-image-inventory.json").products.filter(p=>!p.hasValidImage && process.argv.slice(1).includes(p.brand)).map(p=>p.id).join(","))' "$@"; }
if [ "${SKIP_AUDIT:-0}" != 1 ]; then echo "== audit (read-only)"; pp audit | tail -3; fi
mkdir -p "$PIPELINE_STATE_DIR/catalogue-runs"
while IFS='|' read -r brand pdf; do
  ids=$(need_ids "$brand"); [ -z "$ids" ] && { echo "== $brand: nothing to do"; continue; }
  echo "== catalogue: $brand ($pdf)"
  pp catalogue "--pdf=$pdf" "--brand=$brand" --only=$ids $INC > "$PIPELINE_STATE_DIR/catalogue-runs/$(echo $brand | tr ' +' '__').log" 2>&1
  grep -E '"(targetProducts|candidates|exactUnambiguousIdentity|sharedImage|needsReview|lowResolution|targetsNotInCatalogue|databaseWrites|storageWrites)"' "$PIPELINE_STATE_DIR/catalogue-runs/$(echo $brand | tr ' +' '__').log" | tr -d '\n '; echo
  cp "$PIPELINE_STATE_DIR/catalogue-candidates.json" "$PIPELINE_STATE_DIR/catalogue-runs/$(echo $brand | tr ' +' '__').candidates.json" 2>/dev/null
  pp discover --source=local --only=$ids $INC | tail -1
done <<'LIST'
TCL|catalogues-source/TCL-UAE_AC Catalogue-2025.pdf
Mazaya|catalogues-source/MAZAYA CATALOGUE 2025.pdf
LG|catalogues-source/LG HA & RAC (PS)PPT.pdf
Gree|catalogues-source/Gree-Catalogue-2025-IR.pdf
Super General|catalogues-source/superGeneral.pdf
Krome|catalogues-source/KROME CATALOG 25-26.pdf
Nikai|catalogues-source/Nikai Cataloge 2025 26-03-25.pdf
Midea|catalogues-source/19147 midea-catalogue-2026-R3.pdf
AKAI|catalogues-source/AKAI-ACMA-M12T3R4,M18T3R4.pdf
Black+Decker|catalogues-source/B+D_Heaters_Product_Details (002).pdf
LIST
