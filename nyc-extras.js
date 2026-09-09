// Route details, photos and weather read the same itinerary as the map.
// This module never wraps fetch, modifies geolocation, or reads visitor coordinates.
const DATA_URL = 'data/nyc-itinerary.json';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=40.758&longitude=-73.9855&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&past_days=2&forecast_days=16';
const REFRESH_MS = 30 * 60 * 1000;
let itinerary = null;
const liveWeather = new Map();
let lastAttempt = 0;
let weatherBusy = false;
let weatherFailed = false;
let scheduled = false;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '#'; } catch { return '#'; } };
const mapsLink = query => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
const activeDate = () => document.querySelector('#dayRail .day-chip.is-active')?.dataset.date;
const dayFor = date => itinerary?.days.find(day => day.date === date);
const commonsPage = file => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
const commonsImage = file => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=960`;

function conditionFor(code) {
  if (code === 0) return ['sun', 'Sereno'];
  if (code === 1 || code === 2) return ['partly', code === 1 ? 'Perlopiù sereno' : 'Parzialmente nuvoloso'];
  if (code === 3) return ['cloud', 'Nuvoloso'];
  if ([45,48].includes(code)) return ['fog', 'Nebbia'];
  if ([51,53,55,56,57].includes(code)) return ['rain', 'Pioviggine'];
  if ([61,63,65,66,67,80,81,82].includes(code)) return ['rain', 'Pioggia'];
  if ([71,73,75,77,85,86].includes(code)) return ['snow', 'Neve'];
  if ([95,96,99].includes(code)) return ['storm', 'Temporali'];
  return ['unknown', 'Condizione non disponibile'];
}

function weatherIcon(kind, label) {
  const shapes = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
    partly: '<circle cx="8" cy="8" r="3"/><path d="M8 2V1M2 8H1M3 3l-1-1M5 18h12a3 3 0 0 0 0-6 5 5 0 0 0-9-2 4 4 0 0 0-3 8Z"/>',
    cloud: '<path d="M5 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0-1 10Z"/>',
    rain: '<path d="M5 14h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0-1 10ZM8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    storm: '<path d="M5 13h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0-1 10Zm8 2-3 4h3l-1 3 5-6h-4"/>',
    snow: '<path d="M5 13h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0-1 10ZM8 17h.01M12 20h.01M16 17h.01"/>',
    fog: '<path d="M4 8h16M2 12h17M5 16h16"/>',
    unknown: '<circle cx="12" cy="12" r="8"/><path d="M9 9a3 3 0 1 1 4 3l-1 1M12 17h.01"/>'
  };
  return `<svg viewBox="0 0 24 24" role="img" aria-label="${escapeHtml(label)}">${shapes[kind] || shapes.unknown}</svg>`;
}

function weatherFor(date) {
  const live = liveWeather.get(date);
  const saved = dayFor(date)?.weather;
  if (!live && !saved) return null;
  const value = live || saved;
  const [kind, condition] = conditionFor(value.code);
  return {...value, kind, label: live ? condition : (saved.summary || condition), live: Boolean(live), updatedAt: value.updatedAt || itinerary.weatherUpdated};
}
const temperature = value => Number.isFinite(value) ? `${Math.round(value)}°` : '—';
function updatedLabel(weather) {
  const date = new Date(weather.updatedAt);
  const formatted = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('it-IT', {timeZone:'America/New_York',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date) : 'data non disponibile';
  const stale = weather.live && Date.now() - date.getTime() > REFRESH_MS * 2;
  return `${weather.live ? (weatherFailed || stale ? 'Ultimo dato ricevuto' : 'Dati ricevuti') : 'Previsione salvata'} ${formatted} · NYC${weatherFailed ? ' · aggiornamento non riuscito' : ''}`;
}

function renderGallery(day) {
  const hero = document.querySelector('.day-detail .day-hero');
  if (!hero || document.querySelector('.nyc-gallery') || !day.gallery?.length) return;
  const section = document.createElement('section');
  section.className = 'detail-section nyc-gallery';
  section.innerHTML = `<div class="section-title"><h2>Il percorso in immagini</h2><span>${day.gallery.length} foto</span></div>
    <div class="nyc-carousel" tabindex="0" aria-label="Foto del percorso, scorri orizzontalmente">${day.gallery.map(item => `
      <figure class="nyc-carousel-card"><img src="${commonsImage(item.file)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async"/>
      <figcaption><strong>${escapeHtml(item.title)}</strong><a href="${commonsPage(item.file)}" target="_blank" rel="noreferrer">${escapeHtml(item.credit || 'Wikimedia Commons')}<br>${escapeHtml(item.license || 'Fonte e licenza')} ↗</a></figcaption></figure>`).join('')}</div>`;
  hero.insertAdjacentElement('afterend', section);
  section.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
    image.hidden = true;
    const notice = document.createElement('p');
    notice.textContent = 'Foto non disponibile. Apri la fonte.';
    image.insertAdjacentElement('afterend', notice);
  }, {once:true}));
}

function directionsUrl(day, leg, mode = leg.mode) {
  const a = day.stops[leg.fromStop], b = day.stops[leg.toStop];
  if (!a || !b || !['walking','transit','driving'].includes(mode)) return '#';
  return `https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',origin:a.mapsQuery,destination:b.mapsQuery,travelmode:mode})}`;
}

