import { routeShops, shopBadge, shoppingHtml } from './nyc-shopping.js';

const DATA_URL = 'data/nyc-itinerary.json';
const NYC_CENTER = [40.7580, -73.9855];
const MOBILE_QUERY = '(max-width: 760px)';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const mobileMedia = matchMedia(MOBILE_QUERY);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const els = {
  dayRail: $('#dayRail'),
  content: $('#content'),
  tripTitle: $('#tripTitle'),
  tripSubtitle: $('#tripSubtitle'),
  todayLabel: $('#todayLabel'),
  locationButton: $('#locationButton'),
  locationLabel: $('#locationLabel'),
  mapCard: $('#mapCard'),
  mapStatus: $('#mapStatus'),
  locateButton: $('#locateButton'),
  fitButton: $('#fitButton'),
  tabButtons: $$('[data-tab-target]')
};

const state = {
  data: null,
  showShoppingPins: true,
  shoppingRoute: null,
  selectedDate: null,
  tab: 'today',
  map: null,
  markerLayer: null,
  routeLayer: null,
  markerByKey: new Map(),
  selectedMarker: null,
  userMarker: null,
  accuracyCircle: null,
  userLocation: null,
  locationPermission: 'unknown',
  locationStatus: 'idle',
  watchId: null,
  hasCenteredOnUser: false
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function nycTodayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nycTimeLabel() {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date());
}

