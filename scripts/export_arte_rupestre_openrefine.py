#!/usr/bin/env python3
"""OpenRefine-ready export of every ARTE RUPESTRE entry, for reconciling/
creating the missing Wikidata items one JCyL id at a time - see the
conversation this came out of: after digging into whether these should
share items or get one each (no clean crosswalk to the national BIC
registry exists, see find_bic_clusters.py and the incoación/BOE date
comparison), the call was to just create one item per JCyL id, same as
already done for hórreos/rollos.

Same shape as the earlier one-off data/raw/openrefine_export.json (lat_lon
combined into one column, ready to reconcile against in OpenRefine or feed
into a "coordinate location" column), just filtered to this one category
instead of the whole catalog - only load what you're actually working on.

Includes the 4 already-linked entries too (not just the 343 missing ones)
so they're visible for context in OpenRefine rather than silently absent -
skip those rows rather than accidentally creating a duplicate item.

Run: python3 scripts/export_arte_rupestre_openrefine.py
Writes: data/raw/arte_rupestre_openrefine.csv (gitignored, like the rest of
data/raw/ - import this into OpenRefine directly).
"""
import csv
import json
import os

WEB_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "data")
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
IN_PATH = os.path.join(WEB_DATA_DIR, "cyl_monuments_wikidata.json")
OUT_PATH = os.path.join(RAW_DIR, "arte_rupestre_openrefine.csv")

CATEGORY = "ARTE RUPESTRE"

FIELDNAMES = [
    "jcyl_id",
    "name",
    "category",
    "protection_date",
    "lat_lon",
    "municipality",
    "municipality_ine_code_p772",
    "province",
    "reference_url",
    "wikidata_qid",
    "already_linked",
    "wikidata_conflict",
    "has_wikidata_image",
    "has_wikipedia_article",
    "image_url",
]


def main():
    with open(IN_PATH, encoding="utf-8") as f:
        records = json.load(f)

    rows = [r for r in records if r["category"] == CATEGORY]
    rows.sort(key=lambda r: (r["municipality"], r["name"]))

    os.makedirs(RAW_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for r in rows:
            qid = r["wikidata_qid"]
            writer.writerow(
                {
                    "jcyl_id": r["jcyl_id"],
                    "name": r["name"],
                    "category": r["category"],
                    "protection_date": r["protection_date"],
                    "lat_lon": f"{r['lat']},{r['lon']}",
                    "municipality": r["municipality"],
                    "municipality_ine_code_p772": r["municipality_ine_code_p772"],
                    "province": r["province"],
                    "reference_url": r["reference_url"],
                    "wikidata_qid": "|".join(qid) if isinstance(qid, list) else (qid or ""),
                    "already_linked": r["already_linked"],
                    "wikidata_conflict": r["wikidata_conflict"],
                    "has_wikidata_image": r["has_wikidata_image"],
                    "has_wikipedia_article": r.get("has_wikipedia_article", False),
                    "image_url": r["image_url"] or "",
                }
            )

    linked = sum(1 for r in rows if r["already_linked"])
    print(f"{len(rows)} {CATEGORY} entries written to {OUT_PATH} ({linked} already linked, {len(rows) - linked} to reconcile/create)")


if __name__ == "__main__":
    main()
