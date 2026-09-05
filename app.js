const DATA_URL = 'data/events.json';
const ZURICH = [47.3769, 8.5417];
const MOBILE_QUERY = '(max-width: 760px)';
const NIGHT_START = 18 * 60;
const NIGHT_END = 26 * 60;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const els = {
  search: $('#search'),
  category: $('#category'),
  onlyMapped: $('#onlyMapped'),
  reset: $('#resetFilters'),
  summary: $('#summary'),
  browseList: $('#browseList'),
  timeStrip: $('#timeStrip'),
  mobileCount: $('#mobileCount'),
  mapError: $('#mapError'),
  browseTabs: $$('[data-browse-mode]'),
  mobileTabs: $$('[data-mobile-target]')
};

let data = { events: [], venues: [] };
let map;
let tileLayer;
let markers = new Map();
let hasFittedMap = false;
let browseMode = 'venues';
let selectedVenue = null;
let activeTime = { from: NIGHT_START, to: NIGHT_END, key: 'all' };
const mobileMedia = matchMedia(MOBILE_QUERY);

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const groupBy = (items, keyFn) => items.reduce((groups, item) => {
  const key = keyFn(item);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(item);
  return groups;
}, new Map());

function shortTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':');
  return minute === '00' ? hour : `${hour}:${minute}`;
}

function setupTimeStrip() {
  const buttons = [
    { key: 'all', label: 'Tutta', from: NIGHT_START, to: NIGHT_END },
    ...Array.from({ length: 8 }, (_, index) => {
      const hour = 18 + index;
      return { key: String(hour), label: String(hour % 24).padStart(2, '0'), from: hour * 60, to: hour * 60 + 59 };
    })
  ];
  els.timeStrip.innerHTML = buttons.map(button => `<button type="button" class="time-chip${button.key === 'all' ? ' is-active' : ''}" data-time-key="${button.key}" data-from="${button.from}" data-to="${button.to}" aria-pressed="${button.key === 'all'}">${button.label}</button>`).join('');
  els.timeStrip.addEventListener('click', event => {
    const button = event.target.closest('[data-time-key]');
    if (!button) return;
    activeTime = { from: Number(button.dataset.from), to: Number(button.dataset.to), key: button.dataset.timeKey };
    selectedVenue = null;
    updateTimeButtons();
    render();
  });
}

