// Patrimonio Abierto map.
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

// Short, stable, ASCII-only codes for the URL only (?cats=mon|cas|...) -
// record.category itself is never rewritten (see i18n.js's note on why),
// this is purely a cosmetic swap so the URL isn't 100+ characters of
// percent-encoded accents and spaces for a full category list. Fixed by
// hand, not derived from the category text, so a slug never shifts under
// someone's saved link just because the dataset's category *counts* (and
// so initCategoryFilter()'s sort order) changed.
const CATEGORY_SLUGS = {
  'MONUMENTO': 'mon',
  'CASTILLOS': 'cas',
  'HÓRREOS Y PALLOZAS': 'hor',
  'ARTE RUPESTRE': 'rup',
  'CONJUNTO HISTÓRICO': 'chi',
  'ROLLOS DE JUSTICIA': 'rol',
  'ZONA ARQUEOLÓGICA': 'arq',
  'CONJUNTO ETNOLÓGICO': 'etn',
  'ARCHIVOS, MUSEOS Y BIBLIOTECAS': 'amb',
  'SITIO HISTÓRICO': 'sit',
  'ESCUDOS': 'esc',
  'PAISAJE CULTURAL': 'pai',
  'JARDÍN HISTÓRICO': 'jar',
  'HITOS FORALES': 'hit',
};
const SLUG_TO_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_SLUGS).map(([cat, slug]) => [slug, cat]));

// Commons file extensions worth showing in a photo gallery - excludes PDFs,
// DjVu scans, audio, etc. that also legitimately live in a monument's
// Commons category. Video (webm/ogv - the two formats Commons actually
// accepts uploads in) is its own category, checked separately wherever the
// gallery needs to tell them apart (goToIndex(), renderGallery(), ...) -
// still shown, just needing real playback rather than a plain <img>.
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|tiff?)$/i;
const VIDEO_EXTENSIONS = /\.(webm|ogv)$/i;
function isVideoFile(filename) {
  return VIDEO_EXTENSIONS.test(filename);
}

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

// One L.marker per record, kept around (separately from the cluster group,
// which only ever holds the currently-visible subset) so the category
// filter can cheaply clear+re-add just the matching ones instead of
// recreating markers every time a checkbox is toggled.
let allMarkerLayers = [];
// jcyl_id -> its L.marker, so highlightMonument()/selectMonument() can look
// up a specific marker layer (for markers.getVisibleParent()/
// zoomToShowLayer() - see selectMonument()) without a linear scan.
const markerByJcylId = new Map();
let selectedCategories = new Set(); // filled with every category once data loads = no filter applied
let selectedStatuses = new Set(); // 'unlinked' | 'no_photo' - empty = no status filter applied

// Tracks what's currently shown in the panel so the language toggle can
// re-render it in place, instead of just relabeling the chrome around it.
let currentPanelState = null; // { type: 'monument', record } | { type: 'about' } | { type: 'contribute' } | null

// The open monument panel's photo set: a fixed-order list (P18/first photo
// at index 0, then the rest as fetched) plus which index is currently in
// the hero slot. goToIndex() below is the single place that moves between
// them - both a gallery-thumbnail click and a mobile hero swipe just call
// it with a different target index, so "every photo stays reachable" (the
// original point of this state) falls out for free rather than needing the
// old swap-places bookkeeping. Reset in openPanel() so a stale monument's
// gallery can't leak into e.g. the About panel's hero (which has no
// gallery of its own, but does share the same swipe wiring).
let currentGalleryState = { files: [], index: 0, commonsCategory: null };

// zoomControl: false + added separately at bottomleft, out of the way of
// the shuffle/locate buttons stacked at bottomright.
// maxZoom on the map itself, not left to whichever basemap layer loads.
// The basemap is now added asynchronously (it probes for the local
// archive first), and Leaflet takes its zoom range from the first layer
// that declares one - so markercluster initialised against a map with no
// maxZoom at all and threw "Map has no maxZoom specified". The map's zoom
// range is a property of the map, and tying it to a layer's arrival was
// always incidental.
const map = L.map('map', { zoomControl: false, maxZoom: 19 }).setView([41.65, -4.7], 8); // roughly centered on Castilla y León
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// OpenStreetMap's own raster tiles. Busier than the muted basemap this
// site used to have, and that is a real cost - the markers have to work
// harder against coloured roads and landcover, which is why they are one
// teal now instead of two competing hues (see .monument-icon in
// style.css).
//
// It replaced CARTO, which gates on the HTTP Referer and answers 403
// without one (measured: 403 bare, 200 with a Referer for this domain -
// and the API key the code also carried turned out to be irrelevant).
// Anyone whose browser, extension or proxy strips that header saw a blank
// map, and users in several countries reported exactly that. OSM's tiles
// need neither key nor Referer, so that failure is gone. Their usage
// policy covers normal interactive viewing by people, which is what this
// is; it would not cover bulk fetching or an app.
//
// A self-hosted vector basemap was built and measured before settling
// here: Protomaps' archive of this region is 350MB, Caddy serves it over
// range requests without extra software, and it looks considerably
// quieter. It was abandoned for one reason - protomaps-leaflet renders to
// canvas and Leaflet redraws it after each zoom animation rather than
// during it, so the map judders on every zoom, at every flavour. That
// library is in maintenance mode upstream, and rendering vector tiles
// smoothly means MapLibre GL, which means rewriting the marker, cluster,
// highlight and geolocation layers Leaflet carries today. Worth knowing
// before anyone spends the afternoon rediscovering it.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

// 26, matching .monument-icon's own width/height in style.css. The two
// have to agree: Leaflet positions the icon element from iconSize/
// iconAnchor, but what a visitor actually sees is the .monument-icon div
// inside it, at whatever size the CSS says. They didn't agree before (22
// here vs 26 there), which sat every marker's visible circle 2px
// down-right of its real coordinate - unnoticeable on its own, but the
// selected state used to swap in a bigger iconSize too, flipping that to
// 2px up-left and making the marker visibly jump ~4px the moment it was
// clicked.
// 26 -> 30: a touch more legible/tappable without the map starting to feel
// crowded at typical zoom levels. CSS .monument-icon's own width/height/
// font-size (below) must change together with this, for the exact reason
// explained just above.
const MONUMENT_ICON_SIZE = 30;

// selected (default false): the one marker a click/search/"Cerca de aquí"
// tap just opened - see highlightMonument() below. It recolors this
// marker's own icon rather than drawing a separate ring on top of it: a
// separate ring is only ever as correct as its guess about whether this
// exact marker is currently rendered unclustered, which depends on zoom
// and can change again later (a pan/zoom while the panel stays open) -
// leaving a ring visibly floating over nothing. Recoloring the real marker
// can't go stale that way: if the marker is clustered, its highlight is
// simply invisible too, exactly like the marker itself. What makes it
// *bigger* is .monument-icon.selected's transform, not a bigger iconSize -
// transforms are paint-only, so they can't drag the anchor off the
// coordinate (see MONUMENT_ICON_SIZE above). Getting zoomed in far enough
// to see any of this in the first place is flyToMonument()'s job.
function iconFor(record, selected = false) {
  const emoji = CATEGORY_ICONS[record.category] || DEFAULT_ICON;
  // Colored by whether a free photo exists, not by whether the monument is
  // linked to Wikidata. Linkage is plumbing and nearly finished; a missing
  // photo is the gap a visitor standing in front of the building can
  // actually close.
  const statusClass = record.has_wikidata_image ? 'has-photo' : 'no-photo';
  const half = MONUMENT_ICON_SIZE / 2;
  return L.divIcon({
    html: `<div class="monument-icon ${statusClass}${selected ? ' selected' : ''}">${emoji}</div>`,
    className: '', // suppress Leaflet's default icon styling/box
    iconSize: [MONUMENT_ICON_SIZE, MONUMENT_ICON_SIZE],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
}

// Clusters are colored by their own with-photo/without ratio (green -> red),
// not Leaflet's default blue/yellow/orange-by-count - so even zoomed out,
// the map still reads as "where the documentation gaps are", not just
// "where the monuments are".
function clusterIcon(cluster) {
  const children = cluster.getAllChildMarkers();
  const missing = children.filter((m) => !m.record.has_wikidata_image).length;
  const ratio = missing / children.length; // 0 = all have a photo, 1 = none do
  // One color, like the individual markers: the ratio speaks through the
  // border instead. A gradient here would put a second color language on a
  // basemap that already carries its own, and the dashed ring reads at
  // cluster size perfectly well - which is the size most of the region is
  // seen at.
  const size = children.length < 10 ? 34 : children.length < 100 ? 42 : 52;
  const borderStyle = ratio > 0.5 ? 'dashed' : 'solid'; // same non-color signal as individual markers
  return L.divIcon({
    html: `<div style="border-style: ${borderStyle}">${children.length}</div>`,
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

// Leaflet gives every marker (and, confirmed by testing, every
// Leaflet.markercluster cluster icon too - they're L.Marker instances
// internally) tabindex="0"/role="button" by default, with no accessible
// name on any of them. Individual markers get keyboard:false at creation
// below (allMarkerLayers.push()), which does stop *those* - but that same
// option passed to L.markerClusterGroup() above does NOT reach the
// plugin's own internally-created cluster icons (verified: still
// tabbable), and there's no group-level option that does. Since a cluster
// icon is recreated on every zoom/pan/filter change, not just once, a
// MutationObserver watching for it actually landing in the DOM is more
// robust than trying to catch every Leaflet/plugin event that might
// trigger a re-render. Before this: Tab from the top of the page took 113
// presses (one per marker/cluster icon on screen at the starting zoom) to
// even reach the map's own buttons - unusable, not just imperfect. Search
// (#search-input, arrow-key-navigable results) is the real, actually-
// labeled keyboard/screen-reader path to a monument, not these.
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1 && node.classList?.contains('cluster-icon')) {
        node.removeAttribute('tabindex');
        node.removeAttribute('role');
      }
    }
  }
}).observe(document.getElementById('map'), { childList: true, subtree: true });

// --- Filters: status + category ---------------------------------------------
//
// Two independent, AND-combined dimensions: a marker shows only if its
// category is checked AND (no status box checked, or it matches at least
// one checked status). Categories are JCyL's own official terms (see
// i18n.js's note at the top on why they're never translated), so that list
// is built from whatever distinct record.category values actually show up
// in the dataset - not a hardcoded list - and just displayed as-is, same as
// everywhere else in the app that shows a category.

const filterBtnEl = document.getElementById('filter-btn');
const filterBadgeEl = document.getElementById('filter-badge');
const filterPanelEl = document.getElementById('filter-panel');
const filterListEl = document.getElementById('filter-list');
const filterStatusListEl = document.getElementById('filter-status-list');
let categoriesWithCounts = []; // [{ category, count }], sorted most common first, filled by initCategoryFilter()

// 'no_photo' and 'no_wikipedia' both deliberately exclude unlinked records
// (which trivially have neither too) rather than being the superset they
// technically could be - each maps 1:1 onto one of the concrete
// contribution steps in the "Cómo contribuir" panel (add a photo / write a
// Wikipedia article for an item that already exists), so a checkbox
// corresponds to one distinct task a visitor could go do, not an
// overlapping way of saying "incomplete". They're NOT disjoint from *each
// other* though, on purpose - a linked item can genuinely lack both a
// photo and an article at once, and should show up under both. 'unlinked'
// itself no longer has a matching Contribute step (CyL's own catalog is
// expected to be fully linked by the time these pages ship) but stays as a
// filter in its own right.
//
// 'linked'/'has_photo' are the positive counterparts - "show me what's
// already working", not just "show me the gaps". No positive counterpart
// for 'no_wikipedia' (wasn't asked for) - easy to add the same way later
// if that changes. has_photo doesn't need its own "is this actually
// linked" check the no_photo pair has: has_wikidata_image can only ever
// be true on a record fetch_wikidata.py already found a P18 image for,
// which only happens for items wdt:P3177 matched in the first place - so
// it already implies linked, same data, no need to re-derive it.
function isLinkedNoPhoto(record) {
  return !!record.wikidata_qid && !record.has_wikidata_image;
}
function hasPhoto(record) {
  return !!record.has_wikidata_image;
}
function isLinkedNoWikipedia(record) {
  return !!record.wikidata_qid && !record.has_wikipedia_article;
}
// No linked/unlinked filter any more. It answered a question the map has
// largely stopped having: 91% of the catalogue is linked, and everything
// still missing is one category (ARTE RUPESTRE), so the filter mostly
// returned either "almost everything" or "the rock art". What people
// actually come here to find is what is still undocumented - a photo or an
// article - which is what the remaining three answer.
const STATUS_MATCHERS = {
  no_photo: isLinkedNoPhoto,
  has_photo: hasPhoto,
  no_wikipedia: isLinkedNoWikipedia,
};
const STATUS_ICONS = { no_photo: '🖼️', has_photo: '🖼️', no_wikipedia: '📖' };

function initStatusFilter() {
  // Built from STATUS_MATCHERS' own keys, not hand-listed - adding a new
  // status above (like has_photo/linked just now) only needs to happen in
  // one place, not two that can silently drift apart.
  const counts = Object.fromEntries(Object.keys(STATUS_MATCHERS).map((status) => [status, allRecords.filter(STATUS_MATCHERS[status]).length]));
  // Seed from the URL (?status=unlinked,no_photo) if present, so a
  // reloaded or shared link reopens with the same filter active - see
  // syncFiltersToUrl(), which writes this same param back on every change.
  const urlStatus = new URLSearchParams(location.search).get('status');
  if (urlStatus) {
    for (const s of urlStatus.split('|')) {
      if (STATUS_MATCHERS[s]) selectedStatuses.add(s);
    }
  }
  filterStatusListEl.innerHTML = Object.keys(STATUS_MATCHERS)
    .map((status) => {
      const checked = selectedStatuses.has(status);
      return `
        <label class="filter-row" data-status="${status}">
          <input type="checkbox" ${checked ? 'checked' : ''}>
          <span class="filter-row-icon">${STATUS_ICONS[status]}</span>
          <span class="filter-row-name" data-i18n="filter.status_${status}">${t(`filter.status_${status}`)}</span>
          <span class="filter-row-count">${counts[status].toLocaleString(currentLang)}</span>
        </label>
      `;
    })
    .join('');
  filterStatusListEl.querySelectorAll('.filter-row').forEach((row) => {
    const checkbox = row.querySelector('input');
    checkbox.addEventListener('change', () => {
      const status = row.dataset.status;
      if (checkbox.checked) selectedStatuses.add(status);
      else selectedStatuses.delete(status);
      applyFilters();
    });
  });
}

