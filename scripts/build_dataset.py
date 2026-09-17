#!/usr/bin/env python3
"""Combine the raw JCyL + Wikidata pulls (data/raw/, from fetch_jcyl.py and
fetch_wikidata.py) into the one dataset the map app actually loads:
data/cyl_monuments_wikidata.json - one flat record per official monument,
with its centroid, municipality, and Wikidata linkage status already
resolved.

Also the source dataset for the Wikidata reconciliation work - see README.
"""
import json
import os
from datetime import datetime, timedelta, timezone

from geometry import bbox_of_multipolygon, multipolygon_centroid, point_in_multipolygon

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
WEB_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "data")
# Written straight into web/data/ - these are the actual static assets the
# frontend fetches, not separate build artifacts that need copying over.
OUT_PATH = os.path.join(WEB_DATA_DIR, "cyl_monuments_wikidata.json")
MUNICIPALITIES_PATH = os.path.join(WEB_DATA_DIR, "municipalities.json")
PROVINCES_PATH = os.path.join(WEB_DATA_DIR, "provinces.json")
HISTORY_PATH = os.path.join(WEB_DATA_DIR, "history.json")
PHOTO_COUNTS_RAW_PATH = os.path.join(RAW_DIR, "commons_photo_counts.json")
PHOTO_STATS_PATH = os.path.join(WEB_DATA_DIR, "photo_stats.json")

SMALL_WORDS = {"de", "del", "la", "las", "el", "los", "y", "a", "en"}


# Only the languages the site itself offers get into the shipped dataset.
# Wikidata knows about 300+ editions and some monuments have dozens; every
# one of them would be bytes in a file each visitor downloads, to answer a
# question the UI cannot ask. The raw query result in data/raw/ keeps all
# of them, so widening this later is a rebuild, not a re-fetch.
SHIPPED_WIKIPEDIA_LANGS = ("es", "en")


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


def build_geo_indexes(indexed_munis, records):
    """Municipality/province search indexes - for the "fly to + show
    coverage stats" search feature, not the monument dataset itself. Kept
    lightweight (no polygon geometry shipped to the browser, just a
    centroid + bbox per place) since these load on every page view.
    """
    monuments_by_muni = {}
    for r in records:
        monuments_by_muni.setdefault(r["municipality_ine_code_p772"], []).append(r)

    municipalities = []
    for m in indexed_munis:
        props = m["props"]
        ine = props["c_prov_mun"]
        muni_monuments = monuments_by_muni.get(ine, [])
        lon, lat = multipolygon_centroid(m["coords"])
        municipalities.append(
            {
                "name": props["n_mun"],
                "province": props["n_prov"],
                "ine_code_p772": ine,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "bbox": [round(v, 6) for v in m["bbox"]],
                "monument_count": len(muni_monuments),
                "linked_count": sum(r["already_linked"] for r in muni_monuments),
            }
        )

    provinces_map = {}
    for m in municipalities:
        prov = provinces_map.setdefault(
            m["province"],
            {"name": m["province"], "bbox": None, "monument_count": 0, "linked_count": 0, "municipality_count": 0},
        )
        prov["monument_count"] += m["monument_count"]
        prov["linked_count"] += m["linked_count"]
        prov["municipality_count"] += 1
        if prov["bbox"] is None:
            prov["bbox"] = list(m["bbox"])
        else:
            prov["bbox"][0] = min(prov["bbox"][0], m["bbox"][0])
            prov["bbox"][1] = min(prov["bbox"][1], m["bbox"][1])
            prov["bbox"][2] = max(prov["bbox"][2], m["bbox"][2])
            prov["bbox"][3] = max(prov["bbox"][3], m["bbox"][3])

    provinces = []
    for prov in provinces_map.values():
        prov["lat"] = round((prov["bbox"][1] + prov["bbox"][3]) / 2, 6)
        prov["lon"] = round((prov["bbox"][0] + prov["bbox"][2]) / 2, 6)
        provinces.append(prov)

    municipalities.sort(key=lambda m: m["name"])
    provinces.sort(key=lambda p: p["name"])
    return municipalities, provinces