function mapsLink(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function currentDay() {
  return state.data?.days.find(day => day.date === state.selectedDate) || state.data?.days[0];
}

function chooseInitialDate() {
  const today = nycTodayISO();
  const exact = state.data.days.find(day => day.date === today);
  if (exact) return exact.date;
  const next = state.data.days.find(day => day.date > today);
  return next?.date || state.data.days.at(-1)?.date;
}

function dayNumberLabel(day) {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${day.date}T12:00:00Z`)).replace('.', '');
}

function renderDayRail() {
  const today = nycTodayISO();
  els.dayRail.innerHTML = state.data.days.map(day => `
    <button type="button" class="day-chip${day.date === state.selectedDate ? ' is-active' : ''}" data-date="${day.date}" aria-pressed="${day.date === state.selectedDate}">
      <small>${day.date === today ? 'Oggi' : escapeHtml(day.weekday.slice(0, 3))}</small>
      <strong>${escapeHtml(dayNumberLabel(day))}</strong>
    </button>
  `).join('');

  els.dayRail.querySelectorAll('[data-date]').forEach(button => {
    button.addEventListener('click', () => {
      state.selectedDate = button.dataset.date;
      renderDayRail();
      renderContent();
      renderMapDay({ fit: true });
      if (mobileMedia.matches && state.tab === 'days') setTab('today');
    });
  });
}

function weatherHtml(day) {
  return `
    <section class="weather-card">
      <div class="weather-temp"><strong>${day.weather.high}°</strong><span>${day.weather.low}°</span></div>
      <div><strong>${escapeHtml(day.weather.summary)}</strong><p>${escapeHtml(day.weather.impact)}</p></div>
    </section>
  `;
}

function vibeHtml(day) {
  return `<div class="vibe-row">${day.vibe.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`;
}

function stopCardHtml(stop, index) {
  const key = `${state.selectedDate}:${index}`;
  return `
    <article class="stop-card" data-stop-key="${key}">
      <div class="stop-index">${index + 1}</div>
      <div class="stop-time">${escapeHtml(stop.time)}</div>
      <div class="stop-copy">
        <h3>${escapeHtml(stop.name)}</h3>
        <p>${escapeHtml(stop.description)}</p>
        <div class="stop-actions">
          <button type="button" data-show-on-map="${key}">Mappa</button>
          <a href="${mapsLink(stop.mapsQuery)}" target="_blank" rel="noreferrer">Google Maps ↗</a>
        </div>
      </div>
    </article>
  `;
}

function restaurantsHtml(day) {
  return `
    <section class="detail-section">
      <div class="section-title"><h2>Mangiare</h2><span>${day.restaurants.length} opzioni</span></div>
      <div class="restaurant-list">
        ${day.restaurants.map(item => `
          <a class="restaurant-row" href="${mapsLink(item.mapsQuery)}" target="_blank" rel="noreferrer">
            <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small></span><b>↗</b>
          </a>
        `).join('')}
      </div>
    </section>
  `;
}

function dayDetailHtml(day) {
  const isToday = day.date === nycTodayISO();
  return `
    <div class="day-detail">
      <button type="button" class="shopping-shortcut" data-open-shopping><strong>Shopping, quando vuoi</strong><span>${day.date === state.data.shopping?.date ? '9 negozi tra SoHo e Lower East Side' : '13 negozi salvati · 2 percorsi'} <b>›</b></span></button>
      <header class="day-hero">
        <p>${escapeHtml(day.weekday)} ${escapeHtml(dayNumberLabel(day))}${isToday ? ' · OGGI' : ''}</p>
        <h1>${escapeHtml(day.title)}</h1>
        <div class="day-short">${escapeHtml(day.short)}</div>
        ${vibeHtml(day)}
      </header>

      ${weatherHtml(day)}

      <section class="logic-card">
        <strong>Logica della giornata</strong>
        <p>${escapeHtml(day.logic)}</p>
      </section>

      <section class="detail-section timeline-section">
        <div class="section-title"><h2>Itinerario</h2><a href="${day.routeUrl}" target="_blank" rel="noreferrer">Apri percorso ↗</a></div>
        <div class="timeline">${day.stops.map(stopCardHtml).join('')}</div>
      </section>

      <section class="pause-card"><strong>Pausa</strong><p>${escapeHtml(day.pause)}</p></section>
      ${restaurantsHtml(day)}
      <section class="note-card"><strong>Nota</strong><p>${escapeHtml(day.note)}</p></section>
    </div>
  `;
}

function allDaysHtml() {
  const today = nycTodayISO();
  return `
    <div class="days-overview">
      <div class="overview-intro"><p>${escapeHtml(state.data.note)}</p></div>
      ${state.data.days.map(day => `
        <button type="button" class="day-overview-card" data-open-day="${day.date}">
          <span class="overview-number">${day.number}</span>
          <span class="overview-copy">
            <small>${escapeHtml(day.weekday)} ${escapeHtml(dayNumberLabel(day))}${day.date === today ? ' · Oggi' : ''}</small>
            <strong>${escapeHtml(day.title)}</strong>
            <span>${escapeHtml(day.short)}</span>
          </span>
          <span class="overview-weather">${day.weather.high}°</span>
          <span class="overview-chevron">›</span>
        </button>
      `).join('')}
      <p class="weather-footnote">Meteo salvato nell’itinerario: aggiornato 8 settembre alle 07:57. Ricontrollalo ogni mattina.</p>
    </div>
  `;
}

function renderContent() {
  if (!state.data) return;
  if (state.tab === 'shopping') {
    els.content.innerHTML = shoppingHtml(state.data.shopping, state.shoppingRoute, state.showShoppingPins);
    els.content.querySelector('[data-shopping-pins]')?.addEventListener('change', event => setShoppingPins(event.target.checked));
    els.content.querySelectorAll('[data-shopping-route]').forEach(button => button.addEventListener('click', () => {
      setShoppingRoute(state.shoppingRoute === button.dataset.shoppingRoute ? null : button.dataset.shoppingRoute);
    }));
    els.content.querySelectorAll('[data-shop-focus]').forEach(button => button.addEventListener('click', () => {
      if (!state.showShoppingPins) setShoppingPins(true);
      focusStop(`shop:${button.dataset.shopFocus}`);
    }));
    return;
  }
  if (state.tab === 'days') {
    els.content.innerHTML = allDaysHtml();
    els.content.querySelectorAll('[data-open-day]').forEach(button => {
      button.addEventListener('click', () => {
        state.selectedDate = button.dataset.openDay;
        renderDayRail();
        setTab('today');
        renderMapDay({ fit: true });
      });
    });
    return;
  }

  els.content.innerHTML = dayDetailHtml(currentDay());
  els.content.querySelector('[data-open-shopping]')?.addEventListener('click', () => setTab('shopping'));
  els.content.querySelectorAll('[data-show-on-map]').forEach(button => {
    button.addEventListener('click', () => focusStop(button.dataset.showOnMap));
  });
}

function markerIcon(index) {
  return L.divIcon({
    className: '',
    html: `<div class="nyc-marker">${index + 1}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });
}

