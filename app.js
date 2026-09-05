const DATA_URL = 'data/events.json';
const EVENT_DATE = '2026-09-05';
const ZURICH = [47.3769, 8.5417];
const NIGHT_START = 18 * 60;
const NIGHT_END = 26 * 60;
const MOBILE_QUERY = '(max-width: 760px)';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const els = {
  search: $('#search'),
  timeRail: $('#timeRail'),
  filterBadge: $('#filterBadge'),
  summary: $('#summary'),
  scopeLabel: $('#scopeLabel'),
  browserContent: $('#browserContent'),
  mapError: $('#mapError'),
  mapCard: $('#mapCard'),
  filterDialog: $('#filterDialog'),
  filterForm: $('#filterForm'),
  categoryOptions: $('#categoryOptions'),
  mappedFilter: $('#mappedFilter'),
  clearFilters: $('#clearFilters'),
  detailView: $('#detailView'),
  detailBack: $('#detailBack'),
  detailMap: $('#detailMap'),
  detailContent: $('#detailContent'),
  tabButtons: $$('[data-tab-target]'),
  desktopTabs: $$('[data-desktop-tab]'),
  openFilterButtons: $$('[data-open-filters]'),
  closeFilterButtons: $$('[data-close-filters]')
};

const state = {
  tab: 'tonight',
  time: { key: 'all', from: NIGHT_START, to: NIGHT_END, label: 'Tutta la notte' },
  category: '',
  onlyMapped: false,
  expandedHours: new Set(),
  venue: null,
  mapVenue: null
};

let data = { events: [], venues: [] };
let map;
let markerLayer;
let markerByVenue = new Map();
let mapHasFitted = false;
let detailWasPushed = false;

const mobileMedia = matchMedia(MOBILE_QUERY);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function eventTitle(event) {
  return event.titleIt || event.title || '';
}

function eventDescription(event) {
  return event.descriptionIt || event.description || '';
}

function categoryLabel(category) {
  if (!category) return '';
  const match = data.events.find(event => event.category === category && event.categoryIt);
  return match?.categoryIt || category;
}

function eventCategory(event) {
  return event.categoryIt || categoryLabel(event.category);
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function shortTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':');
  return minute === '00' ? hour : `${hour}:${minute}`;
}

function hourLabel(hour) {
  return `${String(hour % 24).padStart(2, '0')}:00`;
}

function formatNightRange(time) {
  if (time.key === 'all') return 'Tutta la notte';
  if (time.key === 'now') {
    return `Adesso · ${minuteLabel(time.from)}–${minuteLabel(time.to)}`;
  }
  return `${minuteLabel(time.from)}–${minuteLabel(time.to)}`;
}

function minuteLabel(total) {
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function zurichNightMinute() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date())
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  if (date === EVENT_DATE && hour >= 18) return hour * 60 + minute;
  if (date === '2026-09-06' && hour < 2) return (hour + 24) * 60 + minute;
  return null;
}

function setupTimeRail() {
  const now = zurichNightMinute();
  const options = [{ key: 'all', label: 'Tutta', from: NIGHT_START, to: NIGHT_END, scope: 'Tutta la notte' }];

  if (now !== null && now >= NIGHT_START && now < NIGHT_END) {
    options.push({
      key: 'now',
      label: 'Ora',
      from: now,
      to: Math.min(now + 60, NIGHT_END),
      scope: `Adesso · ${minuteLabel(now)}–${minuteLabel(Math.min(now + 60, NIGHT_END))}`
    });
  }

  for (let hour = 18; hour <= 25; hour += 1) {
    options.push({
      key: String(hour),
      label: String(hour % 24).padStart(2, '0'),
      from: hour * 60,
      to: hour * 60 + 59,
      scope: `${hourLabel(hour)}–${minuteLabel(hour * 60 + 59)}`
    });
  }

  els.timeRail.innerHTML = options.map(option => `
    <button
      type="button"
      class="time-chip${option.key === state.time.key ? ' is-active' : ''}"
      data-time-key="${option.key}"
      data-from="${option.from}"
      data-to="${option.to}"
      data-scope="${escapeHtml(option.scope)}"
      aria-pressed="${option.key === state.time.key}"
    >${escapeHtml(option.label)}</button>
  `).join('');

  els.timeRail.addEventListener('click', event => {
    const button = event.target.closest('[data-time-key]');
    if (!button) return;
    state.time = {
      key: button.dataset.timeKey,
      from: Number(button.dataset.from),
      to: Number(button.dataset.to),
      label: button.dataset.scope
    };
    state.expandedHours.clear();
    updateTimeRail();
    render();
  });
}

