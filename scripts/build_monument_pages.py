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
       data/raw/wikidata_labels.json (scripts/fetch_wikidata_labels.py,
       optional - alternate names from Wikidata, shown on the page and in
       its JSON-LD), data/raw/wikipedia_extracts.json (scripts/fetch_wikipedia_extracts.py,
       optional - monuments without an entry just render without an
       extract, same missing-note/CTA copy the live app shows).
Writes: web/monumento/<jcyl_id>-<slug>/index.html (one per monument),
        web/provincia/<province>/index.html and
        web/provincia/<province>/<category>/index.html (listing pages, see
        build_province_page()/build_category_page()),
        web/sitemap.xml, web/robots.txt.
"""
import html
import json
import math
import os
import re
import shutil
import unicodedata
from collections import defaultdict

WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "web")
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
DATASET_FILE = os.path.join(WEB_DIR, "data", "cyl_monuments_wikidata.json")
EXTRACTS_FILE = os.path.join(RAW_DIR, "wikipedia_extracts.json")
LABELS_FILE = os.path.join(RAW_DIR, "wikidata_labels.json")
INDEX_FILE = os.path.join(WEB_DIR, "index.html")
OUT_ROOT = os.path.join(WEB_DIR, "monumento")
PROVINCIA_ROOT = os.path.join(WEB_DIR, "provincia")
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
    "CONJUNTO INDUSTRIAL": "🏭",
    "INMUEBLES ASOCIADOS A LA DECLARACIÓN": "🔗",
}
DEFAULT_ICON = "📌"

# How many neighbours each page links to, and how far away they may be. The
# list exists for two reasons: it is real content a visitor can use, and
# the plain <a href> links are the only way one monument page leads a crawler
# to another (everything else is a map drawn by JavaScript).
# Alternate names shown per page. Wikidata sometimes carries a dozen
# spellings of one monument; the first few cover what people type.
MAX_ALT_NAMES = 6

# A province x category gets a page of its own from this many monuments up.
# Below that the page would be a handful of links, thin next to the province
# page it duplicates.
MIN_CATEGORY_PAGE = 5
FEATURED_COUNT = 12
TOP_MUNICIPALITIES = 10

NEARBY_COUNT = 6
NEARBY_MAX_KM = 25

MONTHS_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

# Singular, lowercase wording for a sentence ("... es un <this>"-free, see
# build_summary()). Anything not listed falls back to the lowercased
# category, so a category JCyL adds later still renders, just less polished.
CATEGORY_NOUN = {
    "MONUMENTO": "monumento",
    "CASTILLOS": "castillo",
    "HÓRREOS Y PALLOZAS": "hórreo o palloza",
    "ARTE RUPESTRE": "yacimiento de arte rupestre",
    "CONJUNTO HISTÓRICO": "conjunto histórico",
    "ROLLOS DE JUSTICIA": "rollo de justicia",
    "ZONA ARQUEOLÓGICA": "zona arqueológica",
    "CONJUNTO ETNOLÓGICO": "conjunto etnológico",
    "ARCHIVOS, MUSEOS Y BIBLIOTECAS": "archivo, museo o biblioteca",
    "SITIO HISTÓRICO": "sitio histórico",
    "ESCUDOS": "escudo",
    "PAISAJE CULTURAL": "paisaje cultural",
    "JARDÍN HISTÓRICO": "jardín histórico",
    "HITOS FORALES": "hito foral",
    "CONJUNTO INDUSTRIAL": "conjunto industrial",
    "INMUEBLES ASOCIADOS A LA DECLARACIÓN": "inmueble asociado a una declaración de BIC",
}

# Plural, as the heading of a listing ("Castillos en Burgos"). Also the
# source of each category's URL segment, so a rename here moves the URL.
CATEGORY_PLURAL = {
    "MONUMENTO": "Monumentos",
    "CASTILLOS": "Castillos",
    "HÓRREOS Y PALLOZAS": "Hórreos y pallozas",
    "ARTE RUPESTRE": "Arte rupestre",
    "CONJUNTO HISTÓRICO": "Conjuntos históricos",
    "ROLLOS DE JUSTICIA": "Rollos de justicia",
    "ZONA ARQUEOLÓGICA": "Zonas arqueológicas",
    "CONJUNTO ETNOLÓGICO": "Conjuntos etnológicos",
    "ARCHIVOS, MUSEOS Y BIBLIOTECAS": "Archivos, museos y bibliotecas",
    "SITIO HISTÓRICO": "Sitios históricos",
    "ESCUDOS": "Escudos",
    "PAISAJE CULTURAL": "Paisajes culturales",
    "JARDÍN HISTÓRICO": "Jardines históricos",
    "HITOS FORALES": "Hitos forales",
    "CONJUNTO INDUSTRIAL": "Conjuntos industriales",
    "INMUEBLES ASOCIADOS A LA DECLARACIÓN": "Inmuebles asociados a la declaración",
}

# For counting in running text: (singular, plural, gender). The heading uses
# CATEGORY_PLURAL ("Arte rupestre en Zamora"); a sentence needs something that
# can be counted and agree with a participle ("25 yacimientos de arte rupestre
# protegidos", not "25 arte rupestre protegidos"). Anything not listed falls
# back to the neutral "bien".
CATEGORY_COUNT_NOUN = {
    "MONUMENTO": ("monumento", "monumentos", "m"),
    "CASTILLOS": ("castillo", "castillos", "m"),
    "HÓRREOS Y PALLOZAS": ("hórreo o palloza", "hórreos y pallozas", "m"),
    "ARTE RUPESTRE": ("yacimiento de arte rupestre", "yacimientos de arte rupestre", "m"),
    "CONJUNTO HISTÓRICO": ("conjunto histórico", "conjuntos históricos", "m"),
    "ROLLOS DE JUSTICIA": ("rollo de justicia", "rollos de justicia", "m"),
    "ZONA ARQUEOLÓGICA": ("zona arqueológica", "zonas arqueológicas", "f"),
    "CONJUNTO ETNOLÓGICO": ("conjunto etnológico", "conjuntos etnológicos", "m"),
    "ARCHIVOS, MUSEOS Y BIBLIOTECAS": ("archivo, museo o biblioteca", "archivos, museos y bibliotecas", "m"),
    "SITIO HISTÓRICO": ("sitio histórico", "sitios históricos", "m"),
    "ESCUDOS": ("escudo", "escudos", "m"),
    "PAISAJE CULTURAL": ("paisaje cultural", "paisajes culturales", "m"),
    "JARDÍN HISTÓRICO": ("jardín histórico", "jardines históricos", "m"),
    "HITOS FORALES": ("hito foral", "hitos forales", "m"),
    "CONJUNTO INDUSTRIAL": ("conjunto industrial", "conjuntos industriales", "m"),
    "INMUEBLES ASOCIADOS A LA DECLARACIÓN": (
        "inmueble asociado a la declaración",
        "inmuebles asociados a la declaración",
        "m",
    ),
}

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


def fold(text):
    """Lowercase, accent-free, single-spaced: two spellings that differ only
    in accents or capitals compare equal."""
    plain = "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))
    return " ".join(plain.split())


def alt_names(record, label_entry):
    """Other names the monument goes by, from Wikidata: its Spanish label
    plus its aliases ("also known as"), minus anything that is the page's own
    name or a repeat (compared without accents/capitals). That is the point of
    including them: the catalogue name is one spelling, people search for
    others ("Castillo de la Triste Condesa" is Arenas de San Pedro's castle)."""
    if not label_entry:
        return []
    seen = {fold(record["name"])}
    names = []
    for candidate in [label_entry["label"], *label_entry["aliases"]]:
        candidate = " ".join(candidate.split())
        if not candidate or len(candidate) > 100 or fold(candidate) in seen:
            continue
        seen.add(fold(candidate))
        names.append(candidate[0].upper() + candidate[1:])
    return names[:MAX_ALT_NAMES]


def category_noun(category):
    return CATEGORY_NOUN.get(category, category.lower())


def spanish_date(iso):
    """2026-03-10 -> "10 de marzo de 2026"; None for anything else."""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", iso or "")
    if not m:
        return None
    year, month, day = int(m[1]), int(m[2]), int(m[3])
    return f"{day} de {MONTHS_ES[month - 1]} de {year}"


def page_title(record, ambiguous=False):
    """"Name, Municipality (Province)" - the place is part of the title
    because the name alone is not unique (89 entries are "Rollo de Justicia",
    69 are "La Villa") and a title that several pages share gives a search
    engine no reason to prefer this one. Also the words a person searching
    for a monument actually types. `ambiguous` adds the JCyL number for the
    few that still collide (several "La Villa" in one municipality)."""
    number = f" · n.º {record['jcyl_id']}" if ambiguous else ""
    return f"{record['name']}, {record['municipality']} ({record['province']}){number} - Patrimonio Abierto"


def build_summary(record):
    """One plain sentence of real, page-specific text. Short on purpose: the
    point is the facts a query is made of (what it is, where, since when),
    not padding."""
    parts = [
        f"{record['name']} es un bien protegido de la categoría «{category_noun(record['category'])}» "
        f"situado en {record['municipality']}, provincia de {record['province']}, en Castilla y León."
    ]
    when = spanish_date(record.get("protection_date"))
    if when:
        parts.append(f"Está declarado Bien de Interés Cultural desde el {when}.")
    return " ".join(parts)


def distance_km(a, b):
    """Great-circle distance between two records, in km (haversine)."""
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def format_distance(km):
    return f"{round(km * 1000)} m" if km < 1 else f"{km:.1f} km".replace(".", ",")


def nearby_records(record, records):
    """The NEARBY_COUNT closest other monuments within NEARBY_MAX_KM,
    nearest first, as (record, km) pairs."""
    # Cheap latitude/longitude box first: 1 degree of latitude is ~111 km,
    # so most of the ~2,600 records are ruled out without a trig call.
    dlat = NEARBY_MAX_KM / 111
    dlon = NEARBY_MAX_KM / (111 * max(math.cos(math.radians(record["lat"])), 0.1))
    found = []
    for other in records:
        if other["jcyl_id"] == record["jcyl_id"]:
            continue
        if abs(other["lat"] - record["lat"]) > dlat or abs(other["lon"] - record["lon"]) > dlon:
            continue
        km = distance_km(record, other)
        if km <= NEARBY_MAX_KM:
            found.append((other, km))
    found.sort(key=lambda pair: pair[1])
    return found[:NEARBY_COUNT]


def page_path(record):
    return f"/monumento/{record['jcyl_id']}-{slugify(record['name'])}/"


def count_noun(category):
    return CATEGORY_COUNT_NOUN.get(category, ("bien", "bienes", "m"))


def counted(n, category):
    """"1 castillo", "175 castillos"."""
    singular, plural, _ = count_noun(category)
    return f"{n} {singular if n == 1 else plural}"


def pluralize(n, one, many):
    return f"{n} {one if n == 1 else many}"


def of_them(n, gender):
    """"1 de ellos" / "3 de ellas"."""
    return f"{n} de {'ellas' if gender == 'f' else 'ellos'}"


def photo_and_wikidata_sentence(recs, gender="m"):
    """How many have a free photo and a Wikidata item, worded for the count
    (none / one / several) and the gender of the thing counted."""
    n = len(recs)
    with_photo = sum(1 for r in recs if r.get("has_wikidata_image"))
    linked = sum(1 for r in recs if r["already_linked"])
    tail = f"{linked} {'está' if linked == 1 else 'están'} enlazad{'a' if gender == 'f' else 'o'}{'' if linked == 1 else 's'} a Wikidata."
    if with_photo == 0:
        head = f"Ning{'una' if gender == 'f' else 'uno'} tiene fotografía libre en Wikimedia Commons"
    elif with_photo == 1:
        head = f"Solo {'una' if gender == 'f' else 'uno'} tiene fotografía libre en Wikimedia Commons"
    else:
        head = f"{of_them(with_photo, gender).capitalize()} tienen fotografía libre en Wikimedia Commons"
    sentence = f"{head}; {tail}"
    if n - with_photo and with_photo / n < 0.5:
        sentence += f" Aún faltan fotografías libres de {n - with_photo}."
    return sentence


def oldest_sentence(recs, gender="m"):
    """"El más antiguo, <name> (<municipality>), está protegido desde <year>."
    Empty when no record has a protection date."""
    dated = [r for r in recs if r.get("protection_date")]
    if not dated:
        return ""
    earliest = min(r["protection_date"] for r in dated)
    oldest_ones = [r for r in dated if r["protection_date"] == earliest]
    if len(oldest_ones) > 1:
        # Several share the date (a whole series declared at once, like the
        # hórreos): naming one of them would be arbitrary.
        return f"La protección más antigua data de {earliest[:4]}."
    oldest = oldest_ones[0]
    article, adjective = ("La", "antigua") if gender == "f" else ("El", "antiguo")
    return (
        f"{article} más {adjective}, {oldest['name']} ({oldest['municipality']}), está "
        f"{'protegida' if gender == 'f' else 'protegido'} desde {oldest['protection_date'][:4]}."
    )


def biggest_municipality(recs):
    counts = defaultdict(int)
    for r in recs:
        counts[r["municipality"]] += 1
    name = min(counts, key=lambda m: (-counts[m], fold(m)))
    return name, counts[name]


def category_summary(province, category, recs):
    """Intro of a province x category page: what and how many, how well
    documented, where most are, which is oldest."""
    _, _, gender = count_noun(category)
    n = len(recs)
    municipalities = len({r["municipality"] for r in recs})
    parts = [
        f"{counted(n, category)} {'protegidas' if gender == 'f' else 'protegidos'} como Bien de Interés Cultural en la provincia de {province}, "
        f"en {pluralize(municipalities, 'municipio', 'municipios')}, según el catálogo oficial de la Junta de Castilla y León.",
        photo_and_wikidata_sentence(recs, gender),
    ]
    if municipalities > 1:
        top, count = biggest_municipality(recs)
        if count > 1:
            parts.append(f"{top} reúne {of_them(count, gender)}.")
    parts.append(oldest_sentence(recs, gender))
    return " ".join(p for p in parts if p)


def province_summary(province, recs):
    """Intro of a province page."""
    by_cat = defaultdict(list)
    for r in recs:
        by_cat[r["category"]].append(r)
    municipalities = len({r["municipality"] for r in recs})
    top_cat = min(by_cat, key=lambda c: (-len(by_cat[c]), c))
    top_muni, top_count = biggest_municipality(recs)
    parts = [
        f"La provincia de {province} cuenta con {pluralize(len(recs), 'bien protegido', 'bienes protegidos')} como "
        f"Bien de Interés Cultural, repartidos en {pluralize(municipalities, 'municipio', 'municipios')} y "
        f"{pluralize(len(by_cat), 'categoría', 'categorías')}, según el catálogo oficial de la Junta de Castilla y León.",
        photo_and_wikidata_sentence(recs),
        f"La categoría más numerosa es «{category_plural(top_cat)}» ({len(by_cat[top_cat])}) "
        f"y el municipio con más bienes es {top_muni} ({top_count}).",
        oldest_sentence(recs),
    ]
    return " ".join(p for p in parts if p)


def category_plural(category):
    return CATEGORY_PLURAL.get(category, category.lower().capitalize())


def province_path(province):
    return f"/provincia/{slugify(province)}/"


def category_path(province, category):
    return f"{province_path(province)}{slugify(category_plural(category))}/"


def list_row(record, stat=""):
    """One <li> in the same markup the app's own lists use
    (monumentListItemHtml() in app.js): the stylesheet already knows it, and
    wireMonumentListRows() turns these real links into in-app navigation
    when the page boots - while the HTML keeps plain, crawlable <a href>s."""
    thumb = commons_file_path(record.get("image_url"), 64)
    if thumb:
        icon = f'<img class="list-row-thumb" src="{thumb}" alt="" loading="lazy">'
    else:
        has_photo = record.get("has_wikidata_image")
        icon = (
            f'<span class="list-row-icon {"has-photo" if has_photo else "no-photo"}" role="img" '
            f'aria-label="{"Con foto libre" if has_photo else "Sin foto libre"}">'
            f'{CATEGORY_ICONS.get(record["category"], DEFAULT_ICON)}</span>'
        )
    stat_html = f'<span class="list-row-stat">{html.escape(stat)}</span>' if stat else ""
    return (
        f'<li><a class="list-row" href="{page_path(record)}" data-jcyl-id="{record["jcyl_id"]}">'
        f'{icon}<span class="list-row-name">{html.escape(record["name"])}</span>{stat_html}</a></li>'
    )


def crumbs_html(items):
    """Visible breadcrumb trail; items are (label, path or None), the last one
    being the current page."""
    parts = [
        f'<a href="{path}">{html.escape(label)}</a>' if path else f'<span aria-current="page">{html.escape(label)}</span>'
        for label, path in items
    ]
    return '<nav class="crumbs" aria-label="Migas de pan">' + ' <span aria-hidden="true">›</span> '.join(parts) + "</nav>"


def crumbs_ld(items, current_url):
    """schema.org BreadcrumbList for the same trail."""
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": position,
                "name": label,
                "item": SITE_URL + path if path else current_url,
            }
            for position, (label, path) in enumerate(items, 1)
        ],
    }


