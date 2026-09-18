#!/usr/bin/env python3
"""Pull every Wikidata item carrying a P3177 (Patrimonio Web JCyL ID) -
i.e. everything already linked to CyL's heritage catalog - plus whether
each one has a P18 (main image), which Wikipedia editions it has a
sitelink to, and if it has an image, its ready-made Special:FilePath
URL. The edition languages matter because "has an article" is not one
question: a reader on the Spanish site wants to know whether there is a
Spanish article, and an item with only a Latvian one is a gap for them,
not a success. Both flags feed the coverage-history snapshot in build_dataset.py and
the map's own status filter/Contribute page links: linkage alone doesn't
tell the whole story, an item can be "linked" and still have no photo, or
no Wikipedia article. The image URL itself feeds thumbnails in list views
(nearby/search) - fetched here, once, in the same bulk query, rather than
one Commons request per monument. Writes raw results to data/raw/ -
regenerate anytime.

Selecting ?lang costs nothing extra: the sitelink join already produced
one row per edition, that language was simply not being projected.

The image and sitelink OPTIONALs are two independent joins on ?item, so an
item with e.g. 2 photos and 3 Wikipedia-language articles produces 2*3=6
rows for that one item - inflates the row count some, but build_dataset.py
already had to dedupe/OR-aggregate multi-row items for P18 alone (a
photogenic item can have several), and does the exact same thing here.
"""
import json
import os
import urllib.parse
import urllib.request

from project import user_agent

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
USER_AGENT = user_agent("patrimonioabierto", "0.1")

# schema:/wikibase: aren't part of the query service's built-in prefixes the
# way wdt:/wd: are (confirmed by testing - omitting these left
# ?hasWikipediaArticle silently unbound on every row instead of erroring),
# so they need declaring explicitly here.
QUERY = """
PREFIX schema: <http://schema.org/>
PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT ?item ?jcylID ?image (BOUND(?image) AS ?hasImage) (BOUND(?article) AS ?hasWikipediaArticle) ?lang WHERE {
  ?item wdt:P3177 ?jcylID .
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf ?site ;
             schema:inLanguage ?lang .
    ?site wikibase:wikiGroup "wikipedia" .
  }
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
    distinct_items = {row["item"]["value"] for row in rows}
    # len(rows) alone is now a much less meaningful number than it used to
    # be - the sitelink OPTIONAL means one item can legitimately produce
    # several rows (see the module docstring) - so print both.
    print(f"{len(distinct_items)} Wikidata items with P3177 set ({len(rows)} raw rows)")
    json.dump(data, open(os.path.join(RAW_DIR, "wikidata_p3177.json"), "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()