// record.category itself stays exactly as JCyL wrote it (ALL CAPS) - it's
// the underlying value used for filtering/matching, and i18n.js's policy
// is to never rewrite official source terms. This only prettifies how a
// category reads in the filter list, mirroring build_dataset.py's own
// titlecase_es() for monument names (same small-words-stay-lowercase
// Spanish heritage-name style), kept in sync by hand since one's Python
// and the other's JS.
const SMALL_WORDS_ES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'a', 'en']);
function titlecaseEs(text) {
  return text
    .toLowerCase()
    .split(' ')
    .map((w, i) => (SMALL_WORDS_ES.has(w) && i !== 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function initCategoryFilter() {
  const counts = new Map();
  for (const record of allRecords) {
    counts.set(record.category, (counts.get(record.category) || 0) + 1);
  }
  categoriesWithCounts = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Seed from the URL (?cats=mon|cas) if present, same as
  // initStatusFilter() does for ?status - falls back to "all" (the normal
  // default) if the param is missing, empty, or matches nothing real (a
  // stale/typo'd link shouldn't silently show zero markers). Each token is
  // tried as a slug first, then as a raw category name - so links from
  // just before CATEGORY_SLUGS existed still work, not just new ones.
  const urlCats = new URLSearchParams(location.search).get('cats');
  const requested = urlCats ? new Set(urlCats.split('|').map((t) => SLUG_TO_CATEGORY[t] || t)) : null;
  const requestedValid = requested ? categoriesWithCounts.map((c) => c.category).filter((c) => requested.has(c)) : [];
  selectedCategories = new Set(requestedValid.length ? requestedValid : categoriesWithCounts.map((c) => c.category));

  filterListEl.innerHTML = categoriesWithCounts
    .map(({ category, count }) => {
      const checked = selectedCategories.has(category);
      return `
        <label class="filter-row${checked ? '' : ' unchecked'}" data-category="${category}">
          <input type="checkbox" ${checked ? 'checked' : ''}>
          <span class="filter-row-icon">${CATEGORY_ICONS[category] || DEFAULT_ICON}</span>
          <span class="filter-row-name">${titlecaseEs(category)}</span>
          <span class="filter-row-count">${count.toLocaleString(currentLang)}</span>
        </label>
      `;
    })
    .join('');
  filterListEl.querySelectorAll('.filter-row').forEach((row) => {
    const checkbox = row.querySelector('input');
    checkbox.addEventListener('change', () => {
      const category = row.dataset.category;
      if (checkbox.checked) selectedCategories.add(category);
      else selectedCategories.delete(category);
      row.classList.toggle('unchecked', !checkbox.checked);
      applyFilters();
    });
  });

  initStatusFilter();
  applyFilters();
}

function setAllCategoryCheckboxes(checked) {
  filterListEl.querySelectorAll('.filter-row').forEach((row) => {
    row.querySelector('input').checked = checked;
    row.classList.toggle('unchecked', !checked);
  });
  selectedCategories = checked ? new Set(categoriesWithCounts.map((c) => c.category)) : new Set();
  applyFilters();
}

// Jumps from a written page (e.g. Contribute's "add photos" section) straight
// to the map, filtered to exactly one status - every category included, and
// any status filter that happened to be active before is replaced rather
// than merged in, so "see items without a photo" always shows exactly that,
// never an accidental intersection with a filter left on from an earlier
// visit. Sets both the underlying state AND the (currently closed) filter
// panel's own checkboxes, same as setAllCategoryCheckboxes() already does
// for categories - otherwise they'd show stale checked state the next time
// someone actually opens the filter panel.
//
// The change is staged rather than just happening, because it used to
// swap the markers under a camera that never moved - unreadable in
// practice: a map full of dots still looks like a map full of dots, and
// the only control saying otherwise is #filter-btn's 16px badge at the
// far edge of the screen. So: markers fade out, the camera flies to frame
// exactly what's left, the filter button pulses, and a toast names the
// filter and what it matched.
//
// The fade doubles as cover for closePanel()'s own 260ms map resize - see
// openPanel()'s comment on why a flyTo issued before that settles aims at
// stale geometry. By the time the camera moves here, #map is final-sized
// either way (panel was open or not).
const FILTER_MOTION_FADE_MS = 280;

function showMapFilteredByStatus(status) {
  selectedStatuses = new Set([status]);
  filterStatusListEl.querySelectorAll('.filter-row').forEach((row) => {
    row.querySelector('input').checked = row.dataset.status === status;
  });
  closePanel();

  const mapWrapEl = document.getElementById('map-wrap');
  mapWrapEl.classList.add('filter-changing');
  setTimeout(() => {
    setAllCategoryCheckboxes(true); // clears any category filter; its own applyFilters() call picks up the status change above too
    mapWrapEl.classList.remove('filter-changing');

    const matching = allRecords.filter(recordPassesFilters);
    if (matching.length) {
      map.flyToBounds(L.latLngBounds(matching.map((r) => [r.lat, r.lon])), { padding: [50, 50], duration: 0.9 });
    }
    // Remove-reflow-add, not a plain add: without it a second call while
    // the first animation is still running is a no-op (the class is
    // already there), so the button would sit still exactly when the
    // filter just changed again.
    filterBtnEl.classList.remove('just-filtered');
    void filterBtnEl.offsetWidth;
    filterBtnEl.classList.add('just-filtered');

    showToast(t('filter.applied', t(`filter.status_${status}`), matching.length.toLocaleString(currentLang)));
  }, FILTER_MOTION_FADE_MS);
}

// Wires a real <a href="..."> so it behaves like an actual link - hovering
// shows the URL, and right-click/copy-link/ctrl-or-cmd-click/middle-click
// all do a real navigation/reload, landing in the right place since that's
// exactly what the href itself points at. A plain left click instead runs
// onNavigate() for the instant in-app transition, skipping the reload.
function wireSpaLink(el, onNavigate) {
  el.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate();
  });
}

// href="?status=..." (see e.g. showContributePanel()) lands on the map
// already filtered on a real navigation, since initCategoryFilter() /
// initStatusFilter() read ?status= (and ?cats=) from the URL on load, the
// same way a shared monument/municipality/province link does.
function wireFilterLink(el, status) {
  wireSpaLink(el, () => showMapFilteredByStatus(status));
}

// Shared with nearbyMonuments() below - a record that fails this wouldn't
// have a marker on the map right now (see applyFilters()), so it shouldn't
// be suggested as "nearby" either: that dead-ended into a click that opened
// the monument's own panel just fine, but nothing to actually see back on
// the map once you closed it (issue #8).
function recordPassesFilters(record) {
  if (!selectedCategories.has(record.category)) return false;
  if (!selectedStatuses.size) return true;
  return [...selectedStatuses].some((status) => STATUS_MATCHERS[status](record));
}

function applyFilters() {
  markers.clearLayers();
  markers.addLayers(allMarkerLayers.filter((m) => recordPassesFilters(m.record)));

  const activeCategoryCount = selectedCategories.size;
  const totalCategoryCount = categoriesWithCounts.length;
  const categoryFiltering = activeCategoryCount < totalCategoryCount;
  const statusFiltering = selectedStatuses.size > 0;
  filterBtnEl.classList.toggle('active', categoryFiltering || statusFiltering);
  filterBadgeEl.hidden = !(categoryFiltering || statusFiltering);
  // Badge shows whichever dimension is actually narrowing things - category
  // count takes priority since it's usually the bigger number, falling back
  // to the status-box count so an "all categories, one status box" filter
  // still shows *something* rather than an empty-looking active button.
  if (categoryFiltering) filterBadgeEl.textContent = activeCategoryCount.toLocaleString(currentLang);
  else if (statusFiltering) filterBadgeEl.textContent = selectedStatuses.size.toLocaleString(currentLang);

  syncFiltersToUrl(categoryFiltering, statusFiltering);
}

// Filters are merged into whatever's already in the URL (an open ?id=
// monument, #about, ...) via replaceState, not pushState - every checkbox
// toggle would otherwise add a browser-history entry, making "back" step
// through individual filter changes instead of actually navigating away
// from the map. Symmetric with initCategoryFilter()/initStatusFilter()
// reading these same two params back out on load.
function syncFiltersToUrl(categoryFiltering, statusFiltering) {
  const params = new URLSearchParams(location.search);
  // '|', not ',' - "ARCHIVOS, MUSEOS Y BIBLIOTECAS" is itself one category
  // name with a comma in it, which a comma-joined list can't tell apart
  // from a separator (silently dropped that category on reload before
  // this was caught - splitting it into two bogus, non-matching tokens).
  // CATEGORY_SLUGS keeps each one to 3 ASCII characters instead of the
  // full accented name - a 14-category URL used to be 100+ characters of
  // percent-encoding, now it's ~55 of plain lowercase letters.
  if (categoryFiltering) params.set('cats', [...selectedCategories].map((c) => CATEGORY_SLUGS[c] || c).join('|'));
  else params.delete('cats');
  if (statusFiltering) params.set('status', [...selectedStatuses].join('|'));
  else params.delete('status');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}

filterBtnEl.addEventListener('click', () => filterPanelEl.classList.toggle('open'));
document.getElementById('filter-all-btn').addEventListener('click', () => setAllCategoryCheckboxes(true));
document.getElementById('filter-none-btn').addEventListener('click', () => setAllCategoryCheckboxes(false));
document.addEventListener('click', (e) => {
  if (!filterPanelEl.contains(e.target) && !filterBtnEl.contains(e.target)) {
    filterPanelEl.classList.remove('open');
  }
});

// --- Panel open/close, with Leaflet size invalidation ----------------------

const panelEl = document.getElementById('panel');
const panelContentEl = document.getElementById('panel-content');
const appEl = document.getElementById('app');

// The "written pages" - About/Contribute/Stats/Privacy/Imprint - replace
// the map entirely instead of sharing the screen with it (see the
// #app.page-mode CSS), on both desktop and mobile. Every other panel type
// (monument/municipality/province/menu) keeps the normal map-side
// panel/bottom-sheet treatment. Checked against currentPanelState.type,
// which every show*Panel() function sets before calling openPanel().
// 'list' joins these too: it's a full alternate way to browse the same
// data as the map (see showListPanel()), not a quick transient panel like
// municipality/province/menu - map-side real estate would just be
// clutter (and, for a screen-reader user, noise) next to a page whose
// whole point is not needing the map at all.
const PAGE_PANEL_TYPES = new Set(['about', 'contribute', 'stats', 'privacy', 'imprint', 'list']);

// Same string index.html's own <title> and build_monument_pages.py's
// fallback both already use for the plain map - not run through t() and
// not re-localized on language toggle, matching that existing baseline
// exactly rather than introducing a second, differently-behaved default.
const DEFAULT_TITLE = 'Patrimonio Abierto - Castilla y León en un mapa';

// The browser tab title never followed pushState - every panel type
// updates the address bar (see each show*Panel() below) but document.title
// stayed whatever the page loaded with, so switching monuments by clicking
// markers left the tab reading the first one indefinitely. One place,
// driven by the state openPanel() already has after every show*Panel()
// call, rather than a duplicate `document.title = ...` line in each of
// them: a call site that adds a new panel type could not forget this the
// way it could forget an inline assignment.
function updateDocumentTitle() {
  const state = currentPanelState;
  const suffix = ' - Patrimonio Abierto';
  document.title = !state
    ? DEFAULT_TITLE
    : {
        monument: () => state.record.name + suffix,
        municipality: () => state.muni.name + suffix,
        province: () => state.prov.name + suffix,
        stats: () => t('nav.stats') + suffix,
        about: () => t('nav.about') + suffix,
        contribute: () => t('nav.contribute') + suffix,
        privacy: () => t('nav.privacy') + suffix,
        imprint: () => t('nav.imprint') + suffix,
        list: () => t('list.title') + suffix,
        menu: () => t('menu.title') + suffix,
      }[state.type]?.() ?? DEFAULT_TITLE;
}

// Same 5 - 'list' excluded, it has no URL of its own - as clean paths
// (/stats/, /about/, ...), 1:1 with each type. Old #stats-style hash
// links still open the right page too (see the deep-link parsing below),
// this only changes what new links look like going forward, same as
// /monumento/<id>-<slug>/ for monuments.
const WRITTEN_PAGE_TYPES = ['about', 'contribute', 'stats', 'privacy', 'imprint'];

// Marks which marker is "the one" a click/search/nearby-list tap just
// opened - by recoloring/enlarging that exact marker's own icon (see
// iconFor()'s `selected` param), not a separate ring layered on top of
// it. A first pass used a separate ring, added straight to the map at the
// record's raw coordinate so it would never itself be absorbed into a
// cluster - but that only fixed half the problem: the ring stayed put at
// a fixed screen position while whether the *actual* marker underneath it
// was clustered could still change (a pan/zoom while the panel stayed
// open), leaving the ring visibly floating over nothing. Recoloring the
// real marker instead means the highlight is only ever exactly as visible
// as that marker already is - never separately wrong.
let selectedMonumentMarker = null; // the actual L.marker currently highlighted, if any

function clearMonumentHighlight() {
  if (selectedMonumentMarker) {
    selectedMonumentMarker.setIcon(iconFor(selectedMonumentMarker.record));
    selectedMonumentMarker.setZIndexOffset(0);
    selectedMonumentMarker = null;
  }
}

function highlightMonument(record) {
  clearMonumentHighlight();
  const target = markerByJcylId.get(String(record.jcyl_id));
  if (!target) return; // shouldn't happen, but a missing highlight is harmless
  target.setIcon(iconFor(record, true));
  target.setZIndexOffset(900); // above regular markers/clusters, below the you-are-here dot (1000)
  selectedMonumentMarker = target;
}

// onMapReady (optional): called once the map's own size is actually
// correct - immediately, if this call isn't resizing/revealing #map at
// all, or otherwise only after the same invalidateSize() below runs. Any
// flyTo()/flyToBounds() paired with an openPanel() call MUST go through
// this, not run right after it unconditionally - confirmed by testing
// (mobile, Stats page -> search selects a monument; page-mode list view ->
// tap a monument): calling flyTo()
// synchronously left the map centered wrong, because at that exact
// instant #map-wrap had just gone display:none -> block and #panel's
// height was still mid-transition (100% -> 68vh takes 300ms) - Leaflet's
// own cached container size was still stale, so flyTo() aimed at the
// wrong pixel geometry entirely. invalidateSize() alone doesn't fix a
// flyTo() that already ran against bad geometry - it only fixes the
// map's *size*, not wherever that earlier, wrongly-aimed flyTo() left the
// view sitting.
function openPanel(onMapReady) {
  // Every panel-show function sets panelContentEl.innerHTML then calls this
  // - resetting here, not per panel type, means a stale gallery/swipe state
  // from whatever was open before can never leak into a panel that has none.
  currentGalleryState = { files: [], index: 0, commonsCategory: null };
  const wasOpen = panelEl.classList.contains('open');
  const isPage = PAGE_PANEL_TYPES.has(currentPanelState?.type);
  const wasPage = appEl.classList.contains('page-mode');
  appEl.classList.toggle('page-mode', isPage);
  panelEl.classList.add('open');
  // Any panel opening steps the picture-of-the-week strip aside for as
  // long as it's open (see hidePotwForPanel()) - not a real dismissal,
  // just out of the way; closePanel() below brings it back unless the
  // user separately, actually dismissed it (its own close button, or
  // following one of its own links) while a panel happened to be open.
  hidePotwForPanel();
  // Every panel type routes through here, so this is the one place that
  // needs to know "is a specific monument marker meant to be highlighted
  // right now" - set it fresh for 'monument', clear it for everything else
  // (municipality/province/stats/...), rather than threading this through
  // every individual show*Panel() function.
  if (currentPanelState?.type === 'monument') {
    highlightMonument(currentPanelState.record);
  } else {
    clearMonumentHighlight();
  }
  // The map's container is display:none in page mode, not just resized, so
  // besides the normal closed->open transition, switching between a page
  // and a regular map-side panel while the panel stays open the whole time
  // (e.g. About -> search selects a monument) also needs a fresh
  // invalidateSize() once the map's own visibility/size has settled.
  if (!wasOpen || isPage !== wasPage) {
    // Leaflet needs to recompute its size once the layout transition that
    // shrinks/grows #map has actually finished, or tiles render into the
    // wrong area until the next manual pan/zoom.
    setTimeout(() => {
      map.invalidateSize();
      onMapReady?.();
    }, 260);
  } else {
    onMapReady?.();
  }
  if (isPage) {
    // Page-mode panels behave like a route change (own URL fragment, own
    // back-button entry, replace the map entirely) - move focus onto the
    // new content so a keyboard/screen-reader user actually lands there.
    // Without this, e.g. activating #skip-to-list-link left focus sitting
    // on the skip link itself: the list rendered, but the very next Tab
    // continued from the skip link's own DOM position (into the topbar),
    // not into the list it supposedly jumped to - confirmed with Playwright.
    panelContentEl.setAttribute('tabindex', '-1');
    panelContentEl.focus();
  }
  updateDocumentTitle();
}

function closePanel() {
  panelEl.classList.remove('open');
  appEl.classList.remove('page-mode');
  setTimeout(() => map.invalidateSize(), 260);
  clearMonumentHighlight();
  restorePotwAfterPanel();
  // Always back to root, not location.pathname - since shareUrl() can now
  // leave the address bar on /monumento/<id>-<slug>/ (or /stats/, /about/,
  // ...) while a panel is open, pushing the current pathname unchanged
  // would strand the visitor there with the panel closed instead of back
  // on the plain map. Query string (active filters) carries over; hash
  // does not - location.hash is only ever a #stats-style legacy deep
  // link into one of these same panels (see WRITTEN_PAGE_TYPES), never
  // anything to preserve past a close.
  history.pushState(null, '', '/' + location.search);
  currentPanelState = null;
  updateDocumentTitle();
}

document.getElementById('panel-close').addEventListener('click', closePanel);

// Every panel-open path (selectMonument(), showMunicipalityPanel(), ...)
// pairs its openPanel() call with a history.pushState(), so the browser's/
// OS's own back button or swipe-back gesture already lands on the right
// history entry - it just did nothing *visible* before this, since nothing
// was listening for popstate. That read as most broken on mobile, where the
// panel is a bottom sheet leaving the map visible above it (see the 768px
// #panel CSS): back button, panel just sits there. Mirror the panel's own
// close button exactly - fully closed, back to the plain map - rather than
// trying to restore whatever panel (if any) was open before this one.
window.addEventListener('popstate', () => {
  if (panelEl.classList.contains('open')) closePanel();
});

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

// Commons' Special:FilePath redirects straight to a rendered thumbnail of
// any width, keyed only by filename - no API call needed to know a photo's
// URL up front, which is what makes preloadNeighbors() below possible.
// Works for video files too (confirmed by hand): Commons redirects a
// width= request for a .webm the same way, to a real JPG poster frame -
// exactly what's needed for gallery thumbnails and the drag-preview clone,
// neither of which plays video, they just need something to show.
function commonsThumbUrl(filename, width) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}

