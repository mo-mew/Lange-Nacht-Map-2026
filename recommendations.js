const RECOMMEND_DATA_URL = 'data/events.json';
const RECOMMEND_EVENT_DATE = '2026-09-05';
const RECOMMEND_NIGHT_START = 18 * 60;
const RECOMMEND_NIGHT_END = 26 * 60;
const RECOMMEND_HORIZON = 150;
const RECOMMEND_LIMIT = 5;

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

function recEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function recTitle(event) {
  return event.titleIt || event.title || '';
}

function recDescription(event) {
  return event.descriptionIt || event.description || '';
}

function recCategory(event) {
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
  let hour = Number(parts.hour);
  const minute = Number(parts.minute);

  if (date === RECOMMEND_EVENT_DATE && hour >= 18) return hour * 60 + minute;
  if (date === '2026-09-06' && hour < 2) return (hour + 24) * 60 + minute;
  return null;
}

function recommendationMinute() {
  const active = document.querySelector('#timeRail [data-time-key].is-active');
  if (active && !['all', 'now'].includes(active.dataset.timeKey)) {
    return Number(active.dataset.from);
  }
  return zurichMinuteNow() ?? RECOMMEND_NIGHT_START;
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
  // Straight-line distance converted into a conservative city walking estimate.
  return Math.max(1, Math.ceil(distanceKm * 14.5));
}

function distanceLabel(distanceKm) {
  if (distanceKm < 1) return `${Math.max(50, Math.round(distanceKm * 1000 / 50) * 50)} m`;
  return `${distanceKm.toFixed(distanceKm < 2 ? 1 : 0)} km`;
}

function currentCategoryFilter() {
  return document.querySelector('#categoryOptions input[name="category"]:checked')?.value || '';
}

