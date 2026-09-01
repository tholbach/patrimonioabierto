"""Turns data/raw/good_pictures_candidates.json (find_good_pictures.py) into
the small, committed pool the "picture of the week" feature actually reads:
web/data/picture_of_the_week.json.

Two things this trims down, on top of just extracting the fields the
frontend needs:
  - Dedup to one photo per monument (a monument with many near-duplicate
    angles shouldn't crowd out variety in a weekly rotation).
  - Drops any monument flagged wikidata_conflict in the main dataset -
    confirmed by testing (see conversation) that clicking through to one
    lands on a page showing an unresolved-conflict warning and no working
    hero image instead of a clean showcase, which defeats the point of a
    "picture of the week" highlight.

Run: python3 scripts/build_potw_seed.py
Needs: data/raw/good_pictures_candidates.json (find_good_pictures.py)
Writes: web/data/picture_of_the_week.json
"""
import json

CANDIDATES_FILE = "data/raw/good_pictures_candidates.json"
DATASET_FILE = "web/data/cyl_monuments_wikidata.json"
OUT_FILE = "web/data/picture_of_the_week.json"


def main():
    with open(DATASET_FILE, encoding="utf-8") as f:
        records = json.load(f)
    conflict_jcyl_ids = {r["jcyl_id"] for r in records if r.get("wikidata_conflict")}

    with open(CANDIDATES_FILE, encoding="utf-8") as f:
        candidates = json.load(f)
    hits = [r for r in candidates if not r.get("_no_hits")]

    seen_qids = set()
    out = []
    skipped = 0
    for r in hits:
        if r["jcyl_id"] in conflict_jcyl_ids:
            skipped += 1
            continue
        if r["wikidata_qid"] in seen_qids:
            continue
        seen_qids.add(r["wikidata_qid"])
        out.append({
            "jcyl_id": r["jcyl_id"],
            "wikidata_qid": r["wikidata_qid"],
            "file": r["file"],
            "tiers": r["tiers"],
        })

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"{len(out)} monuments in the pool, {skipped} candidate rows skipped (wikidata_conflict)")
    print(f"wrote {OUT_FILE}")


if __name__ == "__main__":
    main()