// The *playable* URL for a video file - unlike commonsThumbUrl() this
// needs a real API call, because a video's original upload can be
// enormous (this project's own example, Pirámide de los Italianos' video,
// is a 226MB 4K original) and isn't something to hand a <video> element
// and hope for the best. videoinfo's own `derivatives` list is Commons'
// pre-transcoded, much smaller versions of the same file - prefer a
// modest one (480p, a few MB, still watchable) over the original, only
// falling back to whatever's actually available if that specific transcode
// doesn't exist (e.g. a very recent upload Commons hasn't transcoded yet).
async function fetchVideoInfo(filename) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&prop=videoinfo' +
    '&viprop=derivatives|url&format=json&origin=*&titles=' +
    encodeURIComponent('File:' + filename);
  const resp = await fetch(url);
  const data = await resp.json();
  const page = Object.values(data.query.pages)[0];
  const info = page?.videoinfo?.[0];
  if (!info) return null;
  const derivatives = info.derivatives || [];
  const videoUrl =
    derivatives.find((d) => d.transcodekey === '480p.vp9.webm')?.src ||
    derivatives.find((d) => d.transcodekey?.startsWith('360p') && d.type?.startsWith('video/webm'))?.src ||
    derivatives.find((d) => d.transcodekey?.startsWith('240p'))?.src ||
    info.url; // no transcode ready yet - the original is all there is
  return { videoUrl };
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
    thumbUrl: commonsThumbUrl(filename, 500),
    pageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
    artistHtml: meta.Artist?.value || null,
    license: meta.LicenseShortName?.value || null,
    licenseUrl: meta.LicenseUrl?.value || null,
  };
}

// Fires off a plain Image() fetch for both of `index`'s neighbors, in the
// exact size (width=500) the hero itself displays - matching the URL
// exactly is what lets the browser's own HTTP cache serve goToIndex()'s
// later mainImageEl.src= from memory instead of hitting the network. Both
// directions, since a swipe can go either way; out-of-range neighbors (the
// ends of the gallery) are just skipped. Nothing to await - the point is
// to let these fetches run in the background while the current photo sits
// on screen, not to block on them.
function preloadNeighbors(files, index) {
  for (const i of [index - 1, index + 1]) {
    if (i < 0 || i >= files.length) continue;
    new Image().src = commonsThumbUrl(files[i], 500);
  }
}

// Other photos (and videos - see VIDEO_EXTENSIONS) in the monument's
// Commons category, if it has one (P373) - filtered to actual media files
// (not PDFs, DjVu scans, audio, ...), excluding whatever's already the
// main P18 image so the gallery doesn't just repeat it.
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
        const isMedia = IMAGE_EXTENSIONS.test(title) || VIDEO_EXTENSIONS.test(title);
        if (isMedia && title !== excludeFilename && !seenFiles.has(title)) {
          seenFiles.add(title);
          files.push(title);
        }
      }
    }
  }

  return files.slice(0, MAX_FILES);
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

// Mirrors scripts/build_monument_pages.py's slugify() exactly (NFKD-fold
// diacritics, drop anything left outside a-z0-9, hyphen-join, trim) - same
// record.name in, same slug out, so a live-browsed URL matches that
// monument's own pre-built static page. Purely cosmetic if it ever drifts
// (the id prefix alone is what bootstrap actually reads back), but worth
// keeping in sync so a copied/shared link looks identical either way.
function slugify(name) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics (á -> a)
    .replace(/[^\x00-\x7f]/g, ''); // drop anything left outside ASCII
  const slug = ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'monumento';
}

// Same /monumento/<id>-<slug>/ path as the crawlable static page
// (scripts/build_monument_pages.py) - used for both the share button and
// every internal pushState() when opening a monument, so a copied address
// bar link and a bot-shared link are the same URL, and the live app is
// never left showing a raw ?id= while browsing. Old ?id= links keep
// resolving (see the bootstrap deep-link parsing below) - this only
// changes what new links look like going forward.
// Opening a monument from the map is a pushState, which makes no request,
// so the server otherwise only ever hears about monuments someone landed
// on directly (a search result, a shared link). This fires one HEAD at
// that monument's own static page so the visit lands in the access log
// too - HEAD because only the log line is wanted, not the 180 lines of
// HTML, and ?v=app so an in-app open stays distinguishable from a real
// direct landing rather than quietly inflating the SEO numbers.
//
// Only called when updateUrl is set, which is precisely the "this is a
// new view someone navigated to" case: the bootstrap deep link already
// made a real request for the same page (counting it here would double
// it), and rerenderPanel()'s language-toggle redraw isn't a new view at
// all.
//
// Fire-and-forget by design: a failed count must never affect the panel,
// so every error path is swallowed. keepalive lets it survive the page
// being closed immediately after.
// The guides the interstitial links to, per language. Deliberately the
// specific first-steps pages rather than a help front page - "here's the
// help portal, good luck" is exactly the kind of link people bounce off.
// Every URL here was checked to resolve (the Spanish upload-form page is
// NOT the obvious translation of the English one: Commons:First steps/
// Upload form is Commons:Primeros pasos/Formulario de subida, and the
// literal guess 404s).
const CONTRIBUTION_GUIDES = {
  wikipedia: {
    es: {
      account: 'https://es.wikipedia.org/wiki/Special:CrearCuenta',
      intro: 'https://es.wikipedia.org/wiki/Ayuda:Introducci%C3%B3n',
      wizard: 'https://es.wikipedia.org/wiki/Wikipedia:Asistente_para_la_creaci%C3%B3n_de_art%C3%ADculos',
      sources: 'https://es.wikipedia.org/wiki/Wikipedia:Referencias',
    },
    en: {
      account: 'https://en.wikipedia.org/wiki/Special:CreateAccount',
      intro: 'https://en.wikipedia.org/wiki/Help:Introduction',
      wizard: 'https://en.wikipedia.org/wiki/Wikipedia:Article_wizard',
      sources: 'https://en.wikipedia.org/wiki/Wikipedia:Citing_sources',
    },
  },
  commons: {
    es: {
      account: 'https://commons.wikimedia.org/wiki/Special:CreateAccount',
      first: 'https://commons.wikimedia.org/wiki/Commons:Primeros_pasos',
      form: 'https://commons.wikimedia.org/wiki/Commons:Primeros_pasos/Formulario_de_subida',
      license: 'https://commons.wikimedia.org/wiki/Commons:Primeros_pasos/Selecci%C3%B3n_de_licencia',
    },
    en: {
      account: 'https://commons.wikimedia.org/wiki/Special:CreateAccount',
      first: 'https://commons.wikimedia.org/wiki/Commons:First_steps',
      form: 'https://commons.wikimedia.org/wiki/Commons:First_steps/Upload_form',
      license: 'https://commons.wikimedia.org/wiki/Commons:First_steps/License_selection',
    },
  },
};

const INTRO_SEEN_KEY = 'patrimonioabierto_intro_seen';

function introAlreadySeen(kind) {
  try {
    return (localStorage.getItem(INTRO_SEEN_KEY) || '').split(',').includes(kind);
  } catch (e) {
    return false; // private mode / storage blocked - showing it again is the harmless failure
  }
}

function rememberIntroSeen(kind) {
  try {
    const seen = new Set((localStorage.getItem(INTRO_SEEN_KEY) || '').split(',').filter(Boolean));
    seen.add(kind);
    localStorage.setItem(INTRO_SEEN_KEY, [...seen].join(','));
  } catch (e) {
    /* nothing to do - worst case they see it once more */
  }
}

