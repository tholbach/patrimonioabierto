"""One-off research script for the "weekly featured gallery" idea: finds
Commons files that are BOTH (a) within an already-linked monument's own Commons
category tree (per its Wikidata P373, see fetch_commons_categories.py) and
(b) recognised as a "good picture" - one of the three quality tiers that
https://commons.wikimedia.org/wiki/Commons:Good_pictures points to:
  - Category:Featured pictures on Wikimedia Commons
  - Category:Quality images
  - Category:Valued images by Wikimedia Commons

Search mechanics, worked out empirically (see conversation):
  - `incategory:"A" incategory:"B"` (space = AND) IS a reliable, exact
    intersection - verified against ground truth (a real Quality-Image
    file inside "Aqueduct of Segovia in 2010").
  - Writing `OR` between multiple incategory: filters does NOT work as a
    real boolean OR - CirrusSearch silently ANDs same-type filters
    regardless, so `incategory:"Quality images" OR incategory:"Featured
    pictures..."` quietly means their intersection, not their union.
    Wrapping in parentheses doesn't fix it either (that's simply
    unsupported and returns 0). So: never OR incategory: filters - run
    separate queries per tier and merge client-side instead.
  - `deepcat:"X"` (recursive subcategory search) turns out to be
    trustworthy: an initial "false positive" (a file only reachable via a
    seemingly-unrelated category) turned out to be real - Commons' own
    category graph really does nest that category under the monument's,
    just topically loosely. deepcat correctly reflects that graph; it's
    Commons' curation that's loose, not the search feature. Since this
    project already treats every fuzzy match as a suggestion for human
    review (never an auto-decision), that looseness is fine here too.

Run: python3 scripts/find_good_pictures.py
Needs: data/raw/monument_commons_categories.json (fetch_commons_categories.py)
Writes: data/raw/good_pictures_candidates.json, incrementally (safe to
        interrupt/resume - already-processed QIDs are skipped on rerun).
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

API_URL = "https://commons.wikimedia.org/w/api.php"
UA = "patrimonioabierto-research/1.0 (https://github.com/tholbach/patrimonioabierto; thomas@holba.ch)"

GOOD_PICTURE_TIERS = [
    "Featured pictures on Wikimedia Commons",
    "Quality images",
    "Valued images by Wikimedia Commons",
]

CATEGORIES_FILE = "data/raw/monument_commons_categories.json"
DATASET_FILE = "web/data/cyl_monuments_wikidata.json"
OUT_FILE = "data/raw/good_pictures_candidates.json"


def api_get(params, retries=4):
    params = {**params, "format": "json"}
    url = API_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def strip_prefix(title):
    return title.split(":", 1)[1] if ":" in title else title


def search_tier(root_category, tier):
    srsearch = f'deepcat:"{root_category}" incategory:"{tier}"'
    data = api_get({
        "action": "query", "list": "search", "srsearch": srsearch,
        "srlimit": 50, "srnamespace": 6,
    })
    return [strip_prefix(h["title"]) for h in data.get("query", {}).get("search", [])]


def load_progress():
    if not os.path.exists(OUT_FILE):
        return []
    with open(OUT_FILE, encoding="utf-8") as f:
        return json.load(f)


def main():
    with open(CATEGORIES_FILE, encoding="utf-8") as f:
        qid_to_cat = json.load(f)
    with open(DATASET_FILE, encoding="utf-8") as f:
        records = json.load(f)

    # qid -> (jcyl_id, name) - first match wins for the rare multi-qid conflict rows
    qid_to_monument = {}
    for r in records:
        v = r.get("wikidata_qid")
        if not v:
            continue
        for qid in (v if isinstance(v, list) else [v]):
            qid_to_monument.setdefault(qid, {"jcyl_id": r["jcyl_id"], "name": r["name"]})

    results = load_progress()
    done_qids = {row["wikidata_qid"] for row in results}
    todo = [(qid, cat) for qid, cat in qid_to_cat.items() if qid not in done_qids]
    print(f"{len(todo)}/{len(qid_to_cat)} monuments left to check ({len(done_qids)} already done)")

    for i, (qid, root_cat) in enumerate(todo):
        monument = qid_to_monument.get(qid, {})
        found_any = False
        try:
            files_seen = {}  # filename -> set of tiers
            for tier in GOOD_PICTURE_TIERS:
                for filename in search_tier(root_cat, tier):
                    files_seen.setdefault(filename, set()).add(tier)
                time.sleep(0.25)
            for filename, tiers in files_seen.items():
                results.append({
                    "jcyl_id": monument.get("jcyl_id"),
                    "name": monument.get("name"),
                    "wikidata_qid": qid,
                    "commons_category": root_cat,
                    "file": filename,
                    "tiers": sorted(tiers),
                })
                found_any = True
        except Exception as e:
            print(f"  ! {qid} ({root_cat}): {e}")
        done_qids.add(qid)
        if not found_any:
            # sentinel row so a rerun skips this qid instead of re-querying it
            results.append({"wikidata_qid": qid, "_no_hits": True})

        if (i + 1) % 25 == 0 or i == len(todo) - 1:
            with open(OUT_FILE, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            found = sum(1 for r in results if not r.get("_no_hits"))
            print(f"[{i+1}/{len(todo)}] {found} candidate images found so far")

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    found = sum(1 for r in results if not r.get("_no_hits"))
    monuments_with_hits = len({r["wikidata_qid"] for r in results if not r.get("_no_hits")})
    print(f"DONE: {found} candidate images across {monuments_with_hits} monuments")


if __name__ == "__main__":
    main()
