const ENH_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&forecast_days=16';
const ENH_COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const ENH_WEATHER_REFRESH_MS = 30 * 60 * 1000;

const ENH_GALLERY_QUERIES = {
  '2026-09-08': [
    'Bethesda Terrace Central Park New York',
    'Bow Bridge Central Park New York',
    'Metropolitan Museum of Art exterior New York'
  ],
  '2026-09-09': [
    'Museum of Modern Art New York exterior',
    'Rockefeller Center New York',
    'Grand Central Terminal exterior New York'
  ],
  '2026-09-10': [
    'SoHo cast iron New York',
    'Doyers Street Chinatown New York',
    'Tenement Museum New York exterior'
  ],
  '2026-09-11': [
    'Roosevelt Island Tramway New York',
    'Four Freedoms Park Roosevelt Island',
    'Noguchi Museum Queens'
  ],
  '2026-09-12': [
    'Brooklyn Bridge New York',
    'Washington Street DUMBO Brooklyn',
    'West Village New York streets'
  ],
  '2026-09-13': [
    'Whitney Museum New York exterior',
    'High Line New York',
    'Pioneer Works Red Hook Brooklyn'
  ]
};

const enhState = {
  weather: new Map(),
  weatherUpdatedAt: null,
  galleryCache: new Map(),
  itinerary: null,
  lastWeatherFetchAt: 0,
  observer: null,
  applying: false
};

function enhEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function enhStripHtml(value) {
  const node = document.createElement('div');
  node.innerHTML = String(value || '');
  return node.textContent?.trim() || '';
}

function enhCurrentDate() {
  return document.querySelector('#dayRail [data-date].is-active')?.dataset.date || null;
}

