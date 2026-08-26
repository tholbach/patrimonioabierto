// CyLinked map.
//
// Architecture: the marker data (data/cyl_monuments_wikidata.json) is a
// static "spine" file built offline by scripts/build_dataset.py from the
// JCyL WFS + Wikidata SPARQL - see README. It's loaded once, in full, on
// page load. Wikipedia/Commons content is fetched live, per monument, only
// when its marker is actually clicked.
//
// i18n: STRINGS/t()/applyStaticI18n() live in i18n.js, loaded before this
// file.

const CATEGORY_ICONS = {
  'MONUMENTO': '🏛️',
  'CASTILLOS': '🏰',
  'HÓRREOS Y PALLOZAS': '🌾',
  'ARTE RUPESTRE': '🪨',
  'CONJUNTO HISTÓRICO': '🏘️',
  'ROLLOS DE JUSTICIA': '⚖️',
  'ZONA ARQUEOLÓGICA': '🏺',
  'CONJUNTO ETNOLÓGICO': '🪵',
  'ARCHIVOS, MUSEOS Y BIBLIOTECAS': '📚',
  'SITIO HISTÓRICO': '📍',
  'ESCUDOS': '🛡️',
  'PAISAJE CULTURAL': '🌄',
  'JARDÍN HISTÓRICO': '🌳',
  'HITOS FORALES': '🪧',
};
const DEFAULT_ICON = '📌';

// Commons file extensions worth showing in a photo gallery - excludes PDFs,
// DjVu scans, audio, etc. that also legitimately live in a monument's
// Commons category.
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|tiff?)$/i;

// bbox arrays from the dataset are GeoJSON-style [minlon, minlat, maxlon,
// maxlat] - Leaflet's flyToBounds wants [[lat, lon], [lat, lon]] instead.
function bboxToLeafletBounds(bbox) {
  const [minlon, minlat, maxlon, maxlat] = bbox;
  return [[minlat, minlon], [maxlat, maxlon]];
}

let recordsById = new Map(); // filled once data loads; used by deep-link handling
let allRecords = [];
let allMunicipalities = [];
let allProvinces = [];
let datasetMeta = null;

// Tracks what's currently shown in the panel so the language toggle can
// re-render it in place, instead of just relabeling the chrome around it.
let currentPanelState = null; // { type: 'monument', record } | { type: 'about' } | { type: 'contribute' } | null

// zoomControl: false + added separately at bottomleft, out of the way of
// the shuffle/locate buttons stacked at bottomright.
const map = L.map('map', { zoomControl: false }).setView([41.65, -4.7], 8); // roughly centered on Castilla y León
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// CARTO's light "Positron" style, not raw OSM tiles - a minimal basemap
// with muted labels/roads so our own markers and (eventually) photos are
// what actually draws the eye, rather than competing with a busy default
// OSM render. Free to use with attribution, no API key required.
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxZoom: 19,
  subdomains: 'abcd',
}).addTo(map);

function iconFor(record) {
  const emoji = CATEGORY_ICONS[record.category] || DEFAULT_ICON;
  const statusClass = record.already_linked ? 'linked' : 'missing';
  return L.divIcon({
    html: `<div class="monument-icon ${statusClass}">${emoji}</div>`,
    className: '', // suppress Leaflet's default icon styling/box
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });
}

// Clusters are colored by their own linked/missing ratio (green -> red),
// not Leaflet's default blue/yellow/orange-by-count - so even zoomed out,
// the map still reads as "where the documentation gaps are", not just
// "where the monuments are".
function clusterIcon(cluster) {
  const children = cluster.getAllChildMarkers();
  const missing = children.filter((m) => !m.record.already_linked).length;
  const ratio = missing / children.length; // 0 = fully linked, 1 = fully missing
  // teal (#1c8a6d, linked) -> terracotta (#c2703d, missing) - not the usual
  // red/green: "missing" isn't an error, it's an invitation to help, so an
  // alarm-red reads wrong here even before considering how dated it looks.
  const r = Math.round(0x1c + (0xc2 - 0x1c) * ratio);
  const g = Math.round(0x8a + (0x70 - 0x8a) * ratio);
  const b = Math.round(0x6d + (0x3d - 0x6d) * ratio);
  const size = children.length < 10 ? 34 : children.length < 100 ? 42 : 52;
  const borderStyle = ratio > 0.5 ? 'dashed' : 'solid'; // same non-color signal as individual markers
  return L.divIcon({
    html: `<div style="background: rgb(${r},${g},${b}); border-style: ${borderStyle}">${children.length}</div>`,
    className: 'cluster-icon',
    iconSize: [size, size],
  });
}

const markers = L.markerClusterGroup({
  iconCreateFunction: clusterIcon,
  maxClusterRadius: 50,
  spiderfyOnMaxZoom: true,
  // Default is true - draws a convex-hull polygon over a cluster's whole
  // spread on hover, which reads as noise more than information here.
  showCoverageOnHover: false,
  // Past this zoom, clustering turns off entirely so genuinely co-located
  // monuments (multiple protected elements in the same building/complex)
  // always render as individual markers instead of a cluster that never
  // seems to "finish" splitting apart as you zoom in.
  disableClusteringAtZoom: 18,
});
map.addLayer(markers);

// --- Panel open/close, with Leaflet size invalidation ----------------------

const panelEl = document.getElementById('panel');
const panelContentEl = document.getElementById('panel-content');

function openPanel() {
  const wasOpen = panelEl.classList.contains('open');
  panelEl.classList.add('open');
  if (!wasOpen) {
    // Leaflet needs to recompute its size once the layout transition that
    // shrinks/grows #map has actually finished, or tiles render into the
    // wrong area until the next manual pan/zoom.
    setTimeout(() => map.invalidateSize(), 260);
  }
}

function closePanel() {
  panelEl.classList.remove('open');
  setTimeout(() => map.invalidateSize(), 260);
  history.pushState(null, '', location.pathname);
  currentPanelState = null;
}

document.getElementById('panel-close').addEventListener('click', closePanel);

// --- Wikimedia API calls ----------------------------------------------------

async function fetchWikidataEntity(qid) {
  const resp = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const data = await resp.json();
  return data.entities[qid];
}

async function fetchWikipediaSummary(lang, title) {
  const resp = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  return resp.ok ? resp.json() : null;
}

