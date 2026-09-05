const DATA_URL = 'data/events.json';
const EVENT_DATE = '2026-09-05';
const NIGHT_START = 18 * 60;
const NIGHT_END = 26 * 60;
const HORIZON_MINUTES = 150;
const LIMIT = 5;

const CITY_ANCHORS = [
  { name: 'Zürich HB', lat: 47.37818, lng: 8.54019 },
  { name: 'Bahnhofstrasse / Paradeplatz', lat: 47.36965, lng: 8.53878 },
  { name: 'Bellevue', lat: 47.36688, lng: 8.54524 },
  { name: 'Central', lat: 47.37602, lng: 8.54307 }
];

const state = {
  status: 'idle',
  data: null,
  location: null,
  locationLabel: '',
  permission: 'unknown',
  message: '',
  recommendations: [],
  requestId: 0
};

const els = {
  browserHeader: document.querySelector('.browser-header'),
  browserContent: document.querySelector('#browserContent')
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function titleOf(event) { return event.titleIt || event.title || ''; }
function descriptionOf(event) { return event.descriptionIt || event.description || ''; }
function categoryOf(event) { return event.categoryIt || event.category || ''; }

function zurichMinuteNow() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
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

function recommendationMinute() {
  const active = document.querySelector('#timeRail [data-time-key].is-active');
  if (active && !['all', 'now'].includes(active.dataset.timeKey)) return Number(active.dataset.from);
  return zurichMinuteNow() ?? NIGHT_START;
}

function minuteLabel(total) {
  const hour = Math.floor(total / 60) % 24;
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function haversineKm(a, b) {
  const toRad = degrees => degrees * Math.PI / 180;
  const earth = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function walkMinutes(distanceKm) {
  return Math.max(1, Math.ceil(distanceKm * 14.5));
}

function distanceLabel(distanceKm) {
  if (distanceKm < 1) return `${Math.max(50, Math.round(distanceKm * 1000 / 50) * 50)} m`;
  return `${distanceKm.toFixed(distanceKm < 2 ? 1 : 0)} km`;
}

function currentCategory() {
  return document.querySelector('#categoryOptions input[name="category"]:checked')?.value || '';
}

async function ensureData() {
  if (state.data) return state.data;
  const response = await fetch(DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  state.data = await response.json();
  return state.data;
}

async function readPermission() {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    state.permission = result.state || 'unknown';
    result.addEventListener?.('change', () => {
      state.permission = result.state || 'unknown';
      renderPanel();
    });
    return state.permission;
  } catch {
    return 'unknown';
  }
}

function permissionLabel() {
  if (!window.isSecureContext) return ['non disponibile', 'La pagina non è in HTTPS.'];
  if (!navigator.geolocation) return ['non supportato', 'Questo browser non espone la geolocalizzazione.'];
  if (state.permission === 'granted') return ['consentito', 'Il browser ha già accesso: non deve comparire un nuovo popup.'];
  if (state.permission === 'denied') return ['bloccato', 'Il browser non può mostrare il popup finché non riabiliti la posizione per questo sito/app.'];
  if (state.permission === 'prompt') return ['da chiedere', 'Toccando il pulsante il browser dovrebbe mostrare la richiesta.'];
  return ['da verificare', 'Il browser non espone lo stato del permesso.'];
}

function buildCandidates() {
  if (!state.data) return [];
  const now = recommendationMinute();
  const category = currentCategory();
  const venues = new Map(state.data.venues.map(venue => [venue.name, venue]));

  return state.data.events
    .filter(event => {
      if (!Number.isFinite(event.startMinute)) return false;
      const end = Number.isFinite(event.endMinute) ? event.endMinute : event.startMinute + 45;
      if (end < now + 10) return false;
      if (event.startMinute > Math.min(now + HORIZON_MINUTES, NIGHT_END)) return false;
      if (category && event.category !== category) return false;
      if (state.location) {
        const venue = venues.get(event.venue);
        if (!venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return false;
      }
      return true;
    })
    .map(event => {
      const start = event.startMinute;
      const end = Number.isFinite(event.endMinute) ? event.endMinute : start + 45;
      const ongoing = start <= now && end >= now;
      const untilStart = Math.max(0, start - now);
      const remaining = Math.max(0, end - now);
      const venue = venues.get(event.venue);
      let distanceKm = null;
      let walking = null;

      if (state.location && venue) {
        distanceKm = haversineKm(state.location, { lat: venue.lat, lng: venue.lng });
        walking = walkMinutes(distanceKm);
        if (ongoing && remaining < walking + 10) return null;
        if (!ongoing && walking > untilStart + 10) return null;
      }

      let score;
      if (state.location) {
        const waitAfterWalking = ongoing ? 0 : Math.max(0, untilStart - walking);
        const lateBy = ongoing ? 0 : Math.max(0, walking - untilStart);
        const agePenalty = ongoing ? Math.min(8, Math.max(0, now - start) / 30) : 0;
        score = walking * 1.35 + waitAfterWalking * 0.22 + lateBy * 4 + agePenalty;
      } else {
        score = ongoing ? Math.min(12, Math.max(0, now - start) / 15) : untilStart;
      }

      return { event, start, end, ongoing, untilStart, remaining, distanceKm, walking, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.start - b.start);
}

function chooseRecommendations(candidates) {
  const chosen = [];
  const usedVenues = new Set();
  for (const candidate of candidates) {
    if (usedVenues.has(candidate.event.venue)) continue;
    chosen.push(candidate);
    usedVenues.add(candidate.event.venue);
    if (chosen.length === LIMIT) return chosen;
  }
  for (const candidate of candidates) {
    if (chosen.includes(candidate)) continue;
    chosen.push(candidate);
    if (chosen.length === LIMIT) break;
  }
  return chosen;
}

function timingLabel(item) {
  if (item.ongoing) return `In corso · ancora ${item.remaining} min`;
  if (item.untilStart <= 5) return 'Inizia ora';
  return `Tra ${item.untilStart} min`;
}

function travelLabel(item) {
  if (item.distanceKm == null) return '';
  return `${distanceLabel(item.distanceKm)} · ~${item.walking} min a piedi`;
}

function cardHtml(item, index) {
  const event = item.event;
  const description = descriptionOf(event);
  const category = categoryOf(event);
  return `
    <button class="recommend-card" type="button" data-recommend-venue="${esc(event.venue)}">
      <span class="recommend-rank">${index + 1}</span>
      <span class="recommend-card-body">
        <span class="recommend-meta"><strong>${esc(timingLabel(item))}</strong><span>${esc(minuteLabel(item.start))}</span></span>
        <span class="recommend-title">${esc(titleOf(event))}</span>
        <span class="recommend-venue">${esc(event.venue)}</span>
        ${description ? `<span class="recommend-description">${esc(description)}</span>` : ''}
        <span class="recommend-facts">
          ${travelLabel(item) ? `<span>${esc(travelLabel(item))}</span>` : ''}
          ${category ? `<span>${esc(category)}</span>` : ''}
        </span>
      </span>
      <span class="recommend-chevron" aria-hidden="true">›</span>
    </button>`;
}

function manualOptionsHtml() {
  const anchors = CITY_ANCHORS.map(item => ({ ...item, group: 'Punti centrali' }));
  const venues = (state.data?.venues || [])
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .map(item => ({ name: item.name, lat: item.lat, lng: item.lng, group: 'Musei e luoghi' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it-CH'));

  const option = item => `<option value="${item.lat},${item.lng}" data-label="${esc(item.name)}">${esc(item.name)}</option>`;
  return `
    <option value="">Scegli dove sei…</option>
    <optgroup label="Punti centrali">${anchors.map(option).join('')}</optgroup>
    ${venues.length ? `<optgroup label="Musei e luoghi">${venues.map(option).join('')}</optgroup>` : ''}`;
}

function manualLocationHtml() {
  return `
    <div class="recommend-manual">
      <div><strong>Niente popup?</strong><small>Imposta una posizione approssimativa. Il calcolo resta nel browser.</small></div>
      <select data-manual-location aria-label="Posizione approssimativa">${manualOptionsHtml()}</select>
    </div>`;
}

function idlePanelHtml() {
  const [permission, detail] = permissionLabel();
  return `
    <section id="recommendPanel" class="recommend-panel recommend-panel-idle" aria-label="Consigli personalizzati">
      <div class="recommend-intro">
        <div class="recommend-icon" aria-hidden="true">⌖</div>
        <div><span class="recommend-eyebrow">PER TE</span><h2>Cosa c’è vicino adesso?</h2><p>Incrocio posizione e orari per trovare cose realisticamente raggiungibili.</p></div>
      </div>
      <div class="recommend-permission"><span>Posizione: <strong>${esc(permission)}</strong></span><small>${esc(detail)}</small></div>
      <button class="recommend-primary" type="button" data-get-location>Chiedi la mia posizione</button>
      ${manualLocationHtml()}
    </section>`;
}

function locatingPanelHtml() {
  const [permission, detail] = permissionLabel();
  return `
    <section id="recommendPanel" class="recommend-panel" aria-live="polite">
      <div class="recommend-loading"><span class="recommend-spinner" aria-hidden="true"></span><div><strong>Richiesta posizione inviata</strong><small>${esc(detail)}</small></div></div>
      <div class="recommend-permission"><span>Permesso: <strong>${esc(permission)}</strong></span><small>${state.message ? esc(state.message) : 'Attendo una risposta dal browser…'}</small></div>
      ${state.status === 'location-help' ? manualLocationHtml() : ''}
    </section>`;
}

function resultsPanelHtml() {
  const now = recommendationMinute();
  const hasLocation = Boolean(state.location);
  const heading = hasLocation ? 'Vicino a te' : 'Da fare adesso';
  const subtitle = state.recommendations.length
    ? `${state.recommendations.length} opzioni per le ${minuteLabel(now)}${hasLocation ? ` · posizione: ${state.locationLabel || 'GPS'}` : ''}`
    : 'Nessun evento utile trovato nelle prossime due ore.';
  return `
    <section id="recommendPanel" class="recommend-panel recommend-results" aria-live="polite">
      <div class="recommend-results-head">
        <div><span class="recommend-eyebrow">CONSIGLIATI</span><h2>${esc(heading)}</h2><p>${esc(subtitle)}</p></div>
        <button class="recommend-refresh" type="button" data-refresh aria-label="Aggiorna consigli">↻</button>
      </div>
      ${state.message ? `<div class="recommend-notice">${esc(state.message)}</div>` : ''}
      <div class="recommend-list">${state.recommendations.map(cardHtml).join('') || '<div class="recommend-empty">Prova un’altra fascia oraria oppure un altro punto di partenza.</div>'}</div>
      <div class="recommend-actions-row">
        <button type="button" data-get-location>Usa GPS</button>
        <button type="button" data-show-manual>Scegli posizione</button>
      </div>
      <div data-manual-slot hidden>${manualLocationHtml()}</div>
    </section>`;
}

function renderPanel() {
  if (!els.browserContent || document.body.dataset.tab !== 'tonight') return;
  els.browserContent.querySelector('#recommendPanel')?.remove();
  let html = idlePanelHtml();
  if (state.status === 'locating' || state.status === 'location-help') html = locatingPanelHtml();
  if (state.status === 'ready' || state.status === 'timed' || state.status === 'error') html = resultsPanelHtml();
  els.browserContent.insertAdjacentHTML('afterbegin', html);
  bindPanel();
}

function updateTrigger() {
  const button = document.querySelector('#recommendTrigger');
  if (!button) return;
  button.hidden = document.body.dataset.tab !== 'tonight';
  button.classList.toggle('is-active', state.status === 'ready');
  const label = button.querySelector('span:last-child');
  if (label) label.textContent = state.location ? 'Vicino a te' : 'Vicino a me';
}

function computeRecommendations(status = state.location ? 'ready' : 'timed') {
  state.status = status;
  state.recommendations = chooseRecommendations(buildCandidates());
  renderPanel();
  updateTrigger();
}

async function useManualLocation(select) {
  if (!select?.value) return;
  try {
    await ensureData();
  } catch {
    state.status = 'error';
    state.message = 'Non riesco a caricare il programma.';
    renderPanel();
    return;
  }
  const [lat, lng] = select.value.split(',').map(Number);
  const selected = select.options[select.selectedIndex];
  state.location = { lat, lng, accuracy: null };
  state.locationLabel = selected?.textContent || 'posizione scelta';
  state.message = 'Posizione approssimativa scelta manualmente.';
  computeRecommendations('ready');
}

function startGeolocation() {
  const requestId = ++state.requestId;
  state.status = 'locating';
  state.message = '';
  renderPanel();
  updateTrigger();

  ensureData().catch(() => {});
  readPermission().then(() => {
    if (requestId === state.requestId && (state.status === 'locating' || state.status === 'location-help')) renderPanel();
  });

  if (!window.isSecureContext) {
    state.status = 'error';
    state.message = 'La geolocalizzazione richiede HTTPS. Usa una posizione manuale.';
    renderPanel();
    return;
  }
  if (!navigator.geolocation) {
    state.status = 'error';
    state.message = 'Questo browser non espone la geolocalizzazione. Usa una posizione manuale.';
    renderPanel();
    return;
  }

  const helpTimer = setTimeout(() => {
    if (requestId !== state.requestId || state.status !== 'locating') return;
    state.status = 'location-help';
    state.message = state.permission === 'denied'
      ? 'Il permesso risulta bloccato. Il browser non può mostrare un nuovo popup.'
      : 'Nessuna risposta dal browser. Se sei in un browser incorporato, il popup può essere soppresso.';
    renderPanel();
  }, 2500);

  navigator.geolocation.getCurrentPosition(
    async position => {
      if (requestId !== state.requestId) return;
      clearTimeout(helpTimer);
      state.location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      state.locationLabel = position.coords.accuracy ? `GPS ±${Math.round(position.coords.accuracy)} m` : 'GPS';
      state.permission = 'granted';
      state.message = 'Posizione ottenuta dal browser.';
      try {
        await ensureData();
        computeRecommendations('ready');
      } catch {
        state.status = 'error';
        state.message = 'Posizione ottenuta, ma non riesco a caricare il programma.';
        renderPanel();
      }
    },
    async error => {
      if (requestId !== state.requestId) return;
      clearTimeout(helpTimer);
      await readPermission();
      state.location = null;
      state.locationLabel = '';
      if (error.code === 1) {
        state.permission = 'denied';
        state.message = 'Accesso alla posizione negato o bloccato dal browser/app. Puoi riabilitarlo nelle impostazioni oppure scegliere una posizione manuale.';
      } else if (error.code === 3) {
        state.message = 'La richiesta GPS è scaduta. Puoi riprovare o scegliere una posizione manuale.';
      } else {
        state.message = 'Il browser non è riuscito a determinare la posizione. Puoi scegliere una posizione manuale.';
      }
      try {
        await ensureData();
        computeRecommendations('timed');
      } catch {
        state.status = 'error';
        renderPanel();
      }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

function openVenueFromRecommendation(venue) {
  const search = document.querySelector('#search');
  if (!search) return;
  const previousSearch = search.value;
  const previousTime = document.querySelector('#timeRail [data-time-key].is-active')?.dataset.timeKey || 'all';
  document.querySelector('#timeRail [data-time-key="all"]')?.click();
  search.value = venue;
  search.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => {
    [...document.querySelectorAll('[data-open-venue]')].find(button => button.dataset.openVenue === venue)?.click();
    search.value = previousSearch;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector(`#timeRail [data-time-key="${CSS.escape(previousTime)}"]`)?.click();
  });
}

function bindManual(container) {
  container.querySelectorAll('[data-manual-location]').forEach(select => {
    select.addEventListener('change', () => useManualLocation(select));
  });
}

function bindPanel() {
  const panel = els.browserContent?.querySelector('#recommendPanel');
  if (!panel) return;
  panel.querySelectorAll('[data-get-location]').forEach(button => button.addEventListener('click', startGeolocation));
  panel.querySelector('[data-refresh]')?.addEventListener('click', () => {
    if (state.location) computeRecommendations('ready');
    else startGeolocation();
  });
  panel.querySelector('[data-show-manual]')?.addEventListener('click', () => {
    const slot = panel.querySelector('[data-manual-slot]');
    if (slot) slot.hidden = !slot.hidden;
  });
  panel.querySelectorAll('[data-recommend-venue]').forEach(button => {
    button.addEventListener('click', () => openVenueFromRecommendation(button.dataset.recommendVenue));
  });
  bindManual(panel);
}

function injectTrigger() {
  if (!els.browserHeader || document.querySelector('#recommendTrigger')) return;
  const button = document.createElement('button');
  button.id = 'recommendTrigger';
  button.className = 'recommend-trigger';
  button.type = 'button';
  button.innerHTML = '<span aria-hidden="true">⌖</span><span>Vicino a me</span>';
  button.addEventListener('click', () => {
    if (document.body.dataset.tab !== 'tonight') return;
    renderPanel();
    els.browserContent?.scrollTo({ top: 0, behavior: 'smooth' });
  });
  els.browserHeader.append(button);
  updateTrigger();
}

function setupObservers() {
  const contentObserver = new MutationObserver(() => {
    if (document.body.dataset.tab === 'tonight' && !els.browserContent?.querySelector('#recommendPanel')) queueMicrotask(renderPanel);
  });
  if (els.browserContent) contentObserver.observe(els.browserContent, { childList: true });

  const tabObserver = new MutationObserver(() => {
    updateTrigger();
    if (document.body.dataset.tab === 'tonight') queueMicrotask(renderPanel);
  });
  tabObserver.observe(document.body, { attributes: true, attributeFilter: ['data-tab'] });

  document.addEventListener('click', event => {
    if (event.target.closest('#timeRail [data-time-key]') && state.status !== 'idle') {
      setTimeout(() => computeRecommendations(state.location ? 'ready' : 'timed'), 0);
    }
  });
}

async function init() {
  injectTrigger();
  await Promise.allSettled([ensureData(), readPermission()]);
  renderPanel();
  setupObservers();
}

init();