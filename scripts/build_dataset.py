#!/usr/bin/env python3
"""Combine the raw JCyL + Wikidata pulls (data/raw/, from fetch_jcyl.py and
fetch_wikidata.py) into the one dataset the map app actually loads:
data/cyl_monuments_wikidata.json - one flat record per official monument,
with its centroid, municipality, and Wikidata linkage status already
resolved.

Also the source dataset for OpenRefine reconciliation work - see README.
"""
import json
import os
from datetime import datetime, timedelta

from geometry import bbox_of_multipolygon, multipolygon_centroid, point_in_multipolygon

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
# Written straight into web/data/ - this is the actual static asset the
# frontend fetches, not a separate build artifact that needs copying over.
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "cyl_monuments_wikidata.json")

SMALL_WORDS = {"de", "del", "la", "las", "el", "los", "y", "a", "en"}


def titlecase_es(name):
    """Naive title-case, keeping short connector words lowercase (typical
    Spanish heritage-name style). Still needs a human pass for edge cases
    (roman numerals, "De" at the very start of a proper name, etc.) - this
    is a readability aid, not a source of truth for labels.
    """
    words = name.strip().lower().split()
    return " ".join(w if (w in SMALL_WORDS and i != 0) else w.capitalize() for i, w in enumerate(words))


def normalize_protection_date(iso_str):
    """f_bien_protec arrives as e.g. "1844-08-27T23:00:00Z" - a UTC
    timestamp for local midnight, so whenever the UTC hour is 22-23 the
    *local* calendar date is one day later. Approximate fix: bump the date
    by a day in that case. (Matches the date Wikidata's own P1435 qualifier
    already carries for e.g. León Cathedral - verified during development.)
    """
    if not iso_str:
        return None
    dt = datetime.strptime(iso_str, "%Y-%m-%dT%H:%M:%SZ")
    if dt.hour >= 22:
        dt += timedelta(days=1)
    return dt.strftime("%Y-%m-%d")


def index_municipios(munis_geojson):
    indexed = []
    for f in munis_geojson["features"]:
        if f["properties"]["n_tip_ent"] != "Municipio":
            continue  # skip "Terreno comunal" - not a real administrative municipality
        indexed.append(
            {
                "props": f["properties"],
                "coords": f["geometry"]["coordinates"],
                "bbox": bbox_of_multipolygon(f["geometry"]["coordinates"]),
            }
        )
    return indexed


def match_municipio(lon, lat, indexed_munis):
    candidates = [m for m in indexed_munis if m["bbox"][0] <= lon <= m["bbox"][2] and m["bbox"][1] <= lat <= m["bbox"][3]]
    hits = [m for m in candidates if point_in_multipolygon(lon, lat, m["coords"])]
    if hits:
        return hits[0]["props"], False
    # fallback: nearest bbox-candidate (or nearest overall if no bbox candidate) -
    # only hit for points right on a boundary edge or footprint/admin-boundary
    # precision mismatches. Flagged via the second return value.
    pool = candidates or indexed_munis

    def dist(m):
        bx = (m["bbox"][0] + m["bbox"][2]) / 2
        by = (m["bbox"][1] + m["bbox"][3]) / 2
        return (bx - lon) ** 2 + (by - lat) ** 2

    return min(pool, key=dist)["props"], True


def main():
    monuments = json.load(open(os.path.join(RAW_DIR, "monuments.json")))["features"]
    munis_geojson = json.load(open(os.path.join(RAW_DIR, "municipios.json")))
    wd_raw = json.load(open(os.path.join(RAW_DIR, "wikidata_p3177.json")))["results"]["bindings"]

    indexed_munis = index_municipios(munis_geojson)
    print(f"indexed {len(indexed_munis)} municipios")

    wd_by_jcyl = {}
    for row in wd_raw:
        jcyl_id = row["jcylID"]["value"].strip()
        qid = row["item"]["value"].rsplit("/", 1)[-1]
        wd_by_jcyl.setdefault(jcyl_id, []).append(qid)

    records = []
    approx_count = 0
    for f in monuments:
        p = f["properties"]
        cid = str(p["c_bien_id"])
        lon, lat = multipolygon_centroid(f["geometry"]["coordinates"])
        muni_props, approx = match_municipio(lon, lat, indexed_munis)
        if approx:
            approx_count += 1
        wd_qids = wd_by_jcyl.get(cid, [])

        records.append(
            {
                "jcyl_id": p["c_bien_id"],
                "name": titlecase_es(p["d_bien_denom"]),
                "name_raw": p["d_bien_denom"],
                "category_code": p["c_categ_adquiere"],
                "category": p["d_categ_adquiere"],
                "protection_date": normalize_protection_date(p["f_bien_protec"]),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "municipality": muni_props["n_mun"],
                "municipality_ine_code_p772": muni_props["c_prov_mun"],  # matches Wikidata P772 format exactly, e.g. "24089"
                "municipality_ine_code_full": muni_props["c_ine"],  # source layer's own 11-digit code, NOT what P772 uses
                "municipality_match_approx": approx,
                "province": muni_props["n_prov"],
                "reference_url": p["l_url_pweb"],
                "wikidata_qid": wd_qids[0] if len(wd_qids) == 1 else (wd_qids if wd_qids else None),
                "already_linked": bool(wd_qids),
                "wikidata_conflict": len(wd_qids) > 1,
            }
        )

    records.sort(key=lambda r: r["jcyl_id"])
    json.dump(records, open(OUT_PATH, "w"), ensure_ascii=False, indent=2)

    linked = sum(r["already_linked"] for r in records)
    print(f"wrote {len(records)} records to {OUT_PATH}")
    print(f"already linked: {linked} ({linked / len(records):.0%})")
    print(f"missing from wikidata: {len(records) - linked}")
    print(f"wikidata id conflicts: {sum(r['wikidata_conflict'] for r in records)}")
    print(f"municipality approx-matched: {approx_count}")


if __name__ == "__main__":
    main()