// License/author + a direct link to the File: page for one Commons filename.
async function fetchImageMeta(filename) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo' +
    '&iiprop=extmetadata&format=json&origin=*&titles=' +
    encodeURIComponent('File:' + filename);
  const resp = await fetch(url);
  const data = await resp.json();
  const page = Object.values(data.query.pages)[0];
  const meta = page?.imageinfo?.[0]?.extmetadata || {};
  return {
    filename,
    thumbUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=500`,
    pageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
    artistHtml: meta.Artist?.value || null,
    license: meta.LicenseShortName?.value || null,
    licenseUrl: meta.LicenseUrl?.value || null,
  };
}

// Other photos in the monument's Commons category, if it has one (P373) -
// filtered to actual image files, excluding whatever's already the main
// P18 image so the gallery doesn't just repeat it.
//
// Some categories are nearly empty at the top level with almost all media
// filed under subcategories instead (split by year, by feature, "Interior
// of X", ...) - so this walks the subcategory tree breadth-first rather
// than only looking at the named category itself. Depth and total API
// calls are both capped, and it stops as soon as it has enough files, so
// the common case (main category already has plenty) costs exactly the
// one request it always did.
async function fetchGalleryFiles(categoryName, excludeFilename) {
  const MAX_FILES = 24;
  const MAX_DEPTH = 3;
  const MAX_REQUESTS = 15; // total categorymembers calls across the whole walk

  const seenCategories = new Set([categoryName]);
  const seenFiles = new Set();
  const files = [];
  const queue = [{ name: categoryName, depth: 0 }];
  let requestsMade = 0;

  while (queue.length && files.length < MAX_FILES && requestsMade < MAX_REQUESTS) {
    const { name, depth } = queue.shift();
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers' +
      '&cmtype=file|subcat&cmprop=title|type&cmlimit=50&format=json&origin=*&cmtitle=' +
      encodeURIComponent('Category:' + name);
    requestsMade++;
    let members;
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      members = data.query?.categorymembers || [];
    } catch (e) {
      continue; // one bad subcat request shouldn't sink the whole gallery
    }

    for (const m of members) {
      if (m.type === 'subcat') {
        const subName = m.title.replace(/^Category:/, '');
        if (depth < MAX_DEPTH && !seenCategories.has(subName)) {
          seenCategories.add(subName);
          queue.push({ name: subName, depth: depth + 1 });
        }
      } else {
        const title = m.title.replace(/^File:/, '');
        if (IMAGE_EXTENSIONS.test(title) && title !== excludeFilename && !seenFiles.has(title)) {
          seenFiles.add(title);
          files.push(title);
        }
      }
    }
  }

  return files.slice(0, MAX_FILES);
}

// Batched label lookup for entity-valued properties (architect, style,
// "part of", heritage designation all point at other Wikidata items by
// QID, not a plain readable value) - one call for all of them together,
// not one call per property.
async function fetchLabels(qids) {
  if (!qids.length) return {};
  const url =
    'https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels' +
    `&languages=${currentLang}|es|en&format=json&origin=*&ids=${qids.join('|')}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const out = {};
  for (const [qid, e] of Object.entries(data.entities || {})) {
    out[qid] = e.labels?.[currentLang]?.value || e.labels?.es?.value || e.labels?.en?.value || qid;
  }
  return out;
}

function ordinalSuffix(n) {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

// Wikidata time values encode precision (7=century, 8=decade, 9=year,
// 10=month, 11=day) - a monument "built in the 1200s" shouldn't be
// rendered as a false-precision exact date.
function formatWikidataDate(dv) {
  const match = dv?.time?.match(/^([+-]\d+)-\d{2}-\d{2}/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (dv.precision >= 9) return String(year);
  if (dv.precision === 8) {
    const decade = Math.floor(year / 10) * 10;
    return currentLang === 'en' ? `${decade}s` : `década de ${decade}`;
  }
  if (dv.precision === 7) {
    const century = Math.ceil(year / 100);
    return currentLang === 'en' ? `${century}${ordinalSuffix(century)} century` : `siglo ${century}`;
  }
  return String(year);
}

// Extracts (icon, label key, value) rows for whichever of these commonly-
// populated properties the item actually has - most items won't have all
// of them, rows are just omitted rather than shown empty.
function buildFacts(entity, labelsMap) {
  const facts = [];
  const architect = entity.claims?.P84?.[0]?.mainsnak?.datavalue?.value;
  if (architect) facts.push({ icon: '✏️', labelKey: 'facts.architect', value: labelsMap[architect.id] });

  const styles = (entity.claims?.P149 || [])
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean)
    .map((id) => labelsMap[id])
    .filter(Boolean);
  if (styles.length) facts.push({ icon: '🏛️', labelKey: 'facts.style', value: styles.join(', ') });

  const inception = formatWikidataDate(entity.claims?.P571?.[0]?.mainsnak?.datavalue?.value);
  if (inception) facts.push({ icon: '🕰️', labelKey: 'facts.inception', value: inception });

  const designation = entity.claims?.P1435?.[0]?.mainsnak?.datavalue?.value;
  if (designation && labelsMap[designation.id]) {
    facts.push({ icon: '🛡️', labelKey: 'facts.heritage_designation', value: labelsMap[designation.id] });
  }

  const partOf = entity.claims?.P361?.[0]?.mainsnak?.datavalue?.value;
  if (partOf && labelsMap[partOf.id]) {
    facts.push({ icon: '🧩', labelKey: 'facts.part_of', value: labelsMap[partOf.id] });
  }

  return facts;
}

function renderFacts(facts) {
  if (!facts.length) return '';
  const rows = facts
    .map((f) => `<div class="fact-row"><span class="fact-icon">${f.icon}</span><span class="fact-label">${t(f.labelKey)}</span><span class="fact-value">${f.value}</span></div>`)
    .join('');
  return `<div class="facts">${rows}</div>`;
}

// --- Rendering: monument panel ----------------------------------------------

// Category (+ emoji) overlays the hero image itself; municipality/province/
// date sit below it in the body - splitting these because the hero has room
// for a short label, not a full metadata line.
function heroKicker(record) {
  const emoji = CATEGORY_ICONS[record.category] || DEFAULT_ICON;
  return `${emoji} ${record.category}`;
}

function bodyMetaLine(record) {
  let line = `${record.municipality} · ${record.province}`;
  if (record.protection_date) {
    line += ` · ${t('protection.since')} ${record.protection_date}`;
  }
  return line;
}

function shareUrl(record) {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ id: record.jcyl_id }).toString();
  return url.toString();
}

// Small inline SVG (currentColor, so each badge's own text color applies
// automatically) instead of emoji - "share" read as more playful than
// intended next to the plainer JCyL/Wikidata/Wikipedia badges. No icon
// font/library added just for one glyph.
const ICON_SHARE =
  '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><g fill="currentColor"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/></g><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="8.3" y1="10.6" x2="15.7" y2="6.5"/><line x1="8.3" y1="13.4" x2="15.7" y2="17.5"/></g></svg>';

// Real Wikidata marks, not approximations - Wikidata's is the actual
// Commons file (commons.wikimedia.org/wiki/File:Wikidata-logo.svg, paths
// copied verbatim, just given a small display size), in its real brand
// colors rather than currentColor since it's a recognizable multi-color
// mark, not meant to be recolored. Wikipedia's actual simplified mark
// (its real favicon/touch-icon, verified by fetching it) is just a bold
// serif "W" - rendered as text in the same Fraunces family already used
// for the brand wordmark, rather than a hand-traced path of a complex
// logo I can't verify pixel-for-pixel.
const ICON_WIKIDATA =
  '<svg viewBox="0 0 1050 590" width="18" height="10" aria-hidden="true"><path d="m 120,545 h 30 V 45 H 120 V 545 z m 60,0 h 90 V 45 H 180 V 545 z M 300,45 V 545 h 90 V 45 h -90 z" fill="#990000"/><path d="m 840,545 h 30 V 45 H 840 V 545 z M 900,45 V 545 h 30 V 45 H 900 z M 420,545 h 30 V 45 H 420 V 545 z M 480,45 V 545 h 30 V 45 h -30 z" fill="#339966"/><path d="m 540,545 h 90 V 45 h -90 V 545 z m 120,0 h 30 V 45 H 660 V 545 z M 720,45 V 545 h 90 V 45 H 720 z" fill="#006699"/></svg>';