function renderPlanDetails(day) {
  const timeline = document.querySelector('.timeline-section');
  if (!timeline || document.querySelector('[data-plan-details]')) return;
  const section = document.createElement('section');
  section.className = 'detail-section';
  section.dataset.planDetails = day.date;
  section.innerHTML = `<details><summary><strong>Spostamenti, senza sorprese</strong></summary>
    <p>Tempi indicativi, non dati di traffico in tempo reale. La linea sulla mappa collega le tappe: non è un percorso stradale.</p>
    ${(day.legs || []).map(leg => `<article class="pause-card"><strong>${escapeHtml(day.stops[leg.fromStop].name)} → ${escapeHtml(day.stops[leg.toStop].name)}</strong>
    <p>${escapeHtml(leg.estimate)}</p><div class="stop-actions"><a href="${escapeHtml(directionsUrl(day,leg))}" target="_blank" rel="noreferrer">${leg.mode === 'walking' ? 'A piedi' : 'Con i mezzi'} · Google Maps ↗</a>
    ${leg.walkingAlternative ? `<a href="${escapeHtml(directionsUrl(day,leg,'walking'))}" target="_blank" rel="noreferrer">Alternativa a piedi ↗</a>` : ''}
    ${leg.sourceUrl ? `<a href="${escapeHtml(safeUrl(leg.sourceUrl))}" target="_blank" rel="noreferrer">Orari ufficiali ↗</a>` : ''}</div></article>`).join('')}
    ${day.sources?.length ? `<p>Controlla gli avvisi e i biglietti sui siti ufficiali:</p><div class="stop-actions">${day.sources.map(url => `<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noreferrer">${escapeHtml(new URL(url).hostname.replace(/^www\./,''))} ↗</a>`).join('')}</div>` : ''}</details>
    ${day.alternatives?.length ? `<h2>Alternative, non tappe extra</h2><p>Non sono incluse nella numerazione né nel percorso principale.</p>${day.alternatives.map(item => `<article class="pause-card"><small>${escapeHtml(item.kind)}</small><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p><div class="stop-actions"><a href="${escapeHtml(mapsLink(item.mapsQuery))}" target="_blank" rel="noreferrer">Google Maps ↗</a>${item.sourceUrl ? `<a href="${escapeHtml(safeUrl(item.sourceUrl))}" target="_blank" rel="noreferrer">Sito ufficiale ↗</a>` : ''}</div></article>`).join('')}` : ''}`;
  timeline.insertAdjacentElement('afterend', section);
}

function renderWeather(day) {
  const card = document.querySelector('.day-detail .weather-card');
  const weather = weatherFor(day.date);
  if (!card || !weather) return;
  card.classList.add('nyc-live-weather');
  const html = `<div class="nyc-weather-icon">${weatherIcon(weather.kind,weather.label)}</div><div class="nyc-weather-copy">
    <div class="nyc-weather-head"><strong>${escapeHtml(weather.label)}</strong><small>${escapeHtml(updatedLabel(weather))}</small></div>
    <div class="nyc-weather-temps"><span><b>${temperature(weather.high)}</b> max</span><span><b>${temperature(weather.low)}</b> min</span></div>
    <p>${escapeHtml(day.weather.impact)}</p><a class="nyc-weather-source" href="https://open-meteo.com/" target="_blank" rel="noreferrer">${weather.live ? 'Dati: Open-Meteo' : 'Aggiornamenti automatici: Open-Meteo'} ↗</a>
    <button type="button" class="text-button" data-refresh-weather ${weatherBusy ? 'disabled' : ''}>${weatherBusy ? 'Aggiornamento…' : 'Aggiorna meteo'}</button></div>`;
  if (card.innerHTML !== html) {
    card.innerHTML = html;
    card.querySelector('[data-refresh-weather]')?.addEventListener('click', () => refreshWeather(true));
  }
}