// Shown once per kind before the first hand-off to Wikipedia/Commons, then
// never again: someone who already contributes shouldn't have to dismiss a
// primer on every monument, and the whole point of these buttons is that
// people press them.
//
// `destination` is the finished /go/ URL the caller already built, passed
// through untouched - the prefilled title/description/coordinates/category
// parameters are what make the hand-off worth anything, and rebuilding
// them here would be a second place to get them wrong.
function showContributionIntro(kind, destination) {
  const lang = CONTRIBUTION_GUIDES[kind][currentLang] ? currentLang : 'es';
  const g = CONTRIBUTION_GUIDES[kind][lang];
  const links =
    kind === 'wikipedia'
      ? [[g.intro, 'intro.wikipedia.link_intro'], [g.wizard, 'intro.wikipedia.link_wizard'], [g.sources, 'intro.wikipedia.link_sources'], [g.account, 'intro.wikipedia.link_account']]
      // Account first for Commons: there it isn't further reading, it's the
      // precondition - an upload without one simply cannot happen.
      : [[g.account, 'intro.commons.link_account'], [g.first, 'intro.commons.link_first'], [g.form, 'intro.commons.link_form'], [g.license, 'intro.commons.link_license']];

  const modal = document.createElement('div');
  modal.className = 'intro-modal';
  modal.innerHTML = `
    <div class="intro-card" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <h2 id="intro-title">${t(`intro.${kind}.title`)}</h2>
      <p class="intro-body">${t(`intro.${kind}.body`)}</p>
      <ul class="intro-links">
        ${links.map(([href, key]) => `<li><a href="${href}" target="_blank" rel="noopener">${t(key)}</a></li>`).join('')}
      </ul>
      <a class="badge contribute-cta-btn intro-continue" href="${destination}" target="_blank" rel="noopener nofollow">${t(`intro.${kind}.continue`)}</a>
      <button type="button" class="intro-cancel">${t('intro.cancel')}</button>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    modal.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  // Only continuing is remembered. An earlier version also remembered a
  // second "I already know how this works" button, which was the same
  // action as continuing minus the destination - someone who just pressed
  // the CTA wants to get there, so offering them a way to agree and go
  // nowhere was only ever a way to lose them. Cancelling now means what it
  // says: no hand-off, and the primer is still there next time.
  modal.querySelector('.intro-continue').addEventListener('click', () => {
    rememberIntroSeen(kind);
    close();
  });
  modal.querySelector('.intro-cancel').addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close(); // backdrop
  });
  modal.querySelector('.intro-continue').focus();
}

// Wires a CTA so a plain left click shows the primer first, while
// ctrl/cmd/middle-click keep doing what they do on any other link - the
// href is already the real destination, so those paths need no help and
// must not be hijacked (same reasoning as wireSpaLink()).
function wireContributionCtas(container) {
  container.querySelectorAll('a[data-cta]').forEach((el) => wireContributionCta(el, el.dataset.cta));
}

function wireContributionCta(el, kind) {
  if (!el) return;
  el.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (introAlreadySeen(kind)) return;
    e.preventDefault();
    showContributionIntro(kind, el.getAttribute('href'));
  });
}

function countMonumentView(record) {
  try {
    fetch(`${shareUrl(record)}?v=app`, { method: 'HEAD', cache: 'no-store', keepalive: true }).catch(() => {});
  } catch (e) {
    /* never let counting break browsing */
  }
}

function shareUrl(record) {
  return new URL(`/monumento/${record.jcyl_id}-${slugify(record.name)}/`, location.origin).toString();
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

// P856 comes from Wikidata, which anyone can edit, and it goes straight
// into an href - so it is the one URL on this page that cannot be trusted
// on sight. Anything that is not http(s) is dropped (javascript: and data:
// URLs are the reason), and the value is returned normalised by the URL
// parser, which percent-encodes the quotes an attribute-escape would need.
// Verified against both.
function safeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function linkBadges(record, sitelink, officialWebsite) {
  const qid = Array.isArray(record.wikidata_qid) ? record.wikidata_qid[0] : record.wikidata_qid;
  // JCyL first - they're the ones judging this, their own record deserves
  // top billing over our own share button and the other sources.
  // Two rows, because these are two different kinds of thing and mixing
  // them made the row read as an undifferentiated pile of pills. First:
  // where this information comes from - the sources, JCyL first (they're
  // the ones judging this, their own record deserves top billing).
  // Second: what you can do with the monument itself rather than with its
  // data. Separate containers rather than one wrapping flex row, so the
  // split holds at every width instead of depending on where the line
  // happens to break.
  let html = '<div class="monument-links">';
  html += '<div class="link-badges">';
  html += `<a class="badge jcyl" href="${record.reference_url}" target="_blank" rel="noopener">${t('badge.jcyl')}</a>`;
  if (qid) {
    html += `<a class="badge wikidata" href="https://www.wikidata.org/wiki/${qid}" target="_blank" rel="noopener">${ICON_WIKIDATA}${t('badge.wikidata')}</a>`;
  }
  if (sitelink) {
    html += `<a class="badge wikipedia" href="${sitelink.url}" target="_blank" rel="noopener">${ICON_WIKIPEDIA}${t('badge.wikipedia')}</a>`;
  }
  html += '</div>';

  // Every record here is a real place someone can stand in front of, and
  // the panel above often asks them to go photograph it - so "how do I
  // actually get there" is the obvious missing step. Just a link: nothing
  // is requested from Google until it's clicked, so this adds no
  // third-party contact to a page load and nothing to the Privacidad
  // page's list of services the site itself loads. dir/?api=1&destination=
  // is Google's documented, stable URL form; on a phone it hands off to
  // the installed Maps app. Swap in
  // https://www.openstreetmap.org/directions?to=lat,lon to keep it inside
  // the free-knowledge ecosystem - same one line.
  html += '<div class="link-badges link-actions">';
  // In this row, not up with the sources: an official site is where
  // opening hours and tickets live, which is something you do with the
  // monument rather than something you read about its data. Only ~90 of
  // the linked monuments have one, so the row stays two items wide for
  // almost everything.
  const website = safeExternalUrl(officialWebsite);
  if (website) {
    html += `<a class="badge website" href="${website}" target="_blank" rel="noopener">${t('badge.website')}</a>`;
  }
  html += `<a class="badge directions" href="https://www.google.com/maps/dir/?api=1&destination=${record.lat},${record.lon}" target="_blank" rel="noopener">${t('badge.directions')}</a>`;
  html += shareButtonHtml();
  html += '</div>';
  html += '</div>';
  return html;
}

// A full-bleed hero at the top of every panel (monument, About, Contribute
// alike) - Commons photos are what this project actually has to show off,
// so they get the whole width instead of a small boxed-in thumbnail. Panels
// with no photo (About/Contribute, or a monument with genuinely no image
// anywhere) fall back to a plain gradient in the same spot, so every panel
// still opens with the same visual rhythm.
// loading (default false): the photo isn't known to be absent yet, it just
// hasn't arrived - selectMonument() renders the panel immediately and only
// then goes off to Wikidata/Wikipedia/Commons for the image, which can take
// a visible moment. Without this the wait is drawn with the exact same
// placeholder as "this monument genuinely has no photo", so the panel looks
// finished and then a photo drops into it out of nowhere. Callers that
// already know the answer (every other panel type, and the error path)
// leave it off. Cleared by clearLoadingState() on the one path that resolves
// without re-rendering the hero.
// Placeholder shaped like what's actually on the way - a row of gallery
// thumbnails, a few lines of Wikipedia extract, the link badges - instead
// of leaving most of the panel blank under a lone "Cargando…" line while
// the Wikidata/Commons round-trip finishes. Deliberately approximate: it
// mirrors the *shape* of a loaded monument, not any particular one (a
// monument with no photo or no article still gets the full skeleton, then
// its own CTA where that block would have been), which is the usual
// trade-off for skeletons and much better than the panel looking finished
// and empty. aria-hidden: the .loading line right above it is the real,
// announced status - this is decoration on top of it.
function loadingSkeletonHtml() {
  const thumbs = Array.from({ length: 4 }, () => '<div class="skeleton skeleton-thumb"></div>').join('');
  // Ragged widths, not four identical bars - a paragraph doesn't end flush,
  // and the last short line is most of what makes this read as text.
  const lines = [100, 97, 99, 62].map((w) => `<div class="skeleton skeleton-line" style="width:${w}%"></div>`).join('');
  const badges = [104, 88, 120].map((w) => `<div class="skeleton skeleton-badge" style="width:${w}px"></div>`).join('');
  return `
    <div class="skeleton-block" aria-hidden="true">
      <div class="skeleton-gallery">${thumbs}</div>
      <div class="skeleton-lines">${lines}</div>
      <div class="skeleton-badges">${badges}</div>
    </div>
  `;
}

// Takes down every part of the loading treatment at once - hero spinner
// and body skeleton - so the one path that resolves without re-rendering
// the panel can't take half of it down and leave the other half running.
function clearLoadingState() {
  const hero = panelContentEl.querySelector('.hero-loading');
  if (hero) {
    hero.classList.remove('hero-loading');
    hero.querySelector('.hero-spinner')?.remove();
  }
  panelContentEl.querySelector('.skeleton-block')?.remove();
}

function heroBlock({ imageUrl, linkUrl, kicker, title, placeholderIcon, loading = false }) {
  const scrim = `
    <div class="hero-scrim">
      ${kicker ? `<div class="hero-kicker">${kicker}</div>` : ''}
      <h2 class="hero-title">${title}</h2>
    </div>
  `;
  // Populated by updateHeroDots() once the gallery's real length is known -
  // empty (and so, per its :empty CSS rule, invisible) for every panel type
  // that isn't a monument with >1 photo. Mobile-only by CSS: desktop already
  // has click-based gallery/grid access, a swipe affordance would be noise
  // there.
  const dots = `<div class="hero-dots" id="hero-dots"></div>`;
  if (!imageUrl) {
    // Category-appropriate large watermark instead of a flat gradient -
    // reuses the same emoji already used for map markers, so a castle with
    // no photo still visually reads as "castle" rather than looking like a
    // generic empty/broken state.
    const icon = placeholderIcon ? `<div class="hero-placeholder-icon">${placeholderIcon}</div>` : '';
    const spinner = loading ? '<div class="hero-spinner" aria-hidden="true"></div>' : '';
    return `<div class="hero hero-fallback${loading ? ' hero-loading' : ''}">${icon}${spinner}${scrim}${dots}</div>`;
  }
  // main-image-bg is the blurred backdrop for portrait photos/videos - see
  // the CSS comment on .hero-img-bg. Same src as the real photo, just
  // decorative (hidden from screen readers), and hidden by default (only
  // .hero-portrait shows it) so it costs nothing for the common
  // landscape-photo case. A sibling of #main-image-link, not nested inside
  // its <a>, on purpose: goToIndex() needs to be able to hide the
  // foreground (swapping in #main-video instead) while leaving this
  // backdrop showing behind it, which nesting would rule out.
  const bgImg = `<img id="main-image-bg" class="hero-img-bg" src="${imageUrl}" alt="" aria-hidden="true">`;
  const fgImg = `<img id="main-image" class="hero-img" src="${imageUrl}" alt="">`;
  const fgEl = linkUrl
    ? `<a href="${linkUrl}" target="_blank" rel="noopener" id="main-image-link">${fgImg}</a>`
    : fgImg;
  // #main-video is a sibling too, not wrapped inside #main-image-link's
  // <a> - a video's own play/pause controls shouldn't risk a click
  // bubbling into a Commons-navigation link the way it safely can for a
  // plain <img>. Hidden until goToIndex() actually swaps a video into the
  // hero slot - the initial photo here (P18) is always an image; videos
  // only ever arrive later, via the gallery.
  // preload="metadata", not the browser default (which for some is "auto")
  // - goToIndex() doesn't set .src until fetchVideoInfo() resolves anyway,
  // but being explicit here means no surprise eager-downloading later just
  // because a browser's default happened to be more aggressive than this.
  const video = `<video id="main-video" class="hero-video" controls playsinline preload="metadata" hidden></video>`;
  // Same spinner as the fallback branch above (one loading idiom, not two)
  // - goToIndex() shows this for as long as a swipe's new photo isn't
  // already sitting in the browser cache, so the hero doesn't just keep
  // showing the previous photo with no sign a swipe even registered.
  const swipeSpinner = `<div class="hero-spinner" id="hero-swipe-spinner" hidden aria-hidden="true"></div>`;
  return `<div class="hero">${bgImg}${fgEl}${video}${swipeSpinner}${scrim}${dots}</div>`;
}

// Small dot-per-photo indicator, mobile-only (see .hero-dots CSS) - the
// only visual hint that the hero is swipeable at all, since a swipe gesture
// with zero affordance is undiscoverable.
function updateHeroDots(index, total) {
  const el = document.getElementById('hero-dots');
  if (!el) return;
  el.innerHTML =
    total > 1
      ? Array.from({ length: total }, (_, i) => `<span class="hero-dot${i === index ? ' active' : ''}"></span>`).join('')
      : '';
}

// Touch-swipe on the hero photo, mobile only in practice: touch events
// simply don't fire from a mouse, so this needs no separate desktop
// gate - a touchscreen desktop is the one edge case where it'd also
// trigger, which is fine, that's still a real swipe gesture. Wired once per
// fresh panel render (the .hero element persists across goToIndex() calls,
// which only patch its child <img> src attributes, not recreate it - no
// need to re-wire on every swipe).
//
// Live-tracks the finger rather than just animating on release: the
// dragged-from photo (#main-image-link, which carries both #main-image and
// its portrait backdrop along as its children) and a plain preview clone of
// the neighbor it's revealing both move 1:1 with touchmove, the same way a
// native photo swipe does. commonsThumbUrl() (no API call needed - see its
// own comment) is what makes creating that preview mid-gesture cheap, and
// preloadNeighbors() already has its image sitting in the browser's cache
// most of the time.
function wireHeroSwipe() {
  const hero = panelContentEl.querySelector('.hero');
  if (!hero) return;
  const COMMIT_THRESHOLD_PX = 50; // drag past this far to commit to the next/prev photo; short of it, snap back
  const SETTLE_MS = 240; // release-to-rest animation length - kept in one place so the CSS and the cleanup timeout below can't drift apart
  const EDGE_RESISTANCE = 3; // divides the drag at the first/last photo, where there's no neighbor to reveal - rubber-band, not a dead stop

  let startX = null;
  let startY = null;
  let dx = 0;
  let axis = null; // null until the first move past a small deadzone decides it: 'x' (ours) or 'y' (let the page scroll, untouched)
  let previewDirection = 0; // +1 dragging left (next photo enters from the right), -1 dragging right (previous enters from the left)
  let previewEl = null;
  let settleTimer = null;

  const currentEl = () => document.getElementById('main-image-link') || document.getElementById('main-image');

  // Jumps straight to the resting state with no animation - used both by
  // the normal end-of-settle cleanup and to recover instantly if a new
  // gesture starts while a previous one is still mid-settle, so state never
  // has two drags' worth of leftover transforms fighting each other.
  function resetImmediately() {
    clearTimeout(settleTimer);
    settleTimer = null;
    previewEl?.remove();
    previewEl = null;
    const el = currentEl();
    if (el) {
      el.style.transition = 'none';
      el.style.transform = '';
    }
  }

  hero.addEventListener(
    'touchstart',
    (e) => {
      if (currentGalleryState.files.length < 2) return;
      resetImmediately(); // in case a previous drag's release animation was still settling
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      axis = null;
    },
    { passive: true }
  );

  hero.addEventListener(
    'touchmove',
    (e) => {
      if (startX === null) return;
      dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      if (axis === null) {
        // A few px of deadzone before committing to an axis, so a slightly
        // wobbly finger at the very start of a vertical scroll doesn't get
        // mistaken for a horizontal swipe (or vice versa).
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (axis !== 'x') return; // vertical: leave it to the page/panel's own scrolling, untouched from here on
        const { index, files } = currentGalleryState;
        previewDirection = dx < 0 ? 1 : -1;
        const previewIndex = index + previewDirection;
        if (previewIndex >= 0 && previewIndex < files.length) {
          // Mirrors #main-image-link's own bg+fg pair (see the CSS) - the
          // wrapper is what gets dragged, its two <img> children just ride
          // along untransformed themselves.
          previewEl = document.createElement('div');
          previewEl.className = 'hero-drag-preview';
          const previewSrc = commonsThumbUrl(files[previewIndex], 500);
          const previewBg = document.createElement('img');
          previewBg.className = 'hero-drag-preview-bg';
          previewBg.alt = '';
          previewBg.src = previewSrc;
          const previewFg = document.createElement('img');
          previewFg.className = isVideoFile(files[previewIndex]) ? 'hero-drag-preview-img video-thumb' : 'hero-drag-preview-img';
          previewFg.alt = '';
          previewFg.src = previewSrc;
          previewEl.append(previewBg, previewFg);
          hero.insertBefore(previewEl, hero.querySelector('.hero-scrim'));

          // Same check applyHeroOrientation() runs for the settled photo,
          // aimed at this temporary clone instead: preloadNeighbors() has
          // usually already pulled previewSrc into cache by the time you
          // actually swipe, so this often resolves before the preview is
          // even visible - fitted with its blurred backdrop from the very
          // first frame, instead of showing full-bleed-cropped throughout
          // the drag and only popping to fitted once the swap commits.
          const decideOrientation = () => {
            const portrait = previewFg.naturalHeight > previewFg.naturalWidth;
            previewFg.classList.toggle('portrait', portrait);
            previewBg.style.display = portrait ? 'block' : 'none';
          };
          if (previewFg.complete && previewFg.naturalWidth) decideOrientation();
          else previewFg.addEventListener('load', decideOrientation, { once: true });
        }
        const el = currentEl();
        if (el) el.style.transition = 'none'; // direct 1:1 tracking below, no easing lag behind the finger
      }
      if (axis !== 'x') return;
      e.preventDefault(); // committed to a horizontal swipe now - don't also let the page interpret it as anything else

      const heroWidth = hero.getBoundingClientRect().width || 1;
      const draggedPx = previewEl ? dx : dx / EDGE_RESISTANCE;
      const el = currentEl();
      if (el) el.style.transform = `translateX(${draggedPx}px)`;
      if (previewEl) previewEl.style.transform = `translateX(${previewDirection * heroWidth + dx}px)`;
    },
    { passive: false }
  );

  function endDrag() {
    if (startX === null) return;
    startX = null;
    if (axis !== 'x') {
      axis = null;
      return;
    }
    axis = null;

    const { index, files } = currentGalleryState;
    const targetIndex = index + previewDirection;
    const committed = !!previewEl && Math.abs(dx) >= COMMIT_THRESHOLD_PX && targetIndex >= 0 && targetIndex < files.length;
    const heroWidth = hero.getBoundingClientRect().width || 1;

    const el = currentEl();
    if (el) {
      el.style.transition = `transform ${SETTLE_MS}ms ease`;
      el.style.transform = `translateX(${committed ? previewDirection * -heroWidth : 0}px)`;
    }
    if (previewEl) {
      previewEl.style.transition = `transform ${SETTLE_MS}ms ease`;
      previewEl.style.transform = `translateX(${committed ? 0 : previewDirection * heroWidth}px)`;
    }

    settleTimer = setTimeout(() => {
      settleTimer = null;
      previewEl?.remove();
      previewEl = null;
      if (el) {
        el.style.transition = '';
        el.style.transform = '';
      }
      // No wraparound at the ends - out-of-range goToIndex() calls are just
      // no-ops, same as clicking past the edge of the gallery would be (not
      // that this path can reach one: `committed` already checked range).
      if (committed) goToIndex(targetIndex);
    }, SETTLE_MS);
  }

  hero.addEventListener('touchend', endDrag);
  hero.addEventListener('touchcancel', endDrag);
}

// Portrait photos/videos (naturally taller than wide) get letterboxed with
// a blurred backdrop instead of force-cropped to fill the hero box - see
// the .hero-img-bg CSS comment. Handles the img already being loaded from
// cache (no 'load' event will fire in that case) as well as the normal
// async case - videos have their own equivalent (videoWidth/videoHeight,
// known once 'loadedmetadata' fires, or already if we're re-checking after
// the fact).
function applyHeroOrientation(isVideo) {
  const el = document.getElementById(isVideo ? 'main-video' : 'main-image');
  const hero = el?.closest('.hero');
  if (!el || !hero) return;
  if (isVideo) {
    const decide = () => hero.classList.toggle('hero-portrait', el.videoHeight > el.videoWidth);
    if (el.videoWidth) decide();
    else el.addEventListener('loadedmetadata', decide, { once: true });
    return;
  }
  const decide = () => {
    hero.classList.toggle('hero-portrait', el.naturalHeight > el.naturalWidth);
  };
  if (el.complete && el.naturalWidth) {
    decide();
  } else {
    el.addEventListener('load', decide, { once: true });
  }
}

// Only description/descriptionlang/categories/lat/lon are real, working
// UploadWizard query params without a registered campaign (verified against
// Commons:Upload Wizard/Fields prefilling) - notably NOT a Wikidata QID or
// "depicts" statement, which needs either a manual step after upload or a
// registered campaign (a real Commons permissions process). lat/lon here
// are legitimate: they're the monument's own coordinates, i.e. genuinely
// where the photo would be taken.
// Points at this site's own /go/upload-photo rather than straight at
// Commons: the Caddyfile redirects it there unchanged (fixed host, raw
// query), and the hop leaves a line in the access log. "Someone went to
// upload a photo" is one of only two real success signals this project
// can observe at all - every other number it has is a page view. The
// trade-off is that hovering the link shows this domain instead of
// commons.wikimedia.org, which is why the path says where it goes.
function uploadWizardUrl(record, commonsCategory) {
  const params = new URLSearchParams({
    descriptionlang: currentLang,
    description: record.name,
    lat: record.lat,
    lon: record.lon,
  });
  if (commonsCategory) params.set('categories', commonsCategory);
  return `/go/upload-photo?${params.toString()}`;
}

// action=edit on a title that doesn't exist yet lands on Wikipedia's own
// "there's no article called X" page - which itself offers the guided
// Article Wizard alongside a raw edit box (verified by hand), so this is
// the one link that covers both "just let me start typing" and "actually
// walk me through it" without picking one for the visitor.
// Via /go/wikipedia-article/<lang>, for the same reason as
// uploadWizardUrl() above - the Caddyfile has one branch per language
// with the host hardcoded, so anything it doesn't know falls through to
// the SPA instead of redirecting. Keep those two in step if a third UI
// language is ever added.
function wikipediaCreateUrl(record, lang) {
  return `/go/wikipedia-article/${lang}?${new URLSearchParams({ title: record.name, action: 'edit' })}`;
}

function licenseLineHtml(meta) {
  if (!meta) return '';
  return meta.license
    ? `${meta.artistHtml ? meta.artistHtml + ' · ' : ''}<a href="${meta.licenseUrl || meta.pageUrl}" target="_blank" rel="noopener">${meta.license}</a>`
    : (meta.artistHtml || '');
}

// The single place that moves the hero to a different photo - a gallery
// thumbnail click and a mobile hero swipe both just call this with a
// different target index (see currentGalleryState's own comment for why
// this replaced the old "swap places" bookkeeping). Out-of-range indexes
// (swiping past either end, or a stale click) are silent no-ops.
async function goToIndex(index) {
  const { files } = currentGalleryState;
  if (index < 0 || index >= files.length || index === currentGalleryState.index) return;

  const mainImageEl = document.getElementById('main-image');
  const mainImageBgEl = document.getElementById('main-image-bg');
  const mainImageLinkEl = document.getElementById('main-image-link');
  const mainVideoEl = document.getElementById('main-video');
  const captionEl = document.getElementById('image-caption');
  const spinnerEl = document.getElementById('hero-swipe-spinner');
  if (!mainImageEl) return;

  const filename = files[index];
  const isVideo = isVideoFile(filename);

  // The poster/thumbnail URL is deterministic from the filename
  // (commonsThumbUrl() needs no API round-trip, and works for video too -
  // see its own comment) - and preloadNeighbors() already kicked off this
  // exact fetch, at this exact size, back when the *previous* item went
  // up. So the swap itself doesn't need to wait on any API call: painting
  // here comes straight out of the browser's cache instead of stalling on
  // a round-trip just to re-derive a URL we already knew, which used to
  // make every swipe visibly hang until that call resolved.
  const thumbUrl = commonsThumbUrl(filename, 500);
  if (mainImageBgEl) mainImageBgEl.src = thumbUrl; // blurred backdrop - same poster either way, video included

  if (mainVideoEl) {
    // Stop and fully release whatever was previously playing before
    // swapping content - a <video> element keeps buffering/playing in the
    // background otherwise, even once hidden.
    mainVideoEl.pause();
    mainVideoEl.removeAttribute('src');
    mainVideoEl.load();
    mainVideoEl.hidden = !isVideo;
  }
  if (mainImageLinkEl) mainImageLinkEl.hidden = isVideo;
  else mainImageEl.hidden = isVideo; // no link wrapper (shouldn't happen with a real gallery, but just in case) - hide the bare <img> itself instead
  if (isVideo) {
    if (mainVideoEl) mainVideoEl.poster = thumbUrl;
  } else {
    mainImageEl.src = thumbUrl;
  }
  applyHeroOrientation(isVideo);

  // The new photo is usually already in the browser's cache (see the
  // comment on thumbUrl above), in which case .complete is true the
  // instant .src is set and there's nothing to show a spinner for. When
  // it isn't - swiping faster than preloadNeighbors() can keep up, or a
  // slow connection - the old photo would otherwise just sit there with
  // no sign the swipe even registered until the new one suddenly pops in.
  // Photos only: a video swaps a poster attribute, not an <img>, with no
  // equivalent load event to hook here.
  if (spinnerEl) {
    if (!isVideo && !mainImageEl.complete) {
      spinnerEl.hidden = false;
      const thisIndex = index;
      const onSettled = () => {
        if (currentGalleryState.index !== thisIndex) return; // superseded by a later swipe - that one owns the spinner now
        spinnerEl.hidden = true;
      };
      mainImageEl.addEventListener('load', onSettled, { once: true });
      mainImageEl.addEventListener('error', onSettled, { once: true });
    } else {
      spinnerEl.hidden = true;
    }
  }

  currentGalleryState.index = index;
  updateHeroDots(index, files.length);
  preloadNeighbors(files, index);

  const galleryEl = panelContentEl.querySelector('.gallery');
  if (galleryEl) {
    // outerHTML swaps in a brand-new node, which would otherwise reset the
    // mobile filmstrip's horizontal scroll back to 0 - jarring when the
    // thumbnail that was just tapped sits at the right edge.
    const galleryScrollLeft = galleryEl.scrollLeft;
    galleryEl.outerHTML = renderGallery(files, index, currentGalleryState.commonsCategory);
    wireGalleryClicks();
    const newGalleryEl = panelContentEl.querySelector('.gallery');
    if (newGalleryEl) newGalleryEl.scrollLeft = galleryScrollLeft;
  }

  // License/author + the File: page link still need the API call - fetch
  // it in the background and patch the caption in once it lands, without
  // holding up the poster swap above. A video additionally needs its real
  // playable source resolved the same way (see fetchVideoInfo()) - done
  // alongside, not blocking on, the caption fetch.
  if (captionEl) captionEl.textContent = t('loading');
  try {
    const [meta, videoInfo] = await Promise.all([
      fetchImageMeta(filename),
      isVideo ? fetchVideoInfo(filename) : Promise.resolve(null),
    ]);
    if (currentGalleryState.index !== index) return; // swiped elsewhere before this landed
    if (mainImageLinkEl) mainImageLinkEl.href = meta.pageUrl;
    if (captionEl) captionEl.innerHTML = licenseLineHtml(meta);
    if (isVideo && mainVideoEl && videoInfo) mainVideoEl.src = videoInfo.videoUrl;
  } catch (err) {
    if (captionEl) captionEl.textContent = '';
  }
}

// Shows every photo in `files` except whichever is at `currentIndex` (i.e.
// currently in the hero slot) - always in their fixed original order, so
// thumbnails don't reshuffle position as you click/swipe through them the
// way the old swap-places version did.
function renderGallery(files, currentIndex, commonsCategory) {
  // Not just !files.length - a single-photo gallery would render one
  // thumbnail: itself, already sitting in the hero above. Nothing to
  // browse to, so nothing to show (matches wireHeroSwipe()'s own
  // files.length < 2 check disabling swipe for the same reason).
  if (files.length < 2) return '';
  // files.length > 12 means there's strictly more than what any one window
  // can show - fetchGalleryFiles itself caps at 24, so this can't just be
  // "we happened to fetch exactly the whole category".
  const hasMore = !!commonsCategory && files.length > 12;
  // One fewer thumbnail than usual exactly when the "see more" tile is
  // about to be appended - keeps thumbs+tile at the same total count
  // instead of spilling one item past it, which on the desktop grid means
  // spilling into a whole extra row for the sake of one tile.
  const windowSize = hasMore ? 11 : 12;
  // Whichever photo is currently in the hero slot stays visible (marked
  // .active, see the CSS) rather than being dropped from the strip - so if
  // it's outside the default window, slide the window forward just far
  // enough to keep it in view, rather than always starting at 0 regardless
  // of where you've swiped/clicked to.
  const start = currentIndex >= windowSize ? currentIndex - (windowSize - 1) : 0;
  // .gallery-thumb wraps each thumbnail <img> - needed for the video play
  // icon below (an ::after on a replaced element like <img> itself doesn't
  // render, per spec; a wrapper is the standard workaround), everything
  // else about sizing/hover/active stays on the <img> exactly as before.
  const thumbs = files
    .slice(start, start + windowSize)
    .map(
      (f, offset) => {
        const i = start + offset;
        const activeAttr = i === currentIndex ? ' class="active"' : '';
        const wrapClass = isVideoFile(f) ? ' class="gallery-thumb video-thumb"' : ' class="gallery-thumb"';
        return `<span${wrapClass}><img${activeAttr} src="https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=100"
              alt="" data-index="${i}"></span>`;
      }
    )
    .join('');
  // Links to the category page directly, which has no fetch cap and
  // browses the true full set, subcategories included.
  const seeMore = hasMore
    ? `<a class="gallery-more" href="https://commons.wikimedia.org/wiki/Category:${encodeURIComponent(commonsCategory)}" target="_blank" rel="noopener">${t('gallery.see_more')}</a>`
    : '';
  return `<div class="gallery">${thumbs}${seeMore}</div>`;
}

function wireGalleryClicks() {
  panelContentEl.querySelectorAll('.gallery img').forEach((img) => {
    img.addEventListener('click', () => goToIndex(Number(img.dataset.index)));
  });
}

// flyTo alone can land on a view where the target marker is still inside
// a cluster bubble - clustering only fully stops at zoom 18
// (markerClusterGroup's disableClusteringAtZoom), well past the zoom 14
// this settles on. A clustered marker isn't drawn at all, so
// highlightMonument() has nothing to show: you follow a "Cerca de aquí"
// row (whose whole premise is that the monuments are close together, i.e.
// exactly the ones most likely to still be clustered) and arrive at a map
// with no highlighted marker anywhere - confirmed before this existed.
// markers.zoomToShowLayer() is Leaflet.markercluster's own answer to
// "reveal this one marker": it zooms/spiderfies only as far as actually
// needed, rather than jumping to some fixed deep zoom whether or not the
// marker was already visible. Either branch finishes on the same
// Math.max(zoom, 14) + exact-coordinate view, so where you end up doesn't
// depend on which one ran.
function flyToMonument(record) {
  const target = markerByJcylId.get(String(record.jcyl_id));
  const settle = () => map.setView([record.lat, record.lon], Math.max(map.getZoom(), 14));
  if (target && markers.getVisibleParent(target) !== target) {
    markers.zoomToShowLayer(target, settle);
  } else {
    map.flyTo([record.lat, record.lon], Math.max(map.getZoom(), 14));
  }
}

async function selectMonument(record, { flyTo = false, updateUrl = true, featuredFile = null } = {}) {
  currentPanelState = { type: 'monument', record };

  panelContentEl.innerHTML = `
    ${heroBlock({ kicker: heroKicker(record), title: record.name, placeholderIcon: CATEGORY_ICONS[record.category] || DEFAULT_ICON, loading: true })}
    <div class="panel-body">
      <div class="meta">${bodyMetaLine(record)}</div>
      <div class="loading" role="status">${t('loading')}</div>
      ${loadingSkeletonHtml()}
    </div>
  `;
  openPanel(() => {
    if (flyTo) flyToMonument(record);
  });

  if (updateUrl) {
    history.pushState(null, '', shareUrl(record));
    countMonumentView(record);
  }

  if (!record.already_linked) {
    // Not linked to Wikidata at all yet - which trivially means no known
    // Wikipedia article either, same as the linked-but-no-sitelink case
    // further down. Worth the identical CTA here too: this is most of
    // what a visitor clicking around actually lands on (633 unlinked vs.
    // ~860 linked-but-no-article), so gating the suggestion on "already
    // linked" would miss most of its actual audience.
    // Only path that finishes without re-rendering the panel (the two
    // below both replace panelContentEl wholesale), so it's the only one
    // that has to take the loading treatment down itself - an unlinked
    // monument has no photo or article to wait for, and leaving it
    // spinning would promise content that's never coming.
    clearLoadingState();
    panelContentEl.querySelector('.loading').outerHTML = `
      <div class="missing-note">${t('missing.note')}</div>
      <div class="contribute-cta">
        <div class="contribute-cta-text">${t('wikipedia_cta.text')}</div>
        <a class="badge contribute-cta-btn" data-cta="wikipedia" href="${wikipediaCreateUrl(record, currentLang)}" target="_blank" rel="noopener nofollow">${t('wikipedia_cta.button')}</a>
      </div>
      <div class="link-badges"><a class="badge jcyl" href="${record.reference_url}" target="_blank" rel="noopener">${t('badge.jcyl')}</a>${shareButtonHtml()}</div>
      ${renderNearby(record)}
    `;
    wireShareButton(record);
    wireContributionCtas(panelContentEl);
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
    // Free: the entity is already fetched for P18 and P373, so the
    // official website costs no extra request and nothing in the dataset.
    const officialWebsite = entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value;

    let [summary, mainImageMeta, galleryFiles] = await Promise.all([
      sitelink ? fetchWikipediaSummary(sitelinkLang, sitelink.title) : null,
      p18 ? fetchImageMeta(p18) : null,
      commonsCategory ? fetchGalleryFiles(commonsCategory, p18) : Promise.resolve([]),
    ]);

    // No P18 but the Commons category has photos anyway - promote the
    // first one to the main slot rather than showing an orphan gallery
    // with nothing to swap into.
    if (!mainImageMeta && galleryFiles.length) {
      mainImageMeta = await fetchImageMeta(galleryFiles[0]);
      galleryFiles = galleryFiles.slice(1);
    }

    // A caller can ask for a specific photo to lead with (picture-of-the-
    // week: clicking through should open on the exact photo the card
    // showed, not whatever P18/gallery order would otherwise put in the
    // hero slot) - swap it into the main slot, pushing whatever was there
    // back into the gallery grid instead of just dropping it.
    if (featuredFile && mainImageMeta?.filename !== featuredFile) {
      const displaced = mainImageMeta;
      mainImageMeta = await fetchImageMeta(featuredFile);
      galleryFiles = galleryFiles.filter((f) => f !== featuredFile);
      if (displaced) galleryFiles = [displaced.filename, ...galleryFiles];
    }
    const files = mainImageMeta ? [mainImageMeta.filename, ...galleryFiles] : [];
    currentGalleryState = { files, index: 0, commonsCategory };
    preloadNeighbors(files, 0); // get photo #2 (if any) in flight before the first swipe even happens

    // Media, then each contribution call-to-action right beside the thing
    // it offers to fill in, then links, then nearby. The order is the
    // point: an invitation to add a photo means something directly under
    // the empty space where a photo would be, and much less at the bottom
    // of the panel among the links.
    //
    // A Wikidata "facts" block - architect, style, inception - used to sit
    // between the CTAs and the links, and was removed: coverage of those
    // properties is patchy enough that it read as randomly present on some
    // monuments and absent on most, rather than as a reliable block.
    let bodyHtml = '';
    if (mainImageMeta) {
      bodyHtml += `<div class="image-caption" id="image-caption">${licenseLineHtml(mainImageMeta)}</div>`;
    }
    bodyHtml += `<div class="meta">${bodyMetaLine(record)}</div>`;
    bodyHtml += renderGallery(files, 0, commonsCategory);
    if (!mainImageMeta) {
      // Has a Wikidata item but genuinely no photo anywhere (no P18, no
      // Commons category images either) - this is exactly the case worth a
      // direct call to action, prefilled with what we can legitimately
      // prefill without a registered UploadWizard campaign (description,
      // language, the monument's own coordinates). "depicts <QID>" can't be
      // preset this way - that needs either a manual step after upload, or
      // a registered campaign (a real Commons permissions process, out of
      // scope here) - so the CTA text says so rather than implying it's automatic.
      bodyHtml += `
        <div class="contribute-cta">
          <div class="contribute-cta-text">${t('upload_cta.text')}</div>
          <a class="badge contribute-cta-btn" data-cta="commons" href="${uploadWizardUrl(record, commonsCategory)}" target="_blank" rel="noopener nofollow">${t('contribute.upload.button')}</a>
        </div>
      `;
    }
    if (summary?.extract) {
      bodyHtml += `<div class="extract">${summary.extract}</div>`;
      bodyHtml += `<a class="badge read-more-btn" href="${sitelink.url}" target="_blank" rel="noopener">${ICON_WIKIPEDIA}${t('wikipedia.read_more')}</a>`;
      // Wording mirrors Wikipedia's own article-footer attribution, not
      // invented phrasing - satisfies what CC BY-SA actually requires:
      // attribution, share-alike notice, and a link to the license itself.
      // Articles are a mix of pre-/post-2023-06-01 edits (3.0 vs 4.0), so
      // linking the general 4.0 license page (Wikipedia's own current
      // default) is the standard, safe choice rather than asserting one
      // exact version for the whole article.
      bodyHtml += `<div class="text-license">${t('text_license.note', sitelink?.url)}</div>`;
    } else if (!sitelink) {
      // No article in *either* language (sitelink is only falsy when both
      // preferred and fallback came up empty) - not "the summary fetch
      // failed", a real gap worth the same direct-CTA treatment as the
      // no-photo case above, prefilled with this exact monument's title so
      // there's nothing left to figure out except the actual writing.
      bodyHtml += `
        <div class="contribute-cta">
          <div class="contribute-cta-text">${t('wikipedia_cta.text')}</div>
          <a class="badge contribute-cta-btn" data-cta="wikipedia" href="${wikipediaCreateUrl(record, currentLang)}" target="_blank" rel="noopener nofollow">${t('wikipedia_cta.button')}</a>
        </div>
      `;
    }
    bodyHtml += linkBadges(record, sitelink, officialWebsite);
    if (record.wikidata_conflict) {
      bodyHtml += `<div class="missing-note">⚠ jcyl_id: ${record.wikidata_qid.join(', ')}</div>`;
    }
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

    applyHeroOrientation();
    wireGalleryClicks();
    wireHeroSwipe();
    updateHeroDots(0, files.length);
    wireShareButton(record);
    wireContributionCtas(panelContentEl);
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
    wireContributionCtas(panelContentEl);
    wireMonumentListRows(panelContentEl);
  }
}

// --- Rendering: Stats panel --------------------------------------------

async function fetchHistory() {
  const resp = await fetch('data/history.json');
  return resp.ok ? resp.json() : [];
}

// photo_stats.json only exists once someone has manually run `make
// photo-stats` at least once (see fetch_commons_photo_counts.py's own
// comment on why that's not part of the routine fetch/build - several
// hundred Commons API calls, deliberately not paid on every refresh) - a
// 404 here just means nobody has yet, not a broken build.
async function fetchPhotoStats() {
  const resp = await fetch('data/photo_stats.json');
  return resp.ok ? resp.json() : null;
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
        <polyline points="${linkedPoints}" fill="none" stroke="#0e7490" stroke-width="2.5" />
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
// Thousands separators per locale: "2.479" in Spanish, "2,479" in English.
// Module scope because the Stats page's own figures and the history
// chart's tooltip both want it and must agree - they describe the same
// numbers a few pixels apart.
const fmtNum = (n) => n.toLocaleString(currentLang);

function wireHistoryChart(wrapEl, historyData, total) {
  const svg = wrapEl.querySelector('.stats-chart');
  const tooltip = wrapEl.querySelector('.stats-chart-tooltip');
  const guide = wrapEl.querySelector('.stats-chart-guide');
  const dotLinked = wrapEl.querySelector('.stats-chart-dot.linked');
  const dotImage = wrapEl.querySelector('.stats-chart-dot.image');
  const { xFor, yFor } = chartGeometry(historyData, total);

  const pctOf = (value, entry) => (entry.total ? (value / entry.total) * 100 : 0);
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

// --- Rendering: written pages (About / Contribute / Stats / Privacy / Imprint) ---
//
// These five - and only these - are PAGE_PANEL_TYPES (see openPanel()):
// full takeovers with the map hidden, not the usual map-side panel. They
// share pageNavHtml()'s cross-link row so reading one leads straight into
// the next.

// activeType gets the .active treatment and a disabled click (see
// wirePageNav()) - everything else is a plain nav button.
function pageNavHtml(activeType) {
  const pages = [
    ['about', t('nav.about')],
    ['contribute', t('nav.contribute')],
    ['stats', t('nav.stats')],
    ['privacy', t('nav.privacy')],
    ['imprint', t('nav.imprint')],
  ];
  return `<nav class="page-nav">${pages
    .map(([type, label]) => `<button type="button" class="page-nav-link${type === activeType ? ' active' : ''}" data-page="${type}">${label}</button>`)
    .join('')}</nav>`;
}

// Called by every show*Panel() below right after it sets panelContentEl's
// innerHTML (same spot they already call e.g. wireGalleryClicks() from).
function wirePageNav() {
  panelContentEl.querySelectorAll('.page-nav-link[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return; // already on this page
      const page = btn.dataset.page;
      if (page === 'about') showAboutPanel();
      else if (page === 'contribute') showContributePanel();
      else if (page === 'stats') showStatsPanel();
      else if (page === 'privacy') showPrivacyPanel();
      else if (page === 'imprint') showImprintPanel();
    });
  });
}