def append_history_snapshot(records):
    """Appends today's coverage numbers to history.json - the actual point
    of this isn't the map, it's proving the linking work is real, ongoing
    progress rather than a one-off snapshot. One entry per calendar date:
    re-running `make build` again today updates today's entry instead of
    piling up duplicates, so testing/rebuilding doesn't inflate the trend.
    """
    total = len(records)
    linked = sum(r["already_linked"] for r in records)
    with_image = sum(r["has_wikidata_image"] for r in records)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    history = []
    if os.path.exists(HISTORY_PATH):
        history = json.load(open(HISTORY_PATH))

    snapshot = {"date": today, "total": total, "linked": linked, "with_image": with_image}
    if history and history[-1]["date"] == today:
        history[-1] = snapshot
    else:
        history.append(snapshot)

    json.dump(history, open(HISTORY_PATH, "w"), indent=2)
    print(f"history.json: {len(history)} snapshot(s), latest: {snapshot}")


def write_photo_stats(records):
    """web/data/photo_stats.json - how many actual photos Patrimonio Abierto makes
    browsable, not just how many monuments have "a" photo. Entirely
    optional: fetch_commons_photo_counts.py is a separate, manually-run
    script (several hundred Commons API calls - not something to re-pay on
    every routine `make build`), so its raw output may be stale or simply
    not exist yet. Either is fine - this just skips writing the file
    rather than failing the whole build, and the Stats page already treats
    a missing photo_stats.json as "nothing to show here yet".
    """
    if not os.path.exists(PHOTO_COUNTS_RAW_PATH):
        print("photo_stats.json: skipped (no data/raw/commons_photo_counts.json - run `make photo-stats` first)")
        return

    photo_raw = json.load(open(PHOTO_COUNTS_RAW_PATH))
    item_category = photo_raw["item_category"]
    category_files = photo_raw["category_files"]

    used_categories = set()
    monuments_with_gallery = 0
    for record in records:
        qids = record["wikidata_qid"]
        qids = qids if isinstance(qids, list) else ([qids] if qids else [])
        category = next((item_category[q] for q in qids if q in item_category), None)
        if category:
            used_categories.add(category)
            monuments_with_gallery += 1

    stats = {
        "generated_at": photo_raw["generated_at"],
        "total_photos": sum(category_files.get(c, 0) for c in used_categories),
        "monuments_with_gallery": monuments_with_gallery,
    }
    json.dump(stats, open(PHOTO_STATS_PATH, "w"))
    print(f"photo_stats.json: {stats}")