function updateTimeRail() {
  els.timeRail.querySelectorAll('[data-time-key]').forEach(button => {
    const active = button.dataset.timeKey === state.time.key;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const active = els.timeRail.querySelector(`[data-time-key="${CSS.escape(state.time.key)}"]`);
  active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

function setupMap() {
  if (!window.L) {
    els.mapError.hidden = false;
    els.mapError.textContent = 'La mappa non è disponibile. Ricarica la pagina quando hai connessione.';
    return;
  }

  map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
    attributionControl: true
  }).setView(ZURICH, 13);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  if (typeof L.markerClusterGroup === 'function') {
    markerLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 46,
      disableClusteringAtZoom: 16,
      iconCreateFunction(cluster) {
        return L.divIcon({
          className: '',
          html: `<div class="cluster-badge">${cluster.getChildCount()}</div>`,
          iconSize: [42, 42],
          iconAnchor: [21, 21]
        });
      }
    }).addTo(map);
  } else {
    markerLayer = L.layerGroup().addTo(map);
  }
}

function mappedVenueSet() {
  return new Set(
    data.venues
      .filter(venue => Number.isFinite(venue.lat) && Number.isFinite(venue.lng))
      .map(venue => venue.name)
  );
}

function eventOverlaps(event, time = state.time) {
  const start = event.startMinute ?? 9999;
  const end = event.endMinute ?? start;
  return start <= time.to && end >= time.from;
}

function filteredEvents({ ignoreTime = false } = {}) {
  const query = els.search.value.trim().toLocaleLowerCase('it-CH');
  const mapped = mappedVenueSet();

  return data.events.filter(event => {
    const searchable = `${eventTitle(event)} ${event.title} ${eventDescription(event)} ${event.description || ''} ${event.venue} ${eventCategory(event)} ${event.category || ''}`.toLocaleLowerCase('it-CH');
    return (ignoreTime || eventOverlaps(event)) &&
      (!state.category || event.category === state.category) &&
      (!query || searchable.includes(query)) &&
      (!state.onlyMapped || mapped.has(event.venue));
  });
}

function filterCount() {
  return Number(Boolean(state.category)) + Number(state.onlyMapped);
}

function updateFilterBadge() {
  const count = filterCount();
  els.filterBadge.hidden = count === 0;
  els.filterBadge.textContent = count ? String(count) : '';
}

function scopeText() {
  const bits = [formatNightRange(state.time)];
  if (state.category) bits.push(categoryLabel(state.category));
  if (state.onlyMapped) bits.push('solo mappati');
  if (els.search.value.trim()) bits.push(`“${els.search.value.trim()}”`);
  return bits.join(' · ');
}

function eventPreviewHtml(event) {
  const description = eventDescription(event);
  return `
    <span class="event-preview">
      <time>${escapeHtml(shortTime(event.start))}</time>
      <span class="event-preview-copy">
        <strong>${escapeHtml(eventTitle(event))}</strong>
        ${description ? `<small class="event-description">${escapeHtml(description)}</small>` : ''}
      </span>
    </span>
  `;
}

function venueCardHtml(name, events) {
  const ordered = [...events].sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999));
  const previews = ordered.slice(0, 2);
  return `
    <button class="venue-card" type="button" data-open-venue="${escapeHtml(name)}">
      <span class="venue-card-head">
        <span class="venue-card-title">${escapeHtml(name)}</span>
        <span class="venue-card-count">${events.length} ${events.length === 1 ? 'evento' : 'eventi'}</span>
      </span>
      ${previews.map(eventPreviewHtml).join('')}
    </button>
  `;
}