async function showStatsPanel({ updateUrl = true } = {}) {
  currentPanelState = { type: 'stats' };
  const total = allRecords.length;
  const linked = allRecords.filter((r) => r.already_linked).length;
  const withImage = allRecords.filter((r) => r.has_wikidata_image).length;
  // Deliberately the current language, not "has an article anywhere". An
  // item whose only article is in Latvian is a gap for the reader looking
  // at this page, not an achievement, and saying otherwise would flatter
  // the numbers. It also means this figure moves when the language toggle
  // does - 979 in Spanish, 175 in English - which is the honest picture of
  // where the work still is.
  const withArticle = allRecords.filter((r) => (r.wikipedia_langs || []).includes(currentLang)).length;
  // The photo and article boxes show the share alone, no count beside it.
  // "1,305" and "996" are not figures anyone can place - they only mean
  // something measured against the 2,479 in the box next to them, whereas
  // "53%" is the whole statement at a glance. The counts stay in the
  // history chart's tooltip for anyone who wants them.
  const linkedPct = total ? Math.round((linked / total) * 100) : 0;
  const imagePct = total ? Math.round((withImage / total) * 100) : 0;
  const articlePct = total ? Math.round((withArticle / total) * 100) : 0;

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('stats.title'), placeholderIcon: '📊' })}
    <div class="panel-body">
      ${pageNavHtml('stats')}
      <div class="extract stats-mission">${t('stats.mission')}</div>
      ${datasetMeta ? `<div class="meta">${t('about.updated', new Date(datasetMeta.generated_at).toLocaleDateString(currentLang))}</div>` : ''}
      <div class="stats-numbers">
        <div class="stat-box"><div class="stat-value">${fmtNum(total)}</div><div class="stat-label">${t('stats.total')}</div></div>
        <div class="stat-box"><div class="stat-value">${imagePct}%</div><div class="stat-label">${t('stats.with_image')}</div></div>
        <div class="stat-box"><div class="stat-value">${articlePct}%</div><div class="stat-label">${t('stats.with_article')}</div></div>
        <div class="stat-box stat-box-photos"><div class="stat-value">&nbsp;</div><div class="stat-label">${t('stats.photos_label')}</div></div>
      </div>
      <div class="stats-record">${t('stats.linked_record', fmtNum(linked), fmtNum(total), linkedPct)}</div>
      <h3>${t('stats.history_title')}</h3>
      <div class="loading">${t('loading')}</div>
    </div>
  `;
  openPanel();
  wirePageNav();
  if (updateUrl) history.pushState(null, '', '/stats/');

  const [historyData, photoStats] = await Promise.all([fetchHistory(), fetchPhotoStats()]);
  // history.json is fetched fresh here, every time Stats opens - but
  // allRecords (total/linked/withImage above) was loaded once, at initial
  // page load, and held in memory for the rest of the session. On a
  // long-lived tab that's been open across a data refresh (or just any
  // caching skew between the two separately-fetched files), history.json's
  // own last entry can end up reporting a different "linked" figure than
  // the stat-boxes on this same page do - confirmed live (1918 vs 2162).
  // Both are meant to describe the exact same "right now", so force the
  // chart's rightmost point to match the stat-boxes exactly rather than
  // trusting two independently-fetched sources to agree on their own.
  if (historyData.length) {
    const last = historyData[historyData.length - 1];
    last.total = total;
    last.linked = linked;
    last.with_image = withImage;
  }
  const loadingEl = panelContentEl.querySelector('.loading');
  if (loadingEl) loadingEl.outerHTML = renderHistoryChart(historyData, total);
  const chartWrap = panelContentEl.querySelector('.stats-chart-wrap');
  if (chartWrap) wireHistoryChart(chartWrap, historyData, total);

  // Absent entirely (not just empty) until someone's manually run `make
  // photo-stats` at least once - see fetchPhotoStats()'s own comment. Its
  // box is rendered empty above and filled here rather than waiting for
  // the fetch, so the three figures that are already in memory appear
  // immediately; if the file isn't there, the box is dropped and the grid
  // closes up to three.
  const photoBox = panelContentEl.querySelector('.stat-box-photos');
  if (photoBox && photoStats) {
    photoBox.querySelector('.stat-value').innerHTML =
      t('stats.photos_value', photoStats.total_photos.toLocaleString(currentLang));
    // After the grid, not after the box: .stats-numbers is a grid, so a
    // sibling inserted next to a box becomes a grid cell itself and the
    // note renders as a narrow column under the left-hand figure.
    photoBox.closest('.stats-numbers').insertAdjacentHTML('afterend', renderPhotoNote(photoStats));
  } else if (photoBox) {
    photoBox.remove();
  }
}