def record_crumbs(record, category_pages):
    items = [("Inicio", "/"), (record["province"], province_path(record["province"]))]
    if (record["province"], record["category"]) in category_pages:
        items.append((category_plural(record["category"]), category_path(record["province"], record["category"])))
    items.append((record["name"], None))
    return items


def _sub(html_text, old, new, count=1):
    """Literal (non-regex) find/replace, asserting `old` was actually
    present - a silent no-op here would mean every page quietly shipped
    the homepage's own title/description instead of failing the build, the
    one failure mode worth never allowing."""
    assert old in html_text, f"build_monument_pages.py: expected exact text not found in index.html:\n{old[:200]}"
    return html_text.replace(old, new, count)


def set_head(shell, title, description, page_url, image, json_ld_blocks):
    """Swap the homepage's own <title>/description/canonical/og:*/twitter:*
    and JSON-LD in `shell` for one page's. `title` is already HTML-escaped,
    `description` is not. Every replacement asserts its anchor text is still
    there (see _sub()), so an edit to index.html's head that breaks this
    fails the build instead of shipping the homepage's tags on every page."""
    description_attr = html.escape(description, quote=True)
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
        '<meta name="description" content="Mapa interactivo de los Bienes de Interés Cultural (BIC) de Castilla y León: castillos, yacimientos arqueológicos, arte rupestre, conjuntos históricos, hórreos, rollos de justicia y más - cada uno enlazado con su ficha en Wikidata, su artículo en Wikipedia y sus fotos libres en Wikimedia Commons. Explora, con historia y fotografías, más de 2.500 monumentos protegidos según el catálogo oficial de la Junta de Castilla y León - datos abiertos, gratis, sin cuentas ni anuncios.">',
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
        '<meta property="og:description" content="Castillos, yacimientos arqueológicos, arte rupestre, conjuntos históricos y más de 2.500 monumentos protegidos de Castilla y León, enlazados con Wikidata, Wikipedia y Wikimedia Commons - con fotos, historia y datos abiertos de la Junta de Castilla y León.">',
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
        '<meta name="twitter:description" content="Castillos, yacimientos arqueológicos, arte rupestre, conjuntos históricos y más de 2.500 monumentos protegidos de Castilla y León, enlazados con Wikidata, Wikipedia y Wikimedia Commons.">',
        f'<meta name="twitter:description" content="{description_attr}">',
    )
    shell = _sub(
        shell,
        '<meta name="twitter:image" content="https://patrimonioabierto.es/assets/logo-readme.png">',
        f'<meta name="twitter:image" content="{image}">',
    )

    old_ld_start = shell.index('<script type="application/ld+json">')
    old_ld_end = shell.index("</script>", old_ld_start) + len("</script>")
    new_ld = "".join(
        '<script type="application/ld+json">' + json.dumps(block, ensure_ascii=False) + "</script>"
        for block in json_ld_blocks
    )
    return shell[:old_ld_start] + new_ld + shell[old_ld_end:]


