#!/usr/bin/env python3
"""Pulls the Wikipedia lead-paragraph extract (not the full article - the
same short teaser build_monument_pages.py's static pages, and the live
app's own monument panel via fetchWikipediaSummary() in app.js, both show)
for every linked monument that has one, so scripts/build_monument_pages.py
can bake real, crawlable text into each monument's static page instead of
leaving it to a client-side fetch a search engine never waits for.

Two-step, since cyl_monuments_wikidata.json only records *whether* an item
has a Wikipedia article (has_wikipedia_article), not which one:

1. Batch-resolve es/enwiki sitelinks via wbgetentities (50 QIDs/request -
   same batching shape as fetchLabels() in app.js, just server-side and
   for every linked item instead of a handful of referenced ones).
2. For whichever language each item actually has (es preferred, en
   fallback - same preference order selectMonument() uses at runtime),
   fetch that one article's summary extract.

Run: python3 scripts/fetch_wikipedia_extracts.py
Needs: web/data/cyl_monuments_wikidata.json (scripts/build_dataset.py)
Writes: data/raw/wikipedia_extracts.json, incrementally (safe to
        interrupt/resume - jcyl_ids already in the file are skipped on
        rerun, same pattern as find_good_pictures.py).
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
DATASET_FILE = os.path.join(os.path.dirname(__file__), "..", "web", "data", "cyl_monuments_wikidata.json")
OUT_FILE = os.path.join(RAW_DIR, "wikipedia_extracts.json")
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
UA = "patrimonioabierto-seo/1.0 (https://github.com/tholbach/patrimonioabierto; thomas@holba.ch)"


def api_get(url, retries=4):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # a real "this article doesn't exist" answer, not a transient failure
            if attempt == retries - 1:
                raise
            time.sleep(2**attempt)
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
            time.sleep(2**attempt)


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def fetch_sitelinks(qids):
    """qid -> {'es': title} and/or {'en': title}, only for qids that have
    at least one of the two - everything else (no sitelink at all, or only
    a third-language one) is simply absent from the result."""
    out = {}
    batches = list(chunks(qids, 50))
    for i, batch in enumerate(batches):
        url = (
            WIKIDATA_API
            + "?"
            + urllib.parse.urlencode(
                {
                    "action": "wbgetentities",
                    "props": "sitelinks",
                    "sitefilter": "eswiki|enwiki",
                    "format": "json",
                    "ids": "|".join(batch),
                }
            )
        )
        data = api_get(url) or {}
        for qid, ent in data.get("entities", {}).items():
            sitelinks = ent.get("sitelinks", {})
            titles = {}
            if "eswiki" in sitelinks:
                titles["es"] = sitelinks["eswiki"]["title"]
            if "enwiki" in sitelinks:
                titles["en"] = sitelinks["enwiki"]["title"]
            if titles:
                out[qid] = titles
        if (i + 1) % 10 == 0 or i == len(batches) - 1:
            print(f"  sitelinks: {i + 1}/{len(batches)} batches ({len(out)} with an es/en article so far)")
    return out


def fetch_summary(lang, title):
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(title)}"
    return api_get(url)


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    records = json.load(open(DATASET_FILE, encoding="utf-8"))
    # Same exclusions as build_potw_seed.py's wikidata_conflict skip, for
    # the same reason - an unresolved multi-QID conflict has no single
    # right item to pull a sitelink/extract from.
    candidates = [
        r
        for r in records
        if r["already_linked"] and not r["wikidata_conflict"] and r["has_wikipedia_article"]
    ]
    print(f"{len(candidates)} linked monuments flagged has_wikipedia_article")

    out = {}
    if os.path.exists(OUT_FILE):
        out = json.load(open(OUT_FILE, encoding="utf-8"))
    todo = [r for r in candidates if str(r["jcyl_id"]) not in out]
    print(f"{len(todo)}/{len(candidates)} left to fetch ({len(out)} already done)")
    if not todo:
        return

    qids = []
    for r in todo:
        q = r["wikidata_qid"]
        qids.append(q[0] if isinstance(q, list) else q)
    sitelinks = fetch_sitelinks(qids)

    for i, r in enumerate(todo):
        q = r["wikidata_qid"]
        qid = q[0] if isinstance(q, list) else q
        titles = sitelinks.get(qid)
        if not titles:
            continue  # has_wikipedia_article was true for a third-language edition only
        lang = "es" if "es" in titles else "en"
        title = titles[lang]
        summary = fetch_summary(lang, title)
        if summary and summary.get("extract"):
            out[str(r["jcyl_id"])] = {
                "lang": lang,
                "title": title,
                "extract": summary["extract"],
                "page_url": summary.get("content_urls", {}).get("desktop", {}).get("page")
                or f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title)}",
            }
        time.sleep(0.05)
        if (i + 1) % 100 == 0:
            json.dump(out, open(OUT_FILE, "w"), ensure_ascii=False)
            print(f"  ...{i + 1}/{len(todo)} ({len(out)} extracts total so far)")

    json.dump(out, open(OUT_FILE, "w"), ensure_ascii=False)
    print(f"DONE: {len(out)} extracts written to {OUT_FILE}")


if __name__ == "__main__":
    main()
