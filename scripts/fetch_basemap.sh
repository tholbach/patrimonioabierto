#!/usr/bin/env bash
# Build the self-hosted basemap: one PMTiles file covering Castilla y León,
# extracted from Protomaps' daily OpenStreetMap planet build.
#
# Run via `make basemap`. Takes a few minutes and downloads a few hundred
# MB; the result is web/tiles/cyl.pmtiles, which is gitignored and reaches
# the server by running this there, not by a pull.
#
# Not part of fetch/build on purpose: the basemap is a different kind of
# data from the catalogue. It changes on OpenStreetMap's schedule, not
# JCyL's, and nobody notices a road that appeared last week. Quarterly is
# plenty.
set -euo pipefail

# Castilla y León's own bounding box, from the municipal boundaries in
# data/raw/municipios.json, plus ~0.2° of margin so the region does not end
# at a hard edge mid-screen. Tiles are square, so the neighbours come along
# anyway - this only makes that deliberate.
BBOX="-7.28,39.88,-1.58,43.44"
# Must equal maxDataZoom in app.js's map setup - ask the renderer for a
# level this archive does not hold and it draws nothing, which looks like a
# broken map precisely when someone zooms in to find the building they are
# standing next to. Above this level the renderer overzooms the last real
# one, and vector tiles stay sharp doing it.
#
# 14 costs 350MB and keeps every street and street name; 15 is the planet
# build's own ceiling, costs 803MB, and adds individual building outlines.
# Nothing beyond 15 exists at the source, whatever is spent on it.
MAXZOOM=14
PMTILES_VERSION="1.31.2"

cd "$(dirname "$0")/.."
BIN_DIR="scripts/bin"
OUT="web/tiles/cyl.pmtiles"
mkdir -p "$BIN_DIR" "$(dirname "$OUT")"

if [ ! -x "$BIN_DIR/pmtiles" ]; then
  echo "[basemap] fetching the pmtiles CLI $PMTILES_VERSION..."
  curl -sL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
    | tar xz -C "$BIN_DIR" pmtiles
fi

# The daily builds live at a dated URL and there is no "latest" alias, so
# walk backwards until one answers. A range request for a single byte is
# enough to tell - no point downloading a planet to find out it is missing.
BUILD=""
for i in $(seq 0 14); do
  d=$(date -u -d "-$i day" +%Y%m%d)
  if [ "$(curl -s -o /dev/null -w '%{http_code}' -r 0-0 "https://build.protomaps.com/$d.pmtiles")" = "206" ]; then
    BUILD="$d"; break
  fi
done
[ -n "$BUILD" ] || { echo "[basemap] ERROR: no planet build found in the last 14 days" >&2; exit 1; }
echo "[basemap] using planet build $BUILD"

# Extract to a temp file and move it into place only on success. The
# extract pulls hundreds of MB over range requests and a dropped
# connection mid-way would otherwise leave a truncated basemap behind that
# renders as a half-blank map - the failure mode is silent, which is the
# worst kind. mv within the same directory is atomic.
TMP="$OUT.tmp"
trap 'rm -f "$TMP"' EXIT
"$BIN_DIR/pmtiles" extract "https://build.protomaps.com/$BUILD.pmtiles" "$TMP" \
  --bbox="$BBOX" --maxzoom="$MAXZOOM"
mv "$TMP" "$OUT"
trap - EXIT

echo "[basemap] wrote $OUT ($(du -h "$OUT" | cut -f1))"
"$BIN_DIR/pmtiles" show "$OUT" | head -6
