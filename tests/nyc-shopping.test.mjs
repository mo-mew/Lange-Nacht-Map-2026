import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {routeShops,walkingChunks,shoppingDirections,shoppingHtml,shopBadge,ensureTailoringRoute,routePinShops,shopDetails,prepareShopping} from '../nyc-shopping.js';

const plan = JSON.parse(readFileSync(new URL('../data/nyc-itinerary.json',import.meta.url),'utf8'));
const shopping = ensureTailoringRoute(plan.shopping);

test('four routes share one resale shop without duplicating saved places', () => {
  assert.equal(shopping.shops.length,23);
  assert.equal(shopping.shops.filter(s=>s.secondHand).length,6);
  assert.equal(shopping.shops.filter(s=>s.tailoring).length,3);
  assert.equal(shopping.routes.length,4);
  const ids = shopping.routes.flatMap(r=>[...r.stopIds,...(r.optionalStopIds || [])]);
  assert.equal(new Set(ids).size,23);
  assert.deepEqual([...new Set(ids)].sort(),shopping.shops.map(s=>s.id).sort());
  assert.deepEqual(shopping.routes.map(r=>r.stopIds.length),[9,4,3,6]);
  for (const s of shopping.shops) {
    assert.ok(s.lat>40.71 && s.lat<40.81 && s.lng>-74.01 && s.lng<-73.93);
    assert.match(s.address, /, New York, NY 10\d\d\d$/);
    if (!s.tailoring) assert.equal(s.secondHand,s.type.startsWith('Second hand'));
    assert.ok(!plan.days.flatMap(d=>d.stops).some(stop=>stop.name===s.name));
  }
});

test('tailoring is a separate, walkable Nolita to NoHo route with booking notes', () => {
  const route = shopping.routes.find(r=>r.id==='tailoring');
  assert.deepEqual(route.stopIds,['beggars-run','michael-andrews','reeves']);
  assert.equal(route.prefix,'C');
  assert.equal(route.overallMode,'walking');
  assert.equal(route.legs.length,2);
  assert.ok(route.legs.every(l=>l.mode==='walking'));
  const shops = routeShops(shopping,'tailoring');
  assert.deepEqual(shops.map(s=>s.name),['Beggars Run','Michael Andrews Bespoke · NoHo','Reeves Bespoke']);
  assert.ok(shops.every(s=>s.tailoring && s.appointment && s.sourceUrl));
  assert.match(shops.find(s=>s.id==='michael-andrews').note,/\$1\.995/);
  assert.match(shops.find(s=>s.id==='michael-andrews').note,/structured shoulder/i);
  const directions = new URL(shoppingDirections(shops));
  assert.equal(directions.searchParams.get('travelmode'),'walking');
  assert.equal(directions.searchParams.get('origin'),shops[0].address);
  assert.equal(directions.searchParams.get('destination'),shops.at(-1).address);
  assert.equal(directions.searchParams.get('waypoints'),shops[1].address);
});

test('mobile directions retain every downtown stop, with a shared joining stop', () => {
  const shops = routeShops(shopping,'downtown');
  const chunks = walkingChunks(shops);
  assert.equal(chunks.length,2);
  assert.equal(chunks[0].at(-1).id,chunks[1][0].id);
  assert.deepEqual([...chunks[0],...chunks[1].slice(1)],shops);
  for (const chunk of chunks) {
    const url = new URL(shoppingDirections(chunk));
    assert.equal(url.searchParams.get('travelmode'),'walking');
    assert.ok(url.searchParams.get('waypoints').split('|').length<=3);
    assert.equal(url.searchParams.get('origin'),chunk[0].address);
    assert.equal(url.searchParams.get('destination'),chunk.at(-1).address);
  }
  for (const route of shopping.routes) for (const [i,leg] of route.legs.entries()) {
    assert.equal(leg.from,route.stopIds[i]);
    assert.equal(leg.to,route.stopIds[i+1]);
    assert.ok(['walking','transit'].includes(leg.mode));
  }
  assert.equal(shopping.routes.find(r=>r.id==='uptown').legs.filter(l=>l.mode==='transit').length,2);
});

test('shopping view exposes types, addresses, map actions, appointment notes and store links', () => {
  const html = shoppingHtml(shopping,null,true);
  for (const shop of shopping.shops) {
    assert.ok(html.includes(shop.address));
    assert.ok(html.includes(encodeURIComponent(shop.mapsQuery)));
    assert.ok(html.includes(`data-shop-focus="${shop.id}"`));
  }
  for (const shop of shopping.shops.filter(s=>s.tailoring)) {
    assert.ok(html.includes(shop.appointment));
    assert.ok(html.includes(shop.sourceUrl));
  }
  assert.ok(html.includes('23 posti'));
  assert.ok(html.includes('3 sartorie'));
  assert.ok(html.includes('4 percorsi'));
  assert.ok(html.includes('Apri percorso completo'));
  assert.ok(html.includes('is-secondhand'));
  assert.ok(html.includes('is-new'));
  assert.ok(!shopBadge({type:'<script>',secondHand:false}).includes('<script>'));
});

