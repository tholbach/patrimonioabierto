#!/usr/bin/env python3
"""Structured groundwork for the "is this one physical site catalogued as
several JCyL entries, or genuinely several separate things?" question - see
the conversation this came out of (arte rupestre panels within one valley
vs. hórreos scattered across several villages, both sharing one blanket
protection decree, but only one of those is actually one site).

Groups every BIC by (category, municipality, stripped base name) and, for
any group with 2+ entries, computes the raw signals worth eyeballing before
deciding how to model it on Wikidata - it does NOT decide for you. Nothing
here writes to Wikidata or even picks a side; it's a spreadsheet to
sort/filter/review by hand, the same spirit as
generate_p3177_quickstatements.py's "spot-check a few rows first" - just
one step earlier, before any edit exists to make.

Grouping by municipality alone (an earlier version of this script) turned
out too coarse: real JCyL names for one archaeological complex often don't
even repeat the complex's own name (see e.g. "Las Batuecas" in La Alberca -
most of its 56 entries are actually named things like "Canchal de la
Pizarra I/II/III/IV/V", "Canchal del Zarzalón I-VI", "Lera I/II/III", never
mentioning "Batuecas" at all), so a whole-municipality prefix match missed
almost everything. Stripping each name's own trailing sequence marker
first (roman numeral, number, or a trailing ", la"/", el" article JCyL
files under the *following* word) and grouping by what's left catches
these correctly: "Canchal de la Pizarra I" and "...Pizarra 1" both reduce
to "canchal de la pizarra", regardless of which numbering convention (or
even both, if the catalog has both) was used.

Signals per group:
- n / n_linked / n_distinct_qids - how many entries, how many already
  linked, and among those, how many *different* Wikidata items they point
  at. n_distinct_qids == 1 with n_linked > 1 is a strong existing signal
  that someone already treated this cluster as one shared item.
- protection_dates / dominant_date_share - a single shared date across the
  whole group usually means one blanket decree, not independent
  per-entry declarations (see the 1949/1984/1985/1931/1963 decrees this
  project already knows about) - necessary but NOT sufficient on its own:
  hórreos share a blanket date too and are still genuinely separate
  buildings, which is exactly why this script groups by stripped base name
  now, not just municipality - a real proper name survives the strip,
  a positional index doesn't.
- spread_km - bounding-box diagonal across the group's coordinates. Rough
  and cheap (not a true max pairwise distance), fine for "is this confined
  to one rock face or scattered across an area too big to be one thing".

Run: python3 scripts/find_bic_clusters.py
Writes: data/raw/bic_clusters.csv (gitignored, like the rest of data/raw/ -
open it in a spreadsheet, sort by n/spread_km/whatever matters, and go
cluster by cluster). Groups that only have one member after stripping
(i.e. nothing else in the same municipality reduced to the same base) are
left out entirely - there's nothing to review there, it's already a single
JCyL entry with no clustering question at all.
"""
import csv
import json
import os
import re
from collections import Counter

WEB_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "data")
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
IN_PATH = os.path.join(WEB_DATA_DIR, "cyl_monuments_wikidata.json")
OUT_PATH = os.path.join(RAW_DIR, "bic_clusters.csv")

MIN_GROUP_SIZE = 2
# Roughly km per degree at this latitude (~42°N) - good enough for a rough
# "how far apart are these" signal, not real geodesy.
KM_PER_DEG_LAT = 111.0
KM_PER_DEG_LON = 85.0

# JCyL sometimes files names with the article moved to the end for
# alphabetical sorting ("Palla I, la" = "la Palla I") - strip that *before*
# the sequence-marker strip below, or "la" would just look like the tail of
# a different word instead of a separate leading article to also drop.
TRAILING_ARTICLE_RE = re.compile(r",\s*(la|el|los|las)\s*$", re.IGNORECASE)
# A trailing number, roman numeral, or a single letter (some entries use
# "A"/"B") - with or without a leading separator/underscore/dot - is a
# positional index, not part of a name.
TRAILING_SEQUENCE_RE = re.compile(r"[\s._-]*(\d+|[ivxlcdm]+|[a-z])\s*$", re.IGNORECASE)


def qids_of(record):
    q = record["wikidata_qid"]
    if q is None:
        return []
    return q if isinstance(q, list) else [q]


def strip_sequence_marker(name):
    base = TRAILING_ARTICLE_RE.sub("", name.strip())
    # Only strip a trailing single letter if there's more than just that
    # one letter left afterwards - otherwise a genuinely one-word name
    # ending in a consonant/vowel gets mangled into nonsense.
    stripped = TRAILING_SEQUENCE_RE.sub("", base).strip(" .,_-")
    return stripped.lower() if len(stripped) >= 3 else base.strip().lower()


def main():
    with open(IN_PATH, encoding="utf-8") as f:
        records = json.load(f)

    groups = {}
    for r in records:
        base = strip_sequence_marker(r["name"])
        groups.setdefault((r["category"], r["municipality"], base), []).append(r)

    rows = []
    for (category, municipality, base), members in groups.items():
        if len(members) < MIN_GROUP_SIZE:
            continue

        n = len(members)
        linked = [m for m in members if m["already_linked"]]
        distinct_qids = {q for m in linked for q in qids_of(m)}

        dates = Counter(m["protection_date"] for m in members)
        dominant_date, dominant_count = dates.most_common(1)[0]

        lats = [m["lat"] for m in members]
        lons = [m["lon"] for m in members]
        spread_km = round(
            max((max(lats) - min(lats)) * KM_PER_DEG_LAT, (max(lons) - min(lons)) * KM_PER_DEG_LON), 2
        )

        rows.append(
            {
                "category": category,
                "municipality": municipality,
                "province": members[0]["province"],
                "base_name": base,
                "n": n,
                "n_linked": len(linked),
                "n_distinct_qids": len(distinct_qids),
                "spread_km": spread_km,
                "dominant_date": dominant_date,
                "dominant_date_share": round(dominant_count / n, 2),
                "names": " | ".join(m["name"] for m in members),
                "jcyl_ids": " | ".join(str(m["jcyl_id"]) for m in members),
            }
        )

    # Biggest groups first - those are both the most consequential to get
    # right and the fastest way to eyeball whether this whole approach
    # looks sane for a given category before working through the long tail.
    rows.sort(key=lambda r: (-r["n"], r["spread_km"]))

    os.makedirs(RAW_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    total_entries_covered = sum(r["n"] for r in rows)
    print(f"{len(rows)} candidate clusters ({total_entries_covered} BIC entries total) written to {OUT_PATH}")
    print("Each row is entries that reduced to the same name once a trailing number/roman numeral was stripped -")
    print("review names/jcyl_ids by hand before deciding whether they're really one site or not.")


if __name__ == "__main__":
    main()
