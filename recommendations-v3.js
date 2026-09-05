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
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date())
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
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

function walkMinutes(distanceKm) { return Math.max(1, Math.ceil(distanceKm * 14.5)); }
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

async function refreshPermission() {
  if (!navigator.permissions?.query) {
    state.permission = 'unknown';
    return state.permission;
  }
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    state.permission = result.state || 'unknown';
    return state.permission;
  } catch {
    state.permission = 'unknown';
    return state.permission;
  }
}

function permissionSummary() {
  if (!window.isSecureContext) return ['non disponibile', 'Serve HTTPS.'];
  if (!navigator.geolocation) return ['non supportato', 'Questo browser non espone navigator.geolocation.'];
  if (state.permission === 'granted') return ['consentito', 'Permesso già concesso. Ora deve arrivare un fix GPS, senza nuovo popup.'];
  if (state.permission === 'denied') return ['bloccato', 'Il browser segnala il permesso come negato.'];
  if (state.permission === 'prompt') return ['da chiedere', 'Il browser dovrebbe chiedere il permesso.'];
  return ['da verificare', 'Lo stato del permesso non è leggibile su questo browser.'];
}

function acquireLocation() {
  return new Promise(resolve => {
    if (!window.isSecureContext) return resolve({ ok: false, reason: 'insecure', message: 'La pagina non è in HTTPS.' });
    if (!navigator.geolocation) return resolve({ ok: false, reason: 'unsupported', message: 'Geolocalizzazione non disponibile in questo browser.' });

    let settled = false;
    let watchId = null;
    let lastError = null;

    const finish = result => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(overallTimer);
      resolve(result);
    };

    const success = position => finish({
      ok: true,
      location: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      }
    });

    const error = err => {
      lastError = err;
      if (err.code === 1) {
        finish({ ok: false, reason: 'denied', code: err.code, message: 'Il browser ha rifiutato la geolocalizzazione per questo origin.' });
      }
    };

    // First try a coarse/cached fix: this is much faster and more reliable on iOS.
    navigator.geolocation.getCurrentPosition(
      success,
      error,
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );

    // In parallel, keep listening for a fresh fix. If the coarse request times out,
    // watchPosition often still succeeds a moment later on mobile Safari.
    watchId = navigator.geolocation.watchPosition(
      success,
      error,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    const overallTimer = setTimeout(() => {
      const suffix = lastError?.message ? ` (${lastError.message})` : '';
      finish({
        ok: false,
        reason: 'no-fix',
        code: lastError?.code ?? null,
        message: `Permesso disponibile, ma non è arrivato nessun fix GPS entro 16 secondi${suffix}.`
      });
    }, 16000);
  });
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

      const score = state.location
        ? walking * 1.35 + (ongoing ? 0 : Math.max(0, untilStart - walking) * .22) + (ongoing ? 0 : Math.max(0, walking - untilStart) * 4)
        : (ongoing ? Math.min(12, Math.max(0, now - start) / 15) : untilStart);
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
    if (!chosen.includes(candidate)) chosen.push(candidate);
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
  return `<button class="recommend-card" type="button" data-recommend-venue="${esc(event.venue)}">
    <span class="recommend-rank">${index + 1}</span>
    <span class="recommend-card-body">
      <span class="recommend-meta"><strong>${esc(timingLabel(item))}</strong><span>${esc(minuteLabel(item.start))}</span></span>
      <span class="recommend-title">${esc(titleOf(event))}</span>
      <span class="recommend-venue">${esc(event.venue)}</span>
      ${description ? `<span class="recommend-description">${esc(description)}</span>` : ''}
      <span class="recommend-facts">${travelLabel(item) ? `<span>${esc(travelLabel(item))}</span>` : ''}${category ? `<span>${esc(category)}</span>` : ''}</span>
    </span><span class="recommend-chevron" aria-hidden="true">›</span>
  </button>`;
}

function manualOptionsHtml() {
  const anchors = CITY_ANCHORS;
  const venues = (state.data?.venues || [])
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .sort((a, b) => a.name.localeCompare(b.name, 'it-CH'));
  const option = item => `<option value="${item.lat},${item.lng}">${esc(item.name)}</option>`;
  return `<option value="">Scegli dove sei…</option>
    <optgroup label="Punti centrali">${anchors.map(option).join('')}</optgroup>
    ${venues.length ? `<optgroup label="Musei e luoghi">${venues.map(option).join('')}</optgroup>` : ''}`;
}

function manualLocationHtml() {
  return `<div class="recommend-manual"><div><strong>Posizione manuale</strong><small>Fallback se iOS non restituisce il GPS.</small></div>
    <select data-manual-location aria-label="Posizione approssimativa">${manualOptionsHtml()}</select></div>`;
}

function idlePanelHtml() {
  const [permission, detail] = permissionSummary();
  return `<section id="recommendPanel" class="recommend-panel recommend-panel-idle" aria-label="Consigli personalizzati">
    <div class="recommend-intro"><div class="recommend-icon" aria-hidden="true">⌖</div><div><span class="recommend-eyebrow">PER TE</span><h2>Cosa c’è vicino adesso?</h2><p>Incrocio posizione e orari per trovare cose raggiungibili.</p></div></div>
    <div class="recommend-permission"><span>Posizione: <strong>${esc(permission)}</strong></span><small>${esc(detail)}</small></div>
    <button class="recommend-primary" type="button" data-get-location>Usa GPS</button>
    ${manualLocationHtml()}
  </section>`;
}