function venueEntries(events) {
  return [...groupBy(events, event => event.venue).entries()]
    .sort((a, b) => {
      const aStart = Math.min(...a[1].map(event => event.startMinute ?? 9999));
      const bStart = Math.min(...b[1].map(event => event.startMinute ?? 9999));
      return aStart - bStart || a[0].localeCompare(b[0], 'de-CH');
    });
}

function emptyStateHtml() {
  return `
    <div class="empty-state">
      <strong>Nessun risultato</strong>
      <p>Prova un altro orario, rimuovi un filtro o cambia ricerca.</p>
      <button type="button" data-reset-all>Mostra tutto</button>
    </div>
  `;
}

function renderSearchResults(events) {
  const entries = venueEntries(events);
  if (!entries.length) return emptyStateHtml();
  return `
    <div class="search-results-heading">${entries.length} ${entries.length === 1 ? 'luogo trovato' : 'luoghi trovati'}</div>
    <section class="section">
      ${entries.map(([name, venueEvents]) => venueCardHtml(name, venueEvents)).join('')}
    </section>
  `;
}

function renderTonight(events) {
  if (!events.length) return emptyStateHtml();
  if (els.search.value.trim()) return renderSearchResults(events);

  if (state.time.key !== 'all') {
    const entries = venueEntries(events);
    const visible = state.expandedHours.has(state.time.key) ? entries : entries.slice(0, 8);
    return `
      <section class="section">
        <div class="section-heading">
          <h2>${escapeHtml(state.time.key === 'now' ? 'Adesso' : hourLabel(Math.floor(state.time.from / 60)))}</h2>
          <span>${events.length} eventi · ${entries.length} luoghi</span>
        </div>
        ${visible.map(([name, venueEvents]) => venueCardHtml(name, venueEvents)).join('')}
        ${entries.length > visible.length ? `<button class="more-button" type="button" data-expand-hour="${escapeHtml(state.time.key)}">Mostra altri ${entries.length - visible.length} luoghi</button>` : ''}
      </section>
    `;
  }

  const byHour = groupBy(events, event => Math.floor((event.startMinute ?? NIGHT_END) / 60));
  const hours = [...byHour.keys()].filter(hour => hour >= 18 && hour <= 25).sort((a, b) => a - b);
  if (!hours.length) return renderSearchResults(events);

  return hours.map(hour => {
    const hourEvents = byHour.get(hour);
    const entries = venueEntries(hourEvents);
    const expanded = state.expandedHours.has(String(hour));
    const visible = expanded ? entries : entries.slice(0, 5);
    return `
      <section class="section" id="hour-${hour}">
        <div class="section-heading">
          <h2>${hourLabel(hour)}</h2>
          <span>${hourEvents.length} eventi · ${entries.length} luoghi</span>
        </div>
        ${visible.map(([name, venueEvents]) => venueCardHtml(name, venueEvents)).join('')}
        ${entries.length > visible.length ? `<button class="more-button" type="button" data-expand-hour="${hour}">Mostra altri ${entries.length - visible.length} luoghi</button>` : ''}
      </section>
    `;
  }).join('');
}

function normalizedLetter(name) {
  const normalized = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
  const first = normalized.charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

function nextTime(events) {
  const sorted = [...events].sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999));
  return shortTime(sorted[0]?.start);
}

function placeRowHtml(name, events) {
  const categories = [...new Set(events.map(event => eventCategory(event)).filter(Boolean))].slice(0, 2);
  const subtitle = `${events.length} ${events.length === 1 ? 'evento' : 'eventi'}${categories.length ? ` · ${categories.join(' · ')}` : ''}`;
  return `
    <button class="place-row" type="button" data-open-venue="${escapeHtml(name)}">
      <span>
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(subtitle)}</small>
      </span>
      <span class="next-time">${escapeHtml(nextTime(events))}</span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>
  `;
}

