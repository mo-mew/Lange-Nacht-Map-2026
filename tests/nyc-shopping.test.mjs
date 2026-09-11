import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {routeShops,walkingChunks,shoppingDirections,shoppingHtml,shopBadge} from '../nyc-shopping.js';

const plan = JSON.parse(readFileSync(new URL('../data/nyc-itinerary.json',import.meta.url),'utf8'));
const shopping = plan.shopping;

test('all 13 requested stores occur once across two independent shopping routes', () => {
  assert.equal(shopping.shops.length,13);
  assert.equal(shopping.shops.filter(s=>s.secondHand).length,5);
  assert.equal(shopping.routes.length,2);
  const ids = shopping.routes.flatMap(r=>r.stopIds);
  assert.equal(new Set(ids).size,13);
  assert.deepEqual([...ids].sort(),shopping.shops.map(s=>s.id).sort());
  assert.deepEqual(shopping.routes.map(r=>r.stopIds.length),[9,4]);
  for (const s of shopping.shops) {
    assert.ok(s.lat>40.71 && s.lat<40.79 && s.lng>-74.01 && s.lng<-73.95);
    assert.match(s.address, /, New York, NY 100\d\d$/);
    assert.equal(s.secondHand,s.type.startsWith('Second hand'));
    assert.ok(!plan.days.flatMap(d=>d.stops).some(stop=>stop.name===s.name));
  }
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
  assert.equal(shopping.routes[1].legs.filter(l=>l.mode==='transit').length,2);
});

test('shopping view exposes types, addresses, map actions and all store links', () => {
  const html = shoppingHtml(shopping,null,true);
  for (const shop of shopping.shops) {
    assert.ok(html.includes(shop.address));
    assert.ok(html.includes(encodeURIComponent(shop.mapsQuery)));
    assert.ok(html.includes(`data-shop-focus="${shop.id}"`));
  }
  assert.ok(html.includes('is-secondhand'));
  assert.ok(html.includes('is-new'));
  assert.ok(!shopBadge({type:'<script>',secondHand:false}).includes('<script>'));
});

test('shopping layers coexist with visits, toggle cleanly, and retain marker types after selection', () => {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector,{textContent:'',hidden:true,querySelector:()=>null});
    return elements.get(selector);
  };
  const layer = () => ({items:[],clearLayers(){this.items=[];}});
  const marker = (point,options) => ({point,options,on(){return this;},addTo(target){target.items.push(this);return this;},setIcon(icon){this.options.icon=icon;},getLatLng(){return point;}});
  const sandbox = {Map,Intl,Date,Number,URL,routeShops,shopBadge,shoppingHtml,
    document:{querySelector:element,querySelectorAll:()=>[]},matchMedia:()=>({matches:false}),
    L:{marker,divIcon:options=>options,polyline:marker,DomEvent:{stopPropagation(){}}}};
  vm.createContext(sandbox);
  const source = readFileSync(new URL('../nyc-app.js',import.meta.url),'utf8').replace(/^import .*;\n/,'').replace(/\nmain\(\);\s*$/,'');
  vm.runInContext(source,sandbox);
  sandbox.plan=plan;
  sandbox.markerLayer=layer();sandbox.routeLayer=layer();
  vm.runInContext(`state.data=plan;state.selectedDate='2026-09-11';state.map={fitBounds(){},setView(){}};state.markerLayer=markerLayer;state.routeLayer=routeLayer;renderMapDay();`,sandbox);
  const run = code => vm.runInContext(code,sandbox);
  assert.equal(run('state.markerByKey.size'),18);
  assert.equal(sandbox.routeLayer.items.length,1);
  run("setShoppingRoute('downtown')");
  assert.equal(sandbox.routeLayer.items.length,2);
  run("selectStopOnMap('shop:realreal',state.data.shopping.shops.find(s=>s.id==='realreal'),2);closeMapCard();");
  assert.match(run("state.markerByKey.get('shop:realreal').marker.options.icon.html"),/is-secondhand/);
  run('setShoppingPins(false)');
  assert.equal(run('state.markerByKey.size'),5);
  assert.equal(sandbox.routeLayer.items.length,1);
  assert.equal(run('state.shoppingRoute'),null);
  run("setShoppingRoute('uptown')");
  assert.equal(run('state.markerByKey.size'),18);
  assert.equal(sandbox.routeLayer.items.length,2);
  run("state.selectedDate='2026-09-13';renderMapDay()");
  assert.equal(run('state.markerByKey.size'),16);
});
