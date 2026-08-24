// CyLinked map prototype.
//
// Architecture: the marker data (data/cyl_monuments_wikidata.json) is a
// static "spine" file built offline by scripts/build_dataset.py from the
// JCyL WFS + Wikidata SPARQL - see README. It's loaded once, in full, on
// page load. Wikipedia/Commons content is fetched live, per monument, only
// when its marker is actually clicked - those APIs are meant for that kind
// of per-item lookup, not for bulk-loading thousands of records at once.

const map = L.map('map').setView([41.65, -4.7], 8); // roughly centered on Castilla y León

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

const popupContentFor = (record) => {
  const div = document.createElement('div');
  div.className = 'popup-content';
  div.innerHTML = `
    <h3>${record.name}</h3>
    <div class="meta">${record.category} · ${record.municipality} (${record.province})</div>
    <div class="body">Cargando…</div>
  `;
  return div;
};

// Wikidata's Special:EntityData gives us sitelinks (for Wikipedia) and
// claims (for the P18 image) in one request, no separate API dance needed.
async function loadWikidataEnrichment(qid) {
  const resp = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const data = await resp.json();
  const entity = data.entities[qid];

  const sitelink = entity.sitelinks?.eswiki || entity.sitelinks?.enwiki;
  const p18 = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;

  let summary = null;
  if (sitelink) {
    const lang = entity.sitelinks.eswiki ? 'es' : 'en';
    const summaryResp = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sitelink.title)}`
    );
    if (summaryResp.ok) summary = await summaryResp.json();
  }

  // Special:FilePath redirects straight to a thumbnail - no need for a
  // separate Commons API round trip just to display an image.
  const imageUrl = p18
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}?width=400`
    : null;

  return { summary, imageUrl };
}

function renderEnrichment(container, record, enrichment) {
  const qid = Array.isArray(record.wikidata_qid) ? record.wikidata_qid[0] : record.wikidata_qid;
  let html = `<a href="https://www.wikidata.org/wiki/${qid}" target="_blank" rel="noopener">Wikidata: ${qid}</a>`;
  if (record.wikidata_conflict) {
    html += `<div class="missing-note">⚠ jcyl_id reclamado por varios items: ${record.wikidata_qid.join(', ')}</div>`;
  }
  if (enrichment.imageUrl) {
    html += `<img src="${enrichment.imageUrl}" alt="${record.name}">`;
  }
  if (enrichment.summary?.extract) {
    html += `<div class="extract">${enrichment.summary.extract}</div>`;
  }
  html += `<div class="meta"><a href="${record.reference_url}" target="_blank" rel="noopener">Ficha JCyL (id ${record.jcyl_id})</a></div>`;
  container.querySelector('.body').innerHTML = html;
}

function renderMissing(container, record) {
  container.querySelector('.body').innerHTML = `
    <div class="missing-note">Sin enlazar a Wikidata todavía.</div>
    <div class="meta"><a href="${record.reference_url}" target="_blank" rel="noopener">Ficha JCyL (id ${record.jcyl_id})</a></div>
  `;
}

fetch('data/cyl_monuments_wikidata.json')
  .then((r) => r.json())
  .then((records) => {
    const linked = records.filter((r) => r.already_linked).length;
    document.getElementById('stats').textContent =
      `${linked} / ${records.length} enlazados (${Math.round((linked / records.length) * 100)}%)`;

    for (const record of records) {
      const marker = L.circleMarker([record.lat, record.lon], {
        radius: 5,
        color: record.already_linked ? '#2a9d5c' : '#d9534f',
        fillColor: record.already_linked ? '#2a9d5c' : '#d9534f',
        fillOpacity: 0.8,
        weight: 1,
      }).addTo(map);

      marker.bindPopup(() => popupContentFor(record));

      marker.on('popupopen', async (e) => {
        const container = e.popup.getElement().querySelector('.popup-content');
        if (record.already_linked) {
          const qid = Array.isArray(record.wikidata_qid) ? record.wikidata_qid[0] : record.wikidata_qid;
          try {
            const enrichment = await loadWikidataEnrichment(qid);
            renderEnrichment(container, record, enrichment);
          } catch (err) {
            container.querySelector('.body').innerHTML = `<div class="missing-note">Error cargando datos de Wikidata.</div>`;
          }
        } else {
          renderMissing(container, record);
        }
      });
    }
  })
  .catch((err) => {
    document.getElementById('stats').textContent = 'Error cargando datos.';
    console.error(err);
  });
