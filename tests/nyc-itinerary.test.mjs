import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const plan = JSON.parse(readFileSync(new URL('data/nyc-itinerary.json',root),'utf8'));
const day = date => plan.days.find(d => d.date === date);
test('six unique days and valid map destinations', () => {
  assert.equal(new Set(plan.days.map(d=>d.date)).size,6);
  for (const d of plan.days) {
    for (const s of [...d.stops,...(d.alternatives || [])]) {
      assert.ok(s.name && s.description && s.mapsQuery);
      assert.ok(s.lat>40.65 && s.lat<40.85 && s.lng>-74.04 && s.lng<-73.90);
    }
    for (const l of d.legs || []) {
      assert.ok(l.fromStop>=0 && l.toStop>l.fromStop && l.toStop<d.stops.length);
      assert.ok(['walking','transit','driving'].includes(l.mode));
    }
    const url = new URL(d.routeUrl);
    assert.equal(url.hostname,'www.google.com');
    assert.ok((url.searchParams.get('waypoints') || '').split('|').length<=3);
  }
});
test('today starts at Little Island and keeps MoMA in the afternoon', () => {
  const d=day('2026-09-09');
  assert.equal(d.stops[0].name,'Little Island');
  assert.equal(d.stops[1].name,'Chelsea Market');
  assert.equal(d.stops.at(-1).name,'MoMA');
  assert.match(d.stops.at(-1).time,/^14:00/);
  assert.ok(!d.stops.some(s=>/Rockefeller|Patrick/.test(s.name)));
  assert.ok(d.alternatives.some(s=>s.name.includes('Whitney')));
});
test('Sunday remains around Central Park, not Downtown or Brooklyn', () => {
  const d=day('2026-09-13');
  assert.equal(d.stops.length,3);
  assert.ok(d.stops.every(s=>s.lat>40.775 && s.lat<40.79));
  assert.ok(d.stops.some(s=>s.name.includes('Natural History')));
  assert.ok(d.stops.some(s=>s.name.includes('Guggenheim')));
  assert.ok(!d.stops.some(s=>/Whitney|Pioneer/.test(s.name)));
  assert.ok(d.alternatives.some(s=>s.kind.includes('intera giornata')));
});
test('neighborhood groups do not regress', () => {
  assert.ok(day('2026-09-10').stops.every(s=>s.lat<40.74));
  assert.ok(!day('2026-09-12').stops.some(s=>/Village|Red Hook/.test(s.name)));
});
test('one canonical dataset, no fetch override scripts in the page', () => {
  const html=readFileSync(new URL('index.html',root),'utf8');
  assert.ok(!html.includes('nyc-plan-update.js'));
  assert.ok(!html.includes('nyc-today-override.js'));
  assert.ok(html.includes('nyc-app.js'));
  const extras=readFileSync(new URL('nyc-extras.js',root),'utf8');
  assert.ok(!/window\.fetch\s*=/.test(extras));
  assert.ok(!/navigator\.geolocation/.test(extras));
});