function renderVenues(events) {
  const entries = venueEntries(events).sort((a, b) => a[0].localeCompare(b[0], 'de-CH'));
  if (!entries.length) return emptyStateHtml();

  const byLetter = groupBy(entries, entry => normalizedLetter(entry[0]));
  return [...byLetter.entries()].map(([letter, letterEntries]) => `
    <section class="letter-section">
      <h2 class="letter-heading">${escapeHtml(letter)}</h2>
      ${letterEntries.map(([name, venueEvents]) => placeRowHtml(name, venueEvents)).join('')}
    </section>
  `).join('');
}

function renderBrowser() {
  const events = filteredEvents();
  const groups = groupBy(events, event => event.venue);

  els.summary.textContent = `${events.length} eventi · ${groups.size} luoghi`;
  els.scopeLabel.textContent = scopeText();
  els.browserContent.innerHTML = state.tab === 'venues'
    ? renderVenues(events)
    : renderTonight(events);

  bindBrowserActions();
}

function bindBrowserActions() {
  els.browserContent.querySelectorAll('[data-open-venue]').forEach(button => {
    button.addEventListener('click', () => openVenue(button.dataset.openVenue));
  });

  els.browserContent.querySelectorAll('[data-expand-hour]').forEach(button => {
    button.addEventListener('click', () => {
      state.expandedHours.add(button.dataset.expandHour);
      renderBrowser();
    });
  });

  els.browserContent.querySelector('[data-reset-all]')?.addEventListener('click', resetAll);
}

