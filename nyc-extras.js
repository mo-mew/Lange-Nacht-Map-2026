const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=40.758&longitude=-73.9855&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FNew_York&forecast_days=16';

const FALLBACK_WEATHER = {
  '2026-09-08': { high: 29, low: 21, code: 1 },
  '2026-09-09': { high: 31, low: 23, code: 2 },
  '2026-09-10': { high: 29, low: 20, code: 95 },
  '2026-09-11': { high: 29, low: 19, code: 1 },
  '2026-09-12': { high: 27, low: 20, code: 2 },
  '2026-09-13': { high: 28, low: 22, code: 95 }
};

const GALLERIES = {
  '2026-09-08': [
    ['Bethesda Terrace', 'Bethesda terrace (11143p).jpg'],
    ['Bow Bridge e The Lake', 'Bow Bridge.jpg'],
    ['The Metropolitan Museum of Art', 'The MET.jpg']
  ],
  '2026-09-09': [
    ['Museum of Modern Art', 'MoMA exterior (1629399048).jpg'],
    ['Rockefeller Center', 'Rockefeller Center Plaza NYC.jpg'],
    ['Grand Central Terminal', 'GCT exterior.jpg']
  ],
  '2026-09-10': [
    ['SoHo Cast-Iron District', 'SoHo - Cast Iron Facade.jpg'],
    ['Doyers Street, Chinatown', 'Doyers Street Chinatown.jpg'],
    ['Tenement Museum', 'Tenement Museum.jpg']
  ],
  '2026-09-11': [
    ['Roosevelt Island Tramway', 'Roosevelt Island Tramway from above.jpg'],
    ['FDR Four Freedoms Park', 'FDR Four Freedoms Park.jpg'],
    ['Noguchi Museum', 'Noguchi Museum.JPG']
  ],
  '2026-09-12': [
    ['Brooklyn Bridge', 'Brooklyn Bridge from Manhattan.JPG'],
    ['Washington Street, DUMBO', 'Manhattan Bridge and Empire State Building from Washington Street, Dumbo, Brooklyn, New York.jpg'],
    ['West Village / Christopher Street', 'Christopher Park.jpg']
  ],
  '2026-09-13': [
    ['Whitney Museum of American Art', 'The Whitney Museum, New York City in 2015.JPG'],
    ['High Line', 'High Line 20th Street looking downtown.jpg'],
    ['Pioneer Works, Red Hook', 'Brooklyn Street Scenes - Flickr - Steven Pisano.jpg']
  ]
};

