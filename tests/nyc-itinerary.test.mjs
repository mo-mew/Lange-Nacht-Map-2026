import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const plan = JSON.parse(readFileSync(new URL('data/nyc-itinerary.json',root),'utf8'));
const day = date => plan.days.find(d => d.date === date);
const extras = readFileSync(new URL('nyc-extras.js',root),'utf8');
const html = readFileSync(new URL('index.html',root),'utf8');

function checkLocation(s) {
  assert.ok(s.name && s.description && s.mapsQuery);
  assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lng));
  assert.ok(s.lat>40.65 && s.lat<40.85 && s.lng>-74.04 && s.lng<-73.90);
  for (const nested of s.stops || []) checkLocation(nested);
}
function checkRoute(value) {
  const url = new URL(value);
  assert.equal(url.protocol,'https:');
  assert.equal(url.hostname,'www.google.com');
  const waypoints = url.searchParams.get('waypoints');
  assert.ok(!waypoints || waypoints.split('|').length<=3);
}

test('six ordered days and valid destinations, including alternative plans', () => {
  assert.equal(new Set(plan.days.map(d=>d.date)).size,6);
  assert.deepEqual(plan.days.map(d=>d.date),['2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13']);
  assert.equal(plan.timezone,'America/New_York');
  for (const d of plan.days) {
    for (const s of [...d.stops,...(d.alternatives || [])]) {
      checkLocation(s);
      if (s.routeUrl) checkRoute(s.routeUrl);
    }
    for (const l of d.legs || []) {
      assert.ok(Number.isInteger(l.fromStop) && Number.isInteger(l.toStop));
      assert.ok(l.fromStop>=0 && l.toStop>l.fromStop && l.toStop<d.stops.length);
      assert.ok(['walking','transit','driving'].includes(l.mode));
    }
    checkRoute(d.routeUrl);
  }
});
test('missed MoMA occurs once in the remaining main plan, Thursday afternoon', () => {
  const remaining = plan.days.filter(d=>d.date>='2026-09-10');
  const visits = remaining.flatMap(d=>d.stops).filter(s=>s.name==='MoMA');
  assert.equal(visits.length,1);
  assert.equal(day('2026-09-10').stops.at(-1).name,'MoMA');
  assert.equal(visits[0].time,'14:00–17:00');
  assert.ok(day('2026-09-10').stops.every(s=>s.lat>40.75 && s.lat<40.765));
  assert.ok(!remaining.flatMap(d=>d.stops).some(s=>/Rockefeller|Patrick/.test(s.name)));
  assert.ok(!day('2026-09-09').stops.some(s=>s.name==='MoMA'));
  assert.equal(day('2026-09-09').stops[0].name,'One Manhattan West');
});
test('Friday is Lower Manhattan and Queens is a complete, exclusive alternative', () => {
  const d=day('2026-09-11');
  assert.ok(d.stops.every(s=>s.lat<40.74 && s.lat>40.71));
  assert.ok(d.stops.some(s=>s.name.includes('Tenement')));
  const alternative=d.alternatives.find(a=>a.name.includes('Astoria'));
  assert.match(alternative.kind,/intera giornata/);
  assert.equal(alternative.stops.length,6);
  assert.ok(alternative.stops.some(s=>s.name.includes('Noguchi')));
  assert.ok(alternative.stops.some(s=>s.name.includes('Socrates')));
  assert.ok(!d.stops.some(s=>/Noguchi|Socrates|MoMA/.test(s.name)));
});
test('Saturday stays in Brooklyn after crossing the bridge', () => {
  const d=day('2026-09-12');
  assert.ok(d.stops.slice(1).every(s=>s.lat>40.69 && s.lat<40.71));
  assert.ok(!d.stops.some(s=>/Village|Red Hook|MoMA/.test(s.name)));
});
test('Sunday keeps two museums around Central Park and no distant additions', () => {
  const d=day('2026-09-13');
  assert.equal(d.stops.length,3);
  assert.ok(d.stops.every(s=>s.lat>40.775 && s.lat<40.79));
  assert.ok(d.stops.some(s=>s.name.includes('Natural History')));
  assert.ok(d.stops.some(s=>s.name.includes('Guggenheim')));
  assert.ok(!d.stops.some(s=>/Whitney|Pioneer|MoMA/.test(s.name)));
});
test('saved weather retains honest timestamps and gallery captions match the new days', () => {
  for (const d of plan.days) {
    assert.ok(Number.isFinite(d.weather.high) && Number.isFinite(d.weather.low));
    assert.ok(d.weather.high>=d.weather.low);
    assert.ok(d.weather.updatedAt.startsWith('2026-09-08') || d.weather.updatedAt.startsWith('2026-09-09'));
    assert.ok(d.gallery.length>=2);
    for (const img of d.gallery) assert.ok(img.file && img.title);
  }
  assert.ok(day('2026-09-10').gallery.some(i=>i.title==='MoMA'));
  assert.ok(day('2026-09-11').gallery.some(i=>i.title.includes('SoHo')));
  assert.ok(!day('2026-09-11').gallery.some(i=>/Noguchi|Roosevelt/.test(i.title)));
});
test('canonical data and unchanged location boundary: no fetch overrides or GPS in extras', () => {
  assert.ok(!/nyc-(plan-update|today-override|afternoon-update)\.js/.test(html));
  assert.ok(html.includes('nyc-app.js'));
  assert.ok(!/window\.fetch\s*=/.test(extras));
  assert.ok(!/navigator\.geolocation/.test(extras));
  assert.ok(extras.includes("const DATA_URL = 'data/nyc-itinerary.json'"));
});

// Evaluate pure helpers only; no network, browser GPS or live provider is mocked as verified.
const helpers=extras.slice(0,extras.indexOf('const observer ='));
const sandbox={URL,URLSearchParams,Intl,Date,Map,Number,Array,document:{querySelector:()=>null}};
vm.createContext(sandbox);
vm.runInContext(helpers,sandbox);
test('alternate plans render all saved locations with Google Maps links', () => {
  sandbox.item=day('2026-09-11').alternatives.find(a=>a.stops);
  const result=vm.runInContext('alternativeHtml(item)',sandbox);
  assert.ok(result.includes('Programma alternativo e luoghi salvati'));
  for (const s of sandbox.item.stops) assert.ok(result.includes(encodeURIComponent(s.mapsQuery)));
  assert.ok(result.includes('Percorso alternativo'));
});
test('unknown weather is not shown as sun and missing temperatures are not zero', () => {
  assert.equal(vm.runInContext('conditionFor(undefined)[0]',sandbox),'unknown');
  assert.equal(vm.runInContext('temperature(null)',sandbox),'—');
  assert.equal(vm.runInContext('temperature(0)',sandbox),'0°');
  assert.match(vm.runInContext("updatedLabel({live:false,updatedAt:'2026-09-09T08:48:00-04:00'})",sandbox),/Previsione salvata.*09\/09/);
});
test('untrusted labels and protocols are escaped', () => {
  assert.equal(vm.runInContext("safeUrl('javascript:alert(1)')",sandbox),'#');
  assert.equal(vm.runInContext("escapeHtml('<script>')",sandbox),'&lt;script&gt;');
});