def build_head(shell, record, extract, ambiguous=False, alt=(), extra_ld=()):
    title = html.escape(page_title(record, ambiguous))
    if extract:
        description = truncate(extract["extract"])
    else:
        description = truncate(
            f"{record['name']}, {category_noun(record['category'])} en {record['municipality']} "
            f"({record['province']}). Ficha con datos oficiales, Wikidata y fotos libres."
        )
    page_url = SITE_URL + page_path(record)
    image = commons_file_path(record.get("image_url"), 1200) or f"{SITE_URL}/assets/logo-readme.png"

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
    if alt:
        json_ld["alternateName"] = list(alt)
    if record.get("image_url"):
        json_ld["image"] = commons_file_path(record["image_url"], 1200)
    if same_as:
        json_ld["sameAs"] = same_as

    return set_head(shell, title, description, page_url, image, [json_ld, *extra_ld])


def build_panel_content(record, extract, nearby=(), aka=(), crumbs=""):
    name = html.escape(record["name"])
    icon = CATEGORY_ICONS.get(record["category"], DEFAULT_ICON)
    kicker = f"{icon} {html.escape(record['category'])}"
    meta_line = f"{html.escape(record['municipality'])} · {html.escape(record['province'])}"
    if record.get("protection_date"):
        meta_line += f" · BIC desde {html.escape(record['protection_date'])}"

    image_url = commons_file_path(record.get("image_url"), 800)
    alt = html.escape(f"{record['name']}, {record['municipality']} ({record['province']})", quote=True)
    if image_url:
        hero = (
            f'<div class="hero">'
            f'<img class="hero-img-bg" src="{image_url}" alt="" aria-hidden="true">'
            f'<img class="hero-img" src="{image_url}" alt="{alt}">'
            f'<div class="hero-scrim"><div class="hero-kicker">{kicker}</div><h1 class="hero-title">{name}</h1></div>'
            f"</div>"
        )
    else:
        hero = (
            f'<div class="hero hero-fallback">'
            f'<div class="hero-placeholder-icon">{icon}</div>'
            f'<div class="hero-scrim"><div class="hero-kicker">{kicker}</div><h1 class="hero-title">{name}</h1></div>'
            f"</div>"
        )

    body = [crumbs, f'<div class="meta">{meta_line}</div>', f'<p class="summary">{html.escape(build_summary(record))}</p>']
    if aka:
        names = ", ".join(f"<i>{html.escape(n)}</i>" for n in aka)
        body.append(f'<p class="aka">También conocido como: {names}.</p>')

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

    if nearby:
        rows = "".join(list_row(other, format_distance(km)) for other, km in nearby)
        body.append(f'<h3>Cerca de aquí</h3><ul class="list">{rows}</ul>')

    return hero + f'<div class="panel-body">{"".join(body)}</div>'


