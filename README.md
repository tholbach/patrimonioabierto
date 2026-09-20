# Patrimonio Abierto

<img src="web/assets/logo-readme.png" alt="Patrimonio Abierto logo" width="120">

Castilla y León publishes an open catalogue of every officially protected
monument in the region - a name, a category, a protection date and a point
on a map, and nothing more. Patrimonio Abierto makes those monuments
approachable, bringing each one together with the best that free knowledge
and free media have to offer: the photographs on Wikimedia Commons, the
articles on Wikipedia, and the Wikidata record that ties them together.

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
nothing a browser or proxy can withhold to break them. Their [tile usage
policy](https://operations.osmfoundation.org/policies/tiles/) covers this
kind of use.

```
make serve   # http://localhost:8000, for local development
```

## A real page per monument (`web/monumento/`)

The map is a client-side app, so to a crawler or a link-preview bot - none
of which run JavaScript - all 2,479 URLs would otherwise look like the same
empty page. `make monument-pages` generates one real static page per monument
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

**The data is not ours to licence and is not covered by that.**
`web/data/*.json` is derived from three sources with their own terms:

| Source | Terms |
|---|---|
| JCyL BIC catalogue and municipal boundaries | *"Uso libre y gratuito. Cita obligada a la propiedad de la fuente: 'Junta de Castilla y León'."* |
| Wikidata | CC0 |
| Wikimedia Commons photos | per file, mostly CC BY-SA |

Credit them separately rather than as one blended line - that is what the
JCyL terms ask for and what the Commons licences require.
