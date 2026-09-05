const DATA_URL = 'data/events.json';
const ZURICH = [47.3769, 8.5417];
const MOBILE_QUERY = '(max-width: 760px)';
const $ = selector => document.querySelector(selector);

const els = {
  search: $('#search'),
  from: $('#fromTime'),
  to: $('#toTime'),
  category: $('#category'),
  onlyMapped: $('#onlyMapped'),
  reset: $('#resetFilters'),
  summary: $('#summary'),
  list: $('#eventList'),
  mobileCount: $('#mobileCount'),
  mapError: $('#mapError'),
  viewButtons: [...document.querySelectorAll('[data-view-target]')]
};

const DEFAULT_FROM = 18 * 60;
const DEFAULT_TO = 26 * 60;
const hours = [18, 19, 20, 21, 22, 23, 24, 25, 26];
const labelHour = hour => `${String(hour % 24).padStart(2, '0')}:00`;

for (const hour of hours) {
  els.from.add(new Option(labelHour(hour), String(hour * 60)));
  els.to.add(new Option(labelHour(hour), String(hour * 60)));
}
els.from.value = String(DEFAULT_FROM);
els.to.value = String(DEFAULT_TO);

let data = { events: [], venues: [] };
let map;
let tileLayer;
let markers = new Map();
let hasFittedMap = false;

const mobileMedia = matchMedia(MOBILE_QUERY);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const groupByVenue = events => Map.groupBy
  ? Map.groupBy(events, event => event.venue)
  : events.reduce((groups, event) => {
      groups.set(event.venue, [...(groups.get(event.venue) || []), event]);
      return groups;
    }, new Map());

function setupMap() {
  if (!window.L) {
    els.mapError.hidden = false;
    els.mapError.textContent = 'La mappa non è disponibile. Controlla la connessione e ricarica la pagina.';
    return;
  }
  map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(ZURICH, 13);
  setBaseLayer();
}

function setBaseLayer() {
  if (!map) return;
  if (tileLayer) tileLayer.remove();
  tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function eventOverlapsWindow(event, from, to) {
  const start = event.startMinute ?? 9999;
  const end = event.endMinute ?? start;
  return start <= to && end >= from;
}

function getFiltered() {
  const query = els.search.value.trim().toLocaleLowerCase('de-CH');
  const from = Number(els.from.value);
  const to = Number(els.to.value);
  const category = els.category.value;
  const mapped = new Set(data.venues
    .filter(venue => Number.isFinite(venue.lat) && Number.isFinite(venue.lng))
    .map(venue => venue.name));

  return data.events.filter(event =>
    eventOverlapsWindow(event, from, to) &&
    (!category || event.category === category) &&
    (!query || `${event.title} ${event.venue} ${event.category || ''}`.toLocaleLowerCase('de-CH').includes(query)) &&
    (!els.onlyMapped.checked || mapped.has(event.venue))
  );
}

function compactTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':');
  return minute === '00' ? hour : `${hour}:${minute}`;
}

function eventTimeHtml(event) {
  const start = compactTime(event.start);
  const end = compactTime(event.end);
  return `<div class="event-time"><span>${escapeHtml(start)}</span>${end ? `<small>– ${escapeHtml(end)}</small>` : ''}</div>`;
}

function popupHtml(venue, events) {
  const shown = events.slice(0, 10);
  return `<div class="popup">
    <h3>${escapeHtml(venue)}</h3>
    ${shown.map(event => `<div class="pevent">
      <time>${escapeHtml(event.time)}</time>
      <div>${escapeHtml(event.title)}</div>
      ${event.category ? `<small>${escapeHtml(event.category)}</small>` : ''}
      <div><a href="${escapeHtml(event.url)}" target="_blank" rel="noreferrer">Dettagli ↗</a></div>
    </div>`).join('')}
    ${events.length > shown.length ? `<div class="pevent">+ ${events.length - shown.length} altri eventi</div>` : ''}
  </div>`;
}

function hasActiveFilters() {
  return Boolean(
    els.search.value.trim() ||
    Number(els.from.value) !== DEFAULT_FROM ||
    Number(els.to.value) !== DEFAULT_TO ||
    els.category.value ||
    els.onlyMapped.checked
  );
}

