#!/usr/bin/env python3
"""Generates one static, crawlable HTML page per monument under
web/monumento/<jcyl_id>-<slug>/index.html, plus web/sitemap.xml and
web/robots.txt.

The gap this closes: the live app is a pure client-side SPA - a monument's
Wikipedia extract only exists in the DOM after app.js fetches it at
runtime, and every URL (?id=1, ?id=2, ...) served the exact same <title>/
meta description/og:* tags either way. A search crawler that doesn't wait
out that fetch (or a link-preview bot, which never runs JS at all - see
README/PR discussion) saw 2,479 identical, textless pages. These static
pages fix that at the only layer that can: real, monument-specific
<title>/meta/og/JSON-LD plus the actual extract text as plain HTML,
already in the page before any JS runs.

Each page is index.html's own shell (topbar/map/panel markup, same CSS/JS
includes) with:
  - a per-monument <title>/description/canonical/og:*/twitter:*/JSON-LD in
    <head> - built by literal find/replace against index.html's own
    current homepage text (see _sub() below), NOT a separate hand-maintained
    copy, so any future edit to index.html's shell (new button, changed
    script src, ...) is picked up here automatically. _sub() asserts its
    anchor text is still present before replacing, so a homepage copy
    change that actually breaks this raises loudly at build time instead
    of silently drifting.
  - #panel already carrying class="open" and #panel-content pre-filled
    with real markup (hero photo, name, category/municipality/date, the
    Wikipedia extract if there is one, JCyL/Wikidata/Wikipedia badges) -
    mirrors selectMonument()'s own HTML shape in app.js closely enough
    that once JS boots and re-fetches everything live, the swap is
    invisible, not a layout jump.

URL shape is /monumento/<jcyl_id>-<slug>/ - the numeric id is load-bearing
(app.js's bootstrap parses it back out and rewrites the address bar to the
canonical ?id= form, see the /^\\/monumento\\/(\\d+)-/ match there), the
slug afterward is cosmetic only. A monument renamed between builds gets a
new slug on its next build with the old URL's id prefix still resolving
correctly - nothing needs a redirect map.

Run: python3 scripts/build_monument_pages.py
Needs: web/data/cyl_monuments_wikidata.json (scripts/build_dataset.py),
       data/raw/wikipedia_extracts.json (scripts/fetch_wikipedia_extracts.py,
       optional - monuments without an entry just render without an
       extract, same missing-note/CTA copy the live app shows).
Writes: web/monumento/<jcyl_id>-<slug>/index.html (one per monument),
        web/sitemap.xml, web/robots.txt.
"""
import html
import json
import os
import re
import unicodedata

WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "web")
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
DATASET_FILE = os.path.join(WEB_DIR, "data", "cyl_monuments_wikidata.json")
EXTRACTS_FILE = os.path.join(RAW_DIR, "wikipedia_extracts.json")
INDEX_FILE = os.path.join(WEB_DIR, "index.html")
OUT_ROOT = os.path.join(WEB_DIR, "monumento")
SITE_URL = "https://patrimonioabierto.es"

CATEGORY_ICONS = {
    "MONUMENTO": "🏛️",
    "CASTILLOS": "🏰",
    "HÓRREOS Y PALLOZAS": "🌾",
    "ARTE RUPESTRE": "🪨",
    "CONJUNTO HISTÓRICO": "🏘️",
    "ROLLOS DE JUSTICIA": "⚖️",
    "ZONA ARQUEOLÓGICA": "🏺",
    "CONJUNTO ETNOLÓGICO": "🪵",
    "ARCHIVOS, MUSEOS Y BIBLIOTECAS": "📚",
    "SITIO HISTÓRICO": "📍",
    "ESCUDOS": "🛡️",
    "PAISAJE CULTURAL": "🌄",
    "JARDÍN HISTÓRICO": "🌳",
    "HITOS FORALES": "🪧",
}
DEFAULT_ICON = "📌"