const ICON_WIKIPEDIA = '<span class="wiki-w-icon">W</span>';

function shareButtonHtml() {
  return `<button class="badge share-btn" id="share-btn" type="button">${ICON_SHARE}${t('badge.share')}</button>`;
}

function wireShareButton(record) {
  const btn = document.getElementById('share-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const url = shareUrl(record);
    try {
      if (navigator.share) {
        await navigator.share({ title: record.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      const original = btn.textContent;
      btn.textContent = t('badge.share.copied');
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch (err) {
      // user cancelled navigator.share, or clipboard denied - not an error worth surfacing
    }
  });
}

function linkBadges(record, sitelink) {
  const qid = Array.isArray(record.wikidata_qid) ? record.wikidata_qid[0] : record.wikidata_qid;
  // JCyL first - they're the ones judging this, their own record deserves
  // top billing over our own share button and the other sources.
  let html = '<div class="link-badges">';
  html += `<a class="badge jcyl" href="${record.reference_url}" target="_blank" rel="noopener">${t('badge.jcyl')}</a>`;
  if (qid) {
    html += `<a class="badge wikidata" href="https://www.wikidata.org/wiki/${qid}" target="_blank" rel="noopener">${ICON_WIKIDATA}${t('badge.wikidata')}</a>`;
  }
  if (sitelink) {
    html += `<a class="badge wikipedia" href="${sitelink.url}" target="_blank" rel="noopener">${ICON_WIKIPEDIA}${t('badge.wikipedia')}</a>`;
  }
  html += shareButtonHtml();
  html += '</div>';
  return html;
}

// A full-bleed hero at the top of every panel (monument, About, Contribute
// alike) - Commons photos are what this project actually has to show off,
// so they get the whole width instead of a small boxed-in thumbnail. Panels
// with no photo (About/Contribute, or a monument with genuinely no image
// anywhere) fall back to a plain gradient in the same spot, so every panel
// still opens with the same visual rhythm.
function heroBlock({ imageUrl, linkUrl, kicker, title, placeholderIcon }) {
  const scrim = `
    <div class="hero-scrim">
      ${kicker ? `<div class="hero-kicker">${kicker}</div>` : ''}
      <h2 class="hero-title">${title}</h2>
    </div>
  `;
  if (!imageUrl) {
    // Category-appropriate large watermark instead of a flat gradient -
    // reuses the same emoji already used for map markers, so a castle with
    // no photo still visually reads as "castle" rather than looking like a
    // generic empty/broken state.
    const icon = placeholderIcon ? `<div class="hero-placeholder-icon">${placeholderIcon}</div>` : '';
    return `<div class="hero hero-fallback">${icon}${scrim}</div>`;
  }
  const img = `<img id="main-image" class="hero-img" src="${imageUrl}" alt="">`;
  const imgEl = linkUrl
    ? `<a href="${linkUrl}" target="_blank" rel="noopener" id="main-image-link">${img}</a>`
    : img;
  return `<div class="hero">${imgEl}${scrim}</div>`;
}

// Only description/descriptionlang/categories/lat/lon are real, working
// UploadWizard query params without a registered campaign (verified against
// Commons:Upload Wizard/Fields prefilling) - notably NOT a Wikidata QID or
// "depicts" statement, which needs either a manual step after upload or a
// registered campaign (a real Commons permissions process). lat/lon here
// are legitimate: they're the monument's own coordinates, i.e. genuinely
// where the photo would be taken.
function uploadWizardUrl(record, commonsCategory) {
  const params = new URLSearchParams({
    descriptionlang: currentLang,
    description: record.name,
    lat: record.lat,
    lon: record.lon,
  });
  if (commonsCategory) params.set('categories', commonsCategory);
  return `https://commons.wikimedia.org/wiki/Special:UploadWizard?${params.toString()}`;
}

function licenseLineHtml(meta) {
  if (!meta) return '';
  return meta.license
    ? `${meta.artistHtml ? meta.artistHtml + ' · ' : ''}<a href="${meta.licenseUrl || meta.pageUrl}" target="_blank" rel="noopener">${meta.license}</a>`
    : (meta.artistHtml || '');
}

async function swapMainImage(filename) {
  const mainImageEl = document.getElementById('main-image');
  const mainImageLinkEl = document.getElementById('main-image-link');
  const captionEl = document.getElementById('image-caption');
  if (!mainImageEl) return;
  if (captionEl) captionEl.textContent = t('loading');
  try {
    const meta = await fetchImageMeta(filename);
    mainImageEl.src = meta.thumbUrl;
    if (mainImageLinkEl) mainImageLinkEl.href = meta.pageUrl;
    if (captionEl) captionEl.innerHTML = licenseLineHtml(meta);
  } catch (err) {
    if (captionEl) captionEl.textContent = '';
  }
}

function renderGallery(files) {
  if (!files.length) return '';
  const thumbs = files
    .slice(0, 12)
    .map(
      (f) =>
        `<img src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=100"
              alt="" data-filename="${f.replace(/"/g, '&quot;')}">`
    )
    .join('');
  return `<div class="gallery">${thumbs}</div>`;
}

async function selectMonument(record, { flyTo = false, updateUrl = true } = {}) {
  currentPanelState = { type: 'monument', record };

  panelContentEl.innerHTML = `
    ${heroBlock({ kicker: heroKicker(record), title: record.name, placeholderIcon: CATEGORY_ICONS[record.category] || DEFAULT_ICON })}
    <div class="panel-body">
      <div class="meta">${bodyMetaLine(record)}</div>
      <div class="loading">${t('loading')}</div>
    </div>
  `;
  openPanel();

  if (updateUrl) {
    history.pushState(null, '', shareUrl(record));
  }
  if (flyTo) {
    map.flyTo([record.lat, record.lon], Math.max(map.getZoom(), 14));
  }

  if (!record.already_linked) {
    panelContentEl.querySelector('.loading').outerHTML = `
      <div class="missing-note">${t('missing.note')}</div>
      <div class="link-badges"><a class="badge jcyl" href="${record.reference_url}" target="_blank" rel="noopener">${t('badge.jcyl')}</a>${shareButtonHtml()}</div>
      ${renderNearby(record)}
    `;
    wireShareButton(record);
    wireMonumentListRows(panelContentEl);
    return;
  }

  const qid = Array.isArray(record.wikidata_qid) ? record.wikidata_qid[0] : record.wikidata_qid;

  try {
    const entity = await fetchWikidataEntity(qid);
    // Prefer whichever Wikipedia edition matches the current UI language,
    // falling back to the other if that edition has no article.
    const preferred = currentLang === 'en' ? entity.sitelinks?.enwiki : entity.sitelinks?.eswiki;
    const fallback = currentLang === 'en' ? entity.sitelinks?.eswiki : entity.sitelinks?.enwiki;
    const sitelink = preferred || fallback;
    const sitelinkLang = sitelink === entity.sitelinks?.enwiki ? 'en' : 'es';
    const p18 = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    const commonsCategory = entity.claims?.P373?.[0]?.mainsnak?.datavalue?.value;

    // Architect/style/heritage-designation/part-of all reference other
    // Wikidata items by QID - collect them once so the label lookup below
    // is a single batched call, not one request per property.
    const referencedQids = new Set();
    const architectId = entity.claims?.P84?.[0]?.mainsnak?.datavalue?.value?.id;
    if (architectId) referencedQids.add(architectId);
    (entity.claims?.P149 || []).forEach((c) => {
      const id = c.mainsnak?.datavalue?.value?.id;
      if (id) referencedQids.add(id);
    });
    const partOfId = entity.claims?.P361?.[0]?.mainsnak?.datavalue?.value?.id;
    if (partOfId) referencedQids.add(partOfId);
    const designationId = entity.claims?.P1435?.[0]?.mainsnak?.datavalue?.value?.id;
    if (designationId) referencedQids.add(designationId);

    let [summary, mainImageMeta, galleryFiles, labelsMap] = await Promise.all([
      sitelink ? fetchWikipediaSummary(sitelinkLang, sitelink.title) : null,
      p18 ? fetchImageMeta(p18) : null,
      commonsCategory ? fetchGalleryFiles(commonsCategory, p18) : Promise.resolve([]),
      fetchLabels([...referencedQids]),
    ]);
    const facts = buildFacts(entity, labelsMap);

    // No P18 but the Commons category has photos anyway - promote the
    // first one to the main slot rather than showing an orphan gallery
    // with nothing to swap into.
    if (!mainImageMeta && galleryFiles.length) {
      mainImageMeta = await fetchImageMeta(galleryFiles[0]);
      galleryFiles = galleryFiles.slice(1);
    }

    // Caption (and the upload CTA, when there's no photo at all) come first
    // - both are about the photo slot directly above them, so they belong
    // immediately under the hero, not buried after the facts panel.
    let bodyHtml = '';
    if (mainImageMeta) {
      bodyHtml += `<div class="image-caption" id="image-caption">${licenseLineHtml(mainImageMeta)}</div>`;
    } else {
      // Has a Wikidata item but genuinely no photo anywhere (no P18, no
      // Commons category images either) - this is exactly the case worth a
      // direct call to action, prefilled with what we can legitimately
      // prefill without a registered UploadWizard campaign (description,
      // language, the monument's own coordinates). "depicts <QID>" can't be
      // preset this way - that needs either a manual step after upload, or
      // a registered campaign (a real Commons permissions process, out of
      // scope here) - so the CTA text says so rather than implying it's automatic.
      bodyHtml += `
        <div class="upload-cta">
          <div class="upload-cta-text">${t('upload_cta.text')}</div>
          <a class="badge upload-cta-btn" href="${uploadWizardUrl(record, commonsCategory)}" target="_blank" rel="noopener">${t('contribute.upload.button')}</a>
        </div>
      `;
    }
    bodyHtml += `<div class="meta">${bodyMetaLine(record)}</div>`;
    bodyHtml += renderFacts(facts);
    if (record.wikidata_conflict) {
      bodyHtml += `<div class="missing-note">⚠ jcyl_id: ${record.wikidata_qid.join(', ')}</div>`;
    }
    bodyHtml += renderGallery(galleryFiles);
    if (summary?.extract) {
      bodyHtml += `<div class="extract">${summary.extract}</div>`;
      bodyHtml += `<a class="read-more-link" href="${sitelink.url}" target="_blank" rel="noopener">${t('wikipedia.read_more')}</a>`;
      // Wording mirrors Wikipedia's own article-footer attribution, not
      // invented phrasing - satisfies what CC BY-SA actually requires:
      // attribution, share-alike notice, and a link to the license itself.
      // Articles are a mix of pre-/post-2023-06-01 edits (3.0 vs 4.0), so
      // linking the general 4.0 license page (Wikipedia's own current
      // default) is the standard, safe choice rather than asserting one
      // exact version for the whole article.
      bodyHtml += `<div class="text-license">${t('text_license.note', sitelink?.url)}</div>`;
    }
    bodyHtml += linkBadges(record, sitelink);
    bodyHtml += renderNearby(record);

    panelContentEl.innerHTML = `
      ${heroBlock({
        imageUrl: mainImageMeta?.thumbUrl,
        linkUrl: mainImageMeta?.pageUrl,
        kicker: heroKicker(record),
        title: record.name,
        placeholderIcon: CATEGORY_ICONS[record.category] || DEFAULT_ICON,
      })}
      <div class="panel-body">${bodyHtml}</div>
    `;

    panelContentEl.querySelectorAll('.gallery img').forEach((img) => {
      img.addEventListener('click', () => swapMainImage(img.dataset.filename));
    });
    wireShareButton(record);
    wireMonumentListRows(panelContentEl);
  } catch (err) {
    console.error(err);
    panelContentEl.innerHTML = `
      ${heroBlock({ kicker: heroKicker(record), title: record.name, placeholderIcon: CATEGORY_ICONS[record.category] || DEFAULT_ICON })}
      <div class="panel-body">
        <div class="meta">${bodyMetaLine(record)}</div>
        <div class="missing-note">${t('error.note')}</div>
        ${linkBadges(record, null)}
        ${renderNearby(record)}
      </div>
    `;
    wireShareButton(record);
    wireMonumentListRows(panelContentEl);
  }
}

// --- Rendering: Stats panel --------------------------------------------

async function fetchHistory() {
  const resp = await fetch('data/history.json');
  return resp.ok ? resp.json() : [];
}

// Hand-rolled inline SVG line chart - no charting library needed for two
// simple series. Y-axis is scaled to the current total, not the max of the
// series, so the lines' distance from the top visually reads as "how far
// from 100% coverage", not just relative growth.
const CHART_W = 400, CHART_H = 160, CHART_PAD = 20;

function chartGeometry(historyData, total) {
  const maxY = total || Math.max(...historyData.map((h) => h.total));
  const xStep = (CHART_W - CHART_PAD * 2) / (historyData.length - 1);
  const xFor = (i) => CHART_PAD + i * xStep;
  const yFor = (v) => CHART_H - CHART_PAD - (v / maxY) * (CHART_H - CHART_PAD * 2);
  return { xStep, xFor, yFor };
}

function renderHistoryChart(historyData, total) {
  if (historyData.length < 2) {
    return `<div class="stats-chart-empty">${t('stats.chart_empty')}</div>`;
  }
  const { xStep, xFor, yFor } = chartGeometry(historyData, total);

  const linkedPoints = historyData.map((h, i) => `${xFor(i)},${yFor(h.linked)}`).join(' ');
  const imagePoints = historyData.map((h, i) => `${xFor(i)},${yFor(h.with_image)}`).join(' ');
  // One invisible full-height hit rect per data point - hovering anywhere in
  // its column (not just exactly on the line) triggers that point's tooltip.
  const hitRects = historyData
    .map((h, i) => `<rect class="stats-chart-hit" data-i="${i}" x="${xFor(i) - xStep / 2}" y="0" width="${xStep}" height="${CHART_H}" />`)
    .join('');

  return `
    <div class="stats-chart-wrap">
      <svg class="stats-chart" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none">
        <polyline points="${linkedPoints}" fill="none" stroke="#1c8a6d" stroke-width="2.5" />
        <polyline points="${imagePoints}" fill="none" stroke="#742c64" stroke-width="2.5" />
        <line class="stats-chart-guide" x1="0" x2="0" y1="${CHART_PAD}" y2="${CHART_H - CHART_PAD}" />
        <circle class="stats-chart-dot linked" cx="0" cy="0"></circle>
        <circle class="stats-chart-dot image" cx="0" cy="0"></circle>
        ${hitRects}
      </svg>
      <div class="stats-chart-tooltip"></div>
      <div class="stats-chart-axis"><span>${historyData[0].date}</span><span>${historyData[historyData.length - 1].date}</span></div>
      <div class="stats-chart-legend">
        <span><span class="legend-swatch linked"></span>${t('stats.legend_linked')}</span>
        <span><span class="legend-swatch image"></span>${t('stats.legend_image')}</span>
      </div>
    </div>
  `;
}

// Mouse-over: shows date, count, share of total and the percentage-point
// change since the previous snapshot for both series. Positioned in real
// pixel space (converting the viewBox's fixed units via the SVG's actual
// on-screen size) so the tooltip sits right above the hovered point
// regardless of how wide the panel currently is.
function wireHistoryChart(wrapEl, historyData, total) {
  const svg = wrapEl.querySelector('.stats-chart');
  const tooltip = wrapEl.querySelector('.stats-chart-tooltip');
  const guide = wrapEl.querySelector('.stats-chart-guide');
  const dotLinked = wrapEl.querySelector('.stats-chart-dot.linked');
  const dotImage = wrapEl.querySelector('.stats-chart-dot.image');
  const { xFor, yFor } = chartGeometry(historyData, total);

  const pctOf = (value, entry) => (entry.total ? (value / entry.total) * 100 : 0);
  const fmtNum = (n) => n.toLocaleString(currentLang);
  const fmtPct = (n) => n.toLocaleString(currentLang, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  function deltaHtml(i, key) {
    if (i === 0) return `<span class="tt-delta">· ${t('stats.tooltip_first')}</span>`;
    const now = pctOf(historyData[i][key], historyData[i]);
    const prev = pctOf(historyData[i - 1][key], historyData[i - 1]);
    const d = now - prev;
    const sign = d > 0 ? '+' : '';
    return `<span class="tt-delta ${d < 0 ? 'down' : ''}">${sign}${fmtPct(d)} ${t('stats.tooltip_pts')}</span>`;
  }

  function showFor(i) {
    const h = historyData[i];
    const x = xFor(i);
    const yLinked = yFor(h.linked);
    const yImage = yFor(h.with_image);

    guide.setAttribute('x1', x);
    guide.setAttribute('x2', x);
    guide.style.opacity = 1;
    dotLinked.setAttribute('cx', x);
    dotLinked.setAttribute('cy', yLinked);
    dotImage.setAttribute('cx', x);
    dotImage.setAttribute('cy', yImage);
    dotLinked.setAttribute('r', 4);
    dotImage.setAttribute('r', 4);

    // Built from y/m/d directly (not `new Date(h.date)`) - a plain
    // "YYYY-MM-DD" string parses as UTC midnight, which toLocaleDateString
    // can then roll back a day in timezones west of UTC.
    const [y, mo, d] = h.date.split('-').map(Number);
    const dateLabel = new Date(y, mo - 1, d).toLocaleDateString(currentLang, { day: 'numeric', month: 'short', year: 'numeric' });

    tooltip.innerHTML = `
      <div class="tt-date">${dateLabel}</div>
      <div class="tt-row"><span class="tt-dot linked"></span>${t('stats.legend_linked')}: ${fmtNum(h.linked)} (${fmtPct(pctOf(h.linked, h))}%) ${deltaHtml(i, 'linked')}</div>
      <div class="tt-row"><span class="tt-dot image"></span>${t('stats.legend_image')}: ${fmtNum(h.with_image)} (${fmtPct(pctOf(h.with_image, h))}%) ${deltaHtml(i, 'with_image')}</div>
    `;

    // Viewport coordinates (position: fixed - see the CSS comment for why),
    // not relative to the wrap - the svg also scales its viewBox
    // non-uniformly (preserveAspectRatio="none" above), so pixel position
    // has to go through its actual rendered size rather than viewBox units.
    const svgRect = svg.getBoundingClientRect();
    const scaleX = svgRect.width / CHART_W;
    const scaleY = svgRect.height / CHART_H;
    const topY = svgRect.top + Math.min(yLinked, yImage) * scaleY;
    const bottomY = svgRect.top + Math.max(yLinked, yImage) * scaleY;
    let pxX = svgRect.left + x * scaleX;

    // Measure with the tooltip already sized (content is set above) but
    // before locking in a direction, then clamp/flip so it can never run
    // off any edge of the actual viewport.
    const margin = 8;
    const ttRect = tooltip.getBoundingClientRect();
    const halfW = ttRect.width / 2;
    pxX = Math.min(Math.max(pxX, margin + halfW), window.innerWidth - margin - halfW);

    const fitsAbove = topY - ttRect.height - 10 >= margin;
    tooltip.classList.toggle('above', fitsAbove);
    tooltip.classList.toggle('below', !fitsAbove);
    tooltip.style.left = `${pxX}px`;
    tooltip.style.top = `${fitsAbove ? topY : bottomY}px`;
    tooltip.classList.add('visible');
  }

  function hide() {
    guide.style.opacity = 0;
    dotLinked.setAttribute('r', 0);
    dotImage.setAttribute('r', 0);
    tooltip.classList.remove('visible');
  }

  wrapEl.querySelectorAll('.stats-chart-hit').forEach((rect) => {
    const i = Number(rect.dataset.i);
    rect.addEventListener('mouseenter', () => showFor(i));
    rect.addEventListener('touchstart', (e) => { e.preventDefault(); showFor(i); }, { passive: false });
  });
  svg.addEventListener('mouseleave', hide);
  wrapEl.addEventListener('touchend', hide);
}

async function showStatsPanel({ updateUrl = true } = {}) {
  currentPanelState = { type: 'stats' };
  const total = allRecords.length;
  const linked = allRecords.filter((r) => r.already_linked).length;
  const withImage = allRecords.filter((r) => r.has_wikidata_image).length;
  const linkedPct = total ? Math.round((linked / total) * 100) : 0;
  const imagePct = total ? Math.round((withImage / total) * 100) : 0;

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('stats.title'), placeholderIcon: '📊' })}
    <div class="panel-body">
      <div class="extract stats-mission">${t('stats.mission')}</div>
      <div class="stats-numbers">
        <div class="stat-box"><div class="stat-value">${total}</div><div class="stat-label">${t('stats.total')}</div></div>
        <div class="stat-box"><div class="stat-value">${linked} <span class="stat-pct">${linkedPct}%</span></div><div class="stat-label">${t('stats.linked')}</div></div>
        <div class="stat-box"><div class="stat-value">${withImage} <span class="stat-pct">${imagePct}%</span></div><div class="stat-label">${t('stats.with_image')}</div></div>
      </div>
      <h3>${t('stats.history_title')}</h3>
      <div class="loading">${t('loading')}</div>
    </div>
  `;
  openPanel();
  if (updateUrl) history.pushState(null, '', '#stats');

  const historyData = await fetchHistory();
  const loadingEl = panelContentEl.querySelector('.loading');
  if (loadingEl) loadingEl.outerHTML = renderHistoryChart(historyData, total);
  const chartWrap = panelContentEl.querySelector('.stats-chart-wrap');
  if (chartWrap) wireHistoryChart(chartWrap, historyData, total);
}

// --- Rendering: About / Contribute panels -----------------------------------

function showAboutPanel({ updateUrl = true } = {}) {
  currentPanelState = { type: 'about' };
  const total = allRecords.length;
  const linked = allRecords.filter((r) => r.already_linked).length;
  const pct = total ? Math.round((linked / total) * 100) : 0;

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('about.title'), placeholderIcon: 'ℹ️' })}
    <div class="panel-body">
      <div class="extract">${t('about.intro', linked, total, pct)}</div>
      ${datasetMeta ? `<div class="meta">${t('about.updated', new Date(datasetMeta.generated_at).toLocaleDateString(currentLang))}</div>` : ''}
      <h3>${t('about.sources.title')}</h3>
      <ul class="source-list">
        <li>${t('about.sources.jcyl')}</li>
        <li>${t('about.sources.wikidata')}</li>
        <li>${t('about.sources.commons')}</li>
        <li>${t('about.sources.wikipedia')}</li>
      </ul>
      <h3>${t('about.methodology.title')}</h3>
      <div class="extract">${t('about.methodology.body')}</div>
    </div>
  `;
  openPanel();
  if (updateUrl) history.pushState(null, '', '#about');
}

function showContributePanel({ updateUrl = true } = {}) {
  currentPanelState = { type: 'contribute' };

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('contribute.title'), placeholderIcon: '🤝' })}
    <div class="panel-body">
      <div class="extract">${t('contribute.intro')}</div>
      <h3>${t('contribute.reconcile.title')}</h3>
      <div class="extract">${t('contribute.reconcile.body')}</div>
      <h3>${t('contribute.photos.title')}</h3>
      <div class="extract">${t('contribute.photos.body')}</div>
      <div class="link-badges">
        <a class="badge wikidata" href="https://commons.wikimedia.org/wiki/Special:UploadWizard" target="_blank" rel="noopener">${t('contribute.upload.button')}</a>
      </div>
    </div>
  `;
  openPanel();
  if (updateUrl) history.pushState(null, '', '#contribute');
}

// --- Rendering: Municipality / Province panels ------------------------------

function monumentListItemHtml(record, subValue) {
  const emoji = CATEGORY_ICONS[record.category] || DEFAULT_ICON;
  const statusClass = record.already_linked ? 'linked' : 'missing';
  // Thumbnail when we already know the filename (from the bulk SPARQL
  // pull, not a per-row fetch) - falls back to the emoji dot for anything
  // without a photo, same as before. loading="lazy" so rows off-screen
  // (e.g. a long municipality list) don't all fetch at once.
  const icon = record.image_url
    ? `<img class="list-row-thumb" src="${record.image_url}?width=64" alt="" loading="lazy">`
    : `<span class="list-row-icon ${statusClass}">${emoji}</span>`;
  return `
    <li class="list-row" data-jcyl-id="${record.jcyl_id}">
      ${icon}
      <span class="list-row-name">${record.name}</span>
      ${subValue ? `<span class="list-row-stat">${subValue}</span>` : ''}
    </li>
  `;
}

function wireMonumentListRows(container) {
  container.querySelectorAll('.list-row[data-jcyl-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const record = recordsById.get(row.dataset.jcylId);
      if (record) selectMonument(record, { flyTo: true });
    });
  });
}

// Haversine great-circle distance in km - accurate enough at this scale
// (a province is ~100km across), no need for anything more sophisticated.
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function nearbyMonuments(record, count = 5) {
  return allRecords
    .filter((r) => r.jcyl_id !== record.jcyl_id)
    .map((r) => ({ r, dist: haversineDistanceKm(record.lat, record.lon, r.lat, r.lon) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, count);
}

// Pure client-side math against data already loaded - no API call needed,
// which is exactly why this is cheap to add to every monument panel
// (linked or not) as a way to keep exploration going past one click.
function renderNearby(record) {
  const nearby = nearbyMonuments(record);
  if (!nearby.length) return '';
  const rows = nearby.map(({ r, dist }) => monumentListItemHtml(r, formatDistance(dist))).join('');
  return `<h3>${t('nearby.title')}</h3><ul class="list">${rows}</ul>`;
}

function municipalityShareUrl(muni) {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ muni: muni.ine_code_p772 }).toString();
  return url.toString();
}

function showMunicipalityPanel(muni, { flyTo = false, updateUrl = true } = {}) {
  currentPanelState = { type: 'municipality', muni };

  // Missing-first, then alphabetical - keeps the "here's what needs help"
  // framing consistent with the rest of the app rather than just listing
  // alphabetically.
  const monuments = allRecords
    .filter((r) => r.municipality_ine_code_p772 === muni.ine_code_p772)
    .sort((a, b) => Number(a.already_linked) - Number(b.already_linked) || a.name.localeCompare(b.name));
  const pct = muni.monument_count ? Math.round((muni.linked_count / muni.monument_count) * 100) : 0;

  panelContentEl.innerHTML = `
    ${heroBlock({ kicker: t('municipality.kicker'), title: muni.name, placeholderIcon: '📍' })}
    <div class="panel-body">
      <div class="meta">${muni.province} · ${t('stats.template', muni.linked_count, muni.monument_count, pct)}</div>
      <h3>${t('municipality.monuments_title')}</h3>
      ${
        monuments.length
          ? `<ul class="list">${monuments.map(monumentListItemHtml).join('')}</ul>`
          : `<div class="missing-note">${t('municipality.no_monuments')}</div>`
      }
    </div>
  `;
  wireMonumentListRows(panelContentEl);
  openPanel();
  if (updateUrl) history.pushState(null, '', municipalityShareUrl(muni));
  if (flyTo) map.flyToBounds(bboxToLeafletBounds(muni.bbox), { padding: [40, 40] });
}

function provinceShareUrl(prov) {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ prov: prov.name }).toString();
  return url.toString();
}

function showProvincePanel(prov, { flyTo = false, updateUrl = true } = {}) {
  currentPanelState = { type: 'province', prov };
  const pct = prov.monument_count ? Math.round((prov.linked_count / prov.monument_count) * 100) : 0;

  // Prioritized by absolute number of undocumented monuments, not by
  // percentage - a municipality with 50 missing out of 100 is a bigger
  // practical opportunity than one with 2 missing out of 2.
  const topMissing = allMunicipalities
    .filter((m) => m.province === prov.name && m.monument_count > 0)
    .sort((a, b) => (b.monument_count - b.linked_count) - (a.monument_count - a.linked_count))
    .slice(0, 15);

  const rowsHtml = topMissing
    .map((m) => {
      const mpct = m.monument_count ? Math.round((m.linked_count / m.monument_count) * 100) : 0;
      return `
        <li class="list-row" data-ine="${m.ine_code_p772}">
          <span class="list-row-name">${m.name}</span>
          <span class="list-row-stat">${m.linked_count}/${m.monument_count} (${mpct}%)</span>
        </li>
      `;
    })
    .join('');

  panelContentEl.innerHTML = `
    ${heroBlock({ kicker: t('province.kicker'), title: prov.name, placeholderIcon: '🗺️' })}
    <div class="panel-body">
      <div class="meta">${t('province.municipality_count', prov.municipality_count)} · ${t('stats.template', prov.linked_count, prov.monument_count, pct)}</div>
      <h3>${t('province.municipalities_title')}</h3>
      <ul class="list">${rowsHtml}</ul>
    </div>
  `;
  panelContentEl.querySelectorAll('.list-row[data-ine]').forEach((row) => {
    row.addEventListener('click', () => {
      const muni = allMunicipalities.find((m) => m.ine_code_p772 === row.dataset.ine);
      if (muni) showMunicipalityPanel(muni, { flyTo: true });
    });
  });
  openPanel();
  if (updateUrl) history.pushState(null, '', provinceShareUrl(prov));
  if (flyTo) map.flyToBounds(bboxToLeafletBounds(prov.bbox), { padding: [40, 40] });
}

// Mobile only (see CSS) - the topbar's four nav items collapse into this
// one button + panel instead of competing with the search box for room.
let panelBeforeMenu = null; // so the language toggle below can return here instead of just re-showing the menu

function showMenuPanel() {
  if (currentPanelState?.type !== 'menu') {
    panelBeforeMenu = currentPanelState;
  }
  currentPanelState = { type: 'menu' };
  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('menu.title'), placeholderIcon: '☰' })}
    <div class="panel-body">
      <ul class="list">
        <li class="list-row" data-menu="stats"><span class="list-row-icon-plain">📊</span><span class="list-row-name">${t('nav.stats')}</span></li>
        <li class="list-row" data-menu="about"><span class="list-row-icon-plain">ℹ️</span><span class="list-row-name">${t('nav.about')}</span></li>
        <li class="list-row" data-menu="contribute"><span class="list-row-icon-plain">🤝</span><span class="list-row-name">${t('nav.contribute')}</span></li>
        <li class="list-row" data-menu="lang"><span class="list-row-icon-plain">🌐</span><span class="list-row-name">${currentLang === 'es' ? 'English' : 'Español'}</span></li>
      </ul>
    </div>
  `;
  openPanel();
  panelContentEl.querySelectorAll('.list-row[data-menu]').forEach((row) => {
    row.addEventListener('click', () => {
      const action = row.dataset.menu;
      if (action === 'stats') showStatsPanel();
      else if (action === 'about') showAboutPanel();
      else if (action === 'contribute') showContributePanel();
      else if (action === 'lang') {
        currentLang = currentLang === 'es' ? 'en' : 'es';
        applyStaticI18n();
        rerenderPanel(panelBeforeMenu); // back to whatever was open before the menu, now in the new language
      }
    });
  });
}

