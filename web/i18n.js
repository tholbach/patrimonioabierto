// Minimal i18n: covers the app's own UI chrome (nav, legend, panel labels,
// About/Contribute page text) in Spanish and English. Deliberately does NOT
// translate monument names/categories (they're JCyL's own official Spanish
// terms - translating them would misrepresent the source data) or Wikidata
// extracts (those come from whichever Wikipedia edition actually has the
// article - see fetchWikidataEntity's sitelink preference in app.js, which
// does shift with the language toggle).

// The contact address is published as an image rather than as text, to make
// it less trivially collectable by address harvesters. The alt text still
// carries it in full, so a screen reader reads it out like any other
// address - keeping it from scrapers must not keep it from people.
//
// Defined once because the same markup appears on the About and the Aviso
// legal page in both languages. Four copies of an address drift; one does
// not, and changing it should be a one-line edit.
const CONTACT_EMAIL_IMG =
  '<img class="contact-email-img" src="assets/contact-email.png" alt="patrimonioabierto@holba.ch" width="217" height="22">';

const STRINGS = {
  es: {
    'nav.stats': 'Estadísticas',
    'nav.about': 'Acerca de',
    'nav.contribute': 'Cómo contribuir',
    'nav.privacy': 'Privacidad',
    'nav.imprint': 'Aviso legal',
    'nav.github': 'GitHub',
    'menu.title': 'Menú',
    'menu.button_title': 'Menú',
    'stats.monument_count': (n) => `${n} monumentos`,
    'badge.share': 'Compartir',
    'badge.share.copied': '✓ Copiado',
    // Antesala antes de mandar a alguien a Wikipedia/Commons: los enlaces
    // apuntan a las guías concretas de primeros pasos en su idioma, no a
    // la portada de ayuda. Solo se muestra hasta que se continúa una vez
    // (ver INTRO_SEEN_KEY en app.js) - a quien ya sabe cómo va no hay que
    // repetírselo en cada monumento.
    'intro.wikipedia.title': '¿Es tu primera vez escribiendo en Wikipedia?',
    'intro.wikipedia.body':
      'Wikipedia es una enciclopedia: un artículo no describe lo que uno sabe o recuerda, sino lo que ya han publicado <strong>fuentes fiables</strong> - libros, catálogos, prensa, el propio expediente de declaración BIC. Si es tu primer artículo, el asistente te lleva paso a paso y puedes guardarlo como borrador antes de publicarlo. En la Wikipedia en español <strong>no hace falta cuenta</strong> para crearlo, pero con una tus ediciones quedan a tu nombre en lugar de a tu dirección IP.',
    'intro.wikipedia.link_intro': '📘 Introducción a Wikipedia',
    'intro.wikipedia.link_wizard': '🧭 Asistente para crear un artículo',
    'intro.wikipedia.link_sources': '🔎 Cómo citar fuentes',
    'intro.wikipedia.link_account': '👤 Crear una cuenta',
    'intro.wikipedia.continue': 'Continuar a Wikipedia →',
    'intro.commons.title': '¿Es tu primera vez subiendo a Wikimedia Commons?',
    'intro.commons.body':
      'Commons solo acepta imágenes <strong>que hayas hecho tú</strong> (o que ya tengan una licencia libre): no valen fotos sacadas de otras webs, aunque no tengan marca de agua. Al subirla eliges una <strong>licencia libre</strong>, y esa elección es permanente: con <strong>CC BY-SA 4.0</strong> (la más habitual) cualquiera puede reutilizar tu foto, incluso comercialmente, siempre que te cite y comparta el resultado con la misma licencia; con <strong>CC0</strong> renuncias incluso a que te citen. Seguirás siendo la autora o el autor en todo caso. <strong>Para subir hace falta una cuenta</strong> (gratuita, un minuto); crearla también sirve para Wikipedia y Wikidata.',
    'intro.commons.link_first': '📘 Primeros pasos en Commons',
    'intro.commons.link_form': '⬆️ Cómo funciona el formulario de subida',
    'intro.commons.link_license': '⚖️ Qué licencia elegir',
    'intro.commons.link_account': '👤 Crear una cuenta',
    'intro.commons.continue': 'Continuar a Commons →',
    'intro.cancel': 'Ahora no',
    'badge.jcyl': '📄 Ficha JCyL',
    'badge.website': '🌐 Web oficial',
    'badge.directions': '🧭 Cómo llegar',
    'badge.wikidata': 'Wikidata',
    'badge.wikipedia': 'Wikipedia',
    'missing.note': 'Sin enlazar a Wikidata todavía.',
    'error.note': 'Error cargando datos de Wikidata/Commons.',
    'loading': 'Cargando…',
    'protection.since': 'BIC desde',
    'panel.close': 'Cerrar',
    'loading.screen': 'Cargando el catálogo…',
    'loading.error': 'No se han podido cargar los datos. Recarga la página.',
    'welcome.title': 'Bienvenido a Patrimonio Abierto',
    'welcome.body':
      'Aquí encontrarás todos los Bienes de Interés Cultural (BIC) declarados oficialmente en Castilla y León, junto con información y material multimedia de Wikidata, Wikipedia y Wikimedia Commons. Un proyecto libre, sin cuentas ni anuncios.',
    'welcome.cta': 'Empezar a explorar',
    'welcome.about_link': 'Más sobre el proyecto',
    'about.title': 'Acerca de Patrimonio Abierto',
    'about.intro': (linked, total, pct) =>
      `Patrimonio Abierto combina el catálogo abierto de Bienes de Interés Cultural de la Junta de Castilla y León con Wikidata, Wikimedia Commons y Wikipedia, para mostrar cuáles de los ${total} monumentos protegidos de la región están documentados en el ecosistema de conocimiento libre - y cuáles todavía no. Ahora mismo: <strong>${linked} de ${total} (${pct}%)</strong> tienen un enlace a Wikidata.`,
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
    'about.goals.participate': 'Animar a participar en ese ecosistema - no solo a consultar Patrimonio Abierto, sino a mejorar lo que hay detrás.',
    'about.tech.title': 'Cómo funciona por dentro',
    'about.tech.data':
      'Los monumentos y sus municipios vienen directamente del catálogo oficial de la Junta de Castilla y León. Para saber cuáles ya están documentados en Wikidata, comprobamos automáticamente cuáles la citan. Todo ese proceso es un programa informático que se puede volver a ejecutar en cualquier momento - no es trabajo manual, así que los datos se pueden revisar y actualizar con frecuencia.',
    'about.tech.site':
      'Esta web no guarda tus datos en ningún sitio: no hay base de datos ni cuentas de usuario. Los textos de Wikipedia, las fotos de Commons y los datos de Wikidata se piden en directo desde tu propio navegador cada vez que abres una ficha, no desde un servidor de Patrimonio Abierto. Todo el código es además abierto y cualquiera puede revisarlo.',
    'about.tech.github': '💻 Código en GitHub',
    'contribute.title': 'Cómo contribuir',
    'contribute.intro':
      'Este proyecto no almacena ni gestiona sus propios datos de contribución - todo lo que añadas va directamente al ecosistema abierto de Wikimedia, no a una base de datos privada de Patrimonio Abierto.',
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
      'Patrimonio Abierto es en sí mismo un proyecto de código abierto en GitHub: si encuentras un fallo, tienes una idea de mejora o quieres aportar código directamente, los issues y pull requests son bienvenidos.',
    'contribute.website.button': '💻 Patrimonio Abierto en GitHub',
    'gallery.see_more': 'Ver más fotos en Wikimedia Commons →',
    'potw.label': 'Foto de la semana',
    'potw.close_title': 'Cerrar',
    'potw.cta': 'Ver este Bien de Interés Cultural ahora →',
    'potw.collab_label': 'Todavía no tienen ninguna foto libre en Wikimedia Commons. Súmate a documentarlos:',
    'potw.collab_map_link': 'Ver en el mapa',
    'potw.collab_help_link': 'Cómo ayudar',
    'potw.collab_nearby_link': 'Cerca de mí',
    'potw.collab_nearby_loading': 'Buscando…',
    'potw.collab_nearby_title': 'Sin foto, cerca de ti:',
    'potw.collab_nearby_empty': 'No hay monumentos sin foto cerca de tu ubicación.',
    'contribute_bar.text': '🤝 ¿Quieres ayudar a documentar el patrimonio de Castilla y León? Descubre cómo →',
    'contribute_bar.text_short': '🤝 Ayúdanos a documentar el patrimonio →',
    'search.placeholder': 'Buscar monumento, municipio o provincia…',
    'search.section.monuments': 'Monumentos',
    'search.section.municipalities': 'Municipios',
    'search.section.provinces': 'Provincias',
    'search.no_results': 'Sin resultados',
    'municipality.kicker': '📍 Municipio',
    'province.kicker': '🗺️ Provincia',
    'municipality.monuments_title': 'Monumentos',
    'municipality.no_monuments': 'Ningún BIC registrado en este municipio.',
    'province.municipalities_title': 'Municipios con más monumentos',
    'province.municipality_count': (n) => `${n} municipios`,
    // Varias formulaciones en vez de una sola: quien recorre veinte fichas
    // se encuentra veinte veces el mismo texto, y a la tercera deja de
    // leerlo. Se elige una al azar (ver variant()).
    'upload_cta.text': () => variant([
      'Este monumento ya está en Wikidata pero todavía no tiene ninguna foto. ¿Tienes una?',
      'Nadie ha subido todavía una foto libre de este monumento. ¿Te animas a ser quien lo haga?',
      'Está en Wikidata, pero sigue sin cara: ni una sola fotografía libre. ¿Le pones una?',
      'Si algún día pasas por delante con la cámara (o con el móvil), esta ficha sigue esperando su primera foto.',
      'Catalogado, enlazado, documentado… y todavía sin una sola foto libre. ¿Tienes alguna?',
    ]),
    'wikipedia_cta.text': () => variant([
      'Este monumento todavía no tiene artículo en Wikipedia. ¿Te animas a escribirlo?',
      'Nadie ha escrito aún su artículo en Wikipedia. Podrías ser tú.',
      'En Wikipedia, este monumento todavía no existe. ¿Lo cuentas tú?',
      'Siglos de historia y ni una línea en Wikipedia. ¿Te animas?',
      'Su artículo en Wikipedia está por escribir. ¿Empiezas tú?',
    ]),
    'wikipedia_cta.button': '✍️ Crear el artículo en Wikipedia',
    'geolocation.button_title': 'Mostrar mi ubicación',
    'geolocation.you_are_here': 'Estás aquí',
    'geolocation.error': 'No se pudo obtener tu ubicación. Comprueba los permisos de localización del navegador.',
    'nearby.title': 'Cerca de aquí',
    'shuffle.button_title': 'Descubrir un monumento al azar',
    'filter.button_title': 'Filtrar',
    'filter.status_title': 'Estado',
    'marker.has_photo': 'Con foto libre',
    'marker.no_photo': 'Sin foto libre',
    'filter.status_no_photo': 'Enlazado, sin foto',
    'filter.status_has_photo': 'Con foto',
    'filter.status_no_wikipedia': 'Enlazado, sin artículo en Wikipedia',
    // Toast shown when a filter is applied from outside the filter panel
    // (see showMapFilteredByStatus()) - `label` is one of the
    // filter.status_* strings just above.
    'filter.applied': (label, count) => `Filtro activo · ${label}: ${count} monumentos`,
    'filter.title': 'Categorías',
    'filter.all': 'Todo',
    'filter.none': 'Ninguno',
    'list.skip_link': 'Ir directamente a la lista de monumentos',
    'list.title': 'Todos los monumentos',
    'list.count': (n) => `${n.toLocaleString('es')} monumentos`,
    'list.filtered_note': 'Según los filtros activos - cámbialos con el botón 🎚️.',
    'list.empty': 'Ningún monumento coincide con los filtros activos.',
    'text_license.note': (url) =>
      `Texto de <a href="${url}" target="_blank" rel="noopener">Wikipedia</a>, disponible bajo la licencia <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">Creative Commons Atribución-CompartirIgual 4.0</a>.`,
    'wikipedia.read_more': 'Leer más en Wikipedia →',
    'stats.title': 'Estadísticas',
    'stats.mission':
      'Patrimonio Abierto existe para enlazar más monumentos de Castilla y León con Wikidata y enriquecer Wikipedia y Wikimedia Commons con más fotos y contenido libre. No es solo un mapa - es una herramienta para cerrar activamente esa brecha. Estas cifras son cómo medimos si lo está consiguiendo.',
    'stats.total': 'Monumentos BIC',
    'stats.linked': 'Enlazados a Wikidata',
    'stats.with_image': 'Con foto en Wikimedia Commons',
    'stats.with_article': 'Con artículo en Wikipedia en español',
    'stats.history_title': 'Evolución',
    'stats.chart_empty': 'El histórico se construye con cada actualización de datos - vuelve más adelante para ver la evolución.',
    'stats.tooltip_pts': 'p.p.',
    'stats.tooltip_first': 'primer punto',
    'stats.legend_linked': 'Enlazados',
    'stats.legend_image': 'Con foto',
    'stats.photos_label': 'Fotos accesibles',
    'stats.photos_value': (n) => `más de ${n}`,
    'stats.linked_record': (linked, total, pct) =>
      `${linked} de ${total} monumentos ya están enlazados a Wikidata (${pct}%). Ese enlace es lo que hace posible todo lo demás.`,
    'stats.photos_note': (n, date) =>
      `Suma de las fotos en las categorías de Wikimedia Commons de los ${n} monumentos que ya tienen una - cifra mínima, no cuenta las subcategorías donde muchas fotos adicionales suelen estar archivadas. Instantánea del ${date}, actualizada a mano de vez en cuando, no en cada actualización de datos.`,
    'privacy.title': 'Privacidad',
    'privacy.intro':
      'Esta página explica, en términos sencillos, qué pasa con tus datos cuando usas Patrimonio Abierto. Resumen rápido: no hay cuentas, no hay formularios y no se usa ningún tipo de cookie - lo poco que hay que contar cabe en esta página.',
    'privacy.controller.title': '¿Quién es responsable de esta web?',
    'privacy.controller.body':
      `Patrimonio Abierto lo mantiene una sola persona, <strong>Thomas Holbach</strong>, a título personal, sin ánimo de lucro y sin publicidad. Contacto (como imagen, para dificultar el spam automatizado): ${CONTACT_EMAIL_IMG}.`,
    'privacy.data_processed.title': 'Qué datos tratamos, y con qué base legal',
    'privacy.data_processed.body':
      'Al no haber cuentas ni formularios, no te pedimos ningún dato personal directamente. Cuando tu navegador se comunica con el servidor de esta web, este anota la petición en un registro de acceso: qué página se ha pedido, cuándo, con qué navegador y desde qué página se ha llegado. Tu dirección IP - el número que identifica tu conexión a internet - se <strong>recorta antes de escribirla</strong>: de una dirección IPv4 solo se conservan los tres primeros grupos (por ejemplo 88.1.2.0) y de una IPv6 los tres primeros. No queda en ningún momento una copia completa, así que ese registro no permite identificarte. La base legal es el "interés legítimo" (artículo 6.1.f del RGPD): mantener la web segura y saber, de forma agregada, si sirve para algo. No hay cookies, ni identificadores, ni seguimiento entre webs, y no se elabora ningún perfil sobre ti ni se toma ninguna decisión automatizada.',
    'privacy.stats.title': 'Qué se cuenta, y para qué',
    'privacy.stats.body':
      'A partir de ese registro se sacan cifras agregadas: cuántas visitas hay, qué monumentos se abren, desde qué buscador o enlace se llega, y cuántas veces alguien pulsa los dos botones que llevan a escribir un artículo en Wikipedia o a subir una foto a Wikimedia Commons. Esos dos botones pasan por una dirección propia de esta web (<code>/go/…</code>) antes de redirigirte, y por eso quedan contados. Esas dos cifras son la única forma que tiene el proyecto de saber si de verdad sirve para lo que pretende: que el patrimonio de Castilla y León acabe mejor documentado en el conocimiento libre. Todo ello se calcula sobre datos ya recortados, en el propio servidor, sin enviar nada a terceros y sin ninguna herramienta de analítica externa.',
    'privacy.local_storage.title': 'Lo que se guarda en tu propio navegador',
    'privacy.local_storage.body':
      'Un par de detalles mínimos de la interfaz - si ya has visto el mensaje de bienvenida, si ya has descartado la "foto de la semana" en esta sesión - se guardan localmente en tu propio dispositivo (una técnica llamada localStorage/sessionStorage, distinta de las cookies). Esta información nunca llega a nuestros servidores ni a nadie más.',
    'privacy.external.title': 'Servicios externos que se cargan al usar Patrimonio Abierto',
    'privacy.external.intro':
      'Patrimonio Abierto usa algunos servicios de otras empresas para funcionar. Al usar la web, tu navegador se conecta directamente con ellos - nosotros no vemos ni gestionamos esa conexión, pero sí ocurre, y varias de estas empresas tienen sede fuera de la Unión Europea, por lo que tus datos (normalmente solo la IP) pueden tratarse allí según sus propias políticas:',
    'privacy.external.tiles':
      '<strong>Mapa base</strong> - las imágenes que forman el mapa vienen de OpenStreetMap; tu navegador las descarga directamente de sus servidores según te mueves por el mapa. <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener">Política de privacidad de la OpenStreetMap Foundation</a>.',
    'privacy.external.wiki':
      '<strong>Wikidata, Wikipedia y Wikimedia Commons</strong> - el texto y las fotos de cada monumento se piden en directo a sus propias APIs, cada vez que abres su ficha. <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy" target="_blank" rel="noopener">Política de privacidad de la Fundación Wikimedia</a>.',
    'privacy.external.geolocation':
      '<strong>Tu ubicación</strong> - solo si pulsas el botón 🎯, mediante la geolocalización de tu propio navegador; nunca se envía a Patrimonio Abierto ni se guarda en ningún sitio.',
    'privacy.retention.title': 'Cuánto tiempo se conservan los datos',
    'privacy.retention.body':
      'Patrimonio Abierto no tiene base de datos propia ni guarda tu dirección IP completa en ningún momento. El registro de acceso descrito arriba - ya con las direcciones recortadas - se conserva un máximo de <strong>90 días</strong> y después se borra automáticamente; las cifras agregadas que se sacan de él no contienen direcciones de ningún tipo. Nunca se usa con fines comerciales, publicitarios ni de seguimiento, y nunca se comparte con terceros.',
    'privacy.rights.title': 'Tus derechos',
    'privacy.rights.body':
      'Si en algún momento se llegara a tratar algún dato personal tuyo de forma más significativa, el RGPD te reconoce una serie de derechos: acceder a tus datos, corregirlos, pedir que se borren, limitar u oponerte a su uso, y llevarte una copia (portabilidad). Puedes ejercerlos escribiendo a la persona responsable indicada en el aviso legal. Si no quedas satisfecho con la respuesta, también tienes derecho a presentar una reclamación ante la <a href="https://www.aepd.es/" target="_blank" rel="noopener">Agencia Española de Protección de Datos (AEPD)</a>, la autoridad de control en España.',
    'privacy.changes.title': 'Si esto cambia',
    'privacy.changes.body':
      'Esta página se actualiza antes de cualquier cambio en cómo se tratan los datos, no después: así se hizo al empezar a contar las estadísticas agregadas descritas arriba, y así se hará con cualquier tratamiento nuevo.',
    'imprint.title': 'Aviso legal',
    'imprint.body':
      `Patrimonio Abierto es un proyecto personal e independiente, sin ánimo de lucro, sin publicidad y sin ningún tipo de patrocinio - no genera ingresos de ninguna forma. Responsable del sitio: <strong>Thomas Holbach</strong>. Contacto (como imagen, para dificultar el spam automatizado): ${CONTACT_EMAIL_IMG}.`,
  },
  en: {
    'nav.stats': 'Statistics',
    'nav.about': 'About',
    'nav.contribute': 'How to contribute',
    'nav.privacy': 'Privacy',
    'nav.imprint': 'Imprint',
    'nav.github': 'GitHub',
    'menu.title': 'Menu',
    'menu.button_title': 'Menu',
    'stats.monument_count': (n) => `${n} monuments`,
    'badge.share': 'Share',
    'badge.share.copied': '✓ Copied',
    'intro.wikipedia.title': 'First time writing on Wikipedia?',
    'intro.wikipedia.body':
      "Wikipedia is an encyclopedia: an article isn't what you know or remember, it's what <strong>reliable sources</strong> have already published - books, catalogues, press, the BIC listing document itself. If it's your first article, the wizard walks you through it, and you can keep it as a draft before publishing. <strong>You'll need an account</strong> on the English Wikipedia - it doesn't accept new articles from logged-out visitors - and a brand-new one starts its articles as drafts, which is exactly what the wizard sets up.",
    'intro.wikipedia.link_intro': '📘 Introduction to Wikipedia',
    'intro.wikipedia.link_wizard': '🧭 Article creation wizard',
    'intro.wikipedia.link_sources': '🔎 How to cite sources',
    'intro.wikipedia.link_account': '👤 Create an account',
    'intro.wikipedia.continue': 'Continue to Wikipedia →',
    'intro.commons.title': 'First time uploading to Wikimedia Commons?',
    'intro.commons.body':
      'Commons only accepts images <strong>you took yourself</strong> (or that already carry a free licence): photos taken from other websites are not allowed, watermark or no watermark. You choose a <strong>free licence</strong> as you upload, and that choice is permanent: under <strong>CC BY-SA 4.0</strong> (the usual one) anyone may reuse your photo, commercially too, as long as they credit you and share the result under the same licence; under <strong>CC0</strong> you waive even the credit. You remain the author either way. <strong>Uploading requires an account</strong> (free, a minute); the same one works for Wikipedia and Wikidata too.',
    'intro.commons.link_first': '📘 First steps on Commons',
    'intro.commons.link_form': '⬆️ How the upload form works',
    'intro.commons.link_license': '⚖️ Which licence to choose',
    'intro.commons.link_account': '👤 Create an account',
    'intro.commons.continue': 'Continue to Commons →',
    'intro.cancel': 'Not now',
    'badge.jcyl': '📄 JCyL record',
    'badge.website': '🌐 Official website',
    'badge.directions': '🧭 How to get there',
    'badge.wikidata': 'Wikidata',
    'badge.wikipedia': 'Wikipedia',
    'missing.note': 'Not linked to Wikidata yet.',
    'error.note': 'Error loading Wikidata/Commons data.',
    'loading': 'Loading…',
    'protection.since': 'Protected since',
    'panel.close': 'Close',
    'loading.screen': 'Loading the catalog…',
    'loading.error': 'Could not load the data. Please reload the page.',
    'welcome.title': 'Welcome to Patrimonio Abierto',
    'welcome.body':
      "Here you'll find every officially declared Heritage Site (BIC) in Castile and León, along with information and media from Wikidata, Wikipedia and Wikimedia Commons. A free project - no accounts, no ads.",
    'welcome.cta': 'Start exploring',
    'welcome.about_link': 'More about the project',
    'about.title': 'About Patrimonio Abierto',
    'about.intro': (linked, total, pct) =>
      `Patrimonio Abierto combines the Junta de Castilla y León's open catalog of protected heritage sites (Bienes de Interés Cultural) with Wikidata, Wikimedia Commons and Wikipedia, to show which of the region's ${total} protected monuments are documented in the free-knowledge ecosystem - and which aren't yet. Right now: <strong>${linked} of ${total} (${pct}%)</strong> have a Wikidata link.`,
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
    'about.goals.participate': "Encourage participation in that ecosystem - not just browsing Patrimonio Abierto, but improving what's behind it.",
    'about.tech.title': 'How it works under the hood',
    'about.tech.data':
      "The monuments and their municipalities come straight from the Junta de Castilla y León's official catalog. To find out which ones are already documented in Wikidata, we automatically check which ones cite it. That whole process is a computer program that can be re-run at any time - not manual work, so the data can be checked and refreshed often.",
    'about.tech.site':
      "This site doesn't store your data anywhere: no database, no user accounts. Wikipedia's text, Commons' photos and Wikidata's facts are all fetched live from your own browser each time you open a page, not from a Patrimonio Abierto server. All of the code is open too, and anyone can look through it.",
    'about.tech.github': '💻 Code on GitHub',
    'contribute.title': 'How to contribute',
    'contribute.intro':
      "This project doesn't store or manage its own contribution data - anything you add goes straight into the open Wikimedia ecosystem, not a private Patrimonio Abierto database.",
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
      "Patrimonio Abierto is itself an open-source project on GitHub: if you find a bug, have an idea, or want to contribute code directly, issues and pull requests are welcome.",
    'contribute.website.button': '💻 Patrimonio Abierto on GitHub',
    'gallery.see_more': 'See more photos on Wikimedia Commons →',
    'potw.label': 'Picture of the week',
    'potw.close_title': 'Close',
    'potw.cta': 'See this Heritage Site now →',
    'potw.collab_label': "Still without a single free photo on Wikimedia Commons. Help document them:",
    'potw.collab_map_link': 'See on the map',
    'potw.collab_help_link': 'How to help',
    'potw.collab_nearby_link': 'Near me',
    'potw.collab_nearby_loading': 'Looking…',
    'potw.collab_nearby_title': 'No photo yet, near you:',
    'potw.collab_nearby_empty': 'No monuments without a photo near your location.',
    'contribute_bar.text': '🤝 Want to help document the heritage of Castilla y León? See how →',
    'contribute_bar.text_short': '🤝 Help document the heritage →',
    'search.placeholder': 'Search monument, municipality or province…',
    'search.section.monuments': 'Monuments',
    'search.section.municipalities': 'Municipalities',
    'search.section.provinces': 'Provinces',
    'search.no_results': 'No results',
    'municipality.kicker': '📍 Municipality',
    'province.kicker': '🗺️ Province',
    'municipality.monuments_title': 'Monuments',
    'municipality.no_monuments': 'No protected heritage sites registered in this municipality.',
    'province.municipalities_title': 'Municipalities with the most monuments',
    'province.municipality_count': (n) => `${n} municipalities`,
    'upload_cta.text': () => variant([
      'This monument already has a Wikidata item but no photo yet. Have one?',
      'Nobody has uploaded a free photo of this one yet. Fancy being the first?',
      "It's on Wikidata, but still faceless - not a single free photograph. Got one?",
      'If you ever walk past it with a camera - or a phone - this entry is still waiting for its first picture.',
      'Catalogued, linked, documented... and still without a single free photo. Do you have one?',
    ]),
    'wikipedia_cta.text': () => variant([
      "This monument doesn't have a Wikipedia article yet. Feel like writing it?",
      'Nobody has written its Wikipedia article yet. That could be you.',
      "On Wikipedia, this monument doesn't exist yet. Care to tell its story?",
      'Centuries of history, and not one line on Wikipedia. Fancy a go?',
      'Its Wikipedia article is still unwritten. Want to be the one to start it?',
    ]),
    'wikipedia_cta.button': '✍️ Create the Wikipedia article',
    'geolocation.button_title': 'Show my location',
    'geolocation.you_are_here': 'You are here',
    'geolocation.error': "Couldn't get your location. Check your browser's location permissions.",
    'nearby.title': 'Nearby',
    'shuffle.button_title': 'Discover a random monument',
    'filter.button_title': 'Filter',
    'filter.status_title': 'Status',
    'marker.has_photo': 'Has a free photo',
    'marker.no_photo': 'No free photo',
    'filter.status_no_photo': 'Linked, no photo',
    'filter.status_has_photo': 'Has a photo',
    'filter.status_no_wikipedia': 'Linked, no Wikipedia article',
    'filter.applied': (label, count) => `Filter on · ${label}: ${count} monuments`,
    'filter.title': 'Categories',
    'filter.all': 'All',
    'filter.none': 'None',
    'list.skip_link': 'Skip straight to the list of monuments',
    'list.title': 'All the monuments',
    'list.count': (n) => `${n.toLocaleString('en')} monuments`,
    'list.filtered_note': 'Reflects the active filters - change them with the 🎚️ button.',
    'list.empty': 'No monuments match the active filters.',
    'text_license.note': (url) =>
      `Text from <a href="${url}" target="_blank" rel="noopener">Wikipedia</a>, available under the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">Creative Commons Attribution-ShareAlike 4.0 License</a>.`,
    'wikipedia.read_more': 'Read more on Wikipedia →',
    'stats.title': 'Statistics',
    'stats.mission':
      "Patrimonio Abierto exists to link more of Castilla y León's monuments to Wikidata and enrich Wikipedia and Wikimedia Commons with more photos and free content. It's not just a map - it's a tool for actively closing that gap. These numbers are how we measure whether it's working.",
    'stats.total': 'BIC monuments',
    'stats.linked': 'Linked to Wikidata',
    'stats.with_image': 'With a photo on Wikimedia Commons',
    'stats.with_article': 'With an English Wikipedia article',
    'stats.history_title': 'Progress over time',
    'stats.chart_empty': 'History builds up with each data refresh - check back later to see the trend.',
    'stats.tooltip_pts': 'pp',
    'stats.tooltip_first': 'first point',
    'stats.legend_linked': 'Linked',
    'stats.legend_image': 'With photo',
    'stats.photos_label': 'Photos made accessible',
    'stats.photos_value': (n) => `more than ${n}`,
    'stats.linked_record': (linked, total, pct) =>
      `${linked} of ${total} monuments are already linked to Wikidata (${pct}%). That link is what makes everything else possible.`,
    'stats.photos_note': (n, date) =>
      `Sum of the photos in the Wikimedia Commons categories of the ${n} monuments that already have one - a floor, not counting subcategories, where a lot of additional photos are often filed. Snapshot from ${date}, refreshed by hand every now and then, not with every data update.`,
    'privacy.title': 'Privacy',
    'privacy.intro':
      "This page explains, in plain terms, what happens to your data when you use Patrimonio Abierto. Short version: there are no accounts, no forms, and no cookies of any kind - what little there is to explain fits on this one page.",
    'privacy.controller.title': 'Who is responsible for this site?',
    'privacy.controller.body':
      `Patrimonio Abierto is maintained by one person, <strong>Thomas Holbach</strong>, in a personal capacity, not-for-profit and without advertising. Contact (as an image, to make automated spam harvesting harder): ${CONTACT_EMAIL_IMG}.`,
    'privacy.data_processed.title': 'What data we process, and on what legal basis',
    'privacy.data_processed.body':
      'Since there are no accounts or forms, we don\'t ask you for any personal data directly. When your browser talks to this site\'s server, that server notes the request in an access log: which page was asked for, when, with which browser, and which page you arrived from. Your IP address - the number that identifies your internet connection - is <strong>truncated before it is written down</strong>: only the first three groups of an IPv4 address are kept (88.1.2.0, say), and the first three of an IPv6 one. A complete copy never exists at any point, so that log cannot identify you. The legal basis is "legitimate interest" (GDPR Article 6(1)(f)): keeping the site secure, and knowing in aggregate whether it is of any use. There are no cookies, no identifiers and no cross-site tracking; no profile is built about you and no automated decisions are made.',
    'privacy.stats.title': 'What is counted, and what for',
    'privacy.stats.body':
      'Aggregate figures are worked out from that log: how many visits there are, which monuments get opened, which search engine or link people arrive from, and how often someone presses the two buttons that lead to writing a Wikipedia article or uploading a photo to Wikimedia Commons. Those two buttons go through an address on this site (<code>/go/…</code>) before redirecting you, which is how they end up counted. They are the only way this project can tell whether it actually does what it sets out to do: get Castilla y León\'s heritage better documented in free knowledge. All of it is computed from already-truncated data, on this site\'s own server, with nothing sent to third parties and no external analytics tool involved.',
    'privacy.local_storage.title': 'What gets stored in your own browser',
    'privacy.local_storage.body':
      "A couple of minimal interface details - whether you've already seen the welcome message, whether you've already dismissed this session's 'picture of the week' - are stored locally on your own device (a technique called localStorage/sessionStorage, different from cookies). This information never reaches our servers or anyone else.",
    'privacy.external.title': 'External services loaded while using Patrimonio Abierto',
    'privacy.external.intro':
      "Patrimonio Abierto relies on a few other companies' services to work. Using the site means your browser connects to them directly - we don't see or manage that connection, but it happens, and several of these companies are based outside the European Union, so your data (usually just your IP address) may be processed there under their own policies:",
    'privacy.external.tiles':
      '<strong>Base map</strong> - the images that make up the map come from OpenStreetMap; your browser downloads them directly from their servers as you move around the map. <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener">The OpenStreetMap Foundation\'s privacy policy</a>.',
    'privacy.external.wiki':
      "<strong>Wikidata, Wikipedia and Wikimedia Commons</strong> - each monument's text and photos are fetched live from their own APIs, every time you open its page. <a href=\"https://foundation.wikimedia.org/wiki/Policy:Privacy_policy\" target=\"_blank\" rel=\"noopener\">Wikimedia Foundation privacy policy</a>.",
    'privacy.external.geolocation':
      "<strong>Your location</strong> - only if you tap the 🎯 button, via your own browser's geolocation; never sent to Patrimonio Abierto or stored anywhere.",
    'privacy.retention.title': 'How long data is kept',
    'privacy.retention.body':
      "Patrimonio Abierto has no database of its own, and never holds your full IP address at any point. The access log described above - already truncated - is kept for a maximum of <strong>90 days</strong> and then deleted automatically; the aggregate figures drawn from it contain no addresses of any kind. It is never used for marketing, advertising or tracking, and never shared with third parties.",
    'privacy.rights.title': 'Your rights',
    'privacy.rights.body':
      'If any personal data of yours were ever processed in a more meaningful way, the GDPR gives you a set of rights: to access your data, correct it, request its deletion, restrict or object to its use, and take a copy with you (portability). You can exercise these by writing to the person responsible listed on the Imprint page. If you\'re not satisfied with the response, you also have the right to lodge a complaint with the <a href="https://www.aepd.es/" target="_blank" rel="noopener">Spanish Data Protection Agency (AEPD)</a>, the supervisory authority in Spain.',
    'privacy.changes.title': 'If this ever changes',
    'privacy.changes.body':
      'This page is updated before any change to how data is handled, not after: that is how the aggregate statistics described above were introduced, and how any new kind of processing will be.',
    'imprint.title': 'Imprint',
    'imprint.body':
      `Patrimonio Abierto is a personal, independent, not-for-profit project - no advertising, no sponsorship, no revenue of any kind. Responsible for this site: <strong>Thomas Holbach</strong>. Contact (as an image, to make automated spam harvesting harder): ${CONTACT_EMAIL_IMG}.`,
  },
};

let currentLang = 'es';

function t(key, ...args) {
  const entry = STRINGS[currentLang][key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

// One of several wordings for the same prompt, so that working through a
// list of monuments doesn't mean reading the identical sentence twenty
// times over. Which one is genuinely unimportant, so: random, and no
// bookkeeping to keep it stable per monument.
function variant(options) {
  return options[Math.floor(Math.random() * options.length)];
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
  // Same idea as data-i18n-title, but into data-tooltip instead of the real
  // title attribute - style.css's [data-i18n-tooltip]::after renders it as a
  // custom, styled, instant-appearing tooltip (desktop only) for the
  // floating map buttons, instead of the browser's own small, slow-to-appear
  // native one. Kept as a separate attribute/mechanism rather than reusing
  // title (which those buttons deliberately don't set at all) so the two
  // can never both fire on the same element and show duplicate tooltips.
  document.querySelectorAll('[data-i18n-tooltip]').forEach((el) => {
    el.dataset.tooltip = t(el.dataset.i18nTooltip);
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