function render() {
  const filtered = getFiltered();
  const venues = new Map(data.venues.map(venue => [venue.name, venue]));
  const groups = groupByVenue(filtered);
  const mappedGroups = [...groups.keys()].filter(name => {
    const venue = venues.get(name);
    return venue && Number.isFinite(venue.lat) && Number.isFinite(venue.lng);
  }).length;

  els.summary.textContent = `${filtered.length} eventi · ${groups.size} luoghi`;
  els.mobileCount.textContent = filtered.length ? `· ${filtered.length}` : '';
  els.reset.disabled = !hasActiveFilters();

  for (const marker of markers.values()) marker.remove();
  markers.clear();

  const bounds = [];
  for (const [venueName, events] of groups) {
    const venue = venues.get(venueName);
    if (!venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng) || !map) continue;

    const icon = L.divIcon({
      className: '',
      html: `<div class="marker-badge" aria-label="${events.length} eventi">${events.length}</div>`,
      iconSize: [40, 34],
      iconAnchor: [20, 17],
      popupAnchor: [0, -19]
    });
    const marker = L.marker([venue.lat, venue.lng], { icon })
      .addTo(map)
      .bindPopup(popupHtml(venueName, events), { maxHeight: 440 });
    markers.set(venueName, marker);
    bounds.push([venue.lat, venue.lng]);
  }

  if (!hasFittedMap && map && bounds.length) {
    map.fitBounds(bounds, { padding: [34, 34], maxZoom: 14 });
    hasFittedMap = true;
  }

  if (!filtered.length) {
    els.list.innerHTML = `<div class="empty-state">
      <strong>Nessun evento trovato</strong>
      Prova ad allargare l’orario o a rimuovere qualche filtro.
      <br><button type="button" data-reset-empty>Reset filtri</button>
    </div>`;
    els.list.querySelector('[data-reset-empty]')?.addEventListener('click', resetFilters);
    return;
  }

  els.list.innerHTML = filtered.map(event => `<button class="event" type="button" data-venue="${escapeHtml(event.venue)}">
    ${eventTimeHtml(event)}
    <span class="event-body">
      <span class="event-title">${escapeHtml(event.title)}</span>
      <span class="event-meta">
        <span>${escapeHtml(event.venue)}</span>
        ${event.category ? `<span class="event-category">${escapeHtml(event.category)}</span>` : ''}
      </span>
    </span>
  </button>`).join('');

  els.list.querySelectorAll('.event').forEach(row => {
    row.addEventListener('click', () => focusVenue(row.dataset.venue));
  });

  if (!mappedGroups && els.onlyMapped.checked) {
    els.mapError.hidden = false;
    els.mapError.textContent = 'Nessuno dei risultati filtrati ha coordinate disponibili.';
  } else if (window.L) {
    els.mapError.hidden = true;
  }
}

function focusVenue(venueName) {
  const marker = markers.get(venueName);
  if (!marker || !map) return;
  if (mobileMedia.matches) setMobileView('map');
  requestAnimationFrame(() => {
    map.invalidateSize();
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
    marker.openPopup();
  });
}

function setMobileView(view) {
  document.body.dataset.view = view;
  for (const button of els.viewButtons) {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  if (view === 'map' && map) requestAnimationFrame(() => map.invalidateSize());
}

function resetFilters() {
  els.search.value = '';
  els.from.value = String(DEFAULT_FROM);
  els.to.value = String(DEFAULT_TO);
  els.category.value = '';
  els.onlyMapped.checked = false;
  render();
}

function keepTimeRangeValid(changed) {
  const from = Number(els.from.value);
  const to = Number(els.to.value);
  if (from <= to) return;
  if (changed === els.from) els.to.value = String(from);
  else els.from.value = String(to);
}

els.search.addEventListener('input', render);
els.from.addEventListener('change', () => { keepTimeRangeValid(els.from); render(); });
els.to.addEventListener('change', () => { keepTimeRangeValid(els.to); render(); });
els.category.addEventListener('change', render);
els.onlyMapped.addEventListener('change', render);
els.reset.addEventListener('click', resetFilters);
for (const button of els.viewButtons) button.addEventListener('click', () => setMobileView(button.dataset.viewTarget));

mobileMedia.addEventListener?.('change', event => {
  if (!event.matches) document.body.dataset.view = 'map';
  map?.invalidateSize();
});

async function main() {
  setupMap();
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();

    const categories = [...new Set(data.events.map(event => event.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de-CH'));
    for (const category of categories) els.category.add(new Option(category, category));

    if (!data.events.length) {
      els.summary.textContent = 'Dataset non disponibile';
      els.list.innerHTML = '<div class="empty-state"><strong>Nessun dato</strong>Il programma non è ancora stato importato.</div>';
      return;
    }
    render();
  } catch (error) {
    els.summary.textContent = 'Impossibile caricare gli eventi';
    els.list.innerHTML = `<div class="empty-state"><strong>Errore dati</strong>${escapeHtml(error.message)}<br><button type="button" data-reload>Ricarica</button></div>`;
    els.list.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
  }
}

main();
