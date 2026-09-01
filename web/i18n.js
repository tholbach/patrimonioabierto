// Minimal i18n: covers the app's own UI chrome (nav, legend, panel labels,
// About/Contribute page text) in Spanish and English. Deliberately does NOT
// translate monument names/categories (they're JCyL's own official Spanish
// terms - translating them would misrepresent the source data) or Wikidata
// extracts (those come from whichever Wikipedia edition actually has the
// article - see fetchWikidataEntity's sitelink preference in app.js, which
// does shift with the language toggle).

const STRINGS = {
  es: {
    'nav.stats': 'Estadísticas',
    'nav.about': 'Acerca de',
    'nav.contribute': 'Cómo contribuir',
    'menu.title': 'Menú',
    'menu.button_title': 'Menú',
    'stats.template': (linked, total, pct) => `${linked} / ${total} enlazados (${pct}%)`,
    'badge.share': 'Compartir',
    'badge.share.copied': '✓ Copiado',
    'badge.jcyl': '📄 Ficha JCyL',
    'badge.wikidata': 'Wikidata',
    'badge.wikipedia': 'Wikipedia',
    'missing.note': 'Sin enlazar a Wikidata todavía.',
    'error.note': 'Error cargando datos de Wikidata/Commons.',
    'loading': 'Cargando…',
    'protection.since': 'BIC desde',
    'panel.close': 'Cerrar',
    'loading.screen': 'Cargando el catálogo…',
    'loading.error': 'No se han podido cargar los datos. Recarga la página.',
    'welcome.title': 'Bienvenido a CyLinked',
    'welcome.body':
      'Aquí encontrarás todos los Bienes de Interés Cultural (BIC) declarados oficialmente en Castilla y León, junto con información y material multimedia de Wikidata, Wikipedia y Wikimedia Commons. Un proyecto libre, sin cuentas ni anuncios.',
    'welcome.cta': 'Empezar a explorar',
    'welcome.about_link': 'Más sobre el proyecto',
    'about.title': 'Acerca de CyLinked',
    'about.intro': (linked, total, pct) =>
      `CyLinked combina el catálogo abierto de Bienes de Interés Cultural de la Junta de Castilla y León con Wikidata, Wikimedia Commons y Wikipedia, para mostrar cuáles de los ${total} monumentos protegidos de la región están documentados en el ecosistema de conocimiento libre — y cuáles todavía no. Ahora mismo: <strong>${linked} de ${total} (${pct}%)</strong> tienen un enlace a Wikidata.`,
    'about.updated': (date) => `Datos actualizados por última vez: ${date}.`,
    'about.sources.title': 'Fuentes y licencias',
    'about.sources.jcyl':
      '<strong>Junta de Castilla y León</strong> (catálogo de Bienes de Interés Cultural, vía WFS) — "Sin validez jurídica, carácter informativo. Uso libre y gratuito. Cita obligada a la propiedad de la fuente: \'Junta de Castilla y León\'." (texto literal de la ficha de metadatos del conjunto de datos).',
    'about.sources.wikidata':
      '<strong>Wikidata</strong> — dominio público (CC0). Enlace vía la propiedad <a href="https://www.wikidata.org/wiki/Property:P3177" target="_blank" rel="noopener">P3177</a>.',
    'about.sources.commons':
      '<strong>Wikimedia Commons</strong> — cada foto bajo su propia licencia, mostrada junto a la imagen (habitualmente CC BY-SA).',
    'about.sources.wikipedia': '<strong>Wikipedia</strong> — CC BY-SA.',
    'about.methodology.title': 'Metodología',
    'about.methodology.body':
      'El listado de monumentos y sus municipios se obtiene directamente del servicio WFS de la Junta; el enlace a Wikidata se determina consultando qué elementos tienen la propiedad P3177; la ubicación de cada monumento es el centroide de su polígono oficial; y el municipio se calcula por intersección espacial contra los límites municipales oficiales, verificando el código INE resultante contra el formato real que usa Wikidata. El proceso completo es un script reproducible, no un proceso manual.',
    'contribute.title': 'Cómo contribuir',
    'contribute.intro':
      'Este proyecto no almacena ni gestiona sus propios datos de contribución — todo lo que añadas va directamente al ecosistema abierto de Wikimedia, no a una base de datos privada de CyLinked.',
    'contribute.reconcile.title': '1. Enlazar o crear elementos en Wikidata',
    'contribute.reconcile.body':
      'Si te gusta trabajar con datos estructurados: usa OpenRefine para reconciliar los monumentos sin enlazar contra elementos de Wikidata ya existentes, o para crear elementos nuevos cuando no existan. Los monumentos marcados como "sin enlazar" en el mapa son exactamente los candidatos.',
    'contribute.photos.title': '2. Añadir fotos',
    'contribute.photos.body':
      'Para monumentos que ya tienen elemento en Wikidata pero pocas o ninguna foto: sube una foto propia y libre de derechos a Wikimedia Commons, categorízala correctamente (o enlázala al elemento de Wikidata mediante los datos estructurados) y aparecerá aquí automáticamente en la próxima actualización — no hace falta avisar a nadie.',
    'contribute.upload.button': '📷 Subir una foto a Wikimedia Commons',
    'gallery.see_more': 'Ver más fotos en Wikimedia Commons →',
    'potw.label': 'Foto de la semana',
    'potw.close_title': 'Cerrar',
    'potw.cta': 'Ver este Bien de Interés Cultural ahora →',
    'search.placeholder': 'Buscar monumento, municipio o provincia…',
    'search.section.monuments': 'Monumentos',
    'search.section.municipalities': 'Municipios',
    'search.section.provinces': 'Provincias',
    'search.no_results': 'Sin resultados',
    'municipality.kicker': '📍 Municipio',
    'province.kicker': '🗺️ Provincia',
    'municipality.monuments_title': 'Monumentos',
    'municipality.no_monuments': 'Ningún BIC registrado en este municipio.',
    'province.municipalities_title': 'Municipios con más monumentos sin enlazar',
    'province.municipality_count': (n) => `${n} municipios`,
    'upload_cta.text': 'Este monumento ya está en Wikidata pero todavía no tiene ninguna foto. ¿Tienes una?',
    'geolocation.button_title': 'Mostrar mi ubicación',
    'geolocation.you_are_here': 'Estás aquí',
    'geolocation.error': 'No se pudo obtener tu ubicación. Comprueba los permisos de localización del navegador.',
    'facts.architect': 'Arquitecto',
    'facts.style': 'Estilo',
    'facts.inception': 'Construcción',
    'facts.heritage_designation': 'Categoría de protección',
    'facts.part_of': 'Parte de',
    'nearby.title': 'Cerca de aquí',
    'shuffle.button_title': 'Descubrir un monumento al azar',
    'filter.button_title': 'Filtrar',
    'filter.status_title': 'Estado',
    'filter.status_unlinked': 'Sin enlazar a Wikidata',
    'filter.status_no_photo': 'Enlazado, sin foto',
    'filter.title': 'Categorías',
    'filter.all': 'Todo',
    'filter.none': 'Ninguno',
    'text_license.note': (url) =>
      `Texto de <a href="${url}" target="_blank" rel="noopener">Wikipedia</a>, disponible bajo la licencia <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">Creative Commons Atribución-CompartirIgual 4.0</a>.`,
    'wikipedia.read_more': 'Leer más en Wikipedia →',
    'stats.title': 'Estadísticas',
    'stats.mission':
      'CyLinked existe para enlazar más monumentos de Castilla y León con Wikidata y enriquecer Wikipedia y Wikimedia Commons con más fotos y contenido libre. No es solo un mapa — es una herramienta para cerrar activamente esa brecha. Estas cifras son cómo medimos si lo está consiguiendo.',
    'stats.total': 'Monumentos BIC',
    'stats.linked': 'Enlazados a Wikidata',
    'stats.with_image': 'Con foto principal',
    'stats.history_title': 'Evolución',
    'stats.chart_empty': 'El histórico se construye con cada actualización de datos - vuelve más adelante para ver la evolución.',
    'stats.tooltip_pts': 'p.p.',
    'stats.tooltip_first': 'primer punto',
    'stats.legend_linked': 'Enlazados',
    'stats.legend_image': 'Con foto',
  },
  en: {
    'nav.stats': 'Statistics',
    'nav.about': 'About',
    'nav.contribute': 'How to contribute',
    'menu.title': 'Menu',
    'menu.button_title': 'Menu',
    'stats.template': (linked, total, pct) => `${linked} / ${total} linked (${pct}%)`,
    'badge.share': 'Share',
    'badge.share.copied': '✓ Copied',
    'badge.jcyl': '📄 JCyL record',
    'badge.wikidata': 'Wikidata',
    'badge.wikipedia': 'Wikipedia',
    'missing.note': 'Not linked to Wikidata yet.',
    'error.note': 'Error loading Wikidata/Commons data.',
    'loading': 'Loading…',
    'protection.since': 'Protected since',
    'panel.close': 'Close',
    'loading.screen': 'Loading the catalog…',
    'loading.error': 'Could not load the data. Please reload the page.',
    'welcome.title': 'Welcome to CyLinked',
    'welcome.body':
      "Here you'll find every officially declared Heritage Site (BIC) in Castile and León, along with information and media from Wikidata, Wikipedia and Wikimedia Commons. A free project - no accounts, no ads.",
    'welcome.cta': 'Start exploring',
    'welcome.about_link': 'More about the project',
    'about.title': 'About CyLinked',
    'about.intro': (linked, total, pct) =>
      `CyLinked combines the Junta de Castilla y León's open catalog of protected heritage sites (Bienes de Interés Cultural) with Wikidata, Wikimedia Commons and Wikipedia, to show which of the region's ${total} protected monuments are documented in the free-knowledge ecosystem — and which aren't yet. Right now: <strong>${linked} of ${total} (${pct}%)</strong> have a Wikidata link.`,
    'about.updated': (date) => `Data last refreshed: ${date}.`,
    'about.sources.title': 'Sources and licenses',
    'about.sources.jcyl':
      '<strong>Junta de Castilla y León</strong> (Bienes de Interés Cultural catalog, via WFS) — "No legal validity, informational purpose only. Free and unrestricted use. Mandatory attribution to the source: \'Junta de Castilla y León\'." (verbatim from the dataset\'s own metadata record).',
    'about.sources.wikidata':
      '<strong>Wikidata</strong> — public domain (CC0). Linked via property <a href="https://www.wikidata.org/wiki/Property:P3177" target="_blank" rel="noopener">P3177</a>.',
    'about.sources.commons':
      '<strong>Wikimedia Commons</strong> — each photo under its own license, shown alongside the image (usually CC BY-SA).',
    'about.sources.wikipedia': '<strong>Wikipedia</strong> — CC BY-SA.',
    'about.methodology.title': 'Methodology',
    'about.methodology.body':
      "The monument list and their municipalities come straight from the Junta's own WFS service; Wikidata linkage is determined by querying which items carry property P3177; each monument's location is the centroid of its official polygon footprint; and its municipality is derived by spatial intersection against official municipal boundaries, with the resulting INE code checked against the actual format Wikidata uses. The whole process is a reproducible script, not a manual one.",
    'contribute.title': 'How to contribute',
    'contribute.intro':
      "This project doesn't store or manage its own contribution data — anything you add goes straight into the open Wikimedia ecosystem, not a private CyLinked database.",
    'contribute.reconcile.title': '1. Link or create Wikidata items',
    'contribute.reconcile.body':
      'If you like working with structured data: use OpenRefine to reconcile unlinked monuments against existing Wikidata items, or to create new items where none exist yet. The monuments marked "not linked" on the map are exactly the candidates.',
    'contribute.photos.title': '2. Add photos',
    'contribute.photos.body':
      "For monuments that already have a Wikidata item but few or no photos: upload your own freely-licensed photo to Wikimedia Commons, categorize it correctly (or link it to the Wikidata item via structured data), and it'll show up here automatically next refresh - no need to tell anyone.",
    'contribute.upload.button': '📷 Upload a photo to Wikimedia Commons',
    'gallery.see_more': 'See more photos on Wikimedia Commons →',
    'potw.label': 'Picture of the week',
    'potw.close_title': 'Close',
    'potw.cta': 'See this Heritage Site now →',
    'search.placeholder': 'Search monument, municipality or province…',
    'search.section.monuments': 'Monuments',
    'search.section.municipalities': 'Municipalities',
    'search.section.provinces': 'Provinces',
    'search.no_results': 'No results',
    'municipality.kicker': '📍 Municipality',
    'province.kicker': '🗺️ Province',
    'municipality.monuments_title': 'Monuments',
    'municipality.no_monuments': 'No protected heritage sites registered in this municipality.',
    'province.municipalities_title': 'Municipalities with the most unlinked monuments',
    'province.municipality_count': (n) => `${n} municipalities`,
    'upload_cta.text': "This monument already has a Wikidata item but no photo yet. Have one?",
    'geolocation.button_title': 'Show my location',
    'geolocation.you_are_here': 'You are here',
    'geolocation.error': "Couldn't get your location. Check your browser's location permissions.",
    'facts.architect': 'Architect',
    'facts.style': 'Style',
    'facts.inception': 'Built',
    'facts.heritage_designation': 'Protection category',
    'facts.part_of': 'Part of',
    'nearby.title': 'Nearby',
    'shuffle.button_title': 'Discover a random monument',
    'filter.button_title': 'Filter',
    'filter.status_title': 'Status',
    'filter.status_unlinked': 'Not linked to Wikidata',
    'filter.status_no_photo': 'Linked, no photo',
    'filter.title': 'Categories',
    'filter.all': 'All',
    'filter.none': 'None',
    'text_license.note': (url) =>
      `Text from <a href="${url}" target="_blank" rel="noopener">Wikipedia</a>, available under the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">Creative Commons Attribution-ShareAlike 4.0 License</a>.`,
    'wikipedia.read_more': 'Read more on Wikipedia →',
    'stats.title': 'Statistics',
    'stats.mission':
      "CyLinked exists to link more of Castilla y León's monuments to Wikidata and enrich Wikipedia and Wikimedia Commons with more photos and free content. It's not just a map - it's a tool for actively closing that gap. These numbers are how we measure whether it's working.",
    'stats.total': 'BIC monuments',
    'stats.linked': 'Linked to Wikidata',
    'stats.with_image': 'With a main photo',
    'stats.history_title': 'Progress over time',
    'stats.chart_empty': 'History builds up with each data refresh - check back later to see the trend.',
    'stats.tooltip_pts': 'pp',
    'stats.tooltip_first': 'first point',
    'stats.legend_linked': 'Linked',
    'stats.legend_image': 'With photo',
  },
};

let currentLang = 'es';

function t(key, ...args) {
  const entry = STRINGS[currentLang][key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.documentElement.lang = currentLang;
}

// Accent/case-insensitive matching - "leon" should find "León", "avila"
// should find "Ávila". Spanish place names lean heavily on diacritics that
// most people won't bother typing.
// Combining diacritical marks are U+0300-U+036F. Built via charcodes
// rather than a literal escape range in source, which doesn't survive
// this file being authored/transmitted as reliably as plain hex numbers.
const DIACRITIC_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function normalizeSearch(str) {
  return str.normalize('NFD').replace(DIACRITIC_RE, '').toLowerCase();
}