ICON_WIKIDATA = (
    '<svg viewBox="0 0 1050 590" width="18" height="10" aria-hidden="true">'
    '<path d="m 120,545 h 30 V 45 H 120 V 545 z m 60,0 h 90 V 45 H 180 V 545 z M 300,45 V 545 h 90 V 45 h -90 z" fill="#990000"/>'
    '<path d="m 840,545 h 30 V 45 H 840 V 545 z M 900,45 V 545 h 30 V 45 H 900 z M 420,545 h 30 V 45 H 420 V 545 z M 480,45 V 545 h 30 V 45 h -30 z" fill="#339966"/>'
    '<path d="m 540,545 h 90 V 45 h -90 V 545 z m 120,0 h 30 V 45 H 660 V 545 z M 720,45 V 545 h 90 V 45 H 720 z" fill="#006699"/>'
    "</svg>"
)
ICON_WIKIPEDIA = '<span class="wiki-w-icon">W</span>'


def slugify(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug or "monumento"


def truncate(text, limit=157):
    """Word-boundary truncate for a meta description - never mid-word,
    trailing "..." only added if it actually got cut."""
    text = " ".join(text.split())  # collapse whitespace/newlines from the extract
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut + "…"


def commons_file_path(image_url, width):
    """image_url is already a Special:FilePath URL (build_dataset.py, from
    Wikidata's P18) with no size - append one, same convention
    commonsThumbUrl() in app.js uses at runtime. Also normalizes http->https
    (some P18 values resolve that way from Wikidata) - og:image/twitter:image
    consumers are inconsistent about following a redirect off plain http."""
    if not image_url:
        return None
    if image_url.startswith("http://"):
        image_url = "https://" + image_url[len("http://") :]
    sep = "&" if "?" in image_url else "?"
    return f"{image_url}{sep}width={width}"


def _sub(html_text, old, new, count=1):
    """Literal (non-regex) find/replace, asserting `old` was actually
    present - a silent no-op here would mean every page quietly shipped
    the homepage's own title/description instead of failing the build, the
    one failure mode worth never allowing."""
    assert old in html_text, f"build_monument_pages.py: expected exact text not found in index.html:\n{old[:200]}"
    return html_text.replace(old, new, count)


def build_head(shell, record, extract):
    name = html.escape(record["name"])
    title = f"{name} - Patrimonio Abierto"
    if extract:
        description = truncate(extract["extract"])
    else:
        description = truncate(
            f"{record['name']}, {record['category'].title()} en {record['municipality']} "
            f"({record['province']}), Bien de Interés Cultural de Castilla y León."
        )
    description_attr = html.escape(description, quote=True)
    page_url = f"{SITE_URL}/monumento/{record['jcyl_id']}-{slugify(record['name'])}/"
    image = commons_file_path(record.get("image_url"), 1200) or f"{SITE_URL}/assets/logo-readme.png"

    # index.html itself now carries <base href="/"> directly (needed once
    # app.js also pushState()s the address bar to /monumento/<id>-<slug>/
    # during live browsing, not just here) - nothing to insert, the shell
    # already has it.
    shell = _sub(
        shell,
        "<title>Patrimonio Abierto - Castilla y León en un mapa</title>",
        f"<title>{title}</title>",
    )
    shell = _sub(
        shell,
        '<meta name="description" content="Mapa interactivo de los Bienes de Interés Cultural (BIC) de Castilla y León: castillos, yacimientos arqueológicos, arte rupestre, conjuntos históricos, hórreos, rollos de justicia y más - cada uno enlazado con su ficha en Wikidata, su artículo en Wikipedia y sus fotos libres en Wikimedia Commons. Explora, con historia y fotografías, más de 2.400 monumentos protegidos según el catálogo oficial de la Junta de Castilla y León - datos abiertos, gratis, sin cuentas ni anuncios.">',
        f'<meta name="description" content="{description_attr}">',
    )
    shell = _sub(
        shell,
        '<link rel="canonical" href="https://patrimonioabierto.es/">',
        f'<link rel="canonical" href="{page_url}">',
    )
    shell = _sub(
        shell,
        '<meta property="og:title" content="Patrimonio Abierto - Castilla y León en un mapa">',
        f'<meta property="og:title" content="{title}">',
    )
    shell = _sub(
        shell,
        '<meta property="og:description" content="Castillos, yacimientos arqueológicos, arte rupestre, conjuntos históricos y más de 2.400 monumentos protegidos de Castilla y León, enlazados con Wikidata, Wikipedia y Wikimedia Commons - con fotos, historia y datos abiertos de la Junta de Castilla y León.">',
        f'<meta property="og:description" content="{description_attr}">',
    )
    shell = _sub(
        shell,
        '<meta property="og:image" content="https://patrimonioabierto.es/assets/logo-readme.png">',
        f'<meta property="og:image" content="{image}">',
    )
    shell = _sub(
        shell,
        '<meta property="og:url" content="https://patrimonioabierto.es/">',
        f'<meta property="og:url" content="{page_url}">',
    )
    shell = _sub(
        shell,
        '<meta name="twitter:title" content="Patrimonio Abierto - Castilla y León en un mapa">',
        f'<meta name="twitter:title" content="{title}">',
    )
    shell = _sub(
        shell,
        '<meta name="twitter:description" content="Castillos, yacimientos arqueológicos, arte rupestre, conjuntos históricos y más de 2.400 monumentos protegidos de Castilla y León, enlazados con Wikidata, Wikipedia y Wikimedia Commons.">',
        f'<meta name="twitter:description" content="{description_attr}">',
    )
    shell = _sub(
        shell,
        '<meta name="twitter:image" content="https://patrimonioabierto.es/assets/logo-readme.png">',
        f'<meta name="twitter:image" content="{image}">',
    )

    same_as = []
    qid = record["wikidata_qid"]
    qid = qid[0] if isinstance(qid, list) else qid
    if qid:
        same_as.append(f"https://www.wikidata.org/wiki/{qid}")
    if extract:
        same_as.append(extract["page_url"])
    json_ld = {
        "@context": "https://schema.org",
        "@type": "LandmarkOrHistoricalBuilding",
        "name": record["name"],
        "description": description,
        "url": page_url,
        "address": {
            "@type": "PostalAddress",
            "addressLocality": record["municipality"],
            "addressRegion": record["province"],
            "addressCountry": "ES",
        },
        "geo": {"@type": "GeoCoordinates", "latitude": record["lat"], "longitude": record["lon"]},
        "isPartOf": {"@type": "WebSite", "name": "Patrimonio Abierto", "url": f"{SITE_URL}/"},
    }
    if record.get("image_url"):
        json_ld["image"] = commons_file_path(record["image_url"], 1200)
    if same_as:
        json_ld["sameAs"] = same_as

    old_ld_start = shell.index('<script type="application/ld+json">')
    old_ld_end = shell.index("</script>", old_ld_start) + len("</script>")
    new_ld = (
        '<script type="application/ld+json">'
        + json.dumps(json_ld, ensure_ascii=False)
        + "</script>"
    )
    shell = shell[:old_ld_start] + new_ld + shell[old_ld_end:]
    return shell


def build_panel_content(record, extract):
    name = html.escape(record["name"])
    icon = CATEGORY_ICONS.get(record["category"], DEFAULT_ICON)
    kicker = f"{icon} {html.escape(record['category'])}"
    meta_line = f"{html.escape(record['municipality'])} · {html.escape(record['province'])}"
    if record.get("protection_date"):
        meta_line += f" · BIC desde {html.escape(record['protection_date'])}"

    image_url = commons_file_path(record.get("image_url"), 800)
    if image_url:
        hero = (
            f'<div class="hero">'
            f'<img class="hero-img-bg" src="{image_url}" alt="" aria-hidden="true">'
            f'<img class="hero-img" src="{image_url}" alt="">'
            f'<div class="hero-scrim"><div class="hero-kicker">{kicker}</div><h2 class="hero-title">{name}</h2></div>'
            f"</div>"
        )
    else:
        hero = (
            f'<div class="hero hero-fallback">'
            f'<div class="hero-placeholder-icon">{icon}</div>'
            f'<div class="hero-scrim"><div class="hero-kicker">{kicker}</div><h2 class="hero-title">{name}</h2></div>'
            f"</div>"
        )

    body = [f'<div class="meta">{meta_line}</div>']

    if not record["already_linked"]:
        body.append('<div class="missing-note">Sin enlazar a Wikidata todavía.</div>')
    elif extract:
        body.append(f'<div class="extract">{extract["extract"]}</div>')
        body.append(
            f'<a class="badge read-more-btn" href="{extract["page_url"]}" target="_blank" rel="noopener">'
            f'{ICON_WIKIPEDIA}Leer más en Wikipedia →</a>'
        )
        body.append(
            f'<div class="text-license">Texto de <a href="{extract["page_url"]}" target="_blank" rel="noopener">Wikipedia</a>, '
            f'disponible bajo la licencia <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">'
            f"Creative Commons Atribución-CompartirIgual 4.0</a>.</div>"
        )
    else:
        body.append('<div class="missing-note">Este monumento todavía no tiene artículo en Wikipedia.</div>')

    badges = [f'<a class="badge jcyl" href="{record["reference_url"]}" target="_blank" rel="noopener">📄 Ficha JCyL</a>']
    qid = record["wikidata_qid"]
    qid = qid[0] if isinstance(qid, list) else qid
    if qid:
        badges.append(f'<a class="badge wikidata" href="https://www.wikidata.org/wiki/{qid}" target="_blank" rel="noopener">{ICON_WIKIDATA}Wikidata</a>')
    if extract:
        badges.append(f'<a class="badge wikipedia" href="{extract["page_url"]}" target="_blank" rel="noopener">{ICON_WIKIPEDIA}Wikipedia</a>')
    body.append(f'<div class="link-badges">{"".join(badges)}</div>')

    return hero + f'<div class="panel-body">{"".join(body)}</div>'


def build_page(shell_template, record, extract):
    page = build_head(shell_template, record, extract)
    panel_content = build_panel_content(record, extract)
    page = _sub(page, '<aside id="panel">', '<aside id="panel" class="open">')
    page = _sub(page, '<div id="panel-content"></div>', f'<div id="panel-content">{panel_content}</div>')
    return page


def main():
    shell_template = open(INDEX_FILE, encoding="utf-8").read()
    records = json.load(open(DATASET_FILE, encoding="utf-8"))
    extracts = {}
    if os.path.exists(EXTRACTS_FILE):
        extracts = json.load(open(EXTRACTS_FILE, encoding="utf-8"))

    os.makedirs(OUT_ROOT, exist_ok=True)
    written = []
    for record in records:
        extract = extracts.get(str(record["jcyl_id"]))
        page = build_page(shell_template, record, extract)
        slug = f"{record['jcyl_id']}-{slugify(record['name'])}"
        out_dir = os.path.join(OUT_ROOT, slug)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(page)
        written.append(slug)

    with_extract = sum(1 for r in records if str(r["jcyl_id"]) in extracts)
    print(f"wrote {len(written)} monument pages ({with_extract} with a Wikipedia extract) to {OUT_ROOT}")

    sitemap_urls = [f"{SITE_URL}/"] + [f"{SITE_URL}/monumento/{slug}/" for slug in written]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url in sitemap_urls:
        sitemap.append(f"  <url><loc>{html.escape(url)}</loc></url>")
    sitemap.append("</urlset>")
    with open(os.path.join(WEB_DIR, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(sitemap) + "\n")
    print(f"wrote sitemap.xml ({len(sitemap_urls)} URLs)")

    robots = f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n"
    with open(os.path.join(WEB_DIR, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(robots)
    print("wrote robots.txt")


if __name__ == "__main__":
    main()
