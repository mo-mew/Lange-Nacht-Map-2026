export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function routeShops(shopping, routeId) {
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
  if (!shopping) return '<p>Shopping non disponibile.</p>';
  return `<section class="shopping-panel" aria-label="Itinerari shopping">
    <header><p class="shopping-eyebrow">SHOPPING · 11 SETTEMBRE</p><h1>Una sosta, o un giro intero.</h1>
    <p>13 negozi · 5 second hand · 2 percorsi indipendenti dalle visite.</p></header>
    <label class="shopping-toggle"><input type="checkbox" data-shopping-pins ${showPins ? 'checked' : ''}> Mostra i negozi sulla mappa</label>
    <div class="shopping-legend"><span class="legend-day">● Visite</span><span class="legend-new">■ Nuovo</span><span class="legend-secondhand">■ Second hand</span></div>
    <p class="shopping-note">Scegli liberamente dove fermarti. Indirizzi e categorie dalla tua lista; posizioni indicative. Controlla gli orari su Google Maps prima di partire.</p>
    ${shopping.routes.map(route => {
      const shops = routeShops(shopping,route.id);
      const active = selectedRoute === route.id;
      const chunks = route.id === 'downtown' ? walkingChunks(shops) : [];
      return `<article class="shopping-route${active ? ' is-active' : ''}">
        <div class="shopping-route-heading"><span class="shopping-letter">${route.prefix}</span><div><h2>${escapeHtml(route.title)}</h2><p>${escapeHtml(route.summary)} · ${shops.filter(s=>s.secondHand).length} second hand</p></div></div>
        <p>${escapeHtml(route.description)}</p>
        <button type="button" class="shopping-route-button" data-shopping-route="${route.id}" aria-pressed="${active}">${active ? 'Percorso attivo · torna ai soli pin' : 'Mostra percorso parallelo'}</button>
        <p class="shopping-connection">${escapeHtml(route.connection)}</p>
        <details ${route.id === (selectedRoute || 'downtown') ? 'open' : ''}><summary>Le ${shops.length} tappe in ordine consigliato</summary>
          <ol class="shopping-list">${shops.map((shop,index) => {
            const leg = route.legs.find(l=>l.to===shop.id);
            const previous = leg && shopping.shops.find(s=>s.id===leg.from);
            return `<li><div class="shopping-stop-title"><span class="shopping-stop-number ${shop.secondHand ? 'is-secondhand' : 'is-new'}">${route.prefix}${index+1}</span><h3>${escapeHtml(shop.name)}</h3></div>
              ${shopBadge(shop)}<p class="shopping-address">${escapeHtml(shop.address)}</p>
              <div class="shopping-actions"><button type="button" data-shop-focus="${shop.id}">Mappa</button><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.mapsQuery)}" target="_blank" rel="noreferrer">Scheda negozio ↗</a></div>
              ${leg ? `<a class="shopping-leg" href="${escapeHtml(shoppingDirections([previous,shop],leg.mode))}" target="_blank" rel="noreferrer">${leg.mode==='transit' ? 'Con i mezzi' : 'A piedi'} da ${escapeHtml(previous.name)} ↗</a>` : ''}</li>`;
          }).join('')}</ol>
          ${chunks.length ? `<div class="shopping-actions">${chunks.map((chunk,i)=>`<a href="${escapeHtml(shoppingDirections(chunk))}" target="_blank" rel="noreferrer">Apri tratto ${i+1} · ${route.prefix}${i*4+1}–${route.prefix}${i*4+chunk.length} ↗</a>`).join('')}</div>` : ''}
        </details>
      </article>`;
    }).join('')}
    <p class="shopping-note">Le linee collegano le tappe in ordine, non seguono le strade. Per camminare o prendere i mezzi, apri i collegamenti Google Maps.</p>
  </section>`;
}
