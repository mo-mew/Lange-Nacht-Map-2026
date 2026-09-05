const DATA_URL = 'data/events.json';
const ZURICH = [47.3769, 8.5417];
const $ = s => document.querySelector(s);
const els = {
  search: $('#search'), from: $('#fromTime'), to: $('#toTime'), category: $('#category'),
  onlyMapped: $('#onlyMapped'), summary: $('#summary'), list: $('#eventList'), meta: $('#meta'), error: $('#mapError')
};

const hours = [18,19,20,21,22,23,24,25,26];
const labelHour = h => `${String(h % 24).padStart(2,'0')}:00`;
for (const h of hours) {
  els.from.add(new Option(labelHour(h), String(h * 60)));
  els.to.add(new Option(labelHour(h), String(h * 60)));
}
els.from.value = String(18 * 60);
els.to.value = String(26 * 60);

let data = {events:[],venues:[]};
let markers = new Map();
let map;

function setupMap() {
  if (!window.L) {
    els.error.hidden = false;
    els.error.textContent = 'Leaflet non è stato caricato. Controlla la connessione e ricarica la pagina.';
    return;
  }
  map = L.map('map', { zoomControl:true }).setView(ZURICH, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19,
    attribution:'© OpenStreetMap contributors'
  }).addTo(map);
}

const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const byVenue = events => Map.groupBy ? Map.groupBy(events, e => e.venue) : events.reduce((m,e)=>(m.set(e.venue,[...(m.get(e.venue)||[]),e]),m),new Map());

function getFiltered() {
  const q = els.search.value.trim().toLocaleLowerCase('de-CH');
  const from = Number(els.from.value), to = Number(els.to.value);
  const cat = els.category.value;
  const mappedSet = new Set(data.venues.filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lng)).map(v => v.name));
  return data.events.filter(e => {
    const start = e.startMinute ?? 9999;
    const end = e.endMinute ?? start;
    const overlapsWindow = start <= to && end >= from;
    return overlapsWindow && (!cat || e.category === cat) &&
      (!q || `${e.title} ${e.venue} ${e.category || ''}`.toLocaleLowerCase('de-CH').includes(q)) &&
      (!els.onlyMapped.checked || mappedSet.has(e.venue));
  });
}

function popupHtml(venue, events) {
  const shown = events.slice(0,12);
  return `<div class="popup"><h3>${esc(venue)}</h3>${shown.map(e => `<div class="pevent"><time>${esc(e.time)}</time><div>${esc(e.title)}</div>${e.category ? `<small>${esc(e.category)}</small>`:''}<div><a href="${esc(e.url)}" target="_blank" rel="noreferrer">Dettagli ↗</a></div></div>`).join('')}${events.length>shown.length?`<div class="pevent">+ ${events.length-shown.length} altri eventi</div>`:''}</div>`;
}

function render() {
  const filtered = getFiltered();
  const venues = new Map(data.venues.map(v => [v.name,v]));
  const groups = byVenue(filtered);
  els.summary.textContent = `${filtered.length} eventi · ${groups.size} luoghi`;

  for (const marker of markers.values()) marker.remove();
  markers.clear();
  const bounds = [];
  for (const [venueName, events] of groups) {
    const v = venues.get(venueName);
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lng) || !map) continue;
    const icon = L.divIcon({
      className:'',
      html:`<div class="marker-badge">${events.length}</div>`,
      iconSize:[30,30], iconAnchor:[15,15], popupAnchor:[0,-15]
    });
    const marker = L.marker([v.lat,v.lng], {icon}).addTo(map).bindPopup(popupHtml(venueName, events), {maxHeight:430});
    markers.set(venueName, marker); bounds.push([v.lat,v.lng]);
  }
  if (map && bounds.length) map.fitBounds(bounds, {padding:[28,28], maxZoom:15});

  const list = filtered;
  els.list.innerHTML = list.length ? list.map(e => `<article class="event" data-venue="${esc(e.venue)}" tabindex="0"><strong>${esc(e.title)}</strong><div class="venue">${esc(e.venue)}</div><div class="bottom"><time>${esc(e.time)}</time>${e.category?`<span class="tag">${esc(e.category)}</span>`:''}</div></article>`).join('') : '<div class="empty">Nessun evento con questi filtri.</div>';

  els.list.querySelectorAll('.event').forEach(card => {
    const open = () => {
      const marker = markers.get(card.dataset.venue);
      if (marker && map) { map.setView(marker.getLatLng(), Math.max(map.getZoom(),15), {animate:true}); marker.openPopup(); }
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

for (const el of [els.search,els.from,els.to,els.category,els.onlyMapped]) el.addEventListener(el === els.search ? 'input' : 'change', render);

async function main() {
  setupMap();
  try {
    const r = await fetch(DATA_URL, {cache:'no-store'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json();
    if (data.generatedAt) els.meta.textContent = `5 settembre 2026 · 18:00–02:00 · dati aggiornati ${new Date(data.generatedAt).toLocaleString('it-CH')}`;
    const cats = [...new Set(data.events.map(e => e.category).filter(Boolean))].sort();
    for (const c of cats) els.category.add(new Option(c,c));
    if (!data.events.length) {
      els.summary.textContent = 'Dataset non ancora generato';
      els.list.innerHTML = '<div class="empty">Esegui <code>npm run scrape</code> per importare il programma ufficiale.</div>';
      return;
    }
    render();
  } catch (err) {
    els.summary.textContent = 'Errore dati';
    els.list.innerHTML = `<div class="empty">Impossibile caricare il dataset: ${esc(err.message)}</div>`;
  }
}
main();