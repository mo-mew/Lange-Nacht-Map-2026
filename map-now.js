const MAP_NOW_DATA_URL = 'data/events.json';
const MAP_NOW_EVENT_DATE = '2026-09-05';
const MAP_NOW_LOOKAHEAD = 20;

const mapNowState = {
  map: null,
  data: null,
  active: true,
  userLocation: null,
  nowLayer: null,
  userLayer: null,
  control: null,
  fitted: false,
  requestId: 0
};

function mapNowEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function mapNowTitle(event) {
  return event.titleIt || event.title || '';
}

function mapNowDescription(event) {
  return event.descriptionIt || event.description || '';
}

function zurichNightMinuteNow() {
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
  if (date === MAP_NOW_EVENT_DATE && hour >= 18) return hour * 60 + minute;
  if (date === '2026-09-06' && hour < 2) return (hour + 24) * 60 + minute;
  return null;
}

function minuteText(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function loadMapNowData() {
  if (mapNowState.data) return mapNowState.data;
  const response = await fetch(MAP_NOW_DATA_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  mapNowState.data = await response.json();
  return mapNowState.data;
}

function currentCandidates() {
  if (!mapNowState.data) return [];
  const now = zurichNightMinuteNow();
  if (now == null) return [];

  const venueMap = new Map(mapNowState.data.venues.map(venue => [venue.name, venue]));
  return mapNowState.data.events
    .filter(event => Number.isFinite(event.startMinute))
    .map(event => {
      const start = event.startMinute;
      const end = Number.isFinite(event.endMinute) ? event.endMinute : start + 45;
      const ongoing = start <= now && end >= now;
      const startsSoon = start > now && start <= now + MAP_NOW_LOOKAHEAD;
      if (!ongoing && !startsSoon) return null;
      const venue = venueMap.get(event.venue);
      if (!venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lng)) return null;
      return {
        event,
        venue,
        ongoing,
        startsIn: Math.max(0, start - now),
        remaining: Math.max(0, end - now)
      };
    })
    .filter(Boolean);
}

function groupedCurrentOptions() {
  const groups = new Map();
  for (const item of currentCandidates()) {
    if (!groups.has(item.event.venue)) groups.set(item.event.venue, []);
    groups.get(item.event.venue).push(item);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({ name, items, venue: items[0].venue }))
    .sort((a, b) => {
      const aOngoing = a.items.some(item => item.ongoing) ? 0 : 1;
      const bOngoing = b.items.some(item => item.ongoing) ? 0 : 1;
      const aStart = Math.min(...a.items.map(item => item.event.startMinute));
      const bStart = Math.min(...b.items.map(item => item.event.startMinute));
      return aOngoing - bOngoing || aStart - bStart;
    });
}

function nowMarkerIcon(items) {
  const ongoing = items.filter(item => item.ongoing).length;
  const count = items.length;
  const label = ongoing ? String(ongoing) : `+${Math.min(...items.map(item => item.startsIn))}`;
  return L.divIcon({
    className: '',
    html: `<div class="now-marker-badge${ongoing ? ' is-live' : ' is-soon'}"><span>${mapNowEscape(label)}</span></div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23]
  });
}

function timingText(item) {
  if (item.ongoing) return item.remaining > 0 ? `In corso · ancora ${item.remaining} min` : 'In corso';
  return item.startsIn <= 1 ? 'Inizia ora' : `Tra ${item.startsIn} min`;
}

function renderNowCard(group) {
  const card = document.querySelector('#mapCard');
  if (!card) return;
  const ordered = [...group.items].sort((a, b) => {
    if (a.ongoing !== b.ongoing) return a.ongoing ? -1 : 1;
    return a.event.startMinute - b.event.startMinute;
  });
  const previews = ordered.slice(0, 3);
  card.innerHTML = `
    <div class="map-card-head">
      <div>
        <div class="map-now-kicker">DISPONIBILE ORA</div>
        <h2>${mapNowEscape(group.name)}</h2>
        <div class="map-meta">${ordered.length} ${ordered.length === 1 ? 'opzione' : 'opzioni'} ora o entro ${MAP_NOW_LOOKAHEAD} min</div>
      </div>
      <button class="icon-button" type="button" data-close-map-now-card aria-label="Chiudi">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>
      </button>
    </div>
    <div class="map-preview-list">
      ${previews.map(item => `
        <div class="map-preview map-now-preview">
          <time>${mapNowEscape(minuteText(item.event.startMinute))}</time>
          <span class="map-preview-copy">
            <strong>${mapNowEscape(mapNowTitle(item.event))}</strong>
            <small class="map-now-status">${mapNowEscape(timingText(item))}</small>
            ${mapNowDescription(item.event) ? `<small class="event-description">${mapNowEscape(mapNowDescription(item.event))}</small>` : ''}
          </span>
        </div>
      `).join('')}
    </div>
    <button class="agenda-button" type="button" data-open-map-now-venue="${mapNowEscape(group.name)}">Vedi agenda</button>
  `;
  card.hidden = false;
  card.querySelector('[data-close-map-now-card]')?.addEventListener('click', () => { card.hidden = true; });
  card.querySelector('[data-open-map-now-venue]')?.addEventListener('click', buttonEvent => {
    openVenueFromMapNow(buttonEvent.currentTarget.dataset.openMapNowVenue);
  });
}

function openVenueFromMapNow(venue) {
  const tonightTab = document.querySelector('[data-tab-target="tonight"]');
  tonightTab?.click();
  const allButton = document.querySelector('#timeRail [data-time-key="all"]');
  allButton?.click();
  const search = document.querySelector('#search');
  if (!search) return;
  search.value = venue;
  search.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => {
    const target = [...document.querySelectorAll('[data-open-venue]')]
      .find(button => button.dataset.openVenue === venue);
    target?.click();
  });
}

function ensureMapLayers() {
  const map = mapNowState.map;
  if (!map || !window.L) return;
  if (!map.getPane('nowPane')) {
    map.createPane('nowPane');
    map.getPane('nowPane').style.zIndex = '650';
  }
  if (!map.getPane('userPane')) {
    map.createPane('userPane');
    map.getPane('userPane').style.zIndex = '720';
    map.getPane('userPane').style.pointerEvents = 'none';
  }
  if (!mapNowState.nowLayer) mapNowState.nowLayer = L.layerGroup().addTo(map);
  if (!mapNowState.userLayer) mapNowState.userLayer = L.layerGroup().addTo(map);
}

function renderUserLocation() {
  if (!mapNowState.map || !mapNowState.userLayer) return;
  mapNowState.userLayer.clearLayers();
  const location = mapNowState.userLocation;
  if (!location) return;
  const point = [location.lat, location.lng];
  if (Number.isFinite(location.accuracy) && location.accuracy > 0) {
    L.circle(point, {
      pane: 'userPane',
      radius: Math.min(location.accuracy, 500),
      className: 'user-accuracy-circle',
      interactive: false
    }).addTo(mapNowState.userLayer);
  }
  L.marker(point, {
    pane: 'userPane',
    interactive: false,
    icon: L.divIcon({
      className: '',
      html: '<div class="user-location-dot"><span></span></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
  }).addTo(mapNowState.userLayer);
}

function updateNowControl(count) {
  const button = document.querySelector('[data-map-now-toggle]');
  if (!button) return;
  button.classList.toggle('is-active', mapNowState.active);
  button.setAttribute('aria-pressed', String(mapNowState.active));
  button.querySelector('[data-map-now-count]').textContent = String(count);
}

function renderNowLayer({ fit = false } = {}) {
  if (!mapNowState.map || !mapNowState.nowLayer) return;
  mapNowState.nowLayer.clearLayers();
  const groups = groupedCurrentOptions();
  document.body.classList.toggle('map-now-active', mapNowState.active);
  updateNowControl(groups.length);

  if (!mapNowState.active) return;
  const bounds = [];
  for (const group of groups) {
    const marker = L.marker([group.venue.lat, group.venue.lng], {
      pane: 'nowPane',
      icon: nowMarkerIcon(group.items),
      title: group.name,
      zIndexOffset: 400
    });
    marker.on('click', () => renderNowCard(group));
    marker.addTo(mapNowState.nowLayer);
    bounds.push([group.venue.lat, group.venue.lng]);
  }

  if (mapNowState.userLocation) bounds.push([mapNowState.userLocation.lat, mapNowState.userLocation.lng]);
  if (fit && bounds.length) {
    mapNowState.map.fitBounds(bounds, {
      paddingTopLeft: [42, 86],
      paddingBottomRight: [42, 110],
      maxZoom: 15
    });
  }
}

function installControl() {
  if (!mapNowState.map || mapNowState.control) return;
  const NowControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'map-now-control leaflet-bar');
      wrap.innerHTML = `
        <button type="button" data-map-now-toggle aria-pressed="true">
          <span class="map-now-live-dot" aria-hidden="true"></span>
          <span>Ora</span>
          <b data-map-now-count>0</b>
        </button>`;
      L.DomEvent.disableClickPropagation(wrap);
      wrap.querySelector('button').addEventListener('click', () => {
        mapNowState.active = !mapNowState.active;
        document.querySelector('#mapCard')?.setAttribute('hidden', '');
        renderNowLayer({ fit: mapNowState.active });
      });
      return wrap;
    }
  });
  mapNowState.control = new NowControl().addTo(mapNowState.map);
}

function acquireMapLocation() {
  const requestId = ++mapNowState.requestId;
  if (!window.isSecureContext || !navigator.geolocation) return;

  let settled = false;
  let watchId = null;
  const finish = position => {
    if (settled || requestId !== mapNowState.requestId) return;
    settled = true;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    mapNowState.userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    renderUserLocation();
    if (document.body.dataset.tab === 'map') renderNowLayer({ fit: !mapNowState.fitted });
    mapNowState.fitted = true;
  };
  const ignore = () => {};

  navigator.geolocation.getCurrentPosition(finish, ignore, {
    enableHighAccuracy: false,
    timeout: 7000,
    maximumAge: 300000
  });
  watchId = navigator.geolocation.watchPosition(finish, ignore, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  });
  setTimeout(() => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  }, 16000);
}

async function initializeMapNow(map) {
  if (!map || mapNowState.map) return;
  mapNowState.map = map;
  ensureMapLayers();
  installControl();
  try {
    await loadMapNowData();
    renderNowLayer();
  } catch {
    updateNowControl(0);
  }
  acquireMapLocation();

  const tabObserver = new MutationObserver(() => {
    if (document.body.dataset.tab !== 'map') return;
    requestAnimationFrame(() => {
      mapNowState.map.invalidateSize();
      renderNowLayer({ fit: !mapNowState.fitted });
      mapNowState.fitted = true;
      acquireMapLocation();
    });
  });
  tabObserver.observe(document.body, { attributes: true, attributeFilter: ['data-tab'] });

  setInterval(() => {
    if (document.body.dataset.tab === 'map') renderNowLayer();
  }, 60000);
}

if (window.__langeMap) initializeMapNow(window.__langeMap);
else window.addEventListener('lange-map-ready', event => initializeMapNow(event.detail?.map), { once: true });