document.getElementById('menu-btn').addEventListener('click', showMenuPanel);

// --- Geolocation ---------------------------------------------------------

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

// --- Shuffle / discovery --------------------------------------------------

document.getElementById('shuffle-btn').addEventListener('click', () => {
  if (!allRecords.length) return;
  const missing = allRecords.filter((r) => !r.already_linked);
  // Weighted 70% toward unlinked monuments - a "discover" button that
  // mostly surfaces already-documented ones wastes the chance to nudge
  // people toward exactly what this project is trying to close.
  const pool = missing.length && Math.random() < 0.7 ? missing : allRecords;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  selectMonument(pick, { flyTo: true });
});

const locateBtn = document.getElementById('locate-btn');
let userLocationMarker = null;
let userAccuracyCircle = null;

locateBtn.addEventListener('click', () => {
  locateBtn.classList.add('locating');
  // map.locate() is Leaflet's own wrapper around the browser Geolocation
  // API - no separate plugin needed. Works on both mobile and desktop
  // (desktop falls back to network/IP-based positioning, less precise but
  // still useful), and requires HTTPS in production (fine here - it's
  // already true on localhost for this dev server too).
  map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true });
});

map.on('locationfound', (e) => {
  locateBtn.classList.remove('locating');
  if (userLocationMarker) map.removeLayer(userLocationMarker);
  if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

  // Accuracy circle first (so the dot sits visually on top of it), sized
  // to the real GPS accuracy Leaflet reports - a plain small dot alone is
  // easy to miss/lose track of on a map full of other colored markers.
  userAccuracyCircle = L.circle(e.latlng, {
    radius: e.accuracy,
    color: '#2a6fbb',
    weight: 1,
    fillColor: '#2a6fbb',
    fillOpacity: 0.12,
    interactive: false,
  }).addTo(map);

  userLocationMarker = L.marker(e.latlng, {
    icon: L.divIcon({
      html: '<div class="you-are-here-dot"></div>',
      className: '',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    }),
    zIndexOffset: 1000, // stay above monument markers/clusters at the same spot
  })
    .addTo(map)
    .bindPopup(t('geolocation.you_are_here'));
});

