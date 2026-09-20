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

## Pipeline

```
make fetch           # scripts/fetch_jcyl.py + fetch_wikidata.py -> data/raw/*.json
make build           # scripts/build_dataset.py -> web/data/cyl_monuments_wikidata.json
make wiki-extracts    # scripts/fetch_wikipedia_extracts.py -> data/raw/wikipedia_extracts.json (optional, feeds monument-pages)
make monument-pages   # scripts/build_monument_pages.py -> web/monumento/*/index.html + sitemap.xml/robots.txt
```

Beyond a straight merge, `build_dataset.py` computes each monument's
centre point from its polygon footprint, works out which municipality it
falls in, and appends the day's coverage numbers to `web/data/history.json`
- one entry per date, which is what the site's Estadísticas page charts.
The reasoning behind the fiddlier parts is in the code, next to the code.

## The map (`web/`)

Plain Leaflet and vanilla JavaScript, no build step and no framework. The
whole catalogue loads at once - 2,479 records is small - and every monument
is a marker, grouped into clusters as you zoom out.

Markers are all one colour. Whether a freely licensed photo exists is shown
by the border instead: solid if there is one, dashed if there is not, and
clusters follow the same rule. So even from across the region the map reads
as *where the gaps are*, without a second colour fighting the basemap.

Clicking a monument fetches its text and photos live from Wikidata,
Wikipedia and Commons - nothing is copied into this repository. Monuments
not yet on Wikidata show their JCyL record instead, with an invitation to
add one.

Basemap tiles come from OpenStreetMap directly - no key, no account, and
nothing that can be broken by a browser or proxy withholding a header. See
"The basemap" under Deployment for why that mattered.

```
make serve   # http://localhost:8000, for local development
```

## A real page per monument (`web/monumento/`)

The map is a client-side app, so for a crawler or a link-preview bot - none
of which run JavaScript - all 2,479 URLs used to look like the same empty
page. `make monument-pages` generates one real static page per monument
instead, at `/monumento/<jcyl_id>-<slug>/`, with its own title,
description, social preview and the Wikipedia extract already in the HTML.

That is also the URL you get while browsing, so a copied address bar, a
shared link and what a crawler sees are the same thing. The numeric id is
what resolves; the slug is decoration, so a renamed monument keeps working
without a redirect.

```
make wiki-extracts && make monument-pages
```

Re-run after a `make build` that changed coverage, or `monument-pages`
alone after editing the page shell. Neither is part of `make build`: the
extract fetch alone is several hundred Wikipedia requests, not something to
re-pay on every data refresh.

## Deployment

One container, Caddy serving `web/` as static files. It has no host ports
and no TLS of its own: it expects to sit behind a reverse proxy that
already terminates TLS for a domain. Pointing that proxy at
`patrimonioabierto_web:80` is the only wiring needed, and it stays outside
this repository.

The proxy and this container have to share a Docker network, called
`ingress` by default:

```sh
docker network create ingress   # attach your reverse proxy to it too
docker compose up -d
```

If your proxy already sits on a network with another name, set
`INGRESS_NETWORK` in a `.env` instead of moving it - see `.env.example`.

The site is reachable once the reverse-proxy side points at it.

### The basemap

OpenStreetMap's own tiles, no key and no account, within their [tile usage
policy](https://operations.osmfoundation.org/policies/tiles/). They
replaced CARTO's, which refuse to serve unless the browser sends a
`Referer` - so anyone whose browser or proxy strips that header saw a blank
map, and several did.

A self-hosted vector basemap was built, measured and rejected before
settling here; `web/app.js` says why, so nobody repeats the experiment.

### Updating a running deployment

On the host, `make deploy`: `git pull --ff-only`, `docker compose up -d`,
then `docker compose restart web`.

Use it rather than pulling by hand: the restart is easy to leave out and
hard to notice missing, and without it a changed `Caddyfile` lands on disk
and is silently ignored by the running container. The Makefile explains
why.

The reverse proxy is a separate repo with its own checkout - updating it
does not update this, and the other way round.

## Licence

**Code: [AGPL-3.0-or-later](LICENSE).** Copyright (C) 2026 Thomas Holbach.

Use it, change it, run it, build another region's version from it. The one
condition is that it stays open: if you distribute a modified version, or
run one as a website, the people using it must be able to get your source.
That is the point of the AGPL rather than a permissive licence here - a
project called *Patrimonio Abierto*, whose whole argument is that results
should flow back into the commons, would sit badly with a licence that lets
a derivative close itself off.

Section 13 is why the site links to this repository from its own "Acerca
de" page: anyone using the deployed site can reach the source from it.

**The data is not ours to licence, and is not covered by the above.**
`web/data/*.json` is derived from three sources, each with its own terms:

| Source | Terms |
|---|---|
| JCyL BIC catalogue and municipal boundaries | *"Uso libre y gratuito. Cita obligada a la propiedad de la fuente: 'Junta de Castilla y León'."* - free use, attribution to the Junta required |
| Wikidata | CC0 |
| Wikimedia Commons photos | per file, mostly CC BY-SA - each photo's author and licence are shown beside it |

Attribute each of them distinctly rather than folding them into one vague
credit; that is what the JCyL terms ask for and what the Commons licences
require.

## Not built yet

- Category → Wikidata `P31` (instance of) mapping table - deliberately not
  guessed here, needs a careful pass since some categories (`MONUMENTO`) are
  too generic for a 1:1 mapping.