function markerIcon(count) {
  return L.divIcon({
    className: '',
    html: `<div class="marker-badge">${count}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20]
  });
}

function mapCardHtml(name, events) {
  const ordered = [...events].sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999));
  const previews = ordered.slice(0, 2);
  return `
    <div class="map-card-head">
      <div>
        <h2>${escapeHtml(name)}</h2>
        <div class="map-meta">${events.length} ${events.length === 1 ? 'evento' : 'eventi'} nel filtro corrente</div>
      </div>
      <button class="icon-button" type="button" data-close-map-card aria-label="Chiudi">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>
      </button>
    </div>
    <div class="map-preview-list">
      ${previews.map(event => `
        <div class="map-preview">
          <time>${escapeHtml(shortTime(event.start))}</time>
          <span class="map-preview-copy"><strong>${escapeHtml(eventTitle(event))}</strong>${eventDescription(event) ? `<small class="event-description">${escapeHtml(eventDescription(event))}</small>` : ''}</span>
        </div>
      `).join('')}
    </div>
    <button class="agenda-button" type="button" data-map-open-agenda>Vedi agenda</button>
  `;
}

function clearMarkerSelection() {
  for (const marker of markerByVenue.values()) {
    marker.getElement()?.querySelector('.marker-badge')?.classList.remove('is-selected');
  }
}

function selectMapVenue(name, events) {
  state.mapVenue = name;
  clearMarkerSelection();
  markerByVenue.get(name)?.getElement()?.querySelector('.marker-badge')?.classList.add('is-selected');
  els.mapCard.innerHTML = mapCardHtml(name, events);
  els.mapCard.hidden = false;
  els.mapCard.querySelector('[data-close-map-card]')?.addEventListener('click', () => {
    state.mapVenue = null;
    clearMarkerSelection();
    els.mapCard.hidden = true;
  });
  els.mapCard.querySelector('[data-map-open-agenda]')?.addEventListener('click', () => openVenue(name));
}

function renderMap() {
  if (!map || !markerLayer) return;
  const events = filteredEvents();
  const groups = groupBy(events, event => event.venue);
  const venues = new Map(data.venues.map(venue => [venue.name, venue]));

  markerLayer.clearLayers();
  markerByVenue.clear();
  els.mapCard.hidden = true;
  state.mapVenue = null;

  const bounds = [];
  for (const [name, venueEvents] of groups) {
    const venue = venues.get(name);
    if (!venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) continue;

    const marker = L.marker([venue.lat, venue.lng], { icon: markerIcon(venueEvents.length), title: name });
    marker.on('click', () => selectMapVenue(name, venueEvents));
    markerLayer.addLayer(marker);
    markerByVenue.set(name, marker);
    bounds.push([venue.lat, venue.lng]);
  }

  if (!mapHasFitted && bounds.length) {
    map.fitBounds(bounds, { padding: [34, 34], maxZoom: 14 });
    mapHasFitted = true;
  }
}

function focusVenueOnMap(name) {
  const marker = markerByVenue.get(name);
  if (!marker || !map) return;

  if (mobileMedia.matches) setTab('map');
  requestAnimationFrame(() => {
    map.invalidateSize();
    const point = marker.getLatLng();
    map.setView(point, Math.max(map.getZoom(), 16), { animate: !reducedMotion.matches });
    const venueEvents = groupBy(filteredEvents(), event => event.venue).get(name) || [];
    selectMapVenue(name, venueEvents);
  });
}

function detailAgendaEvents(name) {
  const query = els.search.value.trim().toLocaleLowerCase('it-CH');
  return data.events
    .filter(event => event.venue === name)
    .filter(event => !state.category || event.category === state.category)
    .filter(event => !query || `${eventTitle(event)} ${event.title} ${eventDescription(event)} ${event.description || ''} ${event.venue} ${eventCategory(event)} ${event.category || ''}`.toLocaleLowerCase('it-CH').includes(query))
    .sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999));
}

function agendaRowHtml(event) {
  return `
    <article class="agenda-row">
      <time>
        ${escapeHtml(shortTime(event.start))}
        ${event.end ? `<small>– ${escapeHtml(shortTime(event.end))}</small>` : ''}
      </time>
      <div>
        <strong>${escapeHtml(eventTitle(event))}</strong>
        ${eventDescription(event) ? `<p class="event-description">${escapeHtml(eventDescription(event))}</p>` : ''}
        <div class="agenda-meta">
          ${event.category ? `<span>${escapeHtml(eventCategory(event))}</span>` : ''}
          <a href="${escapeHtml(event.url)}" target="_blank" rel="noreferrer">Programma ufficiale ↗</a>
        </div>
      </div>
    </article>
  `;
}

function renderDetail(name) {
  const agendaEvents = detailAgendaEvents(name);
  const allVenueEvents = data.events.filter(event => event.venue === name);
  const venue = data.venues.find(item => item.name === name);
  const mapped = venue && Number.isFinite(venue.lat) && Number.isFinite(venue.lng);

  els.detailMap.hidden = !mapped;
  els.detailContent.innerHTML = `
    <div class="detail-hero">
      <p>Agenda del luogo</p>
      <h2>${escapeHtml(name)}</h2>
      <div class="detail-sub">
        ${agendaEvents.length} ${agendaEvents.length === 1 ? 'evento visibile' : 'eventi visibili'}
        ${agendaEvents.length !== allVenueEvents.length ? ` · ${allVenueEvents.length} in totale` : ''}
      </div>
    </div>
    <div class="agenda">
      ${agendaEvents.length ? agendaEvents.map(agendaRowHtml).join('') : emptyStateHtml()}
    </div>
  `;
  els.detailContent.querySelector('[data-reset-all]')?.addEventListener('click', () => {
    resetAll();
    renderDetail(name);
  });
}

function openVenue(name, { pushHistory = true } = {}) {
  state.venue = name;
  renderDetail(name);
  els.detailView.hidden = false;
  document.body.classList.add('detail-open');

  if (pushHistory) {
    history.pushState({ venue: name }, '');
    detailWasPushed = true;
  }
  requestAnimationFrame(() => els.detailBack.focus());
}

function closeVenue({ fromHistory = false } = {}) {
  if (els.detailView.hidden) return;
  state.venue = null;
  els.detailView.hidden = true;
  document.body.classList.remove('detail-open');

  if (!fromHistory && detailWasPushed) {
    detailWasPushed = false;
    history.back();
  }
}

function setTab(tab) {
  state.tab = tab;
  document.body.dataset.tab = tab;

  els.tabButtons.forEach(button => {
    const active = button.dataset.tabTarget === tab;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  els.desktopTabs.forEach(button => {
    const target = button.dataset.desktopTab;
    const active = target === tab || (tab === 'map' && target === 'tonight');
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  if (tab !== 'map') renderBrowser();
  if (tab === 'map') requestAnimationFrame(() => map?.invalidateSize());
}

function resetAll() {
  els.search.value = '';
  state.time = { key: 'all', from: NIGHT_START, to: NIGHT_END, label: 'Tutta la notte' };
  state.category = '';
  state.onlyMapped = false;
  state.expandedHours.clear();
  syncFilterForm();
  updateTimeRail();
  updateFilterBadge();
  render();
}

function render() {
  updateFilterBadge();
  renderBrowser();
  renderMap();
}

function syncFilterForm() {
  const categoryRadio = els.categoryOptions.querySelector(`input[name="category"][value="${CSS.escape(state.category)}"]`);
  if (categoryRadio) categoryRadio.checked = true;
  els.mappedFilter.checked = state.onlyMapped;
}

function openFilters() {
  syncFilterForm();
  if (typeof els.filterDialog.showModal === 'function') els.filterDialog.showModal();
  else els.filterDialog.setAttribute('open', '');
}

function closeFilters() {
  if (typeof els.filterDialog.close === 'function') els.filterDialog.close();
  else els.filterDialog.removeAttribute('open');
}

function setupFilters() {
  const categories = [...new Set(data.events.map(event => event.category).filter(Boolean))]
    .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'it-CH'));

  const options = [{ value: '', label: 'Tutti i tipi' }, ...categories.map(category => ({ value: category, label: categoryLabel(category) }))];
  els.categoryOptions.innerHTML = options.map((option, index) => `
    <label class="radio-row">
      <span>${escapeHtml(option.label)}</span>
      <input type="radio" name="category" value="${escapeHtml(option.value)}" ${index === 0 ? 'checked' : ''} />
    </label>
  `).join('');

  els.openFilterButtons.forEach(button => button.addEventListener('click', openFilters));
  els.closeFilterButtons.forEach(button => button.addEventListener('click', closeFilters));

  els.filterDialog.addEventListener('click', event => {
    if (event.target === els.filterDialog) closeFilters();
  });

  els.filterForm.addEventListener('submit', event => {
    event.preventDefault();
    const selected = new FormData(els.filterForm).get('category');
    state.category = typeof selected === 'string' ? selected : '';
    state.onlyMapped = els.mappedFilter.checked;
    state.expandedHours.clear();
    closeFilters();
    render();
  });

  els.clearFilters.addEventListener('click', () => {
    const allTypes = els.categoryOptions.querySelector('input[name="category"][value=""]');
    if (allTypes) allTypes.checked = true;
    els.mappedFilter.checked = false;
  });
}

function setDesktopTab(tab) {
  if (tab !== 'tonight' && tab !== 'venues') return;
  setTab(tab);
}

els.search.addEventListener('input', () => {
  state.expandedHours.clear();
  render();
});

els.tabButtons.forEach(button => {
  button.addEventListener('click', () => setTab(button.dataset.tabTarget));
});

els.desktopTabs.forEach(button => {
  button.addEventListener('click', () => setDesktopTab(button.dataset.desktopTab));
});

els.detailBack.addEventListener('click', () => closeVenue());
els.detailMap.addEventListener('click', () => {
  const name = state.venue;
  closeVenue();
  if (name) setTimeout(() => focusVenueOnMap(name), reducedMotion.matches ? 0 : 80);
});

window.addEventListener('popstate', () => {
  if (!els.detailView.hidden) {
    detailWasPushed = false;
    closeVenue({ fromHistory: true });
  }
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !els.detailView.hidden) closeVenue();
});

mobileMedia.addEventListener?.('change', () => {
  requestAnimationFrame(() => map?.invalidateSize());
});

async function main() {
  setupTimeRail();
  setupMap();

  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();

    setupFilters();
    render();
  } catch (error) {
    els.summary.textContent = 'Impossibile caricare il programma';
    els.scopeLabel.textContent = '';
    els.browserContent.innerHTML = `
      <div class="error-state">
        <strong>Qualcosa non ha funzionato</strong>
        <p>${escapeHtml(error.message)}</p>
        <button type="button" data-reload>Riprova</button>
      </div>
    `;
    els.browserContent.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
  }
}

main();
