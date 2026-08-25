#!/usr/bin/env python3
"""Pull every Wikidata item carrying a P3177 (Patrimonio Web JCyL ID) -
i.e. everything already linked to CyL's heritage catalog - plus whether
each one has a P18 (main image) and, if so, its ready-made Special:FilePath
URL. The image flag feeds the coverage-history snapshot in
build_dataset.py: linkage alone doesn't tell the whole story, an item can
be "linked" and still have no photo. The URL itself feeds thumbnails in
list views (nearby/search) - fetched here, once, in the same bulk query,
rather than one Commons request per monument. Writes raw results to
data/raw/ - regenerate anytime.
"""
import json
import os
import urllib.parse
import urllib.request

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
USER_AGENT = "cylinked/0.1 (https://github.com/tholbach/cylinked)"

QUERY = """
SELECT ?item ?jcylID ?image (BOUND(?image) AS ?hasImage) WHERE {
  ?item wdt:P3177 ?jcylID .
  OPTIONAL { ?item wdt:P18 ?image }
}
"""


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": QUERY})
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/sparql-results+json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)

    rows = data["results"]["bindings"]
    print(f"{len(rows)} Wikidata items with P3177 set")
    json.dump(data, open(os.path.join(RAW_DIR, "wikidata_p3177.json"), "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()
