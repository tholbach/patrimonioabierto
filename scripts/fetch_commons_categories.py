"""One-off research script: fetches the Commons category (P373) for every
already-linked cylinked monument, batched via SPARQL VALUES (same pattern as
the earlier P808 crosswalk lookup).

Feeds find_good_pictures.py, which cross-references these categories against
Commons' three "good pictures" tiers (Featured/Quality/Valued) for the
weekly-gallery feature idea.

Run: python3 scripts/fetch_commons_categories.py
Writes: data/raw/monument_commons_categories.json  ({qid: "Category name"})
"""
import json
import time
import urllib.parse
import urllib.request

SPARQL_URL = "https://query.wikidata.org/sparql"
UA = "cylinked-research/1.0 (https://github.com/tholbach/cylinked; thomas@holba.ch)"
BATCH = 150


def run_query(qids, retries=4):
    values = " ".join(f"wd:{q}" for q in qids)
    query = f"""
    SELECT ?item ?cat WHERE {{
      VALUES ?item {{ {values} }}
      ?item wdt:P373 ?cat .
    }}
    """
    url = SPARQL_URL + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if attempt == retries - 1:
                raise
            print(f"  ({e}, retrying in {2 ** attempt}s)")
            time.sleep(2 ** attempt)


def main():
    with open("web/data/cyl_monuments_wikidata.json", encoding="utf-8") as f:
        records = json.load(f)
    qids = set()
    for r in records:
        if not r.get("already_linked") or not r.get("wikidata_qid"):
            continue
        v = r["wikidata_qid"]
        qids.update(v if isinstance(v, list) else [v])
    qids = sorted(qids)
    print(f"{len(qids)} unique QIDs to look up")

    result = {}
    for i in range(0, len(qids), BATCH):
        batch = qids[i : i + BATCH]
        data = run_query(batch)
        for row in data["results"]["bindings"]:
            qid = row["item"]["value"].rsplit("/", 1)[-1]
            result[qid] = row["cat"]["value"]
        print(f"[{i}-{i+len(batch)}] {len(result)} with a commons category so far")
        time.sleep(1)

    with open("data/raw/monument_commons_categories.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"TOTAL: {len(result)}/{len(qids)} have a Commons category (P373)")
    print("wrote data/raw/monument_commons_categories.json")


if __name__ == "__main__":
    main()
