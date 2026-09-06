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
    'nav.privacy': 'Privacidad',
    'nav.imprint': 'Aviso legal',
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
      `CyLinked combina el catálogo abierto de Bienes de Interés Cultural de la Junta de Castilla y León con Wikidata, Wikimedia Commons y Wikipedia, para mostrar cuáles de los ${total} monumentos protegidos de la región están documentados en el ecosistema de conocimiento libre - y cuáles todavía no. Ahora mismo: <strong>${linked} de ${total} (${pct}%)</strong> tienen un enlace a Wikidata.`,
    'about.updated': (date) => `Datos actualizados por última vez: ${date}.`,
    'about.sources.title': 'Fuentes y licencias',
    'about.sources.jcyl':
      '<strong>Junta de Castilla y León</strong> (catálogo oficial de Bienes de Interés Cultural, publicado como datos abiertos) - "Sin validez jurídica, carácter informativo. Uso libre y gratuito. Cita obligada a la propiedad de la fuente: \'Junta de Castilla y León\'." (texto literal de la ficha oficial del conjunto de datos).',
    'about.sources.wikidata':
      '<strong>Wikidata</strong> - dominio público (CC0). Así sabemos qué monumentos ya están documentados allí: buscamos los elementos que citan a este proyecto mediante un identificador propio de Wikidata, <a href="https://www.wikidata.org/wiki/Property:P3177" target="_blank" rel="noopener">P3177</a>.',
    'about.sources.commons':
      '<strong>Wikimedia Commons</strong> - cada foto bajo su propia licencia, mostrada junto a la imagen (habitualmente CC BY-SA).',
    'about.sources.wikipedia': '<strong>Wikipedia</strong> - CC BY-SA.',
    'about.goals.title': 'Objetivos',
    'about.goals.accessible': 'Acercar la cultura y la historia de Castilla y León a cualquiera, sin necesidad de conocimientos previos.',
    'about.goals.free_knowledge':
      'Promover el conocimiento libre: cuanta más información y más fotos con licencia abierta existan, más rica es Wikipedia y más útil Wikidata para todo el mundo.',
    'about.goals.participate': 'Animar a participar en ese ecosistema - no solo a consultar CyLinked, sino a mejorar lo que hay detrás.',
    'about.tech.title': 'Cómo funciona por dentro',
    'about.tech.data':
      'Los monumentos y sus municipios vienen directamente del catálogo oficial de la Junta de Castilla y León. Para saber cuáles ya están documentados en Wikidata, comprobamos automáticamente cuáles la citan. Todo ese proceso es un programa informático que se puede volver a ejecutar en cualquier momento - no es trabajo manual, así que los datos se pueden revisar y actualizar con frecuencia.',
    'about.tech.site':
      'Esta web no guarda tus datos en ningún sitio: no hay base de datos ni cuentas de usuario. Los textos de Wikipedia, las fotos de Commons y los datos de Wikidata se piden en directo desde tu propio navegador cada vez que abres una ficha, no desde un servidor de CyLinked. Todo el código es además abierto y cualquiera puede revisarlo.',
    'about.tech.github': '💻 Código en GitHub',
    'contribute.title': 'Cómo contribuir',
    'contribute.intro':
      'Este proyecto no almacena ni gestiona sus propios datos de contribución - todo lo que añadas va directamente al ecosistema abierto de Wikimedia, no a una base de datos privada de CyLinked.',
    'contribute.photos.title': '1. Añadir fotos',
    'contribute.photos.body':
      'Para monumentos que ya están en Wikidata pero tienen pocas o ninguna foto: sube tú mismo una foto libre de derechos a Wikimedia Commons, indicando claramente a qué monumento pertenece, y aparecerá aquí automáticamente en la próxima actualización - no hace falta avisar a nadie.',
    'contribute.upload.button': '📷 Subir una foto a Wikimedia Commons',
    'contribute.photos.guide_button': '🔰 Primeros pasos en Commons',
    'contribute.photos.guide_href': 'https://commons.wikimedia.org/wiki/Commons:Primeros_pasos',
    'contribute.photos.see_missing_button': '🖼️ Ver monumentos sin foto',
    'contribute.wikipedia.title': '2. Mejorar artículos de Wikipedia',
    'contribute.wikipedia.body':
      'Muchos de estos monumentos tienen un artículo breve, incompleto o directamente inexistente en Wikipedia. Ampliarlo, corregirlo o crearlo desde cero, con fuentes fiables, beneficia directamente a quien lo lea aquí: el texto que ves en cada ficha viene literalmente de ahí.',
    'contribute.wikipedia.button': '✍️ Guía de introducción a Wikipedia',
    'contribute.wikipedia.href': 'https://es.wikipedia.org/wiki/Wikipedia:Introducci%C3%B3n',
    'contribute.wikipedia.see_missing_button': '📖 Ver monumentos sin artículo en Wikipedia',
    'contribute.website.title': '3. Mejorar esta web',
    'contribute.website.body':
      'CyLinked es en sí mismo un proyecto de código abierto en GitHub: si encuentras un fallo, tienes una idea de mejora o quieres aportar código directamente, los issues y pull requests son bienvenidos.',
    'contribute.website.button': '💻 CyLinked en GitHub',
    'gallery.see_more': 'Ver más fotos en Wikimedia Commons →',
    'potw.label': 'Foto de la semana',
    'potw.close_title': 'Cerrar',
    'potw.cta': 'Ver este Bien de Interés Cultural ahora →',
    'potw.collab_label': 'Todavía no tienen ninguna foto libre en Wikimedia Commons. Súmate a documentarlos:',
    'potw.collab_map_link': 'Ver en el mapa',
    'potw.collab_help_link': 'Cómo ayudar',
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
    'wikipedia_cta.text': 'Este monumento todavía no tiene artículo en Wikipedia. ¿Te animas a escribirlo?',
    'wikipedia_cta.button': '✍️ Crear el artículo en Wikipedia',
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
    'filter.status_no_wikipedia': 'Enlazado, sin artículo en Wikipedia',
    'filter.title': 'Categorías',
    'filter.all': 'Todo',
    'filter.none': 'Ninguno',
    'text_license.note': (url) =>
      `Texto de <a href="${url}" target="_blank" rel="noopener">Wikipedia</a>, disponible bajo la licencia <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">Creative Commons Atribución-CompartirIgual 4.0</a>.`,
    'wikipedia.read_more': 'Leer más en Wikipedia →',
    'stats.title': 'Estadísticas',
    'stats.mission':
      'CyLinked existe para enlazar más monumentos de Castilla y León con Wikidata y enriquecer Wikipedia y Wikimedia Commons con más fotos y contenido libre. No es solo un mapa - es una herramienta para cerrar activamente esa brecha. Estas cifras son cómo medimos si lo está consiguiendo.',
    'stats.total': 'Monumentos BIC',
    'stats.linked': 'Enlazados a Wikidata',
    'stats.with_image': 'Con foto principal',
    'stats.history_title': 'Evolución',
    'stats.chart_empty': 'El histórico se construye con cada actualización de datos - vuelve más adelante para ver la evolución.',
    'stats.tooltip_pts': 'p.p.',
    'stats.tooltip_first': 'primer punto',
    'stats.legend_linked': 'Enlazados',
    'stats.legend_image': 'Con foto',
    'stats.photos_label': 'Fotos accesibles a través de CyLinked',
    'stats.photos_note': (n, date) =>
      `Suma de las fotos en las categorías de Wikimedia Commons de los ${n} monumentos que ya tienen una - cifra mínima, no cuenta las subcategorías donde muchas fotos adicionales suelen estar archivadas. Instantánea del ${date}, actualizada a mano de vez en cuando, no en cada actualización de datos.`,
    'privacy.title': 'Privacidad',
    'privacy.intro':
      'Esta página explica, en términos sencillos, qué pasa con tus datos cuando usas CyLinked. Resumen rápido: no hay cuentas, no hay formularios y no se usa ningún tipo de cookie - lo poco que hay que contar cabe en esta página.',
    'privacy.controller.title': '¿Quién es responsable de esta web?',
    'privacy.controller.body':
      '⚠️ Pendiente: nombre y datos de contacto de la persona o entidad responsable del tratamiento (los mismos que en el aviso legal).',
    'privacy.data_processed.title': 'Qué datos tratamos, y con qué base legal',
    'privacy.data_processed.body':
      'Al no haber cuentas ni formularios, no te pedimos ningún dato personal directamente. El único dato que puede quedar registrado es tu dirección IP - el número que identifica tu conexión a internet - cuando tu navegador se comunica con el servidor de esta web o con los servicios externos descritos más abajo, simplemente por cómo funciona internet. La base legal para esto es el "interés legítimo" (artículo 6.1.f del RGPD): es el mínimo técnico necesario para poder ofrecer la web de forma segura y sin errores. No se elabora ningún perfil sobre ti ni se toma ninguna decisión automatizada con estos datos.',
    'privacy.local_storage.title': 'Lo que se guarda en tu propio navegador',
    'privacy.local_storage.body':
      'Un par de detalles mínimos de la interfaz - si ya has visto el mensaje de bienvenida, si ya has descartado la "foto de la semana" en esta sesión - se guardan localmente en tu propio dispositivo (una técnica llamada localStorage/sessionStorage, distinta de las cookies). Esta información nunca llega a nuestros servidores ni a nadie más.',
    'privacy.external.title': 'Servicios externos que se cargan al usar CyLinked',
    'privacy.external.intro':
      'CyLinked usa algunos servicios de otras empresas para funcionar. Al usar la web, tu navegador se conecta directamente con ellos - nosotros no vemos ni gestionamos esa conexión, pero sí ocurre, y varias de estas empresas tienen sede fuera de la Unión Europea, por lo que tus datos (normalmente solo la IP) pueden tratarse allí según sus propias políticas:',
    'privacy.external.tiles':
      '<strong>Mapa base</strong> - las imágenes que forman el mapa vienen de CARTO, construidas sobre datos de OpenStreetMap; tu navegador las descarga directamente de sus servidores según te mueves por el mapa. <a href="https://carto.com/privacy/" target="_blank" rel="noopener">Política de privacidad de CARTO</a>.',
    'privacy.external.fonts':
      '<strong>Tipografías</strong> - Google Fonts. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Política de privacidad de Google</a>.',
    'privacy.external.wiki':
      '<strong>Wikidata, Wikipedia y Wikimedia Commons</strong> - el texto y las fotos de cada monumento se piden en directo a sus propias APIs, cada vez que abres su ficha. <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy" target="_blank" rel="noopener">Política de privacidad de la Fundación Wikimedia</a>.',
    'privacy.external.geolocation':
      '<strong>Tu ubicación</strong> - solo si pulsas el botón 🎯, mediante la geolocalización de tu propio navegador; nunca se envía a CyLinked ni se guarda en ningún sitio.',
    'privacy.retention.title': 'Cuánto tiempo se conservan los datos',
    'privacy.retention.body':
      'CyLinked no tiene base de datos propia, así que no guarda tu dirección IP ni ningún otro dato de forma permanente. El servidor que aloja la web puede mantener registros técnicos muy básicos (los habituales de cualquier servidor web) durante un tiempo limitado, solo para detectar problemas de seguridad o mal uso - nunca con fines comerciales ni de seguimiento.',
    'privacy.rights.title': 'Tus derechos',
    'privacy.rights.body':
      'Si en algún momento se llegara a tratar algún dato personal tuyo de forma más significativa, el RGPD te reconoce una serie de derechos: acceder a tus datos, corregirlos, pedir que se borren, limitar u oponerte a su uso, y llevarte una copia (portabilidad). Puedes ejercerlos escribiendo a la persona responsable indicada en el aviso legal. Si no quedas satisfecho con la respuesta, también tienes derecho a presentar una reclamación ante la <a href="https://www.aepd.es/" target="_blank" rel="noopener">Agencia Española de Protección de Datos (AEPD)</a>, la autoridad de control en España.',
    'privacy.changes.title': 'Si esto cambia',
    'privacy.changes.body':
      'Si en el futuro CyLinked empieza a usar estadísticas de uso agregadas y anónimas, o cualquier otro tratamiento nuevo, esta página se actualizará primero para explicarlo con el mismo detalle.',
    'imprint.title': 'Aviso legal',
    'imprint.body': '⚠️ Pendiente: añadir aquí los datos de contacto/responsable exigidos por la normativa aplicable.',
  },
  en: {
    'nav.stats': 'Statistics',
    'nav.about': 'About',
    'nav.contribute': 'How to contribute',
    'nav.privacy': 'Privacy',
    'nav.imprint': 'Imprint',
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
      `CyLinked combines the Junta de Castilla y León's open catalog of protected heritage sites (Bienes de Interés Cultural) with Wikidata, Wikimedia Commons and Wikipedia, to show which of the region's ${total} protected monuments are documented in the free-knowledge ecosystem - and which aren't yet. Right now: <strong>${linked} of ${total} (${pct}%)</strong> have a Wikidata link.`,
    'about.updated': (date) => `Data last refreshed: ${date}.`,
    'about.sources.title': 'Sources and licenses',
    'about.sources.jcyl':
      '<strong>Junta de Castilla y León</strong> (official Bienes de Interés Cultural catalog, published as open data) - "No legal validity, informational purpose only. Free and unrestricted use. Mandatory attribution to the source: \'Junta de Castilla y León\'." (verbatim from the dataset\'s own official record).',
    'about.sources.wikidata':
      '<strong>Wikidata</strong> - public domain (CC0). This is how we know which monuments are already documented there: we look for items that cite this project via a Wikidata-specific identifier, <a href="https://www.wikidata.org/wiki/Property:P3177" target="_blank" rel="noopener">P3177</a>.',
    'about.sources.commons':
      '<strong>Wikimedia Commons</strong> - each photo under its own license, shown alongside the image (usually CC BY-SA).',
    'about.sources.wikipedia': '<strong>Wikipedia</strong> - CC BY-SA.',
    'about.goals.title': 'Goals',
    'about.goals.accessible': "Make Castile and León's culture and history approachable to anyone, no prior knowledge required.",
    'about.goals.free_knowledge':
      'Promote free knowledge: the more information and openly-licensed photos exist, the richer Wikipedia gets and the more useful Wikidata becomes for everyone.',
    'about.goals.participate': "Encourage participation in that ecosystem - not just browsing CyLinked, but improving what's behind it.",
    'about.tech.title': 'How it works under the hood',
    'about.tech.data':
      "The monuments and their municipalities come straight from the Junta de Castilla y León's official catalog. To find out which ones are already documented in Wikidata, we automatically check which ones cite it. That whole process is a computer program that can be re-run at any time - not manual work, so the data can be checked and refreshed often.",
    'about.tech.site':
      "This site doesn't store your data anywhere: no database, no user accounts. Wikipedia's text, Commons' photos and Wikidata's facts are all fetched live from your own browser each time you open a page, not from a CyLinked server. All of the code is open too, and anyone can look through it.",
    'about.tech.github': '💻 Code on GitHub',
    'contribute.title': 'How to contribute',
    'contribute.intro':
      "This project doesn't store or manage its own contribution data - anything you add goes straight into the open Wikimedia ecosystem, not a private CyLinked database.",
    'contribute.photos.title': '1. Add photos',
    'contribute.photos.body':
      "For monuments that are already in Wikidata but have few or no photos: upload your own freely-licensed photo to Wikimedia Commons, making clear which monument it shows, and it'll show up here automatically next refresh - no need to tell anyone.",
    'contribute.upload.button': '📷 Upload a photo to Wikimedia Commons',
    'contribute.photos.guide_button': '🔰 First steps on Commons',
    'contribute.photos.guide_href': 'https://commons.wikimedia.org/wiki/Commons:First_steps',
    'contribute.photos.see_missing_button': '🖼️ See monuments without a photo',
    'contribute.wikipedia.title': '2. Improve Wikipedia articles',
    'contribute.wikipedia.body':
      "Many of these monuments have a short, incomplete, or simply missing Wikipedia article. Expanding it, fixing it, or writing it from scratch with reliable sources directly benefits whoever reads it here - the text you see on each page comes straight from there.",
    'contribute.wikipedia.button': '✍️ Wikipedia introduction guide',
    'contribute.wikipedia.href': 'https://en.wikipedia.org/wiki/Help:Introduction',
    'contribute.wikipedia.see_missing_button': '📖 See monuments without a Wikipedia article',
    'contribute.website.title': '3. Improve this website',
    'contribute.website.body':
      "CyLinked is itself an open-source project on GitHub: if you find a bug, have an idea, or want to contribute code directly, issues and pull requests are welcome.",
    'contribute.website.button': '💻 CyLinked on GitHub',
    'gallery.see_more': 'See more photos on Wikimedia Commons →',
    'potw.label': 'Picture of the week',
    'potw.close_title': 'Close',
    'potw.cta': 'See this Heritage Site now →',
    'potw.collab_label': "Still without a single free photo on Wikimedia Commons. Help document them:",
    'potw.collab_map_link': 'See on the map',
    'potw.collab_help_link': 'How to help',
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
    'wikipedia_cta.text': "This monument doesn't have a Wikipedia article yet. Feel like writing it?",
    'wikipedia_cta.button': '✍️ Create the Wikipedia article',
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
    'filter.status_no_wikipedia': 'Linked, no Wikipedia article',
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
    'stats.photos_label': 'Photos made accessible through CyLinked',
    'stats.photos_note': (n, date) =>
      `Sum of the photos in the Wikimedia Commons categories of the ${n} monuments that already have one - a floor, not counting subcategories, where a lot of additional photos are often filed. Snapshot from ${date}, refreshed by hand every now and then, not with every data update.`,
    'privacy.title': 'Privacy',
    'privacy.intro':
      "This page explains, in plain terms, what happens to your data when you use CyLinked. Short version: there are no accounts, no forms, and no cookies of any kind - what little there is to explain fits on this one page.",
    'privacy.controller.title': 'Who is responsible for this site?',
    'privacy.controller.body':
      '⚠️ Pending: name and contact details of the person or entity responsible for processing (the same as on the Imprint page).',
    'privacy.data_processed.title': 'What data we process, and on what legal basis',
    'privacy.data_processed.body':
      'Since there are no accounts or forms, we don\'t ask you for any personal data directly. The only data that may get recorded is your IP address - the number that identifies your internet connection - when your browser talks to this site\'s server or to the external services described below, simply because of how the internet works. The legal basis for this is "legitimate interest" (GDPR Article 6(1)(f)): it\'s the minimum technically necessary to run the site securely and reliably. No profile is built about you, and no automated decisions are made with this data.',
    'privacy.local_storage.title': 'What gets stored in your own browser',
    'privacy.local_storage.body':
      "A couple of minimal interface details - whether you've already seen the welcome message, whether you've already dismissed this session's 'picture of the week' - are stored locally on your own device (a technique called localStorage/sessionStorage, different from cookies). This information never reaches our servers or anyone else.",
    'privacy.external.title': 'External services loaded while using CyLinked',
    'privacy.external.intro':
      "CyLinked relies on a few other companies' services to work. Using the site means your browser connects to them directly - we don't see or manage that connection, but it happens, and several of these companies are based outside the European Union, so your data (usually just your IP address) may be processed there under their own policies:",
    'privacy.external.tiles':
      '<strong>Base map</strong> - the images that make up the map come from CARTO, built on OpenStreetMap data; your browser downloads them directly from their servers as you move around the map. <a href="https://carto.com/privacy/" target="_blank" rel="noopener">CARTO\'s privacy policy</a>.',
    'privacy.external.fonts':
      '<strong>Fonts</strong> - Google Fonts. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google\'s privacy policy</a>.',
    'privacy.external.wiki':
      "<strong>Wikidata, Wikipedia and Wikimedia Commons</strong> - each monument's text and photos are fetched live from their own APIs, every time you open its page. <a href=\"https://foundation.wikimedia.org/wiki/Policy:Privacy_policy\" target=\"_blank\" rel=\"noopener\">Wikimedia Foundation privacy policy</a>.",
    'privacy.external.geolocation':
      "<strong>Your location</strong> - only if you tap the 🎯 button, via your own browser's geolocation; never sent to CyLinked or stored anywhere.",
    'privacy.retention.title': 'How long data is kept',
    'privacy.retention.body':
      "CyLinked has no database of its own, so it doesn't permanently store your IP address or any other data. The server hosting the site may keep very basic technical logs (the kind any web server keeps) for a limited time, only to catch security problems or abuse - never for marketing or tracking purposes.",
    'privacy.rights.title': 'Your rights',
    'privacy.rights.body':
      'If any personal data of yours were ever processed in a more meaningful way, the GDPR gives you a set of rights: to access your data, correct it, request its deletion, restrict or object to its use, and take a copy with you (portability). You can exercise these by writing to the person responsible listed on the Imprint page. If you\'re not satisfied with the response, you also have the right to lodge a complaint with the <a href="https://www.aepd.es/" target="_blank" rel="noopener">Spanish Data Protection Agency (AEPD)</a>, the supervisory authority in Spain.',
    'privacy.changes.title': 'If this ever changes',
    'privacy.changes.body':
      'If CyLinked ever starts using aggregated, anonymous usage statistics, or any other new kind of processing, this page will be updated first to explain it in the same detail.',
    'imprint.title': 'Imprint',
    'imprint.body': '⚠️ Pending: add the contact/responsible-party details required by applicable law here.',
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