function buildCandidates() {
  if (!recState.data) return [];
  const now = recommendationMinute();
  const category = currentCategoryFilter();
  const venueMap = new Map(recState.data.venues.map(venue => [venue.name, venue]));

  return recState.data.events
    .filter(event => {
      if (!Number.isFinite(event.startMinute)) return false;
      const end = Number.isFinite(event.endMinute) ? event.endMinute : event.startMinute + 45;
      if (end < now + 10) return false;
      if (event.startMinute > now + RECOMMEND_HORIZON) return false;
      if (category && event.category !== category) return false;
      if (recState.location) {
        const venue = venueMap.get(event.venue);
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
      const venue = venueMap.get(event.venue);
      let distanceKm = null;
      let walking = null;

      if (recState.location && venue) {
        distanceKm = haversineKm(recState.location, { lat: venue.lat, lng: venue.lng });
        walking = walkMinutes(distanceKm);

        if (ongoing && remaining < walking + 12) return null;
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
  const venues = new Set();

  for (const candidate of candidates) {
    if (venues.has(candidate.event.venue)) continue;
    chosen.push(candidate);
    venues.add(candidate.event.venue);
    if (chosen.length === RECOMMEND_LIMIT) return chosen;
  }

  for (const candidate of candidates) {
    if (chosen.includes(candidate)) continue;
    chosen.push(candidate);
    if (chosen.length === RECOMMEND_LIMIT) break;
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

function recommendationCardHtml(item, index) {
  const event = item.event;
  const description = recDescription(event);
  const category = recCategory(event);
  return `
    <button class="recommend-card" type="button" data-recommend-venue="${recEscape(event.venue)}">
      <span class="recommend-rank">${index + 1}</span>
      <span class="recommend-card-body">
        <span class="recommend-meta">
          <strong>${recEscape(timingLabel(item))}</strong>
          <span>${recEscape(minuteLabel(item.start))}</span>
        </span>
        <span class="recommend-title">${recEscape(recTitle(event))}</span>
        <span class="recommend-venue">${recEscape(event.venue)}</span>
        ${description ? `<span class="recommend-description">${recEscape(description)}</span>` : ''}
        <span class="recommend-facts">
          ${travelLabel(item) ? `<span>${recEscape(travelLabel(item))}</span>` : ''}
          ${category ? `<span>${recEscape(category)}</span>` : ''}
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
          <p>Trova eventi raggiungibili nelle prossime due ore, ordinati per distanza e orario.</p>
        </div>
      </div>
      <button class="recommend-primary" type="button" data-get-recommendations>Consigliami</button>
      <small>La posizione resta sul tuo dispositivo e non viene salvata.</small>
    </section>
  `;
}

function loadingPanelHtml() {
  return `
    <section id="recommendPanel" class="recommend-panel" aria-live="polite">
      <div class="recommend-loading">
        <span class="recommend-spinner" aria-hidden="true"></span>
        <div><strong>Cerco cosa puoi raggiungere adesso…</strong><small>Incrocio posizione, orari e tempi a piedi.</small></div>
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
          <h2>${recEscape(heading)}</h2>
          <p>${recEscape(subtitle)}</p>
        </div>
        <button class="recommend-refresh" type="button" data-refresh-recommendations aria-label="Aggiorna consigli">↻</button>
      </div>
      ${recState.error ? `<div class="recommend-notice">${recEscape(recState.error)}</div>` : ''}
      <div class="recommend-list">
        ${recState.recommendations.map(recommendationCardHtml).join('') || '<div class="recommend-empty">Prova un’altra fascia oraria oppure mostra tutti i tipi di evento.</div>'}
      </div>
      ${!hasLocation ? '<button class="recommend-location-retry" type="button" data-get-recommendations>Usa la mia posizione</button>' : ''}
    </section>
  `;
}

function renderRecommendationPanel() {
  if (!recEls.browserContent || document.body.dataset.tab !== 'tonight') return;
  recEls.browserContent.querySelector('#recommendPanel')?.remove();

  let html = idlePanelHtml();
  if (recState.status === 'loading') html = loadingPanelHtml();
  if (['ready', 'timed', 'error'].includes(recState.status)) html = resultsPanelHtml();

  recEls.browserContent.insertAdjacentHTML('afterbegin', html);
  bindRecommendationPanel();
}

function bindRecommendationPanel() {
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

function openVenueFromRecommendation(venue) {
  const search = document.querySelector('#search');
  if (!search) return;
  const previous = search.value;
  search.value = venue;
  search.dispatchEvent(new Event('input', { bubbles: true }));

  requestAnimationFrame(() => {
    const target = [...document.querySelectorAll('[data-open-venue]')]
      .find(button => button.dataset.openVenue === venue);
    target?.click();
    search.value = previous;
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function computeRecommendations(status = recState.location ? 'ready' : 'timed') {
  recState.status = status;
  recState.recommendations = chooseRecommendations(buildCandidates());
  renderRecommendationPanel();
  updateTrigger();
}

async function ensureData() {
  if (recState.data) return recState.data;
  const response = await fetch(RECOMMEND_DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  recState.data = await response.json();
  return recState.data;
}

async function requestRecommendations() {
  recState.status = 'loading';
  recState.error = '';
  renderRecommendationPanel();
  updateTrigger();

  try {
    await ensureData();
  } catch {
    recState.status = 'error';
    recState.error = 'Non riesco a caricare il programma.';
    recState.recommendations = [];
    renderRecommendationPanel();
    updateTrigger();
    return;
  }

  if (!navigator.geolocation) {
    recState.location = null;
    recState.error = 'Il browser non supporta la posizione: uso solo gli orari.';
    computeRecommendations('timed');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      recState.location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      recState.error = '';
      computeRecommendations('ready');
    },
    error => {
      recState.location = null;
      recState.error = error.code === 1
        ? 'Posizione non autorizzata: per ora ordino le proposte solo per orario.'
        : 'Posizione non disponibile: per ora ordino le proposte solo per orario.';
      computeRecommendations('timed');
    },
    { enableHighAccuracy: true, timeout: 6500, maximumAge: 120000 }
  );
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
    if (recState.status === 'idle') requestRecommendations();
    else {
      renderRecommendationPanel();
      recEls.browserContent?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  recEls.browserHeader.append(button);
  updateTrigger();
}

function updateTrigger() {
  const button = document.querySelector('#recommendTrigger');
  if (!button) return;
  button.hidden = document.body.dataset.tab !== 'tonight';
  button.classList.toggle('is-active', recState.status === 'ready');
  const label = button.querySelector('span:last-child');
  if (label) label.textContent = recState.status === 'ready' ? 'Vicino a te' : 'Vicino a me';
}

function setupObservers() {
  const contentObserver = new MutationObserver(() => {
    if (document.body.dataset.tab === 'tonight' && !recEls.browserContent.querySelector('#recommendPanel')) {
      queueMicrotask(renderRecommendationPanel);
    }
  });
  if (recEls.browserContent) contentObserver.observe(recEls.browserContent, { childList: true });

  const tabObserver = new MutationObserver(() => {
    updateTrigger();
    if (document.body.dataset.tab === 'tonight') queueMicrotask(renderRecommendationPanel);
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
  renderRecommendationPanel();
  setupObservers();
}

initRecommendations();
