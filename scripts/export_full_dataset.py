"""One-off export for offline exploration (e.g. "here's the data, what could
we build with it") - NOT part of the site's own build pipeline and not read
by web/app.js. Combines:

- everything already in web/data/cyl_monuments_wikidata.json (all 2,479
  monuments, linked or not)
- for every one linked to Wikidata: the same claims the live map extracts
  per-monument on click (architect/style/inception/heritage designation/
  part-of - P84/P149/P571/P1435/P361, see web/app.js's renderFacts()), but
  fetched in bulk via wbgetentities rather than one Special:EntityData call
  per click
- the FULL plain-text of its Wikipedia article (es preferred, en fallback -
  same preference order as the live site's currentLang default), not just
  the short REST summary shown in the app

wikidata_qid is null (unlinked), a single QID, or - for the 4 known
conflicts - a list of QIDs. This export always normalizes to a list
(`wikidata_items`), 0/1/2 entries, rather than silently dropping the
conflict cases down to one.

Run: python3 scripts/export_full_dataset.py
Writes: data/raw/full_dataset_with_wikipedia.json (gitignored, like the
rest of data/raw/ - this file is meant to be handed to someone directly,
not committed).
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
UA = "patrimonioabierto-full-export/0.1 (thomas@holba.ch; one-off data export for offline use)"
IN_PATH = "web/data/cyl_monuments_wikidata.json"
OUT_PATH = "data/raw/full_dataset_with_wikipedia.json"

CLAIM_PROPS = {"architect": "P84", "styles": "P149", "inception": "P571",
               "heritage_designation": "P1435", "part_of": "P361", "image": "P18"}


def api_get(base, params, retries=3):
    url = base + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            if attempt == retries - 1:
                raise
            wait = 5 * (attempt + 1)
            print(f"  ! {e} - retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)


def chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def entity_value_id(claims, prop):
    """First mainsnak value of an item-valued claim (architect/style/etc),
    as a QID to resolve later - or None if the claim is absent/novalue."""
    c = (claims.get(prop) or [{}])[0]
    v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
    return v.get("id") if isinstance(v, dict) else None


def fetch_wikidata_entities(qids):
    """qid -> {label, description, sitelinks: {eswiki, enwiki}, claim QIDs,
    inception, image filename}. Batched 50 ids/request (wbgetentities' own
    limit for non-bot accounts) instead of one request per item."""
    entities = {}
    unique = sorted(set(qids))
    for i, chunk in enumerate(chunked(unique, 50), 1):
        data = api_get(WIKIDATA_API, {
            "action": "wbgetentities", "ids": "|".join(chunk),
            "props": "labels|descriptions|claims|sitelinks",
            "languages": "es|en", "sitefilter": "eswiki|enwiki",
        })
        for qid, e in data.get("entities", {}).items():
            if e.get("missing") is not None:
                continue
            labels = e.get("labels", {})
            descriptions = e.get("descriptions", {})
            claims = e.get("claims", {})
            sitelinks = e.get("sitelinks", {})
            inception_val = (claims.get("P571") or [{}])[0].get("mainsnak", {}).get("datavalue", {}).get("value")
            entities[qid] = {
                "label": labels.get("es", labels.get("en", {})).get("value", qid),
                "description": descriptions.get("es", descriptions.get("en", {})).get("value"),
                "architect_qid": entity_value_id(claims, "P84"),
                "style_qids": [c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
                               for c in claims.get("P149", [])
                               if c.get("mainsnak", {}).get("datavalue")],
                "inception": inception_val.get("time") if inception_val else None,
                "heritage_designation_qid": entity_value_id(claims, "P1435"),
                "part_of_qid": entity_value_id(claims, "P361"),
                "image_filename": (claims.get("P18") or [{}])[0].get("mainsnak", {}).get("datavalue", {}).get("value"),
                "eswiki_title": sitelinks.get("eswiki", {}).get("title"),
                "enwiki_title": sitelinks.get("enwiki", {}).get("title"),
            }
        print(f"[wikidata {i}] fetched {len(chunk)} entities ({len(entities)} total so far)", file=sys.stderr)
        time.sleep(0.1)
    return entities


def fetch_labels(qids):
    """label-only lookup for QIDs referenced *inside* claims (architect,
    style, heritage designation, part-of) - a second bulk pass, since we
    don't know those ids until after the first pass above."""
    qids = sorted({q for q in qids if q})
    labels = {}
    for chunk in chunked(qids, 50):
        data = api_get(WIKIDATA_API, {
            "action": "wbgetentities", "ids": "|".join(chunk),
            "props": "labels", "languages": "es|en",
        })
        for qid, e in data.get("entities", {}).items():
            if e.get("missing") is not None:
                continue
            l = e.get("labels", {})
            labels[qid] = l.get("es", l.get("en", {})).get("value", qid)
        time.sleep(0.1)
    return labels