def main():
    monuments = json.load(open(os.path.join(RAW_DIR, "monuments.json")))["features"]
    munis_geojson = json.load(open(os.path.join(RAW_DIR, "municipios.json")))
    wd_raw = json.load(open(os.path.join(RAW_DIR, "wikidata_p3177.json")))["results"]["bindings"]

    indexed_munis = index_municipios(munis_geojson)
    print(f"indexed {len(indexed_munis)} municipios")

    wd_by_jcyl = {}
    wd_has_image_by_jcyl = {}
    wd_image_url_by_jcyl = {}
    wd_has_wikipedia_by_jcyl = {}
    wd_wikipedia_langs_by_jcyl = {}
    for row in wd_raw:
        jcyl_id = row["jcylID"]["value"].strip()
        qid = row["item"]["value"].rsplit("/", 1)[-1]
        # An item with >1 P18 value (multiple photos), or a sitelink in
        # >1 Wikipedia language, produces >1 row for the same item+jcylID
        # via the OPTIONAL joins in fetch_wikidata.py - dedupe here, or a
        # photogenic, well-documented item falsely looks like several
        # different items conflicting over the same jcyl_id.
        if qid not in wd_by_jcyl.setdefault(jcyl_id, []):
            wd_by_jcyl[jcyl_id].append(qid)
        # True if ANY of (possibly several, in conflict cases) linked items
        # has a P18 - "linked" and "has a photo" are genuinely different
        # things worth tracking separately (see history.json below).
        has_image = row.get("hasImage", {}).get("value") == "true"
        wd_has_image_by_jcyl[jcyl_id] = wd_has_image_by_jcyl.get(jcyl_id, False) or has_image
        # Same OR-aggregation, for "has a sitelink to at least one Wikipedia
        # edition" - feeds the map's own "no_wikipedia" status filter and
        # the Contribute page's "see items lacking a Wikipedia article" link.
        has_wikipedia = row.get("hasWikipediaArticle", {}).get("value") == "true"
        wd_has_wikipedia_by_jcyl[jcyl_id] = wd_has_wikipedia_by_jcyl.get(jcyl_id, False) or has_wikipedia
        # Which editions, not just whether there are any. "Has an article"
        # reads as a success only if it is an article the reader can read:
        # for someone on the Spanish site, an item with nothing but a
        # Latvian article is a gap, and the Stats page says so.
        lang = row.get("lang", {}).get("value")
        if lang in SHIPPED_WIKIPEDIA_LANGS:
            wd_wikipedia_langs_by_jcyl.setdefault(jcyl_id, set()).add(lang)
        # First image URL wins if there are several - just needs to be *a*
        # representative thumbnail for list views, not necessarily the same
        # one the per-monument panel picks (that re-fetches the item's own
        # P18[0] directly, which can differ - a minor, acceptable mismatch
        # for the performance win of not doing that per list row).
        if row.get("image") and jcyl_id not in wd_image_url_by_jcyl:
            wd_image_url_by_jcyl[jcyl_id] = row["image"]["value"]

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
                "category": p["d_categ_adquiere"],
                "protection_date": normalize_protection_date(p["f_bien_protec"]),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "municipality": muni_props["n_mun"],
                "municipality_ine_code_p772": muni_props["c_prov_mun"],  # matches Wikidata P772 format exactly, e.g. "24089"
                "province": muni_props["n_prov"],
                "reference_url": p["l_url_pweb"],
                "wikidata_qid": wd_qids[0] if len(wd_qids) == 1 else (wd_qids if wd_qids else None),
                "already_linked": bool(wd_qids),
                "wikidata_conflict": len(wd_qids) > 1,
                "has_wikidata_image": wd_has_image_by_jcyl.get(cid, False),
                "has_wikipedia_article": wd_has_wikipedia_by_jcyl.get(cid, False),
                "wikipedia_langs": sorted(wd_wikipedia_langs_by_jcyl.get(cid, ())),
                "image_url": wd_image_url_by_jcyl.get(cid),  # ready-made Special:FilePath URL, or None
            }
        )

    records.sort(key=lambda r: r["jcyl_id"])
    json.dump(records, open(OUT_PATH, "w"), ensure_ascii=False, indent=2)

    write_photo_stats(records)

    municipalities, provinces = build_geo_indexes(indexed_munis, records)
    json.dump(municipalities, open(MUNICIPALITIES_PATH, "w"), ensure_ascii=False, indent=2)
    json.dump(provinces, open(PROVINCES_PATH, "w"), ensure_ascii=False, indent=2)
    print(f"wrote {len(municipalities)} municipalities, {len(provinces)} provinces")

    linked = sum(r["already_linked"] for r in records)
    with_image = sum(r["has_wikidata_image"] for r in records)

    meta_path = os.path.join(os.path.dirname(OUT_PATH), "meta.json")
    json.dump(
        {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},
        open(meta_path, "w"),
    )
    append_history_snapshot(records)

    print(f"wrote {len(records)} records to {OUT_PATH}")
    print(f"already linked: {linked} ({linked / len(records):.0%})")
    print(f"missing from wikidata: {len(records) - linked}")
    print(f"with a main image: {with_image} ({with_image / len(records):.0%})")
    print(f"wikidata id conflicts: {sum(r['wikidata_conflict'] for r in records)}")
    print(f"municipality approx-matched: {approx_count}")


if __name__ == "__main__":
    main()
