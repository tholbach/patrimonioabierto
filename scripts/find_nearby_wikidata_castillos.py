#!/usr/bin/env python3
"""Reconciliation aid for the CASTILLOS OpenRefine pass: for every CASTILLOS
entry that's NOT linked yet, checks Wikidata for any item with coordinates
within 1km - not because that automatically IS the right item (a 1km
radius over open countryside can easily catch an unrelated village/river/
church too), but because the whole point of one-item-per-JCyL-id
reconciliation is not accidentally creating a duplicate of something that
already exists under a different name/without P3177 set yet. A human
reviews every row here before touching anything - this script doesn't
decide, doesn't write to Wikidata, doesn't even suggest which candidate
(if more than one) is the real match.

Uses WDQS's own `wikibase:around` geospatial service (one query per
castillo, not a single huge bounding-box pull over the whole region - a
1km-radius query is cheap and fast per point, whereas pulling every
geotagged item in Castilla y León up front to filter locally would be a
much bigger, slower query for the same result). Each candidate's P31
("instance of") labels are included specifically so an obviously-unrelated
nearby thing (a river, a village, a restaurant) is visible as noise at a
glance rather than looking like a real candidate.

A candidate that already carries a *different* jcyl_id via P3177 is
flagged as such (already_linked_to_jcyl_id column) - it's not a free match
for the castillo being checked, just a heads-up that something else
nearby is already accounted for.

Run: python3 scripts/find_nearby_wikidata_castillos.py
Writes: data/raw/castillos_nearby_wikidata.csv (gitignored, like the rest
of data/raw/) - one row per (castillo, candidate) pair, sorted by castillo
then distance. Castillos with zero candidates within 1km aren't written
at all (nothing to double-check there).
"""
import csv
import json
import os
import time
import urllib.parse
import urllib.request

WEB_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "data")
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
IN_PATH = os.path.join(WEB_DATA_DIR, "cyl_monuments_wikidata.json")
OUT_PATH = os.path.join(RAW_DIR, "castillos_nearby_wikidata.csv")

CATEGORY = "CASTILLOS"
RADIUS_KM = 1
USER_AGENT = "patrimonioabierto/0.1 (https://github.com/tholbach/patrimonioabierto)"
# Be a reasonable neighbor on WDQS's shared query service - ~200 sequential
# small queries is fine spaced out, not fine fired back to back.
DELAY_BETWEEN_QUERIES_S = 0.3

QUERY_TEMPLATE = """
SELECT ?item ?itemLabel ?dist ?p31Label ?jcylId WHERE {{
  SERVICE wikibase:around {{
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point({lon} {lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "{radius_km}" .
    bd:serviceParam wikibase:distance ?dist .
  }}
  OPTIONAL {{ ?item wdt:P31 ?p31 . }}
  OPTIONAL {{ ?item wdt:P3177 ?jcylId . }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "es,en". }}
}}
ORDER BY ?dist
"""

FIELDNAMES = [
    "jcyl_id",
    "name",
    "municipality",
    "province",
    "lat_lon",
    "reference_url",
    "candidate_qid",
    "candidate_label",
    "candidate_distance_m",
    "candidate_types",
    "candidate_already_linked_to_jcyl_id",
    "candidate_wikidata_url",
]


def query_nearby(lat, lon):
    query = QUERY_TEMPLATE.format(lon=lon, lat=lat, radius_km=RADIUS_KM)
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(
        url, headers={"Accept": "application/sparql-results+json", "User-Agent": USER_AGENT}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)

    # Aggregate: the OPTIONAL P31 join produces one row per (item, P31)
    # pair - an item with 3 "instance of" values shows up 3 times with
    # otherwise-identical dist/label, so fold those back into one
    # candidate with a pipe-joined type list instead of one confusing row
    # per type.
    candidates = {}
    for row in data["results"]["bindings"]:
        qid = row["item"]["value"].rsplit("/", 1)[-1]
        c = candidates.setdefault(
            qid,
            {
                "qid": qid,
                "label": row.get("itemLabel", {}).get("value", qid),
                "dist_km": float(row["dist"]["value"]),
                "types": [],
                "jcyl_ids": [],
            },
        )
        p31 = row.get("p31Label", {}).get("value")
        if p31 and p31 not in c["types"]:
            c["types"].append(p31)
        jcyl = row.get("jcylId", {}).get("value")
        if jcyl and jcyl not in c["jcyl_ids"]:
            c["jcyl_ids"].append(jcyl)

    return sorted(candidates.values(), key=lambda c: c["dist_km"])


def main():
    with open(IN_PATH, encoding="utf-8") as f:
        records = json.load(f)

    unlinked = [r for r in records if r["category"] == CATEGORY and not r["already_linked"]]
    unlinked.sort(key=lambda r: (r["municipality"], r["name"]))

    rows = []
    checked_with_candidates = 0
    for i, r in enumerate(unlinked, 1):
        print(f"[{i}/{len(unlinked)}] {r['name']} ({r['municipality']})...", end=" ", flush=True)
        try:
            candidates = query_nearby(r["lat"], r["lon"])
        except Exception as e:
            print(f"FAILED: {e}")
            continue
        print(f"{len(candidates)} candidate(s)")
        if candidates:
            checked_with_candidates += 1
        for c in candidates:
            rows.append(
                {
                    "jcyl_id": r["jcyl_id"],
                    "name": r["name"],
                    "municipality": r["municipality"],
                    "province": r["province"],
                    "lat_lon": f"{r['lat']},{r['lon']}",
                    "reference_url": r["reference_url"],
                    "candidate_qid": c["qid"],
                    "candidate_label": c["label"],
                    "candidate_distance_m": round(c["dist_km"] * 1000),
                    "candidate_types": " | ".join(c["types"]),
                    "candidate_already_linked_to_jcyl_id": " | ".join(c["jcyl_ids"]),
                    "candidate_wikidata_url": f"https://www.wikidata.org/wiki/{c['qid']}",
                }
            )
        time.sleep(DELAY_BETWEEN_QUERIES_S)

    os.makedirs(RAW_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print()
    print(
        f"{len(unlinked)} unlinked {CATEGORY} checked, {checked_with_candidates} had at least one "
        f"Wikidata item within {RADIUS_KM}km, {len(rows)} candidate rows written to {OUT_PATH}"
    )
    print("Review by hand - a nearby item is not automatically the right item (see candidate_types).")


if __name__ == "__main__":
    main()
