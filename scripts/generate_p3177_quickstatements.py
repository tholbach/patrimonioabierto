#!/usr/bin/env python3
"""Turns the "likely" rows of data/raw/possible_duplicate_wikidata_items.json
(see the conversation this came out of: JCyL monuments that already have a
Wikidata item, just cross-referenced via P808 - Spain's *national* BIC
registry code - instead of P3177, the regional JCyL one fetch_wikidata.py
itself queries for) into a QuickStatements v1 batch that adds the missing
P3177, with a reference back to the JCyL page itself for provenance.

Deliberately only the "likely_same" rows (name overlap or <=10m) - the
"needs review" ones aren't confirmed matches and have no business being
turned into an automatic edit; run those by eye first.

This does NOT write to Wikidata itself - it only generates the batch.
Paste the output into https://quickstatements.toolforge.org/ (logged in
as yourself) and run it there, after spot-checking a handful of rows -
"likely" is a heuristic, not a guarantee.

Run: python3 scripts/generate_p3177_quickstatements.py
Writes: data/raw/p3177_quickstatements.tsv
"""
import json
import os

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
IN_PATH = os.path.join(RAW_DIR, "possible_duplicate_wikidata_items.json")
OUT_PATH = os.path.join(RAW_DIR, "p3177_quickstatements.tsv")


def main():
    with open(IN_PATH, encoding="utf-8") as f:
        matches = json.load(f)

    lines = []
    for m in matches:
        top = m["candidates"][0]
        if not top["likely_same"]:
            continue
        # QuickStatements v1: QID <tab> property <tab> value [<tab> reference-prop <tab> reference-value]
        # P3177 is a plain string (verified against a real linked item,
        # e.g. Q1032560's P3177 = "5", not "05" or a URL) - not the JCyL
        # numeric id's own type, so it needs the quotes.
        # S854 (reference URL) points straight at the JCyL page used to
        # make the match, so the edit's provenance is checkable later.
        lines.append(
            f'{top["qid"]}\tP3177\t"{m["jcyl_id"]}"\tS854\t"{m["reference_url"]}"'
        )

    os.makedirs(RAW_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"{len(lines)} statements written to {OUT_PATH}")
    print("Paste into https://quickstatements.toolforge.org/ (logged in) after spot-checking a few rows.")


if __name__ == "__main__":
    main()