def build_page(shell_template, record, extract, nearby=(), ambiguous=False, alt=(), trail=()):
    page_url = SITE_URL + page_path(record)
    page = build_head(shell_template, record, extract, ambiguous, alt, [crumbs_ld(trail, page_url)] if trail else ())
    panel_content = build_panel_content(record, extract, nearby, alt, crumbs_html(trail) if trail else "")
    page = _sub(page, '<aside id="panel">', '<aside id="panel" class="open">')
    page = _sub(page, '<div id="panel-content"></div>', f'<div id="panel-content">{panel_content}</div>')
    return page


def listing_page(shell, title, description, path, panel, json_ld, province, category=None):
    """A listing page: the shell with `panel` pre-filled and open, like a
    monument page. data-static-province/-category tell app.js (see the
    bootstrap there) that this panel is the page's real content - to keep it
    instead of replacing it with the app's own province panel, so the links
    in it survive for a crawler that runs the page's JavaScript too."""
    page = set_head(shell, html.escape(title), description, SITE_URL + path, f"{SITE_URL}/assets/logo-readme.png", [json_ld])
    attrs = f' data-static-province="{html.escape(province, quote=True)}"'
    if category:
        attrs += f' data-static-category="{html.escape(category, quote=True)}"'
    page = _sub(page, '<aside id="panel">', '<aside id="panel" class="open">')
    return _sub(page, '<div id="panel-content"></div>', f'<div id="panel-content"{attrs}>{panel}</div>')


