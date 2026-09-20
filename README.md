# Patrimonio Abierto

<img src="web/assets/logo-readme.png" alt="Patrimonio Abierto logo" width="120">

Links Castilla y León's open heritage data (Bienes de Interés Cultural) with
Wikidata, Wikimedia Commons, and Wikipedia - and shows the result on a map.

## The gap this project tracks

**2,479** officially protected monuments in Castilla y León. As of
2026-09-20, **2,247 (91%)** have a matching Wikidata item, **1,305 (53%)**
have a freely licensed photo, and **996 (40%)** have a Spanish Wikipedia
article.

Those figures move, so the site publishes them rather than this file:
[patrimonioabierto.es/stats/](https://patrimonioabierto.es/stats/) shows
the current numbers and a history chart, and
`web/data/cyl_monuments_wikidata.json` has the full per-monument
breakdown - including the 4 identifier conflicts (one JCyL ID claimed by
two different Wikidata items) still worth resolving by hand.

**Every category except one is now fully linked.** All 232 remaining
unlinked monuments are `ARTE RUPESTRE` (rock art, 347 entries, 33%
linked) - a category that is genuinely hard, since the sites are often
unnamed, unphotographed and known only by a cadastral reference. The
linking itself happens in Wikidata, not here: this project reads the
result and shows where the result is still missing.

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
propiedad de la fuente: 'Junta de Castilla y León'."* - free use, mandatory
attribution. Combined with Wikidata (CC0) and Commons (per-file, mostly
CC-BY-SA), everything here is fine to combine publicly as long as each
source is attributed distinctly rather than blended into one vague credit.

## Pipeline

```
make fetch           # scripts/fetch_jcyl.py + fetch_wikidata.py -> data/raw/*.json
make build           # scripts/build_dataset.py -> web/data/cyl_monuments_wikidata.json
make wiki-extracts    # scripts/fetch_wikipedia_extracts.py -> data/raw/wikipedia_extracts.json (optional, feeds monument-pages)
make monument-pages   # scripts/build_monument_pages.py -> web/monumento/*/index.html + sitemap.xml/robots.txt
```

`build_dataset.py` does three things beyond a straight merge:

1. **Centroid** of each monument's polygon footprint (`scripts/geometry.py`,
   pure-Python area-weighted shoelace formula - no shapely/pyproj/GDAL
   dependency; reprojection to WGS84 is done server-side by the WFS request
   itself via `srsName=EPSG:4326`, not reimplemented here).
2. **Spatial join** against municipality boundaries to derive which
   municipality each monument sits in (point-in-polygon, bbox-prefiltered;
   99.8% exact match rate, the rest fall back to nearest-municipality -
   tracked internally during the build as an approx-match count printed to
   the console, not carried into the output).
3. **Municipality code normalization**: the source layer's own `c_ine` field
   is an 11-digit extended code, but Wikidata's
   [`P772`](https://www.wikidata.org/wiki/Property:P772) ("INE code") uses
   the 5-digit `c_prov_mun` form - verified against a real item
   (`Q15699`/León, `P772 = "24089"`) before trusting it. Only the P772 form
   (`municipality_ine_code_p772`) makes it into the output; the raw 11-digit
   code is used internally for the join and then dropped, so there is no
   ambiguity about which form matches Wikidata.

Each output record also carries `already_linked` / `wikidata_qid` /
`wikidata_conflict` / `has_wikidata_image` (whether the linked item has a
`P18` main image - linked and "has a photo" are genuinely different things,
tracked separately). It intentionally does *not* carry
`name_raw` (JCyL's raw uppercase denomination - only `titlecase_es()`'s
cleaned-up `name` ships) or `category_code` (the numeric category, only its
`category` label) - neither is read anywhere in `web/app.js`, so both are
dropped at build time rather than shipped dead weight.

`make build` also appends today's coverage numbers (`total`/`linked`/
`with_image`) to `web/data/history.json` - one entry per calendar date,
re-running the same day updates that day's entry rather than duplicating.
This is what backs the in-app "Estadísticas" page: the point isn't just the
map, it's proving the linking work is real, ongoing progress rather than a
one-off snapshot for a submission deadline.