map.on('locationerror', () => {
  locateBtn.classList.remove('locating');
  showToast(t('geolocation.error'));
});

// --- Search --------------------------------------------------------------

const searchInputEl = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
let searchHighlightIndex = -1;

function searchRowHtml(type, key, icon, label, sub, imageUrl, index) {
  // Same reasoning as the list-row thumbnails: URL already known from the
  // bulk pull, no per-row fetch, falls back to the emoji for anything
  // without a photo (and always for municipalities/provinces, which have
  // no image_url at all).
  const iconHtml = imageUrl
    ? `<img class="search-row-thumb" src="${imageUrl}?width=64" alt="" loading="lazy">`
    : `<span class="search-row-icon">${icon}</span>`;
  return `
    <div class="search-row" data-index="${index}" data-type="${type}" data-key="${key}">
      ${iconHtml}
      <span class="search-row-name">${label}</span>
      ${sub ? `<span class="search-row-sub">${sub}</span>` : ''}
    </div>
  `;
}

function renderSearchResults(query) {
  const nq = normalizeSearch(query.trim());
  if (!nq) {
    searchResultsEl.innerHTML = '';
    searchResultsEl.classList.remove('open');
    return;
  }

  const monumentMatches = allRecords.filter((r) => normalizeSearch(r.name).includes(nq)).slice(0, 6);
  const municipalityMatches = allMunicipalities.filter((m) => normalizeSearch(m.name).includes(nq)).slice(0, 5);
  const provinceMatches = allProvinces.filter((p) => normalizeSearch(p.name).includes(nq)).slice(0, 5);

  const sections = [
    { label: t('search.section.provinces'), rows: provinceMatches.map((p) => ['province', p.name, '🗺️', p.name, null, null]) },
    { label: t('search.section.municipalities'), rows: municipalityMatches.map((m) => ['municipality', m.ine_code_p772, '📍', m.name, m.province, null]) },
    {
      label: t('search.section.monuments'),
      rows: monumentMatches.map((r) => [
        'monument', r.jcyl_id, CATEGORY_ICONS[r.category] || DEFAULT_ICON, r.name, r.municipality, r.image_url,
      ]),
    },
  ].filter((s) => s.rows.length);

  if (!sections.length) {
    searchResultsEl.innerHTML = `<div class="search-empty">${t('search.no_results')}</div>`;
    searchResultsEl.classList.add('open');
    return;
  }

  let idx = 0;
  searchResultsEl.innerHTML = sections
    .map(
      (section) => `
        <div class="search-section">
          <div class="search-section-label">${section.label}</div>
          ${section.rows.map((row) => searchRowHtml(...row, idx++)).join('')}
        </div>
      `
    )
    .join('');
  searchResultsEl.classList.add('open');
  searchHighlightIndex = -1;

  searchResultsEl.querySelectorAll('.search-row').forEach((row) => {
    row.addEventListener('click', () => selectSearchResult(row.dataset.type, row.dataset.key));
  });
}