def listing_panel(kicker, title, body_html):
    hero = (
        '<div class="hero hero-fallback"><div class="hero-placeholder-icon">🗺️</div>'
        f'<div class="hero-scrim"><div class="hero-kicker">{html.escape(kicker)}</div>'
        f'<h1 class="hero-title">{html.escape(title)}</h1></div></div>'
    )
    return hero + f'<div class="panel-body">{body_html}</div>'


def link_items(items):
    """[(label, path or None, count)] -> <li>s; no path means no page exists,
    so the label stays plain text."""
    out = []
    for label, path, count in items:
        name = f'<a href="{path}">{html.escape(label)}</a>' if path else html.escape(label)
        out.append(f'<li>{name} <span class="meta">{count}</span></li>')
    return "".join(out)


def featured(recs):
    """A varied handful of well-documented monuments (photo and Wikipedia
    article), at most two per category, for a province's front page."""
    by_cat = defaultdict(list)
    for r in sorted(recs, key=lambda r: fold(r["name"])):
        if r.get("has_wikidata_image") and r.get("has_wikipedia_article"):
            by_cat[r["category"]].append(r)
    picked = []
    for round_ in range(2):
        for category in sorted(by_cat, key=lambda c: -len(by_cat[c])):
            if round_ < len(by_cat[category]) and len(picked) < FEATURED_COUNT:
                picked.append(by_cat[category][round_])
    return picked