## The map (`web/`)

Plain Leaflet + vanilla JS, no build step. Loads
`web/data/cyl_monuments_wikidata.json` once in full (2,479 records is small
enough to load eagerly rather than paginate/tile) and plots every monument
as a marker, clustered via `leaflet.markercluster`. Markers are one colour;
whether a freely licensed photo exists is carried by the border - solid
when there is one, dashed when there is not - and clusters use the same
rule, so even zoomed out the map reads as "where the photo gaps are"
without running a second colour against the basemap's own. A filter button
toggles markers by category or by status, with a live count each. Clicking
a marker fetches Wikidata's
`Special:EntityData` for that item (sitelinks + the `P18` image claim), then
the Wikipedia REST summary and a Commons thumbnail via `Special:FilePath` -
live, per click, not baked into the static dataset. Unlinked monuments show
their JCyL reference instead, with a "not yet on Wikidata" note.

Basemap tiles come from OpenStreetMap directly - no key, no account, and
nothing that can be broken by a browser or proxy withholding a header. See
"The basemap" under Deployment for why that mattered.

```
make serve   # http://localhost:8000, for local development
```

## SEO: static per-monument pages (`web/monumento/`)

The live map is a pure client-side SPA - a monument's Wikipedia extract only
exists in the DOM after `app.js` fetches it at runtime, and every URL
(`?id=1`, `?id=2`, ...) served the exact same `<title>`/meta description/
`og:*` tags regardless. A crawler that doesn't wait out that fetch, or a
link-preview bot (WhatsApp/Twitter/Facebook - none of them run JS at all),
saw 2,479 identical, textless pages.

`scripts/build_monument_pages.py` fixes that by generating one real static
page per monument, `web/monumento/<jcyl_id>-<slug>/index.html` - not a
separate hand-maintained template, but `web/index.html`'s own shell with a
handful of literal, asserted find/replaces: a monument-specific `<title>`/
description/canonical/`og:*`/`twitter:*`/JSON-LD (`LandmarkOrHistoricalBuilding`)
in `<head>`, and `#panel-content` pre-filled with real markup (hero photo,
name, category/municipality/date, the Wikipedia extract if
`fetch_wikipedia_extracts.py` found one, JCyL/Wikidata/Wikipedia badges) -
close enough to `selectMonument()`'s own HTML shape in `app.js` that once JS
boots and re-fetches everything live, the swap is invisible. Any future edit
to `index.html`'s shell (new button, changed script src, ...) is picked up
here automatically on the next build; the asserts just mean a change that
actually breaks one of these substitutions fails the build loudly instead of
silently shipping a broken page.

URL shape is `/monumento/<jcyl_id>-<slug>/` - the numeric id is
load-bearing, the slug is not. The same shape is used while browsing, not
only by crawlers: `app.js` pushes it on every monument it opens, so a copied
address bar and a shared link are the same URL, and that URL has a real
static page behind it if JavaScript never runs. `app.js`'s bootstrap parses
the id back out of the path on load. A monument renamed between builds gets
a new slug next time with the old URL's id prefix still resolving correctly
- nothing needs a redirect map.

**Gotcha already solved, worth not repeating**: the first version used
`<base href="https://patrimonioabierto.es/">` to fix every relative
URL breaking two path segments down from site root (`style.css`, `app.js`,
`assets/*`, and `app.js`'s own `fetch('data/...')` calls all assume the
document lives at `/`). That's correct in production but silently sends
every one of those requests to the real live domain instead of wherever
you're actually testing from (confirmed: `make serve`/localhost included) -
a same-origin `fetch()` turns cross-origin and fails, and since
`loadingScreenFailed()` deliberately never hides the loading screen (see its
own comment in `app.js`), the whole page just hangs behind a spinner with no
visible error. Root-relative `<base href="/">` fixes the exact same problem
without ever leaving whatever origin the page is actually served from.

