export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const TAILORING_SHOPS = [
  {
    id: 'beggars-run',
    name: 'Beggars Run',
    address: '172 Elizabeth St, Ground Floor, New York, NY 10012',
    mapsQuery: 'Beggars Run, 172 Elizabeth St, New York, NY 10012',
    secondHand: false,
    tailoring: true,
    type: 'Sartoria su misura · Contemporaneo',
    lat: 40.72095,
    lng: -73.99465,
    appointment: 'Prenotazione consigliata',
    note: '#3 della shortlist · Più fashion e contemporaneo. Per la silhouette richiesta: moderate padding + roped sleevehead, da specificare esplicitamente.',
    sourceUrl: 'https://www.beggarsrun.com/usa'
  },
  {
    id: 'michael-andrews',
    name: 'Michael Andrews Bespoke · NoHo',
    address: '2 Great Jones Alley, New York, NY 10012',
    mapsQuery: 'Michael Andrews Bespoke, 2 Great Jones Alley, New York, NY 10012',
    secondHand: false,
    tailoring: true,
    type: 'Bespoke / Handmade-to-Measure',
    lat: 40.726265,
    lng: -73.994492,
    appointment: 'Solo su appuntamento',
    note: '#1 della shortlist · Miglior equilibrio risultato/prezzo. Handmade-to-measure da $1.995; bespoke da $2.995. Brief: structured shoulder, moderate padding, slightly extended shoulder, defined roped sleevehead, strong waist suppression.',
    sourceUrl: 'https://www.michaelandrews.com/location/noho-nyc/'
  },
  {
    id: 'reeves',
    name: 'Reeves Bespoke',
    address: '648 Broadway, Suite 600, New York, NY 10012',
    mapsQuery: 'Reeves Bespoke, 648 Broadway Suite 600, New York, NY 10012',
    secondHand: false,
    tailoring: true,
    type: 'Bespoke · English / Savile Row',
    lat: 40.726609,
    lng: -73.995935,
    appointment: 'Contatta e prenota prima',
    note: '#2 della shortlist · Match estetico più forte per una giacca netta e autorevole: vero bespoke, full floating canvas e costruzione English/Savile Row. Fascia alta: chiedi preventivo e tempi.',
    sourceUrl: 'https://www.reeves-nyc.com/bespoke-suit-appointment'
  }
];

const TAILORING_ROUTE = {
  id: 'tailoring',
  prefix: 'C',
  title: 'Sartoria uomo · Nolita → NoHo',
  summary: '3 atelier · a piedi',
  description: 'Percorso separato, compatto e ordinato da sud a nord: Beggars Run su Elizabeth Street, Michael Andrews in Great Jones Alley, poi Reeves su Broadway. L’ordine è geografico; la classifica resta Michael Andrews #1, Reeves #2, Beggars Run #3.',
  connection: 'Non trattarlo come un giro walk-in: Michael Andrews è solo su appuntamento; per Reeves e Beggars Run conviene contattare prima. Se hai un solo appuntamento, Michael Andrews resta la prima scelta.',
  stopIds: ['beggars-run', 'michael-andrews', 'reeves'],
  overallMode: 'walking',
  legs: [
    { from: 'beggars-run', to: 'michael-andrews', mode: 'walking' },
    { from: 'michael-andrews', to: 'reeves', mode: 'walking' }
  ]
};

export function ensureTailoringRoute(shopping) {
  if (!shopping?.shops || !shopping?.routes) return shopping;
  for (const shop of TAILORING_SHOPS) {
    if (!shopping.shops.some(item => item.id === shop.id)) shopping.shops.push({...shop});
  }
  if (!shopping.routes.some(route => route.id === TAILORING_ROUTE.id)) {
    shopping.routes.push({
      ...TAILORING_ROUTE,
      stopIds: [...TAILORING_ROUTE.stopIds],
      legs: TAILORING_ROUTE.legs.map(leg => ({...leg}))
    });
  }
  return shopping;
}

function patchShoppingChrome(shopping) {
  if (typeof document === 'undefined') return;
  const select = document.querySelector('#shoppingMapMode');
  if (select && !select.querySelector('option[value="tailoring"]')) {
    const option = document.createElement('option');
    option.value = 'tailoring';
    option.textContent = 'C · Sartoria uomo · Nolita + NoHo';
    select.querySelector('option[value="hidden"]')?.before(option);
  }
  const total = shopping?.shops?.length || 16;
  const routes = shopping?.routes?.length || 3;
  document.querySelectorAll('.shopping-shortcut span').forEach(node => {
    const next = `${total} posti salvati · ${routes} percorsi`;
    if (!node.textContent?.startsWith(next)) node.innerHTML = `${escapeHtml(next)} <b>›</b>`;
  });
}

let chromeObserver;
function observeShoppingChrome(shopping) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  patchShoppingChrome(shopping);
  if (chromeObserver) return;
  chromeObserver = new MutationObserver(() => patchShoppingChrome(shopping));
  chromeObserver.observe(document.body, {childList:true, subtree:true});
}

export function routeShops(shopping, routeId) {
  ensureTailoringRoute(shopping);
  const route = shopping?.routes.find(item => item.id === routeId);
  return (route?.stopIds || []).map(id => shopping.shops.find(shop => shop.id === id)).filter(Boolean);
}