// The other three figures come from every `make build`; this one doesn't
// (see fetch_commons_photo_counts.py), and it is a floor rather than a
// count - the script only walks one level of subcategories, so the real
// number is always higher. Both facts are carried in the figure itself
// ("more than N") and in this note, which is why it can now sit as a
// fourth box without implying the same freshness or precision as its
// neighbours.
function renderPhotoNote(photoStats) {
  const asOfDate = new Date(photoStats.generated_at).toLocaleDateString(currentLang);
  return `<div class="stats-photos-note">${t('stats.photos_note', photoStats.monuments_with_gallery.toLocaleString(currentLang), asOfDate)}</div>`;
}

function showAboutPanel({ updateUrl = true } = {}) {
  currentPanelState = { type: 'about' };
  const total = allRecords.length;
  const linked = allRecords.filter((r) => r.already_linked).length;
  const pct = total ? Math.round((linked / total) * 100) : 0;

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('about.title'), placeholderIcon: 'ℹ️' })}
    <div class="panel-body">
      ${pageNavHtml('about')}
      <div class="extract">${t('about.intro', linked, total, pct)}</div>
      ${datasetMeta ? `<div class="meta">${t('about.updated', new Date(datasetMeta.generated_at).toLocaleDateString(currentLang))}</div>` : ''}
      <h3>${t('about.goals.title')}</h3>
      <ul class="source-list">
        <li>${t('about.goals.accessible')}</li>
        <li>${t('about.goals.free_knowledge')}</li>
        <li>${t('about.goals.participate')}</li>
      </ul>
      <h3>${t('about.sources.title')}</h3>
      <ul class="source-list">
        <li>${t('about.sources.jcyl')}</li>
        <li>${t('about.sources.wikidata')}</li>
        <li>${t('about.sources.commons')}</li>
        <li>${t('about.sources.wikipedia')}</li>
      </ul>
      <h3>${t('about.tech.title')}</h3>
      <div class="extract">${t('about.tech.data')}</div>
      <div class="extract">${t('about.tech.site')}</div>
      <div class="link-badges">
        <a class="badge" href="https://github.com/tholbach/patrimonioabierto" target="_blank" rel="noopener">${t('about.tech.github')}</a>
      </div>
    </div>
  `;
  openPanel();
  wirePageNav();
  if (updateUrl) history.pushState(null, '', '/about/');
}

function showContributePanel({ updateUrl = true } = {}) {
  currentPanelState = { type: 'contribute' };

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('contribute.title'), placeholderIcon: '🤝' })}
    <div class="panel-body">
      ${pageNavHtml('contribute')}
      <div class="extract">${t('contribute.intro')}</div>
      <h3>${t('contribute.photos.title')}</h3>
      <div class="extract">${t('contribute.photos.body')}</div>
      <div class="link-badges">
        <a class="badge wikidata" href="https://commons.wikimedia.org/wiki/Special:UploadWizard" target="_blank" rel="noopener">${t('contribute.upload.button')}</a>
        <a class="badge" href="${t('contribute.photos.guide_href')}" target="_blank" rel="noopener">${t('contribute.photos.guide_button')}</a>
        <a class="badge filter-link" id="contribute-see-no-photo" href="?status=no_photo">${t('contribute.photos.see_missing_button')}</a>
      </div>
      <h3>${t('contribute.wikipedia.title')}</h3>
      <div class="extract">${t('contribute.wikipedia.body')}</div>
      <div class="link-badges">
        <a class="badge" href="${t('contribute.wikipedia.href')}" target="_blank" rel="noopener">${t('contribute.wikipedia.button')}</a>
        <a class="badge filter-link" id="contribute-see-no-wikipedia" href="?status=no_wikipedia">${t('contribute.wikipedia.see_missing_button')}</a>
      </div>
      <h3>${t('contribute.website.title')}</h3>
      <div class="extract">${t('contribute.website.body')}</div>
      <div class="link-badges">
        <a class="badge" href="https://github.com/tholbach/patrimonioabierto" target="_blank" rel="noopener">${t('contribute.website.button')}</a>
      </div>
    </div>
  `;
  openPanel();
  wirePageNav();
  wireFilterLink(document.getElementById('contribute-see-no-photo'), 'no_photo');
  wireFilterLink(document.getElementById('contribute-see-no-wikipedia'), 'no_wikipedia');
  if (updateUrl) history.pushState(null, '', '/contribute/');
}