function selectedMarkerIcon(index) {
  return L.divIcon({
    className: '',
    html: `<div class="nyc-marker is-selected">${index + 1}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
}

function setupMap() {
  if (!window.L) {
    els.mapStatus.textContent = 'Mappa non disponibile.';
    return;
  }

  state.map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(NYC_CENTER, 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  state.routeLayer = L.layerGroup().addTo(state.map);
  state.map.on('click', () => closeMapCard());
}

function renderMapDay({ fit = false } = {}) {
  if (!state.map || !state.data) return;
  const day = currentDay();
  state.markerLayer.clearLayers();
  state.routeLayer.clearLayers();
  state.markerByKey.clear();
  state.selectedMarker = null;
  closeMapCard();

  const points = [];
  day.stops.forEach((stop, index) => {
    if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return;
    const key = `${day.date}:${index}`;
    const marker = L.marker([stop.lat, stop.lng], { icon: markerIcon(index), title: stop.name });
    marker.on('click', event => {
      L.DomEvent.stopPropagation(event);
      selectStopOnMap(key, stop, index);
    });
    marker.addTo(state.markerLayer);
    state.markerByKey.set(key, { marker, stop, index });
    points.push([stop.lat, stop.lng]);
  });

  if (points.length > 1) {
    L.polyline(points, { color: '#5f7600', weight: 3, opacity: 0.55, dashArray: '8 8' }).addTo(state.routeLayer);
  }

  renderShoppingMap();
  if (fit && points.length) fitDayAndUser();
}

function fitDayAndUser(dayPoints = null) {
  if (!state.map) return;
  const day = currentDay();
  const points = dayPoints || (state.shoppingRoute ? routeShops(state.data.shopping,state.shoppingRoute) : day.stops).filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)).map(stop => [stop.lat, stop.lng]);
  const boundsPoints = [...points];
  if (state.userLocation && distanceKm(state.userLocation, { lat: NYC_CENTER[0], lng: NYC_CENTER[1] }) < 80) {
    boundsPoints.push([state.userLocation.lat, state.userLocation.lng]);
  }
  if (!boundsPoints.length) return;
  if (boundsPoints.length === 1) state.map.setView(boundsPoints[0], 15);
  else state.map.fitBounds(boundsPoints, { padding: [42, 42], maxZoom: state.shoppingRoute ? 16 : 14 });
}

function mapCardHtml(stop, index) {
  return `
    <div class="map-card-head">
      <div><small>Tappa ${index + 1} · ${escapeHtml(stop.time)}</small><h2>${escapeHtml(stop.name)}</h2></div>
      <button type="button" data-close-map aria-label="Chiudi">×</button>
    </div>
    <p>${escapeHtml(stop.description)}</p>
    <div class="map-card-actions">
      <a href="${mapsLink(stop.mapsQuery)}" target="_blank" rel="noreferrer">Apri in Google Maps ↗</a>
    </div>
  `;
}

function selectStopOnMap(key, stop, index) {
  if (state.selectedMarker) {
    const previous = state.markerByKey.get(state.selectedMarker);
    if (previous) previous.marker.setIcon(iconForEntry(previous));
  }
  state.selectedMarker = key;
  const current = state.markerByKey.get(key);
  if (current) current.marker.setIcon(iconForEntry(current, true));
  els.mapCard.innerHTML = current?.shop ? shoppingMapCard(current) : mapCardHtml(stop, index);
  els.mapCard.hidden = false;
  els.mapCard.querySelector('[data-close-map]')?.addEventListener('click', closeMapCard);
}

function closeMapCard() {
  if (state.selectedMarker) {
    const previous = state.markerByKey.get(state.selectedMarker);
    if (previous) previous.marker.setIcon(iconForEntry(previous));
  }
  state.selectedMarker = null;
  els.mapCard.hidden = true;
}

function focusStop(key) {
  const target = state.markerByKey.get(key);
  if (!target || !state.map) return;
  if (mobileMedia.matches) setTab('map');
  requestAnimationFrame(() => {
    state.map.invalidateSize();
    state.map.setView(target.marker.getLatLng(), 16, { animate: !reducedMotion.matches });
    selectStopOnMap(key, target.stop, target.index);
  });
}

function iconForEntry(entry, selected = false) {
  if (!entry.shop) return selected ? selectedMarkerIcon(entry.index) : markerIcon(entry.index);
  return L.divIcon({className:'', html:`<div class="shopping-marker ${entry.stop.secondHand ? 'is-secondhand' : 'is-new'}${selected ? ' is-selected' : ''}">${entry.label}</div>`, iconSize:[40,40], iconAnchor:[20,20]});
}

function renderShoppingMap() {
  const shopping = state.data.shopping;
  if (!shopping) return;
  if (state.showShoppingPins) shopping.routes.forEach(route => {
    routeShops(shopping,route.id).forEach((shop,index) => {
      const key = `shop:${shop.id}`;
      const entry = {shop:true,stop:shop,index,label:`${route.prefix}${index+1}`};
      const marker = L.marker([shop.lat,shop.lng], {icon:iconForEntry(entry),title:`${entry.label} · ${shop.name} · ${shop.type}`,zIndexOffset:100});
      entry.marker = marker;
      marker.on('click', event => { L.DomEvent.stopPropagation(event); selectStopOnMap(key,shop,index); });
      marker.addTo(state.markerLayer);
      state.markerByKey.set(key,entry);
    });
  });
  if (state.shoppingRoute) {
    const points = routeShops(shopping,state.shoppingRoute).map(shop=>[shop.lat,shop.lng]);
    L.polyline(points,{color:'#8050b9',weight:4,opacity:0.8,dashArray:'4 9',interactive:false}).addTo(state.routeLayer);
  }
  $('#shoppingMapMode').value = !state.showShoppingPins ? 'hidden' : state.shoppingRoute || 'pins';
  els.fitButton.textContent = state.shoppingRoute ? 'Vedi shopping' : 'Vedi giornata';
  $('#shoppingMapNote').textContent = state.shoppingRoute ? 'Percorso shopping parallelo · linea indicativa' : 'Soste shopping opzionali';
}

function setShoppingPins(show) {
  state.showShoppingPins = show;
  if (!show) state.shoppingRoute = null;
  renderMapDay();
  if (state.tab === 'shopping') renderContent();
}

function setShoppingRoute(routeId) {
  state.shoppingRoute = routeId;
  state.showShoppingPins = true;
  renderMapDay({fit:true});
  if (state.tab === 'shopping') renderContent();
  if (mobileMedia.matches && routeId && state.map) setTab('map');
}

function shoppingMapCard(entry) {
  const shop = entry.stop;
  return `<div class="map-card-head"><div><small>Shopping ${entry.label} · sosta opzionale</small><h2>${escapeHtml(shop.name)}</h2></div><button type="button" data-close-map aria-label="Chiudi">×</button></div>
    ${shopBadge(shop)}<p>${escapeHtml(shop.address)}</p>
    <div class="map-card-actions"><a href="${mapsLink(shop.mapsQuery)}" target="_blank" rel="noreferrer">Negozio e orari su Google Maps ↗</a></div>`;
}

function userIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="user-location"><span></span></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function updateUserOnMap(location) {
  if (!state.map) return;
  const point = [location.lat, location.lng];
  if (!state.userMarker) {
    state.userMarker = L.marker(point, { icon: userIcon(), zIndexOffset: 1000, title: 'La mia posizione' }).addTo(state.map);
  } else {
    state.userMarker.setLatLng(point);
  }

  const radius = Math.min(Math.max(location.accuracy || 20, 8), 1500);
  if (!state.accuracyCircle) {
    state.accuracyCircle = L.circle(point, {
      radius,
      className: 'user-accuracy',
      interactive: false
    }).addTo(state.map);
  } else {
    state.accuracyCircle.setLatLng(point).setRadius(radius);
  }

  if (!state.hasCenteredOnUser && distanceKm(location, { lat: NYC_CENTER[0], lng: NYC_CENTER[1] }) < 80) {
    state.hasCenteredOnUser = true;
    fitDayAndUser();
  }
}

function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const R = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function readPermission() {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    state.locationPermission = status.state;
    status.addEventListener?.('change', () => {
      state.locationPermission = status.state;
      updateLocationUI();
      if (status.state === 'granted' && state.locationStatus === 'idle') startLocation();
    });
    return status.state;
  } catch {
    return 'unknown';
  }
}

function updateLocationUI(message = '') {
  let label = 'Posizione';
  if (state.locationStatus === 'locating') label = 'Cerco…';
  if (state.userLocation) label = `GPS ±${Math.round(state.userLocation.accuracy || 0)} m`;
  if (state.locationStatus === 'error') label = 'GPS non disponibile';
  els.locationLabel.textContent = label;
  els.mapStatus.textContent = message || (state.userLocation
    ? `Posizione attiva · ${nycTimeLabel()} New York`
    : state.locationPermission === 'denied'
      ? 'Posizione bloccata nelle impostazioni del browser.'
      : 'Tocca “La mia posizione” per mostrarti sulla mappa.');
  els.locationButton.classList.toggle('is-active', Boolean(state.userLocation));
  els.locateButton.classList.toggle('is-active', Boolean(state.userLocation));
}

function startLocation() {
  if (!window.isSecureContext) {
    state.locationStatus = 'error';
    updateLocationUI('La posizione richiede HTTPS.');
    return;
  }
  if (!navigator.geolocation) {
    state.locationStatus = 'error';
    updateLocationUI('Questo browser non espone la geolocalizzazione.');
    return;
  }
  if (state.watchId !== null) {
    centerOnUser();
    return;
  }

  state.locationStatus = 'locating';
  updateLocationUI('Richiesta GPS in corso…');

  const onSuccess = position => {
    state.locationStatus = 'ready';
    state.locationPermission = 'granted';
    state.userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp
    };
    updateUserOnMap(state.userLocation);
    updateLocationUI();
  };

  const onError = error => {
    if (error.code === 1) state.locationPermission = 'denied';
    state.locationStatus = 'error';
    const messages = {
      1: 'Accesso alla posizione negato dal browser.',
      2: 'Il dispositivo non riesce a determinare la posizione.',
      3: 'Il GPS sta impiegando troppo tempo. Riprova.'
    };
    updateLocationUI(messages[error.code] || 'Posizione non disponibile.');
  };

  navigator.geolocation.getCurrentPosition(onSuccess, onError, {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 300000
  });

  state.watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 0
  });
}

function centerOnUser() {
  if (!state.map) return;
  if (!state.userLocation) {
    startLocation();
    return;
  }
  state.map.setView([state.userLocation.lat, state.userLocation.lng], 16, { animate: !reducedMotion.matches });
}

function setTab(tab) {
  state.tab = tab;
  document.body.dataset.tab = tab;
  els.todayLabel.textContent = tab === 'shopping' ? 'Shopping' : tab === 'days' ? 'Tutti i giorni' : `${currentDay()?.weekday || ''} ${currentDay() ? dayNumberLabel(currentDay()) : ''}`;
  els.tabButtons.forEach(button => {
    const active = button.dataset.tabTarget === tab;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (tab !== 'map') renderContent();
  if (tab === 'map') requestAnimationFrame(() => state.map?.invalidateSize());
}

function bindStaticActions() {
  els.tabButtons.forEach(button => button.addEventListener('click', () => setTab(button.dataset.tabTarget)));
  els.locationButton.addEventListener('click', () => {
    startLocation();
    if (mobileMedia.matches) setTab('map');
  });
  els.locateButton.addEventListener('click', centerOnUser);
  $('#shoppingMapMode').addEventListener('change', event => {
    const value = event.target.value;
    if (value === 'hidden') setShoppingPins(false);
    else if (value === 'pins') { state.showShoppingPins = true; setShoppingRoute(null); }
    else setShoppingRoute(value);
  });
  els.fitButton.addEventListener('click', () => fitDayAndUser());
  mobileMedia.addEventListener?.('change', () => requestAnimationFrame(() => state.map?.invalidateSize()));
}

async function main() {
  setupMap();
  bindStaticActions();
  updateLocationUI();

  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.selectedDate = chooseInitialDate();

    els.tripTitle.textContent = state.data.title;
    els.tripSubtitle.textContent = state.data.subtitle;
    const selected = currentDay();
    els.todayLabel.textContent = selected ? `${selected.weekday} ${dayNumberLabel(selected)}` : '';

    renderDayRail();
    renderContent();
    renderMapDay({ fit: true });

    const permission = await readPermission();
    updateLocationUI();
    if (permission === 'granted') startLocation();
  } catch (error) {
    els.content.innerHTML = `<div class="fatal-error"><strong>Impossibile caricare l’itinerario</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

main();
