# CyLinked

Links Castilla y León's open heritage data (Bienes de Interés Cultural) with
Wikidata, Wikimedia Commons, and Wikipedia — and shows the result on a map.

## The gap this project tracks

As of the last `make build` run: **2,479** officially protected monuments in
Castilla y León, of which **989 (40%)** have a matching Wikidata item and
**1,490 (60%)** don't. See `web/data/cyl_monuments_wikidata.json` for the
full per-monument breakdown, including 4 identifier conflicts (one JCyL ID
claimed by two different Wikidata items) worth resolving by hand.

Coverage is wildly uneven by category — obvious categories like
`MONUMENTO` (cathedrals, churches, palaces) are ~78% linked, while entire
categories are essentially untouched: `HÓRREOS Y PALLOZAS` (traditional
granaries) and `ARTE RUPESTRE` (rock art) are both ~99-100% missing, and
`CASTILLOS` (434 castles) is 65% missing despite being probably the single
most visually compelling category for this project's map.

## Data sources

Three sources, each queried differently, deliberately kept separate rather
than blended into one call:

| Source | What it's for | How |
|---|---|---|
| [JCyL WFS](https://idecyl.jcyl.es/geoserver) (`patrimoniocultural` / `limites` workspaces) | Ground truth: which monuments exist, category, protection date, footprint geometry, municipality boundaries | HTTP GET, GeoJSON, no auth. `scripts/fetch_jcyl.py` |
| [Wikidata Query Service](https://query.wikidata.org/) | Which monuments already have a Wikidata item, via [`P3177`](https://www.wikidata.org/wiki/Property:P3177) ("Patrimonio Web JCyL ID") | SPARQL. `scripts/fetch_wikidata.py` |
| Wikipedia REST API + Commons `Special:FilePath` | Lead paragraph + photo for a monument, fetched live, per-item, only when its marker is clicked | `web/app.js`, at runtime in the browser |

JCyL's data license (from its own ISO 19139 metadata record): *"Sin validez
jurídica, carácter informativo. Uso libre y gratuito. Cita obligada a la
propiedad de la fuente: 'Junta de Castilla y León'."* — free use, mandatory
attribution. Combined with Wikidata (CC0) and Commons (per-file, mostly
CC-BY-SA), everything here is fine to combine publicly as long as each
source is attributed distinctly rather than blended into one vague credit.

## Pipeline

```
make fetch   # scripts/fetch_jcyl.py + fetch_wikidata.py -> data/raw/*.json
make build   # scripts/build_dataset.py -> web/data/cyl_monuments_wikidata.json
```

`build_dataset.py` does three things beyond a straight merge:

1. **Centroid** of each monument's polygon footprint (`scripts/geometry.py`,
   pure-Python area-weighted shoelace formula — no shapely/pyproj/GDAL
   dependency; reprojection to WGS84 is done server-side by the WFS request
   itself via `srsName=EPSG:4326`, not reimplemented here).
2. **Spatial join** against municipality boundaries to derive which
   municipality each monument sits in (point-in-polygon, bbox-prefiltered;
   99.8% exact match rate, the rest fall back to nearest-municipality with
   `municipality_match_approx: true` flagged for manual review).
3. **Municipality code normalization**: the source layer's own `c_ine` field
   is an 11-digit extended code, but Wikidata's
   [`P772`](https://www.wikidata.org/wiki/Property:P772) ("INE code") uses
   the 5-digit `c_prov_mun` form — verified against a real item
   (`Q15699`/León, `P772 = "24089"`) before trusting it. Both are kept in
   the output (`municipality_ine_code_p772` vs `_full`) so it's obvious
   which one to actually use for reconciliation.

Each output record also carries `already_linked` / `wikidata_qid` /
`wikidata_conflict` — this file doubles as the source dataset for OpenRefine
reconciliation work, not just map data.

## The map (`web/`)

Plain Leaflet + vanilla JS, no build step. Loads
`web/data/cyl_monuments_wikidata.json` once in full (2,479 records is small
enough to load eagerly rather than paginate/tile), plots every monument as a
marker colored by linkage status. Clicking a marker fetches Wikidata's
`Special:EntityData` for that item (sitelinks + the `P18` image claim), then
the Wikipedia REST summary and a Commons thumbnail via `Special:FilePath` —
live, per click, not baked into the static dataset. Unlinked monuments show
their JCyL reference instead, with a "not yet on Wikidata" note.

```
make serve   # http://localhost:8000, for local development
```

## Deployment

Runs as its own container (`docker-compose.yml`) with no exposed host ports
or its own TLS — it joins the ingress host's existing `ingress`
the same way the other services behind it already do (see
[the ingress proxy's own repository](the ingress proxy's own repository#cross-stack-caddy-routes)),
and relies on the shared Caddy there to terminate TLS and route a domain to
it. That means going live needs one manual addition to
`the ingress proxy's own Caddyfile` (deliberately not done from this repo —
review it there):

```
cylinked.holba.ch {
	reverse_proxy cylinked_web:80
}
```

On the host: `docker compose up -d` here starts the container; the
Caddyfile addition above (plus a Caddy restart on the the ingress host side)
makes it reachable.

## Not built yet

- Category → Wikidata `P31` (instance of) mapping table — deliberately not
  guessed here, needs a careful pass since some categories (`MONUMENTO`) are
  too generic for a 1:1 mapping.
- "Add a photo" contribution flow — planned to deep-link into Commons'
  UploadWizard (with a pre-filled category) rather than build a custom
  upload/storage system, matching how Wiki Loves Monuments itself works.
- Marker clustering (currently all 2,479 render individually — fine so far,
  worth revisiting if it gets sluggish at low zoom levels).