function showPrivacyPanel({ updateUrl = true } = {}) {
  currentPanelState = { type: 'privacy' };

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('privacy.title'), placeholderIcon: '🔒' })}
    <div class="panel-body">
      ${pageNavHtml('privacy')}
      <div class="extract">${t('privacy.intro')}</div>
      <h3>${t('privacy.controller.title')}</h3>
      <div class="extract">${t('privacy.controller.body')}</div>
      <h3>${t('privacy.data_processed.title')}</h3>
      <div class="extract">${t('privacy.data_processed.body')}</div>
      <h3>${t('privacy.stats.title')}</h3>
      <div class="extract">${t('privacy.stats.body')}</div>
      <h3>${t('privacy.local_storage.title')}</h3>
      <div class="extract">${t('privacy.local_storage.body')}</div>
      <h3>${t('privacy.external.title')}</h3>
      <div class="extract">${t('privacy.external.intro')}</div>
      <ul class="source-list">
        <li>${t('privacy.external.tiles')}</li>
        <li>${t('privacy.external.wiki')}</li>
        <li>${t('privacy.external.geolocation')}</li>
      </ul>
      <h3>${t('privacy.retention.title')}</h3>
      <div class="extract">${t('privacy.retention.body')}</div>
      <h3>${t('privacy.rights.title')}</h3>
      <div class="extract">${t('privacy.rights.body')}</div>
      <h3>${t('privacy.changes.title')}</h3>
      <div class="extract">${t('privacy.changes.body')}</div>
    </div>
  `;
  openPanel();
  wirePageNav();
  if (updateUrl) history.pushState(null, '', '/privacy/');
}

function showImprintPanel({ updateUrl = true } = {}) {
  currentPanelState = { type: 'imprint' };

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('imprint.title'), placeholderIcon: '📜' })}
    <div class="panel-body">
      ${pageNavHtml('imprint')}
      <div class="extract">${t('imprint.body')}</div>
    </div>
  `;
  openPanel();
  wirePageNav();
  if (updateUrl) history.pushState(null, '', '/imprint/');
}

// --- Rendering: Municipality / Province panels ------------------------------

function monumentListItemHtml(record, subValue) {
  const emoji = CATEGORY_ICONS[record.category] || DEFAULT_ICON;
  const statusClass = record.has_wikidata_image ? 'has-photo' : 'no-photo';
  // Thumbnail when we already know the filename (from the bulk SPARQL
  // pull, not a per-row fetch) - falls back to the emoji dot for anything
  // without a photo, same as before. loading="lazy" so rows off-screen
  // (e.g. a long municipality list) don't all fetch at once. The emoji dot
  // also carries a text aria-label (same linked/missing status a map
  // marker for this record would show via color) - a screen reader has no
  // way to read "green" or "terracotta" otherwise.
  const statusLabel = t(record.has_wikidata_image ? 'marker.has_photo' : 'marker.no_photo');
  const icon = record.image_url
    ? `<img class="list-row-thumb" src="${record.image_url}?width=64" alt="" loading="lazy">`
    : `<span class="list-row-icon ${statusClass}" role="img" aria-label="${statusLabel}">${emoji}</span>`;
  // A real <a href="?id=...">, not a plain click target - see
  // wireMonumentListRows()/wireSpaLink(): Tab/Enter reaches it, a screen
  // reader reads it as a link (not silent inert text), and right-click/
  // copy-link/ctrl-click do a real navigation, matching every other "link"
  // in this app.
  return `
    <li><a class="list-row" href="${shareUrl(record)}" data-jcyl-id="${record.jcyl_id}">
      ${icon}
      <span class="list-row-name">${record.name}</span>
      ${subValue ? `<span class="list-row-stat">${subValue}</span>` : ''}
    </a></li>
  `;
}