export function shoppingDirections(shops, mode = 'walking') {
  if (shops.length < 2 || shops.length > 5) return '#';
  const params = new URLSearchParams({api:'1', origin:shops[0].address, destination:shops.at(-1).address, travelmode:mode});
  if (shops.length > 2) params.set('waypoints', shops.slice(1,-1).map(shop => shop.address).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

// Google Maps mobile supports at most three waypoints; retain the joining stop.
export function walkingChunks(shops) {
  const chunks = [];
  for (let start = 0; start < shops.length - 1; start += 4) chunks.push(shops.slice(start,start+5));
  return chunks;
}

export function shopBadge(shop) {
  return `<span class="shop-badge ${shop.secondHand ? 'is-secondhand' : 'is-new'}">${escapeHtml(shop.type)}</span>`;
}

export function shoppingHtml(shopping, selectedRoute, showPins) {
  ensureTailoringRoute(shopping);
  observeShoppingChrome(shopping);
  if (!shopping) return '<p>Shopping non disponibile.</p>';
  const secondHandCount = shopping.shops.filter(shop => shop.secondHand).length;
  const tailoringCount = shopping.shops.filter(shop => shop.tailoring).length;
  return `<section class="shopping-panel" aria-label="Itinerari shopping e sartoria">
    <header><p class="shopping-eyebrow">PERCORSI EXTRA</p><h1>Shopping e sartoria.</h1>
    <p>${shopping.shops.length} posti · ${secondHandCount} second hand · ${tailoringCount} sartorie · ${shopping.routes.length} percorsi indipendenti dalle visite.</p></header>
    <label class="shopping-toggle"><input type="checkbox" data-shopping-pins ${showPins ? 'checked' : ''}> Mostra i posti sulla mappa</label>
    <div class="shopping-legend"><span class="legend-day">● Visite</span><span class="legend-new">■ Nuovo / sartoria</span><span class="legend-secondhand">■ Second hand</span></div>
    <p class="shopping-note">Scegli liberamente dove fermarti. Per i tre atelier del percorso C verifica sempre appuntamento e disponibilità prima di andarci.</p>
    ${shopping.routes.map(route => {
      const shops = routeShops(shopping,route.id);
      const active = selectedRoute === route.id;
      const chunks = route.id === 'downtown' ? walkingChunks(shops) : [];
      const completeRoute = route.overallMode && shops.length <= 5 ? shoppingDirections(shops, route.overallMode) : '#';
      return `<article class="shopping-route${active ? ' is-active' : ''}">
        <div class="shopping-route-heading"><span class="shopping-letter">${route.prefix}</span><div><h2>${escapeHtml(route.title)}</h2><p>${escapeHtml(route.summary)}</p></div></div>
        <p>${escapeHtml(route.description)}</p>
        <button type="button" class="shopping-route-button" data-shopping-route="${route.id}" aria-pressed="${active}">${active ? 'Percorso attivo · torna ai soli pin' : 'Mostra percorso parallelo'}</button>
        <p class="shopping-connection">${escapeHtml(route.connection)}</p>
        <details ${route.id === (selectedRoute || 'downtown') ? 'open' : ''}><summary>Le ${shops.length} tappe in ordine consigliato</summary>
          <ol class="shopping-list">${shops.map((shop,index) => {
            const leg = route.legs.find(l=>l.to===shop.id);
            const previous = leg && shopping.shops.find(s=>s.id===leg.from);
            return `<li><div class="shopping-stop-title"><span class="shopping-stop-number ${shop.secondHand ? 'is-secondhand' : 'is-new'}">${route.prefix}${index+1}</span><h3>${escapeHtml(shop.name)}</h3></div>
              ${shopBadge(shop)}<p class="shopping-address">${escapeHtml(shop.address)}</p>
              ${shop.appointment ? `<p class="shopping-note"><strong>${escapeHtml(shop.appointment)}</strong></p>` : ''}
              ${shop.note ? `<p class="shopping-note">${escapeHtml(shop.note)}</p>` : ''}
              <div class="shopping-actions"><button type="button" data-shop-focus="${shop.id}">Mappa</button><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.mapsQuery)}" target="_blank" rel="noreferrer">Google Maps ↗</a>${shop.sourceUrl ? `<a href="${escapeHtml(shop.sourceUrl)}" target="_blank" rel="noreferrer">Sito / prenota ↗</a>` : ''}</div>
              ${leg ? `<a class="shopping-leg" href="${escapeHtml(shoppingDirections([previous,shop],leg.mode))}" target="_blank" rel="noreferrer">${leg.mode==='transit' ? 'Con i mezzi' : 'A piedi'} da ${escapeHtml(previous.name)} ↗</a>` : ''}</li>`;
          }).join('')}</ol>
          ${completeRoute !== '#' ? `<div class="shopping-actions"><a href="${escapeHtml(completeRoute)}" target="_blank" rel="noreferrer">Apri percorso completo ↗</a></div>` : ''}
          ${chunks.length ? `<div class="shopping-actions">${chunks.map((chunk,i)=>`<a href="${escapeHtml(shoppingDirections(chunk))}" target="_blank" rel="noreferrer">Apri tratto ${i+1} · ${route.prefix}${i*4+1}–${route.prefix}${i*4+chunk.length} ↗</a>`).join('')}</div>` : ''}
        </details>
      </article>`;
    }).join('')}
    <p class="shopping-note">Le linee collegano le tappe in ordine, non seguono le strade. Per camminare o prendere i mezzi, apri i collegamenti Google Maps.</p>
  </section>`;
}