function renderSmallWeather() {
  for (const button of document.querySelectorAll('#dayRail .day-chip[data-date]')) {
    const weather = weatherFor(button.dataset.date);
    if (!weather) continue;
    let target = button.querySelector('.nyc-day-weather');
    if (!target) { target = document.createElement('span'); target.className = 'nyc-day-weather'; button.append(target); }
    target.innerHTML = `${weatherIcon(weather.kind,weather.label)}<span>${temperature(weather.high)}/${temperature(weather.low)}</span>`;
    target.title = updatedLabel(weather);
  }
  for (const card of document.querySelectorAll('.day-overview-card[data-open-day]')) {
    const weather = weatherFor(card.dataset.openDay), target = card.querySelector('.overview-weather');
    if (weather && target) {
      target.innerHTML = `${weatherIcon(weather.kind,weather.label)}<span>${temperature(weather.high)}/${temperature(weather.low)}</span>`;
      target.title = updatedLabel(weather);
    }
  }
  const note = document.querySelector('.weather-footnote');
  if (note) note.textContent = 'Meteo: aggiornamento all’apertura e ogni 30 minuti mentre la pagina è attiva. Le previsioni salvate sono datate separatamente.';
}

const observer = new MutationObserver(scheduleEnhance);
function observeContent() {
  for (const id of ['content','dayRail']) {
    const root = document.getElementById(id);
    if (root) observer.observe(root,{childList:true,subtree:true});
  }
}
function enhance() {
  scheduled = false;
  if (!itinerary) return;
  // Prevent our own DOM changes from scheduling another render indefinitely.
  observer.disconnect();
  try {
    const day = dayFor(activeDate());
    if (day) { renderGallery(day); renderWeather(day); renderPlanDetails(day); }
    renderSmallWeather();
  } finally { observeContent(); }
}
function scheduleEnhance() {
  if (!scheduled) { scheduled = true; requestAnimationFrame(enhance); }
}

async function refreshWeather(force = false) {
  if (weatherBusy || (!force && Date.now() - lastAttempt < REFRESH_MS)) return;
  weatherBusy = true; lastAttempt = Date.now(); scheduleEnhance();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(),12000);
  try {
    const response = await fetch(WEATHER_URL,{cache:'no-store',signal:controller.signal});
    if (!response.ok) throw new Error('Weather request failed');
    const {daily} = await response.json();
    if (!Array.isArray(daily?.time)) throw new Error('Missing daily forecast');
    let valid = 0;
    const updatedAt = new Date().toISOString();
    daily.time.forEach((date,index) => {
      const high = daily.temperature_2m_max?.[index], low = daily.temperature_2m_min?.[index], code = daily.weather_code?.[index];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(high) || !Number.isFinite(low) || high < low) return;
      liveWeather.set(date,{high,low,code,updatedAt}); valid++;
    });
    if (!valid) throw new Error('No valid forecast');
    weatherFailed = false;
  } catch { weatherFailed = true; }
  finally { clearTimeout(timeout); weatherBusy = false; scheduleEnhance(); }
}

async function init() {
  observeContent();
  try {
    const response = await fetch(DATA_URL,{cache:'no-store'});
    if (!response.ok) throw new Error('Itinerary unavailable');
    const value = await response.json();
    if (!Array.isArray(value.days)) throw new Error('Invalid itinerary');
    itinerary = value;
    scheduleEnhance();
    refreshWeather(true);
  } catch {
    // The base itinerary and GPS remain independent of these enhancements.
    observer.disconnect();
  }
}
setInterval(() => { if (!document.hidden) refreshWeather(); },REFRESH_MS);
document.addEventListener('visibilitychange',() => { if (!document.hidden) refreshWeather(); });
window.addEventListener('online',() => refreshWeather(true));
window.addEventListener('focus',() => refreshWeather());
init();