function wireMonumentListRows(container) {
  container.querySelectorAll('.list-row[data-jcyl-id]').forEach((row) => {
    wireSpaLink(row, () => {
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
    .filter((r) => r.jcyl_id !== record.jcyl_id && recordPassesFilters(r))
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
  // pathname forced to '/', not left as location.pathname - unlike
  // monuments, municipalities have no pretty static page of their own, so
  // this must never inherit a /monumento/<id>-<slug>/ path left over from
  // shareUrl() above.
  const url = new URL('/', location.origin);
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

  panelContentEl.innerHTML = `
    ${heroBlock({ kicker: t('municipality.kicker'), title: muni.name, placeholderIcon: '📍' })}
    <div class="panel-body">
      <div class="meta">${muni.province} · ${t('stats.monument_count', muni.monument_count)}</div>
      <h3>${t('municipality.monuments_title')}</h3>
      ${
        monuments.length
          ? `<ul class="list">${monuments.map(monumentListItemHtml).join('')}</ul>`
          : `<div class="missing-note">${t('municipality.no_monuments')}</div>`
      }
    </div>
  `;
  wireMonumentListRows(panelContentEl);
  openPanel(() => {
    if (flyTo) map.flyToBounds(bboxToLeafletBounds(muni.bbox), { padding: [40, 40] });
  });
  if (updateUrl) history.pushState(null, '', municipalityShareUrl(muni));
}

// --- List view (accessible fallback for browsing without the map) ---------
//
// Leaflet markers have no keyboard path at all - clicking one to open a
// monument is a mouse/touch-only interaction (confirmed: Leaflet's marker
// <img>/divIcon elements carry no tabindex or key handling of their own).
// This panel is the way in for anyone who can't (or doesn't want to) drive
// the map: the exact same set of monuments the map currently shows -
// selectedCategories/selectedStatuses, the same two filters applyFilters()
// itself reads - as a plain, scrollable list. Rows reuse
// monumentListItemHtml()/wireMonumentListRows(), the same real-<a>-per-row
// helper the Municipality panel and "Nearby" already use, rather than a
// one-off template that could drift from them.
function showListPanel() {
  currentPanelState = { type: 'list' };
  const filtered = allRecords
    .filter((r) => selectedCategories.has(r.category))
    .filter((r) => !selectedStatuses.size || [...selectedStatuses].some((s) => STATUS_MATCHERS[s](r)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const rowsHtml = filtered.length
    ? filtered.map((r) => monumentListItemHtml(r, r.municipality)).join('')
    : `<div class="missing-note">${t('list.empty')}</div>`;

  panelContentEl.innerHTML = `
    ${heroBlock({ title: t('list.title'), placeholderIcon: '📋' })}
    <div class="panel-body">
      <div class="meta">${t('list.count', filtered.length)} · ${t('list.filtered_note')}</div>
      <ul class="list">${rowsHtml}</ul>
    </div>
  `;
  wireMonumentListRows(panelContentEl);
  openPanel();
}

wireSpaLink(document.getElementById('skip-to-list-link'), () => {
  dismissWelcomeModal(); // see its own comment - don't leave a keyboard user stuck behind it
  showListPanel();
});

function provinceShareUrl(prov) {
  // pathname forced to '/' - same reasoning as municipalityShareUrl() above.
  const url = new URL('/', location.origin);
  url.search = new URLSearchParams({ prov: prov.name }).toString();
  return url.toString();
}

function showProvincePanel(prov, { flyTo = false, updateUrl = true } = {}) {
  currentPanelState = { type: 'province', prov };

  // Biggest municipalities by BIC count, not by documentation gap - the
  // list shows a plain total per row, so it is sorted by the number that
  // is actually visible rather than one that only used to be.
  const topMunicipalities = allMunicipalities
    .filter((m) => m.province === prov.name && m.monument_count > 0)
    .sort((a, b) => b.monument_count - a.monument_count)
    .slice(0, 15);

  const rowsHtml = topMunicipalities
    .map(
      (m) => `
        <li class="list-row" data-ine="${m.ine_code_p772}">
          <span class="list-row-name">${m.name}</span>
          <span class="list-row-stat">${m.monument_count}</span>
        </li>
      `
    )
    .join('');

  panelContentEl.innerHTML = `
    ${heroBlock({ kicker: t('province.kicker'), title: prov.name, placeholderIcon: '🗺️' })}
    <div class="panel-body">
      <div class="meta">${t('province.municipality_count', prov.municipality_count)} · ${t('stats.monument_count', prov.monument_count)}</div>
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
  openPanel(() => {
    if (flyTo) map.flyToBounds(bboxToLeafletBounds(prov.bbox), { padding: [40, 40] });
  });
  if (updateUrl) history.pushState(null, '', provinceShareUrl(prov));
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
        <li class="list-row" data-menu="github"><span class="list-row-icon-plain">💻</span><span class="list-row-name">${t('nav.github')}</span></li>
        <li class="list-row" data-menu="privacy"><span class="list-row-icon-plain">🔒</span><span class="list-row-name">${t('nav.privacy')}</span></li>
        <li class="list-row" data-menu="imprint"><span class="list-row-icon-plain">📜</span><span class="list-row-name">${t('nav.imprint')}</span></li>
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
      else if (action === 'privacy') showPrivacyPanel();
      else if (action === 'imprint') showImprintPanel();
      else if (action === 'github') window.open('https://github.com/tholbach/patrimonioabierto', '_blank', 'noopener');
      else if (action === 'lang') {
        currentLang = currentLang === 'es' ? 'en' : 'es';
        applyStaticI18n();
        rerenderPanel(panelBeforeMenu); // back to whatever was open before the menu, now in the new language
      }
    });
  });
}

document.getElementById('menu-btn').addEventListener('click', showMenuPanel);

// Logo/wordmark - the usual "click the brand to go home" convention.
// closePanel() is the plain map with nothing open, exactly what "home"
// means here, so this is a no-op (correctly - no stray history entry)
// when nothing's open already.
wireSpaLink(document.getElementById('brand-link'), () => {
  if (panelEl.classList.contains('open')) closePanel();
});

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

// --- Picture of the week (desktop only) ------------------------------------
//
// Deliberately no backend/build step: the pool of candidates is a small,
// pre-fetched JSON file (see scripts/find_good_pictures.py - Commons files
// that are both within a monument's own Commons category tree and tagged
// as a "good picture" - Featured/Quality/Valued). Which one shows is
// picked purely client-side, seeded by the ISO week number, so it's the
// same for every visitor all week and moves on next week automatically -
// no cron, no server state. Once the pool is exhausted for now (it's tiny
// while the crawl is still ongoing) it just cycles back to the start
// rather than repeating a fixed image forever; if the pool is empty the
// card stays hidden rather than showing broken/placeholder content.
function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function dismissPotw() {
  if (document.getElementById('potw').hidden) return; // already gone - nothing to do
  sessionStorage.setItem('potw-dismissed', '1');
  document.getElementById('potw').hidden = true;
  // Drop the class that lifts the zoom control/attribution/button stack
  // clear of the strip (see style.css) - once the strip's gone, those
  // should settle back to their normal spot instead of leaving a gap of
  // bare map beneath them.
  document.getElementById('map-wrap').classList.remove('potw-visible');
}

// Whether #potw is currently hidden ONLY because a panel is open, not
// because of a real dismissal (dismissPotw() above) - openPanel()/
// closePanel() use this pair to step the strip aside for as long as the
// sidebar (desktop) / bottom sheet (mobile) is open without losing it for
// the rest of the session the way any panel-opening click used to
// (marker clicks bubble to the map's own click handler, which used to
// call dismissPotw() unconditionally - opening a monument's details and
// closing right back out shouldn't cost you the suggestion any more than
// glancing at the Stats page should).
let potwHiddenByPanel = false;

function hidePotwForPanel() {
  const potwEl = document.getElementById('potw');
  if (potwEl.hidden) return; // already gone (real dismissal, or never shown yet) - nothing to track
  potwEl.hidden = true;
  document.getElementById('map-wrap').classList.remove('potw-visible');
  potwHiddenByPanel = true;
}

function restorePotwAfterPanel() {
  if (!potwHiddenByPanel) return; // wasn't hidden for this reason - nothing to undo
  potwHiddenByPanel = false;
  if (sessionStorage.getItem('potw-dismissed')) return; // actually dismissed since - stay gone
  document.getElementById('potw').hidden = false;
  document.getElementById('map-wrap').classList.add('potw-visible');
}

function initPictureOfTheWeek() {
  const potwEl = document.getElementById('potw');
  if (sessionStorage.getItem('potw-dismissed')) return;

  fetch('data/picture_of_the_week.json')
    .then((r) => (r.ok ? r.json() : []))
    .then(async (pool) => {
      if (!pool.length) return;
      const entry = pool[isoWeekNumber(new Date()) % pool.length];
      const record = recordsById.get(String(entry.jcyl_id));
      if (!record) return;

      const meta = await fetchImageMeta(entry.file);
      const thumbUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(entry.file)}?width=440`;

      // Same "linked but no photo" count the Contribute page's own "see
      // monuments without a photo" link uses (isLinkedNoPhoto) - the
      // picture of the week already has everyone's attention on exactly
      // this gap (a nice photo of one monument), so it's the natural place
      // to also ask for help closing it for the rest. Only shown on wide
      // enough screens (see CSS) - there isn't room next to the photo
      // otherwise, and the strip already does its main job without it.
      const missingPhotoCount = allRecords.filter(isLinkedNoPhoto).length;
      // Two real links (map/Contribute), not one block - #potw's own
      // click-through handler below already ignores clicks on any <a>, so
      // neither needs its own stopPropagation() the way #potw-close does.
      const collabHtml =
        missingPhotoCount > 0
          ? `
        <div id="potw-collab">
          <div id="potw-collab-count">${missingPhotoCount.toLocaleString(currentLang)}</div>
          <div id="potw-collab-text">
            <div id="potw-collab-label" data-i18n="potw.collab_label">${t('potw.collab_label')}</div>
            <div id="potw-collab-links">
              <a id="potw-collab-map-link" href="?status=no_photo" data-i18n="potw.collab_map_link">${t('potw.collab_map_link')}</a>
              <span class="sep">·</span>
              <a id="potw-collab-help-link" href="/contribute/" data-i18n="potw.collab_help_link">${t('potw.collab_help_link')}</a>
              <span class="sep">·</span>
              <a id="potw-collab-nearby-link" href="#" data-i18n="potw.collab_nearby_link">${t('potw.collab_nearby_link')}</a>
            </div>
          </div>
        </div>
      `
          : '';

      potwEl.innerHTML = `
        <button type="button" id="potw-close" data-i18n-title="potw.close_title" aria-label="Close">✕</button>
        <img src="${thumbUrl}" alt="${record.name}" loading="lazy">
        <div id="potw-info">
          <div id="potw-label" data-i18n="potw.label">${t('potw.label')}</div>
          <div id="potw-name">${record.name}</div>
          <div id="potw-credit">${licenseLineHtml(meta)}</div>
          <div id="potw-cta" data-i18n="potw.cta">${t('potw.cta')}</div>
        </div>
        ${collabHtml}
      `;
      applyStaticI18n();
      potwEl.hidden = false;
      document.getElementById('map-wrap').classList.add('potw-visible');

      // Any interaction dismisses the card, not just its own close button:
      // following through to the monument it's advertising, or clicking
      // anywhere else on the map (a different marker, or just empty map
      // space - see the map.on('click', dismissPotw) below), both count as
      // "done with this suggestion" rather than something to leave sitting
      // there stale over whatever's now on screen.
      //
      // Two exemptions. Any of the strip's own <a> links (the credit
      // line's artist/license links, #potw-collab's three) each handle
      // their own destination, not this monument. And #potw-collab as a
      // whole, links or not: it's a message about the ~900 monuments that
      // have NO photo, sitting inside a card advertising one that does -
      // so a stray click on that count or its label used to open the
      // featured monument, which is the one monument it definitively
      // isn't about. Nothing but its own links is clickable there (see
      // its cursor in style.css).
      potwEl.addEventListener('click', (e) => {
        if (e.target.closest('a, #potw-collab')) return;
        dismissPotw();
        // entry.file: the exact photo the card showed - without this,
        // selectMonument() would open on whatever P18/gallery order
        // naturally puts in the hero slot, which isn't necessarily this
        // one (that's the whole reason build_potw_seed.py hand-picks a
        // "good picture" tier photo rather than trusting P18 already
        // points at the best shot).
        selectMonument(record, { flyTo: true, featuredFile: entry.file });
      });
      document.getElementById('potw-close').addEventListener('click', (e) => {
        e.stopPropagation();
        dismissPotw();
      });
      const collabMapLink = document.getElementById('potw-collab-map-link');
      if (collabMapLink) {
        // No dismissPotw() here, unlike the other two collab links - this
        // one doesn't navigate away from the map at all, just filters what
        // it shows (and #potw is display:none below 768px regardless, so
        // this only ever matters on desktop, where there's room for both
        // the filtered map and the strip at once). showMapFilteredByStatus()
        // does call closePanel(), but that's a harmless no-op here since
        // clicking this link is only ever possible while no panel is open
        // (any open panel already hides #potw itself - see openPanel()'s
        // hidePotwForPanel()).
        wireSpaLink(collabMapLink, () => {
          showMapFilteredByStatus('no_photo');
        });
      }
      const collabHelpLink = document.getElementById('potw-collab-help-link');
      if (collabHelpLink) {
        wireSpaLink(collabHelpLink, () => {
          dismissPotw();
          showContributePanel();
        });
      }
      const collabNearbyLink = document.getElementById('potw-collab-nearby-link');
      if (collabNearbyLink) {
        // Not wireSpaLink() - this one doesn't navigate anywhere itself,
        // it triggers geolocation and re-renders #potw-collab in place, so
        // it needs its own handler rather than the "real link" pattern.
        collabNearbyLink.addEventListener('click', (e) => {
          e.preventDefault();
          collabNearbyLink.textContent = t('potw.collab_nearby_loading');
          // .once(), not the persistent map.on('locationfound'/'locationerror')
          // listeners further down (which still fire independently and draw
          // the usual accuracy-circle/"you are here" dot - free bonus here,
          // not duplicated) - this pair is just for this one request, so a
          // second click later gets its own fresh pair rather than stacking
          // listeners.
          map.once('locationfound', (ev) => renderPotwNearby(ev.latlng));
          map.once('locationerror', () => {
            collabNearbyLink.textContent = t('potw.collab_nearby_link');
          });
          map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true });
        });
      }
    })
    .catch(() => {}); // no data file yet, or offline - just stay hidden
}

// Replaces the collab block's count+links with the closest few linked-but-
// photoless monuments to wherever geolocation just found - same distance
// math as renderNearby()'s "Cerca de aquí" section on a monument panel,
// just sourced from the visitor's own location instead of another
// monument's. #potw-collab may already be gone by the time this resolves
// (card dismissed while the geolocation prompt was still pending) - bail
// rather than throw.
function renderPotwNearby(latlng) {
  const collabEl = document.getElementById('potw-collab');
  if (!collabEl) return;

  const nearby = allRecords
    .filter(isLinkedNoPhoto)
    .map((r) => ({ r, dist: haversineDistanceKm(latlng.lat, latlng.lng, r.lat, r.lon) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  if (!nearby.length) {
    collabEl.innerHTML = `<div id="potw-collab-text">${t('potw.collab_nearby_empty')}</div>`;
    return;
  }

  const rowsHtml = nearby
    .map(
      ({ r, dist }) => `
        <li><a href="${shareUrl(r)}" data-jcyl-id="${r.jcyl_id}">
          <span class="potw-nearby-name">${r.name}</span>
          <span class="potw-nearby-dist">${formatDistance(dist)}</span>
        </a></li>
      `
    )
    .join('');
  collabEl.innerHTML = `
    <div id="potw-collab-nearby">
      <div id="potw-collab-label">${t('potw.collab_nearby_title')}</div>
      <ul id="potw-nearby-list">${rowsHtml}</ul>
    </div>
  `;
  collabEl.querySelectorAll('#potw-nearby-list a[data-jcyl-id]').forEach((a) => {
    wireSpaLink(a, () => {
      dismissPotw();
      const record = recordsById.get(a.dataset.jcylId);
      if (record) selectMonument(record, { flyTo: true });
    });
  });
}

// Individual marker clicks bubble up to the map's own click event by
// default in Leaflet (Marker's bubblingMouseEvents defaults to true), so
// map.on('click', ...) alone would also cover those - deliberately
// excluded here (see the .leaflet-marker-icon guard) since opening a
// monument's panel now steps the strip aside via openPanel()'s own
// hidePotwForPanel() instead, restored on close rather than dismissed for
// the rest of the session; a real click on blank map space still counts
// as "moved on" and dismisses it outright, same as it always did.
// Cluster icon clicks are NOT covered by map.on('click', ...) at all
// (Leaflet.markercluster handles those on the cluster group layer itself,
// spiderfying/zooming rather than bubbling a plain map click - confirmed
// by testing), so that keeps its own listener on `markers`, unchanged:
// drilling into a cluster doesn't open a panel to later restore this
// from, so it stays a real dismissal.
map.on('click', (e) => {
  if (e.originalEvent.target.closest('.leaflet-marker-icon')) return;
  dismissPotw();
});
markers.on('click', dismissPotw);

// Mobile only: the panel is a bottom sheet that leaves the map visible
// above it (see the 768px #panel CSS), so tapping that visible strip of map
// while a monument/municipality/etc. panel is open should feel like tapping
// the panel's own close button - back to the plain map. Desktop's panel
// sits beside the map instead of over it, so this would just be annoying
// there.
//
// Guard on the click's real target, not just "a panel is open": marker
// clicks bubble up to this same map click event (see the comment above
// dismissPotw's bindings), and closing right back down would undo the
// panel a marker tap just opened or switched to. Cluster-icon clicks don't
// bubble here at all (same as for dismissPotw), so they're a non-issue.
map.on('click', (e) => {
  if (window.innerWidth > 768) return;
  if (!panelEl.classList.contains('open')) return;
  if (e.originalEvent.target.closest('.leaflet-marker-icon')) return;
  closePanel();
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

// statusClass is 'linked'/'missing' for a monument row (same signal as its
// map marker's own color - see iconFor()), or null for province/
// municipality rows, which don't have one thing to be "linked" - they're
// a whole area, not a single Wikidata-able entity.
function searchRowHtml(type, key, icon, label, sub, imageUrl, statusClass, index) {
  // Same reasoning as the list-row thumbnails: URL already known from the
  // bulk pull, no per-row fetch, falls back to the emoji tile for anything
  // without a photo (and always for municipalities/provinces, which have
  // no image_url at all). Both a real photo and the emoji fallback sit in
  // the same rounded-square slot so a mixed-result list (some monuments
  // photographed, some not, plus municipalities/provinces) still lines up
  // into one clean grid instead of thumbnails and bare icons of different
  // sizes.
  const media = imageUrl
    ? `<img class="search-row-thumb" src="${imageUrl}?width=96" alt="" loading="lazy">`
    : `<span class="search-row-icon ${statusClass || 'neutral'}">${icon}</span>`;
  // Small corner dot, same green/terracotta as everywhere else this status
  // shows (map markers, list rows) - only for monuments, and only a
  // color-coded dot, not the only signal: marker.has_photo/no_photo's
  // own text already describes it elsewhere, this is a quick visual
  // echo for someone who already knows the color language from the map.
  const dot = statusClass ? `<span class="search-row-dot ${statusClass}"></span>` : '';
  return `
    <div class="search-row" data-index="${index}" data-type="${type}" data-key="${key}">
      <span class="search-row-media">${media}${dot}</span>
      <span class="search-row-text">
        <span class="search-row-name">${label}</span>
        ${sub ? `<span class="search-row-sub">${sub}</span>` : ''}
      </span>
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
    { label: t('search.section.provinces'), rows: provinceMatches.map((p) => ['province', p.name, '🗺️', p.name, null, null, null]) },
    { label: t('search.section.municipalities'), rows: municipalityMatches.map((m) => ['municipality', m.ine_code_p772, '📍', m.name, m.province, null, null]) },
    {
      label: t('search.section.monuments'),
      rows: monumentMatches.map((r) => [
        'monument', r.jcyl_id, CATEGORY_ICONS[r.category] || DEFAULT_ICON, r.name, r.municipality, r.image_url,
        r.has_wikidata_image ? 'has-photo' : 'no-photo',
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
  } else if (state?.type === 'list') {
    showListPanel();
  } else if (state?.type === 'stats') {
    showStatsPanel({ updateUrl: false });
  } else if (state?.type === 'about') {
    showAboutPanel({ updateUrl: false });
  } else if (state?.type === 'contribute') {
    showContributePanel({ updateUrl: false });
  } else if (state?.type === 'privacy') {
    showPrivacyPanel({ updateUrl: false });
  } else if (state?.type === 'imprint') {
    showImprintPanel({ updateUrl: false });
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

const WELCOME_SEEN_KEY = 'patrimonioabierto_welcome_seen';

// Also called directly by the skip-to-list link (see its own wiring) - a
// keyboard/screen-reader user's very first action landing them behind an
// unrelated modal they now have to fight through first would defeat the
// whole point of a skip link being the fastest way to the list.
function dismissWelcomeModal() {
  const modal = document.getElementById('welcome-modal');
  if (!modal || !modal.classList.contains('open')) return;
  modal.classList.remove('open');
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, '1');
  } catch (e) {
    // nothing to do - worst case it shows again next visit
  }
}

// Shown once per browser via a localStorage flag - never on top of a deep
// link (?id=/?muni=/?prov=/#stats etc.), since someone arriving at a
// specific monument already knows what they're looking at.
function maybeShowWelcome() {
  let alreadySeen = true;
  try {
    alreadySeen = !!localStorage.getItem(WELCOME_SEEN_KEY);
  } catch (e) {
    return; // e.g. private browsing with storage blocked - skip rather than risk showing it every single visit
  }
  if (alreadySeen) return;

  const modal = document.getElementById('welcome-modal');
  if (!modal) return;
  modal.classList.add('open');

  document.getElementById('welcome-close-btn').addEventListener('click', dismissWelcomeModal, { once: true });
  document.getElementById('welcome-about-link').addEventListener('click', (e) => {
    e.preventDefault();
    dismissWelcomeModal();
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

    // keyboard: false - Leaflet gives every marker tabindex="0"/role="button"
    // by default (and, confirmed by testing, so does Leaflet.markercluster
    // for its own cluster icons - see the matching option on the
    // markerClusterGroup above), but none of them ever gets an accessible
    // name, and there are 2,479 of them. Measured before this fix: Tab from
    // the top of the page took 113 presses (one per marker/cluster icon
    // rendered at the starting zoom) to even reach the map's own buttons -
    // unusable, not just imperfect. Turning marker keyboard focus off
    // entirely, in favor of search (arrow-key-navigable, real accessible
    // names) as the one keyboard/screen-reader path to open a monument,
    // fixed that outright (re-verified: 0 marker-related tab stops).
    for (const record of records) {
      const marker = L.marker([record.lat, record.lon], { icon: iconFor(record), keyboard: false });
      marker.record = record; // read by clusterIcon() to compute each cluster's linked ratio
      marker.on('click', () => selectMonument(record, { flyTo: false }));
      allMarkerLayers.push(marker);
      markerByJcylId.set(String(record.jcyl_id), marker);
    }
    initCategoryFilter();

    // Deep links: ?id=<jcyl_id> / ?muni=<ine_code> / ?prov=<name> open
    // straight to that monument/municipality/province; /about/,
    // /contribute/, /stats/, /privacy/, /imprint/ (or the old #about-style
    // hash equivalents - see WRITTEN_PAGE_TYPES) open those written pages.
    const params = new URLSearchParams(location.search);
    let requestedId = params.get('id');
    // /monumento/<jcyl_id>-<slug>/ - the crawlable static page for a
    // monument (scripts/build_monument_pages.py), and also what
    // shareUrl()/selectMonument() now push to during live browsing (see
    // shareUrl()) - so this is read, not rewritten away: whichever form a
    // visitor landed on (an old ?id= bookmark or a pretty path) is left as
    // the address bar shows it. The slug is decorative only, never read -
    // a monument renamed since its last build still resolves correctly off
    // the id alone.
    const monumentoPath = location.pathname.match(/^\/monumento\/(\d+)-/);
    if (!requestedId && monumentoPath) {
      requestedId = monumentoPath[1];
    }
    const requestedMuni = params.get('muni');
    const requestedProv = params.get('prov');
    // /stats/ etc. read the same way /monumento/<id>-<slug>/ is above - not
    // rewritten away, left as the address bar shows it. A bare #stats hash
    // (no matching path) still resolves too, for anyone with an old link.
    const hashPage = location.hash.replace(/^#/, '');
    const requestedPage =
      WRITTEN_PAGE_TYPES.find((type) => location.pathname === `/${type}/`) ||
      (WRITTEN_PAGE_TYPES.includes(hashPage) ? hashPage : null);
    const hasDeepLink = !!(requestedId || requestedMuni || requestedProv || requestedPage);
    // Same reasoning as maybeShowWelcome() below: someone landing on a
    // specific monument/municipality/province/static page came for that
    // page, not the map's own landing view - a card advertising an
    // unrelated monument, floating over a map they may not even look at
    // this visit, doesn't belong there.
    if (!hasDeepLink) initPictureOfTheWeek();
    if (requestedId && recordsById.has(requestedId)) {
      selectMonument(recordsById.get(requestedId), { flyTo: true, updateUrl: false });
    } else if (requestedMuni) {
      const muni = allMunicipalities.find((m) => m.ine_code_p772 === requestedMuni);
      if (muni) showMunicipalityPanel(muni, { flyTo: true, updateUrl: false });
    } else if (requestedProv) {
      const prov = allProvinces.find((p) => p.name === requestedProv);
      if (prov) showProvincePanel(prov, { flyTo: true, updateUrl: false });
    } else if (requestedPage === 'stats') {
      showStatsPanel({ updateUrl: false });
    } else if (requestedPage === 'about') {
      showAboutPanel({ updateUrl: false });
    } else if (requestedPage === 'contribute') {
      showContributePanel({ updateUrl: false });
    } else if (requestedPage === 'privacy') {
      showPrivacyPanel({ updateUrl: false });
    } else if (requestedPage === 'imprint') {
      showImprintPanel({ updateUrl: false });
    }

    hideLoadingScreen();
    if (!hasDeepLink) maybeShowWelcome();
  })
  .catch((err) => {
    console.error(err);
    loadingScreenFailed();
  });
