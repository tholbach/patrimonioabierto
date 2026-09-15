#!/usr/bin/env bash
# Runs on the server (via the systemd timer in this same directory, see
# daily-refresh.service/.timer) - NOT part of any local dev workflow.
# `make fetch && make build` regenerate web/data/*.json from JCyL/Wikidata;
# Caddy serves that directory as a bind mount, so the live site picks up
# the change the moment this script writes the files - no container
# restart, no `docker compose up -d`, nothing else needed for the site
# itself to be current.
#
# What this script adds on top of a plain `make fetch build`: commits and
# pushes web/data/*.json back to GitHub too, matching the "Refresh data"
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

if git diff --quiet -- web/data/ && git diff --cached --quiet -- web/data/; then
  echo "[$(date -Is)] no changes to web/data/ - nothing to commit"
  exit 0
fi

git add web/data/
git commit -m "Refresh data

Automated daily refresh (scripts/daily_refresh.sh via systemd timer)."
git push

echo "[$(date -Is)] pushed data refresh"