function enhWeatherInfo(code) {
  if (code === 0) return { key: 'sun', label: 'Sereno' };
  if ([1, 2].includes(code)) return { key: 'partly', label: code === 1 ? 'Perlopiù sereno' : 'Parzialmente nuvoloso' };
  if (code === 3) return { key: 'cloud', label: 'Nuvoloso' };
  if ([45, 48].includes(code)) return { key: 'fog', label: 'Nebbia' };
  if ([51, 53, 55, 56, 57].includes(code)) return { key: 'rain', label: 'Pioviggine' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { key: 'rain', label: 'Pioggia' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { key: 'snow', label: 'Neve' };
  if ([95, 96, 99].includes(code)) return { key: 'storm', label: 'Temporali' };
  return { key: 'partly', label: 'Variabile' };
}

function enhWeatherIcon(key, className = '') {
  const common = `class="enh-weather-svg ${className}" aria-hidden="true" viewBox="0 0 24 24"`;
  const icons = {
    sun: `<svg ${common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>`,
    partly: `<svg ${common}><circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1.3M3.8 4.5l.9.9M2.5 9h1.3M12.3 4.5l-.9.9"/><path d="M7.5 17.5h9a3.5 3.5 0 0 0 .4-6.98A5 5 0 0 0 7.5 12a2.75 2.75 0 0 0 0 5.5Z"/></svg>`,
    cloud: `<svg ${common}><path d="M6.5 18h10a4 4 0 0 0 .43-7.98A5.5 5.5 0 0 0 6.58 11.5 3.25 3.25 0 0 0 6.5 18Z"/></svg>`,
    rain: `<svg ${common}><path d="M6.5 15h10a4 4 0 0 0 .43-7.98A5.5 5.5 0 0 0 6.58 8.5 3.25 3.25 0 0 0 6.5 15Z"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/></svg>`,
    storm: `<svg ${common}><path d="M6.5 14h10a4 4 0 0 0 .43-7.98A5.5 5.5 0 0 0 6.58 7.5 3.25 3.25 0 0 0 6.5 14Z"/><path d="m12 15-2 3h2l-1 4 4-5h-2l1-2"/></svg>`,
    snow: `<svg ${common}><path d="M6.5 14h10a4 4 0 0 0 .43-7.98A5.5 5.5 0 0 0 6.58 7.5 3.25 3.25 0 0 0 6.5 14Z"/><path d="M8 18h.01M12 20h.01M16 18h.01"/></svg>`,
    fog: `<svg ${common}><path d="M6.5 13h10a4 4 0 0 0 .43-7.98A5.5 5.5 0 0 0 6.58 6.5 3.25 3.25 0 0 0 6.5 13Z"/><path d="M5 17h14M7 20h10"/></svg>`
  };
  return icons[key] || icons.partly;
}

function enhSavedWeatherFor(date) {
  const day = enhState.itinerary?.days?.find(item => item.date === date);
  if (!day?.weather) return null;
  return {
    date,
    code: Number.isFinite(day.weather.code) ? day.weather.code : 2,
    high: day.weather.high,
    low: day.weather.low,
    impact: day.weather.impact || day.weather.summary || ''
  };
}

function enhWeatherFor(date) {
  return enhState.weather.get(date) || enhSavedWeatherFor(date);
}

function enhWeatherTimestamp() {
  if (!enhState.weatherUpdatedAt) return 'previsione salvata';
  return `aggiornato ${new Intl.DateTimeFormat('it-IT', {
    timeZone: 'America/New_York', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(enhState.weatherUpdatedAt)}`;
}

async function enhLoadWeather(force = false) {
  const now = Date.now();
  if (!force && now - enhState.lastWeatherFetchAt < ENH_WEATHER_REFRESH_MS) return;
  enhState.lastWeatherFetchAt = now;

  try {
    const response = await fetch(ENH_WEATHER_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const daily = payload.daily || {};
    const dates = daily.time || [];
    const next = new Map();
    dates.forEach((date, index) => {
      next.set(date, {
        date,
        code: daily.weather_code?.[index],
        high: daily.temperature_2m_max?.[index],
        low: daily.temperature_2m_min?.[index],
        impact: enhSavedWeatherFor(date)?.impact || ''
      });
    });
    enhState.weather = next;
    enhState.weatherUpdatedAt = new Date();
  } catch (error) {
    console.warn('Live weather unavailable; using saved itinerary forecast.', error);
  }

  enhApplyWeatherEverywhere();
}

function enhApplyWeatherEverywhere() {
  document.querySelectorAll('#dayRail [data-date]').forEach(button => {
    const weather = enhWeatherFor(button.dataset.date);
    if (!weather || !Number.isFinite(weather.high) || !Number.isFinite(weather.low)) return;
    let chip = button.querySelector('.enh-day-weather');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'enh-day-weather';
      button.append(chip);
    }
    const info = enhWeatherInfo(weather.code);
    chip.innerHTML = `${enhWeatherIcon(info.key, 'is-small')}<span>${Math.round(weather.high)}°/${Math.round(weather.low)}°</span>`;
  });

  document.querySelectorAll('.day-overview-card[data-open-day]').forEach(card => {
    const weather = enhWeatherFor(card.dataset.openDay);
    const target = card.querySelector('.overview-weather');
    if (!weather || !target) return;
    const info = enhWeatherInfo(weather.code);
    target.innerHTML = `${enhWeatherIcon(info.key, 'is-small')}<span>${Math.round(weather.high)}°/${Math.round(weather.low)}°</span>`;
  });

  const date = enhCurrentDate();
  const card = document.querySelector('.day-detail .weather-card');
  const weather = date ? enhWeatherFor(date) : null;
  if (card && weather) {
    const info = enhWeatherInfo(weather.code);
    card.dataset.liveWeather = 'true';
    card.innerHTML = `
      <div class="enh-weather-icon">${enhWeatherIcon(info.key)}</div>
      <div class="enh-weather-copy">
        <div class="enh-weather-head">
          <div><strong>${enhEsc(info.label)}</strong><small>${enhEsc(enhWeatherTimestamp())} · New York</small></div>
          <div class="enh-weather-range"><span><b>${Math.round(weather.high)}°</b> max</span><span><b>${Math.round(weather.low)}°</b> min</span></div>
        </div>
        ${weather.impact ? `<p>${enhEsc(weather.impact)}</p>` : ''}
      </div>`;
  }
}

function enhCommonsUrl(params) {
  const url = new URL(ENH_COMMONS_API);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  return url.toString();
}

async function enhFindCommonsImage(query) {
  const url = enhCommonsUrl({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '1200'
  });
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Commons ${response.status}`);
  const payload = await response.json();
  const pages = Object.values(payload.query?.pages || {});
  const candidates = pages
    .map(page => ({ page, info: page.imageinfo?.[0] }))
    .filter(item => item.info?.thumburl && ['image/jpeg', 'image/png', 'image/webp'].includes(item.info.mime));
  const chosen = candidates[0];
  if (!chosen) return null;

  const metadata = chosen.info.extmetadata || {};
  const artist = enhStripHtml(metadata.Artist?.value) || 'Wikimedia Commons';
  const license = metadata.LicenseShortName?.value || 'licenza su Commons';
  const description = enhStripHtml(metadata.ImageDescription?.value) || query;
  return {
    src: chosen.info.thumburl,
    page: chosen.info.descriptionurl || `https://commons.wikimedia.org/?curid=${chosen.page.pageid}`,
    title: description.length > 90 ? query : description,
    artist: artist.length > 80 ? 'Wikimedia Commons' : artist,
    license
  };
}

async function enhGalleryFor(date) {
  if (enhState.galleryCache.has(date)) return enhState.galleryCache.get(date);
  const queries = ENH_GALLERY_QUERIES[date] || [];
  const promise = Promise.all(queries.map(async query => {
    try { return await enhFindCommonsImage(query); }
    catch (error) { console.warn('Image search failed', query, error); return null; }
  })).then(items => items.filter(Boolean));
  enhState.galleryCache.set(date, promise);
  return promise;
}

async function enhRenderGallery() {
  const detail = document.querySelector('.day-detail');
  const hero = detail?.querySelector('.day-hero');
  const date = enhCurrentDate();
  if (!detail || !hero || !date) return;

  detail.querySelector('.enh-route-carousel')?.remove();
  const queries = ENH_GALLERY_QUERIES[date];
  if (!queries?.length) return;

  const section = document.createElement('section');
  section.className = 'enh-route-carousel detail-section';
  section.dataset.date = date;
  section.innerHTML = `
    <div class="section-title"><h2>Atmosfera del percorso</h2><span>caricamento…</span></div>
    <div class="enh-carousel-skeleton" aria-hidden="true"><i></i><i></i><i></i></div>`;
  hero.insertAdjacentElement('afterend', section);

  const images = await enhGalleryFor(date);
  if (!section.isConnected || section.dataset.date !== enhCurrentDate()) return;
  if (!images.length) {
    section.remove();
    return;
  }

  section.innerHTML = `
    <div class="section-title"><h2>Atmosfera del percorso</h2><span>${images.length} immagini</span></div>
    <div class="enh-carousel" role="region" aria-label="Immagini rappresentative del percorso">
      ${images.map((image, index) => `
        <figure class="enh-carousel-card">
          <a href="${image.page}" target="_blank" rel="noreferrer" aria-label="Apri fonte dell'immagine ${index + 1}">
            <img src="${image.src}" alt="${enhEsc(image.title)}" loading="lazy" decoding="async" />
          </a>
          <figcaption>
            <strong>${enhEsc(queries[index] || image.title)}</strong>
            <small><a href="${image.page}" target="_blank" rel="noreferrer">${enhEsc(image.artist)}</a> · ${enhEsc(image.license)}</small>
          </figcaption>
        </figure>`).join('')}
    </div>`;
}

function enhApply() {
  if (enhState.applying) return;
  enhState.applying = true;
  queueMicrotask(async () => {
    try {
      enhApplyWeatherEverywhere();
      const detail = document.querySelector('.day-detail');
      const date = enhCurrentDate();
      const existing = detail?.querySelector('.enh-route-carousel');
      if (detail && date && existing?.dataset.date !== date) existing?.remove();
      if (detail && date && !detail.querySelector('.enh-route-carousel')) await enhRenderGallery();
    } finally {
      enhState.applying = false;
    }
  });
}

async function enhInit() {
  try {
    const response = await fetch('data/nyc-itinerary.json', { cache: 'no-store' });
    if (response.ok) enhState.itinerary = await response.json();
  } catch (error) {
    console.warn('Could not read itinerary metadata.', error);
  }

  await enhLoadWeather(true);
  enhApply();

  const content = document.querySelector('#content');
  const rail = document.querySelector('#dayRail');
  enhState.observer = new MutationObserver(enhApply);
  if (content) enhState.observer.observe(content, { childList: true, subtree: true });
  if (rail) enhState.observer.observe(rail, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  setInterval(() => enhLoadWeather(true), ENH_WEATHER_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - enhState.lastWeatherFetchAt > 15 * 60 * 1000) {
      enhLoadWeather(true);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhInit, { once: true });
else enhInit();