const liveWeather = new Map();
let weatherUpdatedAt = null;
let scheduled = false;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function commonsImage(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1600`;
}

function commonsPage(file) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
}

function activeDate() {
  return document.querySelector('#dayRail .day-chip.is-active')?.dataset.date || null;
}

function conditionFor(code) {
  if (code === 0) return ['sun', 'Sereno'];
  if ([1, 2].includes(code)) return ['partly', code === 1 ? 'Perlopiù sereno' : 'Parzialmente nuvoloso'];
  if (code === 3) return ['cloud', 'Nuvoloso'];
  if ([45, 48].includes(code)) return ['fog', 'Nebbia'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['rain', 'Pioviggine'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['rain', 'Pioggia'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['snow', 'Neve'];
  if ([95, 96, 99].includes(code)) return ['storm', 'Temporali'];
  return ['partly', 'Variabile'];
}

function weatherIcon(kind, label) {
  const common = `viewBox="0 0 24 24" role="img" aria-label="${escapeHtml(label)}"`;
  if (kind === 'sun') return `<svg ${common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
  if (kind === 'partly') return `<svg ${common}><circle cx="9" cy="9" r="3"/><path d="M9 3V2M4.8 4.8 4 4M3 9H2M15.2 4.8 16 4M6 17h11a3 3 0 0 0 0-6 5 5 0 0 0-9.4-1.9A4 4 0 0 0 6 17Z"/></svg>`;
  if (kind === 'cloud') return `<svg ${common}><path d="M5 18h12a4 4 0 0 0 .4-8A6 6 0 0 0 6.1 8.2 5 5 0 0 0 5 18Z"/></svg>`;
  if (kind === 'rain') return `<svg ${common}><path d="M5 14h12a4 4 0 0 0 .4-8A6 6 0 0 0 6.1 4.2 5 5 0 0 0 5 14Z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/></svg>`;
  if (kind === 'storm') return `<svg ${common}><path d="M5 13h12a4 4 0 0 0 .4-8A6 6 0 0 0 6.1 3.2 5 5 0 0 0 5 13Z"/><path d="m13 14-3 4h3l-2 4 5-6h-3l2-2"/></svg>`;
  if (kind === 'snow') return `<svg ${common}><path d="M5 13h12a4 4 0 0 0 .4-8A6 6 0 0 0 6.1 3.2 5 5 0 0 0 5 13Z"/><path d="M8 17h.01M12 19h.01M16 17h.01"/></svg>`;
  return `<svg ${common}><path d="M4 9h16M3 13h14M6 17h13"/></svg>`;
}

function weatherFor(date) {
  return liveWeather.get(date) || FALLBACK_WEATHER[date] || null;
}

function updatedLabel() {
  if (!weatherUpdatedAt) return 'Previsione salvata';
  return `Aggiornato ${new Intl.DateTimeFormat('it-IT', {
    timeZone: 'America/New_York', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(weatherUpdatedAt)} · NYC`;
}

function renderGallery() {
  const date = activeDate();
  const hero = document.querySelector('.day-detail .day-hero');
  if (!date || !hero || document.querySelector('.nyc-gallery')) return;
  const items = GALLERIES[date];
  if (!items?.length) return;

  const section = document.createElement('section');
  section.className = 'detail-section nyc-gallery';
  section.innerHTML = `
    <div class="section-title"><h2>Atmosfera del percorso</h2><span>${items.length} immagini</span></div>
    <div class="nyc-carousel" aria-label="Immagini rappresentative del percorso">
      ${items.map(([title, file]) => `
        <figure class="nyc-carousel-card">
          <img src="${commonsImage(file)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" />
          <figcaption>
            <strong>${escapeHtml(title)}</strong>
            <a href="${commonsPage(file)}" target="_blank" rel="noreferrer">Wikimedia Commons ↗</a>
          </figcaption>
        </figure>
      `).join('')}
    </div>`;
  hero.insertAdjacentElement('afterend', section);
  section.querySelectorAll('img').forEach(image => {
    image.addEventListener('error', () => image.closest('.nyc-carousel-card')?.remove(), { once: true });
  });
}

function renderWeather() {
  const date = activeDate();
  const card = document.querySelector('.day-detail .weather-card');
  if (!date || !card || card.dataset.liveWeather === '1') return;
  const weather = weatherFor(date);
  if (!weather) return;

  const existingImpact = card.querySelector('p')?.textContent?.trim() || '';
  const [kind, label] = conditionFor(weather.code);
  card.dataset.liveWeather = '1';
  card.classList.add('nyc-live-weather');
  card.innerHTML = `
    <div class="nyc-weather-icon">${weatherIcon(kind, label)}</div>
    <div class="nyc-weather-copy">
      <div class="nyc-weather-head">
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(updatedLabel())}</small>
      </div>
      <div class="nyc-weather-temps">
        <span><b>${Math.round(weather.high)}°</b> max</span>
        <span><b>${Math.round(weather.low)}°</b> min</span>
      </div>
      ${existingImpact ? `<p>${escapeHtml(existingImpact)}</p>` : ''}
      <a class="nyc-weather-source" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Meteo: Open-Meteo ↗</a>
    </div>`;
}

function renderDayRailWeather() {
  document.querySelectorAll('#dayRail .day-chip[data-date]').forEach(button => {
    if (button.querySelector('.nyc-day-weather')) return;
    const weather = weatherFor(button.dataset.date);
    if (!weather) return;
    const [kind, label] = conditionFor(weather.code);
    button.insertAdjacentHTML('beforeend', `
      <span class="nyc-day-weather" title="${escapeHtml(label)}">
        ${weatherIcon(kind, label)}
        <span>${Math.round(weather.high)}°/${Math.round(weather.low)}°</span>
      </span>`);
  });
}

function renderOverviewWeather() {
  document.querySelectorAll('.day-overview-card[data-open-day]').forEach(card => {
    const target = card.querySelector('.overview-weather');
    if (!target || target.dataset.liveWeather === '1') return;
    const weather = weatherFor(card.dataset.openDay);
    if (!weather) return;
    const [kind, label] = conditionFor(weather.code);
    target.dataset.liveWeather = '1';
    target.innerHTML = `${weatherIcon(kind, label)}<span>${Math.round(weather.high)}°/${Math.round(weather.low)}°</span>`;
  });

  const footnote = document.querySelector('.weather-footnote');
  if (footnote && weatherUpdatedAt) {
    footnote.textContent = `Meteo aggiornato automaticamente · ${updatedLabel().replace('Aggiornato ', '')}`;
  }
}

function enhance() {
  scheduled = false;
  renderGallery();
  renderWeather();
  renderDayRailWeather();
  renderOverviewWeather();
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(enhance);
}

async function refreshWeather() {
  try {
    const response = await fetch(WEATHER_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const daily = payload.daily;
    if (!daily?.time) return;
    daily.time.forEach((date, index) => {
      liveWeather.set(date, {
        high: daily.temperature_2m_max[index],
        low: daily.temperature_2m_min[index],
        code: daily.weather_code[index]
      });
    });
    weatherUpdatedAt = new Date();
    document.querySelectorAll('[data-live-weather]').forEach(node => node.removeAttribute('data-live-weather'));
    document.querySelectorAll('.nyc-day-weather').forEach(node => node.remove());
    scheduleEnhance();
  } catch (error) {
    console.warn('Meteo live non disponibile; uso la previsione salvata.', error);
  }
}

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.body, { childList: true, subtree: true });

scheduleEnhance();
refreshWeather();
setInterval(refreshWeather, 30 * 60 * 1000);