def fetch_wikipedia_extracts(titles_by_lang):
    """Full plain-text article body (action=query&prop=extracts,
    explaintext). One title per request, deliberately NOT batched: the
    extracts API caps exlimit at 1 for whole-article extracts (only
    intro-only extracts, exintro=1, support batching several titles per
    call - confirmed by hand against the live API, which silently lowers
    exlimit to 1 with a warning otherwise). Slower than the rest of this
    script's fetches, but still just ~1-2 requests/second with the delay
    below."""
    extracts = {}  # (lang, title) -> text
    for lang, titles in titles_by_lang.items():
        host = f"https://{lang}.wikipedia.org/w/api.php"
        unique_titles = sorted(set(titles))
        for i, title in enumerate(unique_titles, 1):
            data = api_get(host, {
                "action": "query", "prop": "extracts", "explaintext": "1",
                "redirects": "1", "titles": title,
            })
            pages = data.get("query", {}).get("pages", {})
            extract = next(iter(pages.values()), {}).get("extract") if pages else None
            extracts[(lang, title)] = extract
            if i % 50 == 0 or i == len(unique_titles):
                print(f"[{lang}wiki] {i}/{len(unique_titles)} article extracts fetched", file=sys.stderr)
            time.sleep(0.05)
    return extracts


def main():
    with open(IN_PATH, encoding="utf-8") as f:
        records = json.load(f)

    all_qids = []
    for r in records:
        q = r["wikidata_qid"]
        if isinstance(q, str):
            all_qids.append(q)
        elif isinstance(q, list):
            all_qids.extend(q)
    print(f"{len(records)} monuments, {len(all_qids)} wikidata_qid references ({len(set(all_qids))} unique)", file=sys.stderr)

    wd_entities = fetch_wikidata_entities(all_qids)

    referenced_qids = []
    for e in wd_entities.values():
        referenced_qids += [e["architect_qid"], e["heritage_designation_qid"], e["part_of_qid"], *e["style_qids"]]
    label_lookup = fetch_labels(referenced_qids)

    titles_by_lang = defaultdict(list)
    for e in wd_entities.values():
        if e["eswiki_title"]:
            titles_by_lang["es"].append(e["eswiki_title"])
        elif e["enwiki_title"]:
            titles_by_lang["en"].append(e["enwiki_title"])
    extracts = fetch_wikipedia_extracts(titles_by_lang)

    out_records = []
    for r in records:
        q = r["wikidata_qid"]
        qids = [q] if isinstance(q, str) else (q or [])
        wikidata_items = []
        for qid in qids:
            e = wd_entities.get(qid)
            if not e:
                continue
            lang = "es" if e["eswiki_title"] else ("en" if e["enwiki_title"] else None)
            title = e["eswiki_title"] or e["enwiki_title"]
            wikidata_items.append({
                "qid": qid,
                "label": e["label"],
                "description": e["description"],
                "architect": label_lookup.get(e["architect_qid"]),
                "styles": [label_lookup.get(s) for s in e["style_qids"] if s],
                "inception": e["inception"],
                "heritage_designation": label_lookup.get(e["heritage_designation_qid"]),
                "part_of": label_lookup.get(e["part_of_qid"]),
                "image_filename": e["image_filename"],
                "wikipedia": {
                    "lang": lang,
                    "title": title,
                    "url": f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}" if title else None,
                    "extract": extracts.get((lang, title)) if title else None,
                } if title else None,
            })
        out_records.append({**r, "wikidata_items": wikidata_items})

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out_records, f, ensure_ascii=False)
    with_article = sum(1 for r in out_records if any(wi.get("wikipedia") for wi in r["wikidata_items"]))
    print(f"wrote {OUT_PATH}: {len(out_records)} monuments, {with_article} with a Wikipedia article attached", file=sys.stderr)


if __name__ == "__main__":
    main()
