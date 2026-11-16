#!/usr/bin/env python3
"""Pulls the coat of arms (P94) and flag (P41) of every Castilla y León
municipality and province from Wikidata.

The app shows them in the header of a municipality's and a province's panel,
where a photo would otherwise be missing (neither has one).

Emblems almost never change, so this runs weekly (Sundays, see
daily_refresh.sh), not on every refresh: two SPARQL queries, nothing more.

Run: python3 scripts/fetch_emblems.py
Writes: web/data/emblems.json - {
          "municipalities": {ine_code: {"coa": filename, "flag": filename}},
          "provinces":      {province name: {"coa": ..., "flag": ...}},
        }
        Filenames are Commons files, without the "File:" prefix. A key is
        only present when Wikidata has it, and a place with neither is left
        out. Written to web/data/ directly (nothing reads it in the build),
        and only after both queries succeeded and returned a plausible
        amount, so a bad run cannot wipe out the last good file.
"""
import json
import os
import urllib.parse
import urllib.request

from project import urlopen_with_retry, user_agent

OUT_FILE = os.path.join(os.path.dirname(__file__), "..", "web", "data", "emblems.json")
WDQS = "https://query.wikidata.org/sparql"
UA = user_agent("patrimonioabierto-emblems")

# INE province prefixes of Castilla y León: Ávila, Burgos, León, Palencia,
# Salamanca, Segovia, Soria, Valladolid, Zamora.
INE_PREFIXES = ("05", "09", "24", "34", "37", "40", "42", "47", "49")

MUNICIPALITIES_QUERY = """
SELECT ?ine ?coa ?flag WHERE {
  ?item wdt:P772 ?ine .
  FILTER(REGEX(?ine, "^(PREFIXES)[0-9]{3}$"))
  OPTIONAL { ?item wdt:P94 ?coa }
  OPTIONAL { ?item wdt:P41 ?flag }
}
""".replace("PREFIXES", "|".join(INE_PREFIXES))

# Q162620 = province of Spain, Q5739 = Castilla y León.
PROVINCES_QUERY = """
SELECT ?name ?coa ?flag WHERE {
  ?item wdt:P31 wd:Q162620 ; wdt:P131 wd:Q5739 ; rdfs:label ?name .
  FILTER(LANG(?name) = "es")
  OPTIONAL { ?item wdt:P94 ?coa }
  OPTIONAL { ?item wdt:P41 ?flag }
}
"""

MIN_MUNICIPALITIES = 500  # CyL has 2248; the real number with an emblem is far above this
EXPECTED_PROVINCES = 9


def run(query):
    url = WDQS + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    with urlopen_with_retry(req, timeout=120) as resp:
        return json.load(resp)["results"]["bindings"]


def commons_filename(uri):
    """.../Special:FilePath/Escudo%20de%20X.svg -> "Escudo de X.svg"."""
    return urllib.parse.unquote(uri.rsplit("/", 1)[-1])


def collect(rows, key):
    """{key value: {"coa": ..., "flag": ...}}. An item can carry several
    images, and the query then returns one row per combination: the first
    file in name order wins, so the choice does not flip between runs."""
    out = {}
    for row in sorted(rows, key=lambda r: (r[key]["value"], r.get("coa", {}).get("value", ""), r.get("flag", {}).get("value", ""))):
        entry = out.setdefault(row[key]["value"], {})
        for field in ("coa", "flag"):
            if field in row and field not in entry:
                entry[field] = commons_filename(row[field]["value"])
    return {k: v for k, v in out.items() if v}


def province_name(label):
    """"provincia de Ávila" -> "Ávila" (the name provinces.json uses)."""
    return label.removeprefix("provincia de ").removeprefix("provincia del ").strip()


def main():
    municipalities = collect(run(MUNICIPALITIES_QUERY), "ine")
    province_rows = run(PROVINCES_QUERY)
    for row in province_rows:
        row["name"]["value"] = province_name(row["name"]["value"])
    provinces = collect(province_rows, "name")

    if len(municipalities) < MIN_MUNICIPALITIES or len(provinces) != EXPECTED_PROVINCES:
        raise SystemExit(
            f"unexpected result ({len(municipalities)} municipalities, {len(provinces)} provinces) "
            f"- keeping the existing {os.path.basename(OUT_FILE)}"
        )

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump({"municipalities": municipalities, "provinces": provinces}, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write("\n")
    both = sum(1 for e in municipalities.values() if len(e) == 2)
    print(f"DONE: {len(municipalities)} municipalities ({both} with both coat of arms and flag), {len(provinces)} provinces")


if __name__ == "__main__":
    main()