function updateTimeButtons() {
  els.timeStrip.querySelectorAll('[data-time-key]').forEach(button => {
    const active = button.dataset.timeKey === activeTime.key;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setupMap() {
  if (!window.L) {
    els.mapError.hidden = false;
    els.mapError.textContent = 'La mappa non è disponibile. Controlla la connessione e ricarica la pagina.';
    return;
  }
  map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(ZURICH, 13);
  tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function mappedVenueNames() {
  return new Set(data.venues
    .filter(venue => Number.isFinite(venue.lat) && Number.isFinite(venue.lng))
    .map(venue => venue.name));
}

function eventOverlapsWindow(event) {
  const start = event.startMinute ?? 9999;
  const end = event.endMinute ?? start;
  return start <= activeTime.to && end >= activeTime.from;
}

function filteredEvents() {
  const query = els.search.value.trim().toLocaleLowerCase('de-CH');
  const category = els.category.value;
  const mapped = mappedVenueNames();
  return data.events.filter(event =>
    eventOverlapsWindow(event) &&
    (!category || event.category === category) &&
    (!query || `${event.title} ${event.venue} ${event.category || ''}`.toLocaleLowerCase('de-CH').includes(query)) &&
    (!els.onlyMapped.checked || mapped.has(event.venue))
  );
}

function hasActiveFilters() {
  return Boolean(
    els.search.value.trim() ||
    els.category.value ||
    els.onlyMapped.checked ||
    activeTime.key !== 'all'
  );
}

function uniqueTimes(events, limit = 4) {
  const seen = [];
  for (const event of events) {
    const value = shortTime(event.start);
    if (value && !seen.includes(value)) seen.push(value);
    if (seen.length === limit) break;
  }
  return seen;
}

function categorySummary(events, limit = 2) {
  const counts = new Map();
  for (const event of events) if (event.category) counts.set(event.category, (counts.get(event.category) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
}

function venueRowHtml(name, events) {
  const sorted = [...events].sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999));
  const times = uniqueTimes(sorted);
  const cats = categorySummary(sorted);
  return `<button class="venue-row" type="button" data-venue="${escapeHtml(name)}">
    <span class="venue-copy">
      <span class="venue-title">${escapeHtml(name)}</span>
      <span class="venue-sub">${events.length} ${events.length === 1 ? 'evento' : 'eventi'}${cats.length ? ` · ${cats.map(escapeHtml).join(' · ')}` : ''}</span>
    </span>
    <span class="venue-times">${times.map(time => `<span>${escapeHtml(time)}</span>`).join('')}${events.length > times.length ? '<span>…</span>' : ''}</span>
    <span class="chevron" aria-hidden="true">›</span>
  </button>`;
}

function renderVenueBrowser(events) {
  const groups = groupBy(events, event => event.venue);
  const ordered = [...groups.entries()].sort((a, b) => {
    const aStart = Math.min(...a[1].map(event => event.startMinute ?? 9999));
    const bStart = Math.min(...b[1].map(event => event.startMinute ?? 9999));
    return aStart - bStart || a[0].localeCompare(b[0], 'de-CH');
  });

  if (!ordered.length) return emptyStateHtml();
  return `<div class="section-intro"><strong>${ordered.length} luoghi</strong><span>Scegli un museo per vedere la sua agenda.</span></div>${ordered.map(([name, venueEvents]) => venueRowHtml(name, venueEvents)).join('')}`;
}

function renderTimeBrowser(events) {
  const hourGroups = groupBy(events, event => Math.floor((event.startMinute ?? NIGHT_END) / 60));
  const orderedHours = [...hourGroups.keys()].sort((a, b) => a - b);
  if (!orderedHours.length) return emptyStateHtml();

  return orderedHours.map((hour, index) => {
    const hourEvents = hourGroups.get(hour);
    const venues = groupBy(hourEvents, event => event.venue);
    const rows = [...venues.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'de-CH'))
      .map(([name, venueEvents]) => venueRowHtml(name, venueEvents)).join('');
    return `<details class="time-group" ${index === 0 ? 'open' : ''}>
      <summary>
        <span class="hour-label">${String(hour % 24).padStart(2, '0')}:00</span>
        <span>${hourEvents.length} eventi · ${venues.size} luoghi</span>
        <span class="details-chevron" aria-hidden="true">›</span>
      </summary>
      <div class="time-group-body">${rows}</div>
    </details>`;
  }).join('');
}

function eventRowHtml(event) {
  return `<article class="event-row">
    <time>${escapeHtml(shortTime(event.start))}${event.end ? `<small>– ${escapeHtml(shortTime(event.end))}</small>` : ''}</time>
    <div class="event-copy">
      <strong>${escapeHtml(event.title)}</strong>
      <div>${event.category ? `<span>${escapeHtml(event.category)}</span>` : ''}<a href="${escapeHtml(event.url)}" target="_blank" rel="noreferrer">Dettagli ↗</a></div>
    </div>
  </article>`;
}

function renderVenueDetail(events) {
  const venueEvents = events.filter(event => event.venue === selectedVenue)
    .sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999));
  if (!venueEvents.length) {
    selectedVenue = null;
    return renderVenueBrowser(events);
  }

  const venue = data.venues.find(item => item.name === selectedVenue);
  const canMap = venue && Number.isFinite(venue.lat) && Number.isFinite(venue.lng);
  return `<div class="detail-head">
    <button class="back-button" type="button" data-back>‹ <span>Tutti i luoghi</span></button>
    <div class="detail-title-row">
      <div><h2>${escapeHtml(selectedVenue)}</h2><p>${venueEvents.length} ${venueEvents.length === 1 ? 'evento' : 'eventi'} nella selezione corrente</p></div>
      ${canMap ? '<button class="map-button" type="button" data-show-map>Mostra sulla mappa</button>' : ''}
    </div>
  </div>
  <div class="venue-agenda">${venueEvents.map(eventRowHtml).join('')}</div>`;
}

function emptyStateHtml() {
  return `<div class="empty-state"><strong>Nessun risultato</strong><span>Prova a cambiare orario, tipo o ricerca.</span><button type="button" data-reset-empty>Reset filtri</button></div>`;
}

function renderBrowse(events) {
  if (selectedVenue) els.browseList.innerHTML = renderVenueDetail(events);
  else els.browseList.innerHTML = browseMode === 'venues' ? renderVenueBrowser(events) : renderTimeBrowser(events);

  els.browseList.querySelectorAll('[data-venue]').forEach(button => button.addEventListener('click', () => {
    selectedVenue = button.dataset.venue;
    render();
    focusVenue(selectedVenue, false);
  }));
  els.browseList.querySelector('[data-back]')?.addEventListener('click', () => {
    selectedVenue = null;
    render();
  });
  els.browseList.querySelector('[data-show-map]')?.addEventListener('click', () => focusVenue(selectedVenue, true));
  els.browseList.querySelector('[data-reset-empty]')?.addEventListener('click', resetFilters);
}

function popupHtml(venue, events) {
  const shown = [...events].sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999)).slice(0, 5);
  return `<div class="popup"><h3>${escapeHtml(venue)}</h3>${shown.map(event => `<div class="pevent"><time>${escapeHtml(event.time)}</time><div>${escapeHtml(event.title)}</div></div>`).join('')}${events.length > shown.length ? `<div class="popup-more">+ ${events.length - shown.length} altri</div>` : ''}</div>`;
}

