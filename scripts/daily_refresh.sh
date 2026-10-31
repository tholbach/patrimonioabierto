#!/usr/bin/env bash
# Runs on the server (via the systemd timer in this same directory, see
# daily-refresh.service/.timer) - NOT part of any local dev workflow.
# `make fetch && make build` regenerate web/data/*.json from JCyL/Wikidata;
# Caddy serves that directory as a bind mount, so the live site picks up
# the change the moment this script writes the files - no container
# restart, no `docker compose up -d`, nothing else needed for the site
# itself to be current.
#
# It also runs `make monument-pages`, so the static per-monument pages
# always match the current index.html shell (a stale page whose markup
# lacks an element app.js expects never finishes loading).
#
# What this script adds on top of a plain `make fetch build`: commits and
# pushes web/data/*.json and the generated pages back to GitHub too, matching the "Refresh data"
# commits already threaded through this repo's history by hand - so the
# repo's own history stays truthful about what's actually live, instead
# of silently drifting out of sync with what the server is serving.
#
# Deliberately NOT included here: `make photo-stats` (fetch_commons_
# photo_counts.py) - a few hundred Commons API calls, explicitly a manual/
# occasional job per its own docstring, not something to re-pay daily -
# and find_good_pictures.py/build_potw_seed.py (the picture-of-the-week
# pool) for the same reason.
#
# Needs: this checkout's git remote must have PUSH access (not just
# read/pull) - an SSH deploy key with write access, or a stored HTTPS
# credential, set up once on the server. `git push` below will just fail
# (loudly, in the systemd journal) if that's missing, not corrupt
# anything - safe to add push access after the fact and re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[$(date -Is)] make fetch"
make fetch

echo "[$(date -Is)] make build"
make build

# Incremental (skips jcyl_ids already in data/raw/wikipedia_extracts.json),
# so a normal day only fetches extracts for newly linked articles - a few
# requests, not the ~1000 a from-scratch run costs.
# Sundays: drop the cache first so existing extracts get re-fetched too
# (the script never updates an entry it already has). It writes
# incrementally, so if a run dies midway the next day resumes from there.
if [ "$(date +%u)" = "7" ]; then
  echo "[$(date -Is)] Sunday - discarding extract cache for a full refresh"
  rm -f data/raw/wikipedia_extracts.json
fi

echo "[$(date -Is)] make wiki-extracts"
make wiki-extracts

echo "[$(date -Is)] make monument-pages"
make monument-pages

# status --porcelain, not git diff: a monument added upstream creates a new
# (untracked) page directory, which git diff alone would never see.
PUBLISHED=(web/data/ web/monumento/ web/sitemap.xml web/robots.txt)
if [ -z "$(git status --porcelain -- "${PUBLISHED[@]}")" ]; then
  echo "[$(date -Is)] no changes to published files - nothing to commit"
  exit 0
fi

git add "${PUBLISHED[@]}"
git commit -m "Refresh data

Automated daily refresh (scripts/daily_refresh.sh via systemd timer)."
git push

echo "[$(date -Is)] pushed data refresh"