def build_province_page(shell, province, recs, category_pages, provinces):
    """/provincia/<province>/ - what the province holds, with links down into
    its category pages and across to the other provinces."""
    path = province_path(province)
    url = SITE_URL + path
    by_cat = defaultdict(list)
    by_muni = defaultdict(int)
    for r in recs:
        by_cat[r["category"]].append(r)
        by_muni[r["municipality"]] += 1
    cats = sorted(by_cat, key=lambda c: (-len(by_cat[c]), c))
    trail = [("Inicio", "/"), (province, None)]

    summary = province_summary(province, recs)
    top_munis = sorted(by_muni.items(), key=lambda kv: (-kv[1], fold(kv[0])))[:TOP_MUNICIPALITIES]
    body = [
        crumbs_html(trail),
        f'<div class="meta">{len(recs)} bienes protegidos · {len(by_muni)} municipios</div>',
        f'<p class="summary">{html.escape(summary)}</p>',
        "<h2>Por categoría</h2>",
        '<ul class="page-links">'
        + link_items(
            [
                (
                    category_plural(c),
                    category_path(province, c) if (province, c) in category_pages else None,
                    len(by_cat[c]),
                )
                for c in cats
            ]
        )
        + "</ul>",
        "<h2>Municipios con más bienes</h2>",
        '<ul class="page-links">' + link_items([(m, None, n) for m, n in top_munis]) + "</ul>",
    ]
    picks = featured(recs)
    if picks:
        body += ["<h2>Bienes destacados</h2>", '<ul class="list">' + "".join(list_row(r, r["municipality"]) for r in picks) + "</ul>"]
    # Monuments whose category is too small for a page of its own would have
    # nothing linking to them but their neighbours; list them here so every
    # monument is reachable from its province.
    uncovered = [r for r in recs if (province, r["category"]) not in category_pages]
    if uncovered:
        rows = "".join(
            list_row(r, r["municipality"])
            for r in sorted(uncovered, key=lambda r: (fold(category_plural(r["category"])), fold(r["name"])))
        )
        body += ["<h2>Otros bienes protegidos</h2>", f'<ul class="list">{rows}</ul>']
    others = [(p, province_path(p), len(rs)) for p, rs in provinces.items() if p != province]
    body += ["<h2>Otras provincias</h2>", '<ul class="page-links">' + link_items(others) + "</ul>"]

    # As many of the biggest categories as fit in a meta description: a long
    # name ("yacimientos de arte rupestre") takes the room of a third one.
    for shown in (3, 2, 1):
        top = ", ".join(counted(len(by_cat[c]), c) for c in cats[:shown])
        description = (
            f"{len(recs)} bienes protegidos en {province}: {top} y más. Con fotos libres, Wikidata y Wikipedia."
        )
        if len(description) <= 157:
            break
    title = f"Bienes de Interés Cultural en {province} ({len(recs)}) - Patrimonio Abierto"
    heading = f"Patrimonio protegido en {province}"
    json_ld = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": heading,
        "description": description,
        "url": url,
        "isPartOf": {"@type": "WebSite", "name": "Patrimonio Abierto", "url": f"{SITE_URL}/"},
        "breadcrumb": crumbs_ld(trail, url),
    }
    panel = listing_panel("🗺️ Provincia", heading, "".join(body))
    return listing_page(shell, title, description, path, panel, json_ld, province)


