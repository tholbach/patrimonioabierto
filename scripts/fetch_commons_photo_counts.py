#!/usr/bin/env python3
"""How many actual photos does linking a monument to Wikidata make
browsable? Not just "1" (the P18 main image) - most linked items also
carry a P373 (Commons category), and Patrimonio Abierto's own gallery walks that
whole category. This pulls the real count, the same way a human clicking
through would see it: for every P3177-tagged item's Commons category, ask
Commons directly how many files are in it (categoryinfo, not a manual
listing - Commons already tracks the count), one level of subcategories
deep (a lot of these categories are near-empty at the top with the actual
photos filed under "Interior of X"/"X in winter"/... subcategories - see
the same reasoning in app.js's own fetchGalleryFiles()).

Deliberately still just depth 1, not the full recursive walk the live
gallery does per-monument on demand: at ~1200 categories this is already
several hundred requests (~500 - see the module's own run for the exact
count), and a build-time script pulling stats for *everything* isn't the
same trade-off as one visitor's browser fetching *one* monument's gallery.
build_dataset.py's own total, further down, is labelled a floor for
exactly this reason - the real count only grows from here.

NOT part of `make fetch`/`make build` on purpose - a few hundred requests
is a real, deliberate cost, not something to re-pay on every routine data
refresh. Run by hand (`make photo-stats`) whenever you want the Stats
page's photo count refreshed; build_dataset.py picks up whatever this last
wrote and is happy to run without it ever having been run at all.

Writes raw results to data/raw/ - regenerate anytime.
"""
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
USER_AGENT = "patrimonioabierto/0.1 (https://github.com/tholbach/patrimonioabierto)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

SPARQL_QUERY = """
SELECT ?item ?commonscat WHERE {
  ?item wdt:P3177 ?jcylID .
  OPTIONAL { ?item wdt:P373 ?commonscat }
}
"""


def sparql(query):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/sparql-results+json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)["results"]["bindings"]


def commons_api(params):
    url = COMMONS_API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


# categoryinfo gives an exact files/subcats count for a category in one
# call, no need to actually list/paginate its members just to count them -
# batchable up to 50 titles per request, which is what makes checking
# ~1200 categories for this script feasible at all.
def fetch_categoryinfo(category_names):
    info = {}
    names = list(category_names)
    for i in range(0, len(names), 50):
        batch = names[i : i + 50]
        titles = "|".join("Category:" + n for n in batch)
        data = commons_api({"action": "query", "prop": "categoryinfo", "titles": titles})
        for page in data.get("query", {}).get("pages", {}).values():
            title = page["title"][len("Category:") :]
            categoryinfo = page.get("categoryinfo") or {}
            info[title] = {"files": categoryinfo.get("files", 0), "subcats": categoryinfo.get("subcats", 0)}
        time.sleep(0.1)
    return info


# Unlike categoryinfo, listing a category's *subcategories* isn't
# batchable across categories - one categorymembers call per category.
# cmlimit=500 covers every subcat list we're realistically going to see in
# one page, so no pagination handling needed.
def fetch_subcat_names(category_name):
    data = commons_api(
        {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": "Category:" + category_name,
            "cmtype": "subcat",
            "cmlimit": 500,
        }
    )
    members = data.get("query", {}).get("categorymembers", [])
    return [m["title"][len("Category:") :] for m in members]


def main():
    os.makedirs(RAW_DIR, exist_ok=True)

    rows = sparql(SPARQL_QUERY)
    # First category wins if an item somehow has more than one P3177-linked
    # QID pointing at different categories (a handful of conflict cases,
    # same as elsewhere) - "some browsable gallery" beats "none" for the
    # purposes of this count, and build_dataset.py already has its own
    # proper conflict handling for everything else.
    item_category = {}
    for row in rows:
        if "commonscat" not in row:
            continue
        qid = row["item"]["value"].rsplit("/", 1)[-1]
        item_category.setdefault(qid, row["commonscat"]["value"])
    print(f"{len(item_category)} linked items have a Commons category")

    top_categories = sorted(set(item_category.values()))
    print(f"fetching categoryinfo for {len(top_categories)} top-level categories...")
    top_info = fetch_categoryinfo(top_categories)

    categories_with_subcats = [c for c in top_categories if top_info.get(c, {}).get("subcats", 0) > 0]
    print(f"{len(categories_with_subcats)} of those have subcategories - listing them...")
    category_subcats = {}
    for i, cat in enumerate(categories_with_subcats):
        category_subcats[cat] = fetch_subcat_names(cat)
        if (i + 1) % 50 == 0:
            print(f"  ...{i + 1}/{len(categories_with_subcats)}")
        time.sleep(0.1)

    all_subcat_names = sorted({name for names in category_subcats.values() for name in names})
    print(f"fetching categoryinfo for {len(all_subcat_names)} subcategories...")
    subcat_info = fetch_categoryinfo(all_subcat_names)

    # One number per top-level category: its own files plus its direct
    # subcategories' files - build_dataset.py just sums these up for
    # whichever categories its linked records actually use, it doesn't
    # need the subcat breakdown itself.
    category_files = {}
    for cat in top_categories:
        total = top_info.get(cat, {}).get("files", 0)
        for subcat in category_subcats.get(cat, []):
            total += subcat_info.get(subcat, {}).get("files", 0)
        category_files[cat] = total

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "item_category": item_category,
        "category_files": category_files,
    }
    json.dump(out, open(os.path.join(RAW_DIR, "commons_photo_counts.json"), "w"), ensure_ascii=False)
    print(f"total files across all categories (depth 1): {sum(category_files.values())}")


if __name__ == "__main__":
    main()