```
make wiki-extracts && make monument-pages
```

Re-run both after any `make build` that changes linked-item coverage, or
`monument-pages` alone after editing `index.html`'s own shell/copy - neither
is wired into `make build` automatically (the extract fetch alone is
several hundred Wikipedia API calls, not something to re-pay on every
routine data refresh, matching `photo-stats`'s own reasoning).

## Deployment

Runs as its own container (`docker-compose.yml`, Caddy serving `web/` as
static files on internal port 80) with no exposed host ports or TLS of its
own - it's meant to sit behind an existing reverse proxy that terminates
TLS and routes a domain to it, rather than owning that itself. Wiring up
that reverse-proxy side is intentionally external to this repo (a
`reverse_proxy patrimonioabierto_web:80` site block wherever your ingress
config lives, on a Docker network both containers share).

That network is called `ingress` by default. On a host where it does not
exist yet:

```sh
docker network create ingress   # then attach your reverse proxy to it too
docker compose up -d
```

On a host where the proxy already sits on some other network, point this
at that one instead of moving the proxy - put `INGRESS_NETWORK=<name>` in
a `.env` next to `docker-compose.yml` (gitignored, see `.env.example`).
Compose only ever looks the network up and never creates it, so a name
that does not exist fails the deploy outright rather than starting
anything.

The site is reachable once the reverse-proxy side above points at it. The
container was previously named `cylinked_web` (project rename) - if you
are updating an existing deployment rather than starting fresh, update the
external Caddyfile's `reverse_proxy` line to the new name in the same
step, or the site goes down until both sides match.

### The basemap

OpenStreetMap's own raster tiles, no key and no account. They replaced
CARTO's, which gate on the HTTP `Referer` and answer 403 without one -
anyone whose browser, extension or proxy strips that header saw a blank
map, and users in several countries reported exactly that. OSM's tiles need
neither key nor `Referer`, so that failure is gone. Their [tile usage
policy](https://operations.osmfoundation.org/policies/tiles/) covers normal
interactive viewing by people, which is what this is.

The cost is that they are busier than the muted basemap this site had, and
the markers work harder against coloured roads and landcover - which is why
every marker is now one teal with the photo state on the border rather than
two colours competing with the map's own.

A self-hosted vector basemap was built and measured before settling here:
Protomaps' archive of this region is 350MB, Caddy serves it over range
requests with no extra software, and it looks considerably quieter. It was
abandoned because `protomaps-leaflet` renders to canvas and Leaflet redraws
it after each zoom animation rather than during it, so the map judders on
every zoom, at every flavour. That library is in maintenance mode upstream;
rendering vector tiles smoothly means MapLibre GL, which means rewriting
the marker, cluster, highlight and geolocation layers Leaflet carries
today. Worth knowing before anyone spends an afternoon rediscovering it.

### Updating a running deployment

On the host, `make deploy`: `git pull --ff-only`, `docker compose up -d`,
then `docker compose restart web`.

Use it rather than pulling by hand. The restart is the part that is easy
to leave out and hard to notice missing: git replaces files via atomic
rename rather than editing them in place, and `Caddyfile` is bind-mounted
as a single file, so the running container stays attached to the old,
now-unlinked inode. `up -d` does not fix that by itself - it only
recreates a container when the compose *config* changed, and a
bind-mounted file's contents are not part of that. A change that only
touches `Caddyfile` would land on disk and be silently ignored by the
container actually serving the site.

Note that nothing here is pulled by the reverse proxy's own deploy, even
when both live on the same host: that side is a separate repo with a
separate checkout, and updating it does not update this.

## Not built yet

- Category → Wikidata `P31` (instance of) mapping table - deliberately not
  guessed here, needs a careful pass since some categories (`MONUMENTO`) are
  too generic for a 1:1 mapping.