function locatingPanelHtml() {
  const [permission, detail] = permissionSummary();
  return `<section id="recommendPanel" class="recommend-panel" aria-live="polite">
    <div class="recommend-loading"><span class="recommend-spinner" aria-hidden="true"></span><div><strong>Cerco il GPS…</strong><small>Prima una posizione rapida, poi alta precisione.</small></div></div>
    <div class="recommend-permission"><span>Permesso: <strong>${esc(permission)}</strong></span><small>${esc(state.message || detail)}</small></div>
    ${state.status === 'location-help' ? manualLocationHtml() : ''}
  </section>`;
}

function resultsPanelHtml() {
  const now = recommendationMinute();
  const hasLocation = Boolean(state.location);
  const heading = hasLocation ? 'Vicino a te' : 'Da fare adesso';
  const subtitle = state.recommendations.length
    ? `${state.recommendations.length} opzioni per le ${minuteLabel(now)}${hasLocation ? ` · ${state.locationLabel || 'GPS'}` : ''}`
    : 'Nessun evento utile trovato nelle prossime due ore.';
  return `<section id="recommendPanel" class="recommend-panel recommend-results" aria-live="polite">
    <div class="recommend-results-head"><div><span class="recommend-eyebrow">CONSIGLIATI</span><h2>${esc(heading)}</h2><p>${esc(subtitle)}</p></div><button class="recommend-refresh" type="button" data-refresh aria-label="Aggiorna consigli">↻</button></div>
    ${state.message ? `<div class="recommend-notice">${esc(state.message)}</div>` : ''}
    <div class="recommend-list">${state.recommendations.map(cardHtml).join('') || '<div class="recommend-empty">Prova un altro punto di partenza.</div>'}</div>
    <div class="recommend-actions-row"><button type="button" data-get-location>Riprova GPS</button><button type="button" data-show-manual>Scegli posizione</button></div>
    <div data-manual-slot hidden>${manualLocationHtml()}</div>
  </section>`;
}

function renderPanel() {
  if (!els.browserContent || document.body.dataset.tab !== 'tonight') return;
  els.browserContent.querySelector('#recommendPanel')?.remove();
  let html = idlePanelHtml();
  if (state.status === 'locating' || state.status === 'location-help') html = locatingPanelHtml();
  if (['ready', 'timed', 'error'].includes(state.status)) html = resultsPanelHtml();
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
  try { await ensureData(); } catch {
    state.status = 'error'; state.message = 'Non riesco a caricare il programma.'; renderPanel(); return;
  }
  const [lat, lng] = select.value.split(',').map(Number);
  state.location = { lat, lng, accuracy: null };
  state.locationLabel = select.options[select.selectedIndex]?.textContent || 'posizione scelta';
  state.message = 'Posizione approssimativa scelta manualmente.';
  computeRecommendations('ready');
}

function startGeolocation() {
  const requestId = ++state.requestId;
  state.status = 'locating';
  state.message = 'Richiesta inviata al browser.';
  renderPanel();
  updateTrigger();

  // Critical: start the browser geolocation request synchronously from the tap.
  const locationPromise = acquireLocation();
  const dataPromise = ensureData();
  refreshPermission().then(() => { if (requestId === state.requestId) renderPanel(); });

  const helpTimer = setTimeout(() => {
    if (requestId !== state.requestId || state.status !== 'locating') return;
    state.status = 'location-help';
    state.message = 'Permesso concesso ma il GPS non ha ancora restituito coordinate. Continuo a provare; puoi anche scegliere una posizione manuale.';
    renderPanel();
  }, 3500);

  Promise.allSettled([locationPromise, dataPromise]).then(async ([locationResult, dataResult]) => {
    if (requestId !== state.requestId) return;
    clearTimeout(helpTimer);
    await refreshPermission();

    if (dataResult.status === 'rejected') {
      state.status = 'error';
      state.message = 'Non riesco a caricare il programma.';
      renderPanel();
      return;
    }

    if (locationResult.status === 'fulfilled' && locationResult.value.ok) {
      const location = locationResult.value.location;
      state.location = location;
      state.locationLabel = location.accuracy ? `GPS ±${Math.round(location.accuracy)} m` : 'GPS';
      state.message = 'Posizione GPS ottenuta.';
      computeRecommendations('ready');
      return;
    }

    const result = locationResult.status === 'fulfilled' ? locationResult.value : { message: 'Errore imprevisto nella geolocalizzazione.' };
    state.location = null;
    state.locationLabel = '';
    state.message = `${result.message} Stato permesso: ${state.permission}.`;
    computeRecommendations('timed');
  });
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

function bindPanel() {
  const panel = els.browserContent?.querySelector('#recommendPanel');
  if (!panel) return;
  panel.querySelectorAll('[data-get-location]').forEach(button => button.addEventListener('click', startGeolocation));
  panel.querySelector('[data-refresh]')?.addEventListener('click', () => state.location ? computeRecommendations('ready') : startGeolocation());
  panel.querySelector('[data-show-manual]')?.addEventListener('click', () => {
    const slot = panel.querySelector('[data-manual-slot]');
    if (slot) slot.hidden = !slot.hidden;
  });
  panel.querySelectorAll('[data-manual-location]').forEach(select => select.addEventListener('change', () => useManualLocation(select)));
  panel.querySelectorAll('[data-recommend-venue]').forEach(button => button.addEventListener('click', () => openVenueFromRecommendation(button.dataset.recommendVenue)));
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
  await Promise.allSettled([ensureData(), refreshPermission()]);
  renderPanel();
  setupObservers();
}

init();