function selectSearchResult(type, key) {
  if (type === 'monument') {
    const record = recordsById.get(key);
    if (record) selectMonument(record, { flyTo: true });
  } else if (type === 'municipality') {
    const muni = allMunicipalities.find((m) => m.ine_code_p772 === key);
    if (muni) showMunicipalityPanel(muni, { flyTo: true });
  } else if (type === 'province') {
    const prov = allProvinces.find((p) => p.name === key);
    if (prov) showProvincePanel(prov, { flyTo: true });
  }
  searchResultsEl.classList.remove('open');
  searchInputEl.value = '';
  searchInputEl.blur();
  closeMobileSearch(); // no-op on desktop - .search-active is never set there
}

searchInputEl.addEventListener('input', () => renderSearchResults(searchInputEl.value));

// Mobile only (see CSS) - #search-wrap stays collapsed to just an icon
// until tapped, so the default header is one compact row instead of
// permanently reserving a full-width second row for search.
function closeMobileSearch() {
  topbarEl.classList.remove('search-active');
  searchResultsEl.classList.remove('open');
  searchInputEl.value = '';
  searchInputEl.blur();
}

const topbarEl = document.getElementById('topbar');
document.getElementById('search-toggle-btn').addEventListener('click', () => {
  topbarEl.classList.add('search-active');
  searchInputEl.focus();
});
document.getElementById('search-close-btn').addEventListener('click', closeMobileSearch);

