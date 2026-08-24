#!/usr/bin/env python3
"""Pull every Wikidata item carrying a P3177 (Patrimonio Web JCyL ID) -
i.e. everything already linked to CyL's heritage catalog. Writes raw
results to data/raw/ - regenerate anytime.
"""
import json
import os
import urllib.parse
import urllib.request

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
USER_AGENT = "cylinked/0.1 (https://github.com/tholbach/cylinked)"

QUERY = """
SELECT ?item ?jcylID WHERE {
  ?item wdt:P3177 ?jcylID .
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
