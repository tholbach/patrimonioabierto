.DEFAULT_GOAL := help

.PHONY: help fetch build photo-stats wiki-extracts monument-pages potw basemap serve deploy up down logs

help:
	@echo "Available targets:"
	@echo "  fetch            Pull fresh JCyL + Wikidata raw data into data/raw/"
	@echo "  build            Rebuild web/data/cyl_monuments_wikidata.json from data/raw/"
	@echo "  photo-stats      Refresh the Stats page's photo count (~500 Commons API calls -"
	@echo "                   manual/occasional, NOT part of fetch/build - run 'build' after"
	@echo "                   this to pick it up)"
	@echo "  wiki-extracts    Fetch each linked monument's Wikipedia teaser extract into"
	@echo "                   data/raw/ (~1 request/article, resumable) - feeds monument-pages"
	@echo "  monument-pages   (Re)generate web/monumento/<id>-<slug>/index.html for every"
	@echo "                   monument + web/sitemap.xml + web/robots.txt - run after"
	@echo "                   build/wiki-extracts so both are picked up"
	@echo "  potw             Top up the picture-of-the-week pool (Commons search per"
	@echo "                   monument - long, resumable, manual/occasional like"
	@echo "                   photo-stats; writes web/data/ directly, no 'build' after)"
	@echo "  basemap          (Re)build the self-hosted map background into"
	@echo "                   web/tiles/ (~330MB, a few minutes - quarterly is plenty)"
	@echo "  serve            Serve web/ on :8000 via the real Caddy config (needs docker)"
	@echo "  deploy           On the host: pull, apply, and restart so a changed"
	@echo "                   Caddyfile actually takes effect"
	@echo "  up               Start the container (joins the ingress proxy's network)"
	@echo "  down             Stop the container"
	@echo "  logs             Tail container stdout/stderr"

fetch:
	@python3 scripts/fetch_jcyl.py
	@python3 scripts/fetch_wikidata.py

build:
	@cd scripts && python3 build_dataset.py

photo-stats:
	@python3 scripts/fetch_commons_photo_counts.py

wiki-extracts:
	@python3 scripts/fetch_wikipedia_extracts.py

monument-pages:
	@python3 scripts/build_monument_pages.py

# The map's own basemap, served from this site instead of a tile provider.
# See scripts/fetch_basemap.sh for why, and app.js's map setup for what it
# replaced. Gitignored output: it reaches the server by running this there.
basemap:
	@./scripts/fetch_basemap.sh

# The picture-of-the-week pool, all three stages. Manual and occasional like
# photo-stats, deliberately NOT part of fetch/build: the middle stage runs a
# Commons search per monument per quality tier, which is a long job and not
# one to re-pay on every routine data refresh.
#
# Safe to interrupt. fetch_commons_categories is a handful of batched SPARQL
# queries and simply rewrites its file; find_good_pictures writes a sentinel
# row for every monument it has checked, hit or not, so Ctrl-C costs only the
# monument in flight and a rerun covers just what is left plus whatever got
# linked to Wikidata since.
#
# Why you would run it: the pool IS the rotation. app.js picks
# pool[isoWeekNumber(today) % pool.length], so the number of entries is how
# many weeks pass before a monument comes round again. Run this when that
# starts feeling short.
potw:
	@python3 scripts/fetch_commons_categories.py
	@python3 scripts/find_good_pictures.py
	@python3 scripts/build_potw_seed.py

# The real Caddy with the real Caddyfile, not python -m http.server, so
# that what you see locally is what the server does. http.server serves
# files and nothing else, which quietly stopped being enough: it has no
# SPA fallback (/stats/, /about/, /privacy/ all 404 - broken locally ever
# since those got clean URLs) and no /go/ redirects (both contribution
# call-to-action buttons 404 instead of reaching Wikipedia/Commons).
# Neither failure exists in production, which is the worst kind: local
# development disagreeing with the deployed site about whether a link
# works at all.
#
# --rm and no log volume: Caddy creates /var/log/caddy inside the
# container itself, and it goes away with the container. Ctrl-C stops it -
# docker forwards the signal, so no -it is needed, and leaving it off is
# what lets this also run somewhere without a terminal attached (`docker
# run -it` fails outright there with "cannot attach stdin to a TTY-enabled
# container").
serve:
	@echo "http://localhost:8000/  (Ctrl-C to stop)"
	@docker run --rm -p 8000:80 \
		-v "$(CURDIR)/web:/srv:ro" \
		-v "$(CURDIR)/Caddyfile:/etc/caddy/Caddyfile:ro" \
		caddy:2

# The restart is not redundant. git replaces files via atomic rename rather
# than editing them in place, and Caddyfile is bind-mounted as a single
# file, so the running container stays attached to the old, now-unlinked
# inode. "up -d" does not fix that on its own: it only recreates a
# container when the compose *config* changed, and a bind-mounted file's
# contents are not part of that config. Without the restart, a
# Caddyfile-only change lands on disk and is silently ignored by the
# container serving the site - the worst kind of deploy, one that reports
# success and changes nothing.
#
# --ff-only: a deploy should fast-forward to exactly what was reviewed and
# stop if it can't, rather than invent a merge commit on the host.
deploy:
	@git pull --ff-only
	@docker compose up -d
	@docker compose restart web

up:
	@docker compose up -d

down:
	@docker compose down

logs:
	@docker compose logs -f
