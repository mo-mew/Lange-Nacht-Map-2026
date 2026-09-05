const RECOMMEND_DATA_URL = 'data/events.json';
const EVENT_DATE = '2026-09-05';
const NIGHT_START = 18 * 60;
const NIGHT_END = 26 * 60;
const HORIZON_MINUTES = 150;
const LIMIT = 5;

const recState = {
  status: 'idle',
  data: null,
  location: null,
  error: '',
  recommendations: []
};

const recEls = {
  browserHeader: document.querySelector('.browser-header'),
  browserContent: document.querySelector('#browserContent')
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function titleOf(event) {
  return event.titleIt || event.title || '';
}

function descriptionOf(event) {
  return event.descriptionIt || event.description || '';
}

function categoryOf(event) {
  return event.categoryIt || event.category || '';
}

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
  if (active && !['all', 'now'].includes(active.dataset.timeKey)) {
    return Number(active.dataset.from);
  }
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
  if (recState.data) return recState.data;
  const response = await fetch(RECOMMEND_DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  recState.data = await response.json();
  return recState.data;
}

function requestLocationImmediately() {
  return new Promise(resolve => {
    if (!window.isSecureContext) {
      resolve({
        ok: false,
        reason: 'insecure',
        message: 'La posizione richiede una connessione HTTPS.'
      });
      return;
    }

    if (!navigator.geolocation) {
      resolve({
        ok: false,
        reason: 'unsupported',
        message: 'Questo browser non supporta la posizione.'
      });
      return;
    }

    // Important: call getCurrentPosition synchronously inside the user tap.
    // Some mobile browsers suppress permission UI after an awaited operation.
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        ok: true,
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        }
      }),
      error => {
        let message = 'Posizione non disponibile: uso solo gli orari.';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Accesso alla posizione bloccato. Riabilitalo nelle impostazioni del sito/browser e riprova.';
        } else if (error.code === error.TIMEOUT) {
          message = 'La posizione sta impiegando troppo tempo: uso solo gli orari.';
        }
        resolve({ ok: false, reason: `geo-${error.code}`, message });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function buildCandidates() {
  if (!recState.data) return [];
  const now = recommendationMinute();
  const category = currentCategory();
  const venues = new Map(recState.data.venues.map(venue => [venue.name, venue]));

  return recState.data.events
    .filter(event => {
      if (!Number.isFinite(event.startMinute)) return false;
      const end = Number.isFinite(event.endMinute) ? event.endMinute : event.startMinute + 45;
      if (end < now + 10) return false;
      if (event.startMinute > Math.min(now + HORIZON_MINUTES, NIGHT_END)) return false;
      if (category && event.category !== category) return false;
      if (recState.location) {
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

      if (recState.location && venue) {
        distanceKm = haversineKm(recState.location, { lat: venue.lat, lng: venue.lng });
        walking = walkMinutes(distanceKm);

        if (ongoing && remaining < walking + 10) return null;
        if (!ongoing && walking > untilStart + 10) return null;
      }

      let score;
      if (recState.location) {
        const waitAfterWalking = ongoing ? 0 : Math.max(0, untilStart - walking);
        const lateBy = ongoing ? 0 : Math.max(0, walking - untilStart);
        const agePenalty = ongoing ? Math.min(8, Math.max(0, now - start) / 30) : 0;
        score = walking * 1.35 + waitAfterWalking * 0.22 + lateBy * 4 + agePenalty;
      } else {
        score = ongoing ? Math.min(12, Math.max(0, now - start) / 15) : untilStart;
      }

      return { event, now, start, end, ongoing, untilStart, remaining, distanceKm, walking, score };
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
        <span class="recommend-meta">
          <strong>${esc(timingLabel(item))}</strong>
          <span>${esc(minuteLabel(item.start))}</span>
        </span>
        <span class="recommend-title">${esc(titleOf(event))}</span>
        <span class="recommend-venue">${esc(event.venue)}</span>
        ${description ? `<span class="recommend-description">${esc(description)}</span>` : ''}
        <span class="recommend-facts">
          ${travelLabel(item) ? `<span>${esc(travelLabel(item))}</span>` : ''}
          ${category ? `<span>${esc(category)}</span>` : ''}
        </span>
      </span>
      <span class="recommend-chevron" aria-hidden="true">›</span>
    </button>
  `;
}

function idlePanelHtml() {
  return `
    <section id="recommendPanel" class="recommend-panel recommend-panel-idle" aria-label="Consigli personalizzati">
      <div class="recommend-intro">
        <div class="recommend-icon" aria-hidden="true">⌖</div>
        <div>
          <span class="recommend-eyebrow">PER TE</span>
          <h2>Cosa c’è vicino adesso?</h2>
          <p>Incrocio la tua posizione con gli eventi raggiungibili nelle prossime due ore.</p>
        </div>
      </div>
      <button class="recommend-primary" type="button" data-get-recommendations>Usa la mia posizione</button>
      <small>La posizione resta nel browser e non viene salvata.</small>
    </section>
  `;
}

function loadingPanelHtml() {
  return `
    <section id="recommendPanel" class="recommend-panel" aria-live="polite">
      <div class="recommend-loading">
        <span class="recommend-spinner" aria-hidden="true"></span>
        <div><strong>Sto leggendo la posizione…</strong><small>Il browser potrebbe chiederti il permesso adesso.</small></div>
      </div>
    </section>
  `;
}

function resultsPanelHtml() {
  const now = recommendationMinute();
  const hasLocation = Boolean(recState.location);
  const heading = hasLocation ? 'Vicino a te' : 'Da fare adesso';
  const subtitle = recState.recommendations.length
    ? `${recState.recommendations.length} opzioni per le ${minuteLabel(now)}${hasLocation ? ', ordinate per raggiungibilità' : ', ordinate per orario'}`
    : 'Nessun evento utile trovato nelle prossime due ore.';

  return `
    <section id="recommendPanel" class="recommend-panel recommend-results" aria-live="polite">
      <div class="recommend-results-head">
        <div>
          <span class="recommend-eyebrow">CONSIGLIATI</span>
          <h2>${esc(heading)}</h2>
          <p>${esc(subtitle)}</p>
        </div>
        <button class="recommend-refresh" type="button" data-refresh-recommendations aria-label="Aggiorna consigli">↻</button>
      </div>
      ${recState.error ? `<div class="recommend-notice">${esc(recState.error)}</div>` : ''}
      <div class="recommend-list">
        ${recState.recommendations.map(cardHtml).join('') || '<div class="recommend-empty">Prova un’altra fascia oraria oppure mostra tutti i tipi di evento.</div>'}
      </div>
      ${!hasLocation ? '<button class="recommend-location-retry" type="button" data-get-recommendations>Riprova posizione</button>' : ''}
    </section>
  `;
}

function renderPanel() {
  if (!recEls.browserContent || document.body.dataset.tab !== 'tonight') return;
  recEls.browserContent.querySelector('#recommendPanel')?.remove();

  let html = idlePanelHtml();
  if (recState.status === 'loading') html = loadingPanelHtml();
  if (['ready', 'timed', 'error'].includes(recState.status)) html = resultsPanelHtml();

  recEls.browserContent.insertAdjacentHTML('afterbegin', html);
  bindPanel();
}

function updateTrigger() {
  const button = document.querySelector('#recommendTrigger');
  if (!button) return;
  button.hidden = document.body.dataset.tab !== 'tonight';
  button.classList.toggle('is-active', recState.status === 'ready');
  const label = button.querySelector('span:last-child');
  if (label) label.textContent = recState.status === 'ready' ? 'Vicino a te' : 'Vicino a me';
}

function computeRecommendations(status = recState.location ? 'ready' : 'timed') {
  recState.status = status;
  recState.recommendations = chooseRecommendations(buildCandidates());
  renderPanel();
  updateTrigger();
}

async function requestRecommendations() {
  recState.status = 'loading';
  recState.error = '';
  renderPanel();
  updateTrigger();

  // Start location access immediately, before any await, so Safari/iOS keeps
  // the permission request attached to the user's tap.
  const locationPromise = requestLocationImmediately();
  const dataPromise = ensureData();

  const [locationResult, dataResult] = await Promise.allSettled([locationPromise, dataPromise]);

  if (dataResult.status === 'rejected') {
    recState.status = 'error';
    recState.error = 'Non riesco a caricare il programma.';
    recState.recommendations = [];
    renderPanel();
    updateTrigger();
    return;
  }

  if (locationResult.status === 'fulfilled' && locationResult.value.ok) {
    recState.location = locationResult.value.location;
    recState.error = '';
    computeRecommendations('ready');
    return;
  }

  recState.location = null;
  recState.error = locationResult.status === 'fulfilled'
    ? locationResult.value.message
    : 'Posizione non disponibile: uso solo gli orari.';
  computeRecommendations('timed');
}

function openVenueFromRecommendation(venue) {
  const search = document.querySelector('#search');
  if (!search) return;

  const previousSearch = search.value;
  const previousTime = document.querySelector('#timeRail [data-time-key].is-active')?.dataset.timeKey || 'all';
  const allTime = document.querySelector('#timeRail [data-time-key="all"]');
  allTime?.click();

  search.value = venue;
  search.dispatchEvent(new Event('input', { bubbles: true }));

  requestAnimationFrame(() => {
    const target = [...document.querySelectorAll('[data-open-venue]')]
      .find(button => button.dataset.openVenue === venue);
    target?.click();

    search.value = previousSearch;
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const previousButton = document.querySelector(`#timeRail [data-time-key="${CSS.escape(previousTime)}"]`);
    previousButton?.click();
  });
}

function bindPanel() {
  const panel = recEls.browserContent?.querySelector('#recommendPanel');
  if (!panel) return;
  panel.querySelectorAll('[data-get-recommendations]').forEach(button => {
    button.addEventListener('click', requestRecommendations);
  });
  panel.querySelector('[data-refresh-recommendations]')?.addEventListener('click', () => {
    if (recState.location) computeRecommendations('ready');
    else requestRecommendations();
  });
  panel.querySelectorAll('[data-recommend-venue]').forEach(button => {
    button.addEventListener('click', () => openVenueFromRecommendation(button.dataset.recommendVenue));
  });
}

function injectTrigger() {
  if (!recEls.browserHeader || document.querySelector('#recommendTrigger')) return;
  const button = document.createElement('button');
  button.id = 'recommendTrigger';
  button.className = 'recommend-trigger';
  button.type = 'button';
  button.innerHTML = '<span aria-hidden="true">⌖</span><span>Vicino a me</span>';
  button.addEventListener('click', () => {
    if (document.body.dataset.tab !== 'tonight') return;
    if (recState.status === 'idle' || !recState.location) requestRecommendations();
    else {
      renderPanel();
      recEls.browserContent?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  recEls.browserHeader.append(button);
  updateTrigger();
}

function setupObservers() {
  const contentObserver = new MutationObserver(() => {
    if (document.body.dataset.tab === 'tonight' && !recEls.browserContent?.querySelector('#recommendPanel')) {
      queueMicrotask(renderPanel);
    }
  });
  if (recEls.browserContent) contentObserver.observe(recEls.browserContent, { childList: true });

  const tabObserver = new MutationObserver(() => {
    updateTrigger();
    if (document.body.dataset.tab === 'tonight') queueMicrotask(renderPanel);
  });
  tabObserver.observe(document.body, { attributes: true, attributeFilter: ['data-tab'] });

  document.addEventListener('click', event => {
    if (event.target.closest('#timeRail [data-time-key]') && recState.status !== 'idle') {
      setTimeout(() => computeRecommendations(recState.location ? 'ready' : 'timed'), 0);
    }
  });
}

function initRecommendations() {
  injectTrigger();
  renderPanel();
  setupObservers();
}

initRecommendations();