test('shopping layers coexist with visits, toggle cleanly, and retain marker types after selection', () => {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector,{textContent:'',hidden:true,value:'pins',querySelector:()=>null});
    return elements.get(selector);
  };
  const layer = () => ({items:[],clearLayers(){this.items=[];}});
  const marker = (point,options) => ({point,options,on(){return this;},addTo(target){target.items.push(this);return this;},setIcon(icon){this.options.icon=icon;},getLatLng(){return point;}});
  const sandbox = {Map,Intl,Date,Number,URL,routeShops,routePinShops,shopBadge,shopDetails,shoppingHtml,prepareShopping,
    document:{querySelector:element,querySelectorAll:()=>[]},matchMedia:()=>({matches:false}),
    L:{marker,divIcon:options=>options,polyline:marker,DomEvent:{stopPropagation(){}}}};
  vm.createContext(sandbox);
  const source = readFileSync(new URL('../nyc-app.js',import.meta.url),'utf8').replace(/^import .*;\n/,'').replace(/\nmain\(\);\s*$/,'');
  vm.runInContext(source,sandbox);
  sandbox.plan=plan;
  sandbox.markerLayer=layer();sandbox.routeLayer=layer();
  vm.runInContext(`state.data=plan;state.selectedDate='2026-09-11';state.map={fitBounds(){},setView(){}};state.markerLayer=markerLayer;state.routeLayer=routeLayer;renderMapDay();`,sandbox);
  const run = code => vm.runInContext(code,sandbox);
  assert.equal(run('state.markerByKey.size'),28);
  assert.equal(sandbox.routeLayer.items.length,1);
  run("setShoppingRoute('downtown')");
  assert.equal(sandbox.routeLayer.items.length,2);
  run("selectStopOnMap('shop:realreal',state.data.shopping.shops.find(s=>s.id==='realreal'),2);closeMapCard();");
  assert.match(run("state.markerByKey.get('shop:realreal').marker.options.icon.html"),/is-secondhand/);
  assert.equal(sandbox.markerLayer.items.length,28, 'shared RealReal has only one physical marker');
  run("setShoppingRoute('cowboy')");
  assert.equal(run("state.markerByKey.get('shop:realreal').label"),'D3');
  assert.ok(run("state.markerByKey.has('shop:arial-7')"));
  assert.equal(sandbox.routeLayer.items[1].point.length,6, 'bonus shops stay off the route line');
  assert.equal(sandbox.markerLayer.items.length,28);
  run("setShoppingRoute('downtown')");
  assert.equal(run("state.markerByKey.get('shop:realreal').label"),'A3');
  run('setShoppingPins(false)');
  assert.equal(run('state.markerByKey.size'),5);
  assert.equal(sandbox.routeLayer.items.length,1);
  assert.equal(run('state.shoppingRoute'),null);
  run("setShoppingRoute('tailoring')");
  assert.equal(run('state.markerByKey.size'),28);
  assert.equal(sandbox.routeLayer.items.length,2);
  assert.ok(run("state.markerByKey.has('shop:michael-andrews')"));
  run("state.selectedDate='2026-09-13';renderMapDay()");
  assert.equal(run('state.markerByKey.size'),26);
});


test('cowboy route follows the requested priorities with two optional detours', () => {
  const route = shopping.routes.find(r=>r.id==='cowboy');
  assert.equal(route.prefix,'D');
  assert.deepEqual(route.stopIds,['tecovas','double-rl','realreal','kemo-sabe','bergdorf-men','azteca']);
  assert.deepEqual(route.optionalStopIds,['wgaca','arial-7']);
  assert.equal(routeShops(shopping,'cowboy').length,6);
  assert.equal(routePinShops(shopping,'cowboy').length,8);
  assert.equal(shopping.shops.filter(s=>s.id==='realreal').length,1);
  assert.ok(shopping.shops.find(s=>s.id==='arial-7').appointment);
  assert.ok(!shopping.shops.some(s=>/Space Cowboy|Western Spirit/i.test(s.name)));
  const html=shoppingHtml(shopping,'cowboy',true);
  assert.match(html,/2 bonus opzionali/);
  assert.match(html,/niente square o round toe/);
  const popup=shopping.shops.find(s=>s.id==='kemo-sabe');
  assert.ok(!shopDetails(popup,'','2026-09-13').includes('Pop-up terminato'));
  assert.ok(!shopDetails(popup,'','2026-09-27').includes('Pop-up terminato'));
  assert.ok(shopDetails(popup,'','2026-09-28').includes('Pop-up terminato'));
  const count=shopping.shops.length;
  prepareShopping(shopping);prepareShopping(shopping);
  assert.equal(shopping.shops.length,count);
  assert.equal(shopping.routes.length,4);
});