def build_category_page(shell, province, category, recs, category_pages, provinces):
    """/provincia/<province>/<category>/ - every monument of one category in
    one province, grouped by municipality. The page that matches what people
    look for ("castillos de Burgos")."""
    path = category_path(province, category)
    url = SITE_URL + path
    plural = category_plural(category)
    by_muni = defaultdict(list)
    for r in recs:
        by_muni[r["municipality"]].append(r)
    trail = [("Inicio", "/"), (province, province_path(province)), (plural, None)]

    summary = category_summary(province, category, recs)
    body = [
        crumbs_html(trail),
        f'<div class="meta">{len(recs)} bienes · {len(by_muni)} municipios</div>',
        f'<p class="summary">{html.escape(summary)}</p>',
    ]
    for municipality in sorted(by_muni, key=fold):
        rows = "".join(list_row(r) for r in sorted(by_muni[municipality], key=lambda r: fold(r["name"])))
        body.append(f"<h2>{html.escape(municipality)}</h2><ul class=\"list\">{rows}</ul>")

    siblings = [
        (category_plural(c), category_path(province, c), len(rs))
        for (p, c), rs in sorted(category_pages.items(), key=lambda kv: -len(kv[1]))
        if p == province and c != category
    ]
    same_elsewhere = [
        (f"{plural} en {p}", category_path(p, c), len(rs))
        for (p, c), rs in sorted(category_pages.items())
        if c == category and p != province
    ]
    body += [f"<h2>Más de {html.escape(province)}</h2>", '<ul class="page-links">'
             + link_items([(f"Todo el patrimonio de {province}", province_path(province), len(provinces[province]))] + siblings)
             + "</ul>"]
    if same_elsewhere:
        body += [f"<h2>{html.escape(plural)} en otras provincias</h2>", '<ul class="page-links">' + link_items(same_elsewhere) + "</ul>"]

    title = f"{plural} en {province}: {len(recs)} bienes protegidos - Patrimonio Abierto"
    description = truncate(
        f"Lista de {counted(len(recs), category)} {'protegidas' if count_noun(category)[2] == 'f' else 'protegidos'} "
        f"como Bien de Interés Cultural en {province}, por municipio, con fotos libres y Wikidata."
    )
    heading = f"{plural} en {province}"
    ordered = sorted(recs, key=lambda r: (fold(r["municipality"]), fold(r["name"])))
    json_ld = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": heading,
        "description": description,
        "url": url,
        "isPartOf": {"@type": "WebSite", "name": "Patrimonio Abierto", "url": f"{SITE_URL}/"},
        "breadcrumb": crumbs_ld(trail, url),
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": len(ordered),
            "itemListElement": [
                {"@type": "ListItem", "position": i, "name": r["name"], "url": SITE_URL + page_path(r)}
                for i, r in enumerate(ordered, 1)
            ],
        },
    }
    panel = listing_panel(f"{CATEGORY_ICONS.get(category, DEFAULT_ICON)} {plural}", heading, "".join(body))
    return listing_page(shell, title, description, path, panel, json_ld, province, category)


