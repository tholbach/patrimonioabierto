.DEFAULT_GOAL := help

.PHONY: help fetch build photo-stats serve up down logs

help:
	@echo "Available targets:"
	@echo "  fetch        Pull fresh JCyL + Wikidata raw data into data/raw/"
	@echo "  build        Rebuild web/data/cyl_monuments_wikidata.json from data/raw/"
	@echo "  photo-stats  Refresh the Stats page's photo count (~500 Commons API calls -"
	@echo "               manual/occasional, NOT part of fetch/build - run 'build' after"
	@echo "               this to pick it up)"
	@echo "  serve        Serve web/ locally on :8000 for development"
	@echo "  up           Start the container (joins the ingress host's ingress)"
	@echo "  down         Stop the container"
	@echo "  logs         Tail container stdout/stderr"

fetch:
	@python3 scripts/fetch_jcyl.py
	@python3 scripts/fetch_wikidata.py

build:
	@cd scripts && python3 build_dataset.py

photo-stats:
	@python3 scripts/fetch_commons_photo_counts.py

serve:
	@cd web && python3 -m http.server 8000

up:
	@docker compose up -d

down:
	@docker compose down

logs:
	@docker compose logs -f