function renderMap(events) {
  const venueMap = new Map(data.venues.map(venue => [venue.name, venue]));
  const groups = groupBy(events, event => event.venue);

  for (const marker of markers.values()) marker.remove();
  markers.clear();
  const bounds = [];

  for (const [name, venueEvents] of groups) {
    const venue = venueMap.get(name);
    if (!map || !venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) continue;
    const icon = L.divIcon({
      className: '',
      html: `<div class="marker-badge">${venueEvents.length}</div>`,
      iconSize: [42, 36], iconAnchor: [21, 18], popupAnchor: [0, -20]
    });
    const marker = L.marker([venue.lat, venue.lng], { icon })
      .addTo(map)
      .bindPopup(popupHtml(name, venueEvents), { maxHeight: 360 });
    marker.on('click', () => {
      if (!mobileMedia.matches) {
        selectedVenue = name;
        renderBrowse(events);
      }
    });
    markers.set(name, marker);
    bounds.push([venue.lat, venue.lng]);
  }

  if (!hasFittedMap && map && bounds.length) {
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    hasFittedMap = true;
  }
}

function render() {
  const events = filteredEvents();
  const groups = groupBy(events, event => event.venue);
  els.summary.textContent = `${events.length} eventi · ${groups.size} luoghi`;
  els.mobileCount.textContent = events.length ? `· ${events.length}` : '';
  els.reset.disabled = !hasActiveFilters();
  renderBrowse(events);
  renderMap(events);
}

function focusVenue(name, switchMobile = true) {
  const marker = markers.get(name);
  if (!marker || !map) return;
  if (mobileMedia.matches && switchMobile) setMobileView('map');
  requestAnimationFrame(() => {
    map.invalidateSize();
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
    marker.openPopup();
  });
}

function setBrowseMode(mode) {
  browseMode = mode;
  selectedVenue = null;
  els.browseTabs.forEach(button => {
    const active = button.dataset.browseMode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  render();
}

function setMobileView(view) {
  document.body.dataset.mobileView = view;
  els.mobileTabs.forEach(button => {
    const active = button.dataset.mobileTarget === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (view === 'map') requestAnimationFrame(() => map?.invalidateSize());
}

function resetFilters() {
  els.search.value = '';
  els.category.value = '';
  els.onlyMapped.checked = false;
  activeTime = { from: NIGHT_START, to: NIGHT_END, key: 'all' };
  selectedVenue = null;
  updateTimeButtons();
  render();
}

els.search.addEventListener('input', () => { selectedVenue = null; render(); });
els.category.addEventListener('change', () => { selectedVenue = null; render(); });
els.onlyMapped.addEventListener('change', () => { selectedVenue = null; render(); });
els.reset.addEventListener('click', resetFilters);
els.browseTabs.forEach(button => button.addEventListener('click', () => setBrowseMode(button.dataset.browseMode)));
els.mobileTabs.forEach(button => button.addEventListener('click', () => setMobileView(button.dataset.mobileTarget)));
mobileMedia.addEventListener?.('change', () => map?.invalidateSize());

async function main() {
  setupTimeStrip();
  setupMap();
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    const categories = [...new Set(data.events.map(event => event.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de-CH'));
    categories.forEach(category => els.category.add(new Option(category, category)));
    render();
  } catch (error) {
    els.summary.textContent = 'Errore dati';
    els.browseList.innerHTML = `<div class="empty-state"><strong>Impossibile caricare gli eventi</strong><span>${escapeHtml(error.message)}</span><button type="button" data-reload>Ricarica</button></div>`;
    els.browseList.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
  }
}

main();