searchInputEl.addEventListener('keydown', (e) => {
  const rows = Array.from(searchResultsEl.querySelectorAll('.search-row'));
  if (!rows.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchHighlightIndex = Math.min(searchHighlightIndex + 1, rows.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchHighlightIndex = Math.max(searchHighlightIndex - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const row = rows[searchHighlightIndex] || rows[0];
    selectSearchResult(row.dataset.type, row.dataset.key);
    return;
  } else if (e.key === 'Escape') {
    searchResultsEl.classList.remove('open');
    searchInputEl.blur();
    return;
  } else {
    return;
  }
  rows.forEach((r, i) => r.classList.toggle('highlighted', i === searchHighlightIndex));
  rows[searchHighlightIndex]?.scrollIntoView({ block: 'nearest' });
});

document.addEventListener('click', (e) => {
  if (!document.getElementById('search-wrap').contains(e.target)) {
    searchResultsEl.classList.remove('open');
  }
});

// --- Language ------------------------------------------------------------

// Re-renders a given panel state in the (by then already-switched) current
// language - shared by showMenuPanel()'s language row (return to whatever
// was open before the menu, not just the menu itself) and available for
// any other future language-affecting action.
function rerenderPanel(state) {
  if (state?.type === 'monument') {
    selectMonument(state.record, { flyTo: false, updateUrl: false });
  } else if (state?.type === 'municipality') {
    showMunicipalityPanel(state.muni, { flyTo: false, updateUrl: false });
  } else if (state?.type === 'province') {
    showProvincePanel(state.prov, { flyTo: false, updateUrl: false });
  } else if (state?.type === 'stats') {
    showStatsPanel({ updateUrl: false });
  } else if (state?.type === 'about') {
    showAboutPanel({ updateUrl: false });
  } else if (state?.type === 'contribute') {
    showContributePanel({ updateUrl: false });
  } else {
    closePanel(); // nothing was open before - just back to the plain map
  }
}

applyStaticI18n();

// --- Loading screen / one-time welcome modal ----------------------------

function hideLoadingScreen() {
  document.getElementById('loading-screen')?.classList.add('hidden');
}

function loadingScreenFailed() {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  el.querySelector('#loading-spinner')?.style.setProperty('display', 'none');
  const p = el.querySelector('p');
  if (p) p.textContent = t('loading.error');
  // Deliberately not hidden - a blank map behind a silent console error is
  // worse than staying on the branded screen with a visible message.
}

// Shown once per browser via a localStorage flag - never on top of a deep
// link (?id=/?muni=/?prov=/#stats etc.), since someone arriving at a
// specific monument already knows what they're looking at.
function maybeShowWelcome() {
  const KEY = 'cylinked_welcome_seen';
  let alreadySeen = true;
  try {
    alreadySeen = !!localStorage.getItem(KEY);
  } catch (e) {
    return; // e.g. private browsing with storage blocked - skip rather than risk showing it every single visit
  }
  if (alreadySeen) return;

  const modal = document.getElementById('welcome-modal');
  if (!modal) return;
  modal.classList.add('open');

  const dismiss = () => {
    modal.classList.remove('open');
    try {
      localStorage.setItem(KEY, '1');
    } catch (e) {
      // nothing to do - worst case it shows again next visit
    }
  };
  document.getElementById('welcome-close-btn').addEventListener('click', dismiss, { once: true });
  document.getElementById('welcome-about-link').addEventListener('click', (e) => {
    e.preventDefault();
    dismiss();
    showAboutPanel();
  });
}

// --- Load data, plot markers -------------------------------------------

Promise.all([
  fetch('data/cyl_monuments_wikidata.json').then((r) => r.json()),
  fetch('data/municipalities.json').then((r) => r.json()),
  fetch('data/provinces.json').then((r) => r.json()),
  fetch('data/meta.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
])
  .then(([records, municipalities, provinces, meta]) => {
    allRecords = records;
    allMunicipalities = municipalities;
    allProvinces = provinces;
    datasetMeta = meta;

    recordsById = new Map(records.map((r) => [String(r.jcyl_id), r]));

    for (const record of records) {
      const marker = L.marker([record.lat, record.lon], { icon: iconFor(record) });
      marker.record = record; // read by clusterIcon() to compute each cluster's linked ratio
      marker.on('click', () => selectMonument(record, { flyTo: false }));
      markers.addLayer(marker);
    }

    // Deep links: ?id=<jcyl_id> / ?muni=<ine_code> / ?prov=<name> open
    // straight to that monument/municipality/province; #about / #contribute
    // open those static panels.
    const params = new URLSearchParams(location.search);
    const requestedId = params.get('id');
    const requestedMuni = params.get('muni');
    const requestedProv = params.get('prov');
    const hasDeepLink = !!(requestedId || requestedMuni || requestedProv || location.hash);
    if (requestedId && recordsById.has(requestedId)) {
      selectMonument(recordsById.get(requestedId), { flyTo: true, updateUrl: false });
    } else if (requestedMuni) {
      const muni = allMunicipalities.find((m) => m.ine_code_p772 === requestedMuni);
      if (muni) showMunicipalityPanel(muni, { flyTo: true, updateUrl: false });
    } else if (requestedProv) {
      const prov = allProvinces.find((p) => p.name === requestedProv);
      if (prov) showProvincePanel(prov, { flyTo: true, updateUrl: false });
    } else if (location.hash === '#stats') {
      showStatsPanel({ updateUrl: false });
    } else if (location.hash === '#about') {
      showAboutPanel({ updateUrl: false });
    } else if (location.hash === '#contribute') {
      showContributePanel({ updateUrl: false });
    }

    hideLoadingScreen();
    if (!hasDeepLink) maybeShowWelcome();
  })
  .catch((err) => {
    console.error(err);
    loadingScreenFailed();
  });