def main():
    shell_template = open(INDEX_FILE, encoding="utf-8").read()
    records = json.load(open(DATASET_FILE, encoding="utf-8"))
    extracts = {}
    if os.path.exists(EXTRACTS_FILE):
        extracts = json.load(open(EXTRACTS_FILE, encoding="utf-8"))

    labels = {}
    if os.path.exists(LABELS_FILE):
        labels = json.load(open(LABELS_FILE, encoding="utf-8"))

    provinces = defaultdict(list)
    by_province_category = defaultdict(list)
    for record in records:
        provinces[record["province"]].append(record)
        by_province_category[(record["province"], record["category"])].append(record)
    category_pages = {key: recs for key, recs in by_province_category.items() if len(recs) >= MIN_CATEGORY_PAGE}

    titles = {}
    for record in records:
        titles.setdefault(page_title(record), []).append(record["jcyl_id"])
    ambiguous_ids = {i for ids in titles.values() if len(ids) > 1 for i in ids}

    os.makedirs(OUT_ROOT, exist_ok=True)
    written = []
    for record in records:
        extract = extracts.get(str(record["jcyl_id"]))
        page = build_page(
            shell_template, record, extract, nearby_records(record, records),
            record["jcyl_id"] in ambiguous_ids,
            alt_names(record, labels.get(str(record["jcyl_id"]))),
            record_crumbs(record, category_pages),
        )
        slug = f"{record['jcyl_id']}-{slugify(record['name'])}"
        out_dir = os.path.join(OUT_ROOT, slug)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(page)
        written.append(slug)

    # A monument JCyL drops from the catalogue keeps its folder here forever
    # otherwise: a live URL with the old title and text that no longer
    # matches anything. Only folders shaped like the ones written above and
    # holding nothing but their index.html are removed.
    stale = 0
    for entry in os.listdir(OUT_ROOT):
        path = os.path.join(OUT_ROOT, entry)
        if entry in written or not re.match(r"\d+-", entry) or not os.path.isdir(path):
            continue
        if os.listdir(path) == ["index.html"]:
            shutil.rmtree(path)
            stale += 1
    if stale:
        print(f"removed {stale} page(s) of monuments no longer in the catalogue")

    # The listing pages are all generated, nothing else lives under
    # /provincia/, so the folder is rebuilt from scratch: a category that
    # fell below MIN_CATEGORY_PAGE loses its page instead of keeping a stale one.
    shutil.rmtree(PROVINCIA_ROOT, ignore_errors=True)
    listing_paths = []
    for province, recs in sorted(provinces.items()):
        pages = [(province_path(province), build_province_page(shell_template, province, recs, category_pages, provinces))]
        for (p, category), cat_recs in sorted(category_pages.items()):
            if p == province:
                pages.append((category_path(p, category), build_category_page(shell_template, p, category, cat_recs, category_pages, provinces)))
        for path, page in pages:
            out_dir = os.path.join(WEB_DIR, path.strip("/"))
            os.makedirs(out_dir, exist_ok=True)
            with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
                f.write(page)
            listing_paths.append(path)
    print(f"wrote {len(listing_paths)} listing pages ({len(provinces)} provinces, {len(category_pages)} province x category) to {PROVINCIA_ROOT}")

    with_extract = sum(1 for r in records if str(r["jcyl_id"]) in extracts)
    print(f"wrote {len(written)} monument pages ({with_extract} with a Wikipedia extract) to {OUT_ROOT}")

    # Mirrors WRITTEN_PAGE_TYPES in web/app.js - these 5 have no static file
    # of their own (Caddyfile's try_files fallback hands them the SPA shell,
    # which then renders client-side), but they're real, crawlable URLs now
    # too, so they belong in the sitemap same as every monument page.
    written_pages = ["about", "contribute", "stats", "privacy", "imprint"]
    sitemap_urls = (
        [f"{SITE_URL}/"]
        + [f"{SITE_URL}/{page}/" for page in written_pages]
        + [f"{SITE_URL}{path}" for path in listing_paths]
        + [f"{SITE_URL}/monumento/{slug}/" for slug in written]
    )
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
