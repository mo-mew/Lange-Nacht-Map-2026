import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const PROGRAM_URL = 'https://langenacht-zuerich.ch/programm?culture=de-ch&limit=1000&skip=0';
const OUT = path.resolve('data/events.json');
const EVENT_DATE = '2026-09-05';
const CATEGORIES = ['Konzert','Führung','Vortrag/Lesung/Gespräch','Dies & das','Film','Party','Performance/Tanz/Theater','Workshop'];
const KNOWN_VENUES = [
  'Alterthümer-Magazin','Altstadtkirchen','Archäologische Fenster','Archäologische Sammlung UZH',
  'Atelier Hermann Haller','Atelier Righini-Fries','Botanischer Garten UZH','Cabaret Voltaire',
  'Einfach Zürich','extract ETH Zürich','FCZ Museum','FIFA Museum','focusTerra – ETH Zürich',
  'Friedhof Forum Museum über Leben und Tod','Graphische Sammlung ETH Zürich','Haus zum Rech',
  'Heimatschutzzentrum in der Villa Patumbah','Helmhaus','KULTURAMA Museum des Menschen','Kunsthalle Zürich',
  'Kunsthaus Zürich','Kunstsammlung der Zürcher Kantonalbank (Gast)','Landesmuseum Zürich',
  'Migros Museum für Gegenwartskunst','Moulagenmuseum','Mühlerama','Musée Visionnaire',
  'Museum für Gestaltung Zürich, Ausstellungsstrasse','Museum für Gestaltung Zürich, Toni-Areal',
  'Museum Haus Konstruktiv','Museum Rietberg','Naturhistorisches Museum UZH','Nordamerika Native Museum NONAM',
  'Pavillon Le Corbusier','Rathaus Hard','Sammlung Johann Caspar Lavater','Schauplatz Brunngasse',
  'Schweizer Finanzmuseum','Science Pavilion UZH','Semper-Sternwarte, ETH Zürich (Gast)','Shedhalle',
  'Stadtgärtnerei – Zentrum für Pflanzen und Bildung','Strauhof','Sukkulenten-Sammlung Zürich',
  'Thomas-Mann-Archiv der ETH Zürich','Tram-Museum Zürich','Uhrenmuseum Beyer','Urania-Sternwarte Zürich',
  'Völkerkundemuseum UZH','Wildnispark Zürich','ZAZ BELLERIVE Zentrum Architektur Zürich',
  'Zentralbibliothek Zürich','Zivilschutz-Museum','Zoo Zürich','Zunftstadt Zürich'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => (s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

function parseTime(text) {
  const t = clean(text);
  let m = t.match(/(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*Uhr/i);
  if (m) return {
    label: m[0].trim(),
    start: `${m[1].padStart(2,'0')}:${m[2] || '00'}`,
    end: `${m[3].padStart(2,'0')}:${m[4] || '00'}`
  };
  m = t.match(/Ab\s+(\d{1,2})(?::(\d{2}))?\s*Uhr/i);
  if (m) return { label: m[0], start: `${m[1].padStart(2,'0')}:${m[2] || '00'}`, end: null };
  m = t.match(/(\d{1,2})(?::(\d{2}))?\s*Uhr/i);
  if (m) return { label: m[0], start: `${m[1].padStart(2,'0')}:${m[2] || '00'}`, end: null };
  return null;
}

function normalizeNightMinute(hhmm) {
  if (!hhmm) return null;
  let [h,m] = hhmm.split(':').map(Number);
  if (h < 6) h += 24;
  return h * 60 + m;
}

async function expandAll(page) {
  for (let i = 0; i < 100; i++) {
    const candidates = page.getByText(/weitere anzeigen/i);
    const count = await candidates.count();
    if (!count) break;
    let clicked = false;
    for (let j = 0; j < count; j++) {
      const el = candidates.nth(j);
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
  }
}

async function extractCards(page) {
  return page.evaluate(({ knownVenues, categories }) => {
    const clean = s => (s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
    const timeRe = /(?:\d{1,2}(?::\d{2})?\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*Uhr)|(?:Ab\s+\d{1,2}(?::\d{2})?\s*Uhr)|(?:\d{1,2}(?::\d{2})?\s*Uhr)/i;
    const headings = [...document.querySelectorAll('h2,h3,h4')];
    const out = [];

    for (const heading of headings) {
      const title = clean(heading.textContent);
      if (!title || title.length < 2 || /^(Programm|Anschrift|Zürcher Museen|Social Media|Sprache)$/i.test(title)) continue;

      let node = heading;
      let card = null;
      for (let depth = 0; depth < 9 && node?.parentElement; depth++, node = node.parentElement) {
        const candidate = node.parentElement;
        const text = clean(candidate.innerText);
        const headingCount = candidate.querySelectorAll('h2,h3,h4').length;
        if (timeRe.test(text) && headingCount <= 2 && text.length < 2200) {
          card = candidate;
          break;
        }
      }
      if (!card) continue;

      const raw = clean(card.innerText);
      const lines = card.innerText.split(/\n+/).map(clean).filter(Boolean);
      const titleIndex = lines.findIndex(x => x === title);
      let venue = knownVenues.find(v => lines.includes(v)) || null;

      if (!venue && titleIndex > 0) {
        const before = lines.slice(Math.max(0, titleIndex - 5), titleIndex).reverse();
        venue = before.find(x =>
          !categories.includes(x) &&
          !timeRe.test(x) &&
          !/^(Spezialhinweis|Findet mehrmals statt|Deutsch|Englisch|Sprachneutral)$/i.test(x) &&
          x.length > 2 && x.length < 140
        ) || null;
      }

      const category = categories.find(c => lines.includes(c)) || null;
      const anchor = card.querySelector('a[href]');
      out.push({ title, venue, category, raw, href: anchor?.href || null });
    }
    return out;
  }, { knownVenues: KNOWN_VENUES, categories: CATEGORIES });
}

function dedupeAndParse(cards) {
  const seen = new Set();
  const events = [];
  for (const card of cards) {
    const time = parseTime(card.raw);
    if (!time || !card.title) continue;
    const venue = clean(card.venue) || 'Unbekannter Ort';
    const key = `${card.title}|${venue}|${time.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const searchUrl = `https://langenacht-zuerich.ch/programm?searchTerm=${encodeURIComponent(card.title)}`;
    events.push({
      id: `e${events.length + 1}`,
      title: clean(card.title),
      venue,
      category: card.category || null,
      time: time.label,
      start: time.start,
      end: time.end,
      startMinute: normalizeNightMinute(time.start),
      endMinute: normalizeNightMinute(time.end),
      url: card.href || searchUrl
    });
  }
  events.sort((a,b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999) || a.venue.localeCompare(b.venue) || a.title.localeCompare(b.title));
  return events;
}

async function geocodeVenue(name) {
  const q = encodeURIComponent(`${name}, Zürich, Switzerland`);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ch&q=${q}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'lange-nacht-map-2026/1.0' } });
  if (!r.ok) return null;
  const data = await r.json();
  const hit = data[0];
  if (!hit) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), displayName: hit.display_name };
}

async function main() {
  console.log('Opening official programme…');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'de-CH' });
  await page.goto(PROGRAM_URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1200);
  await expandAll(page);
  const cards = await extractCards(page);
  await browser.close();

  const events = dedupeAndParse(cards);
  console.log(`Extracted ${events.length} unique timed events from ${cards.length} candidate cards.`);
  if (events.length < 300) {
    throw new Error(`Extraction count (${events.length}) is too low; refusing to overwrite the dataset.`);
  }

  let old = null;
  try { old = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch {}
  const oldCoords = new Map((old?.venues || []).map(v => [v.name, v]));
  const names = [...new Set(events.map(e => e.venue).filter(v => v && v !== 'Unbekannter Ort'))];
  const venues = [];

  for (const name of names) {
    const cached = oldCoords.get(name);
    if (Number.isFinite(cached?.lat) && Number.isFinite(cached?.lng)) {
      venues.push(cached);
      continue;
    }
    process.stdout.write(`Geocoding ${name}… `);
    try {
      const geo = await geocodeVenue(name);
      if (geo) {
        venues.push({ name, ...geo });
        console.log('ok');
      } else {
        venues.push({ name, lat: null, lng: null, displayName: null });
        console.log('not found');
      }
    } catch (err) {
      venues.push({ name, lat: null, lng: null, displayName: null });
      console.log(`failed (${err.message})`);
    }
    await sleep(1100);
  }

  const data = {
    generatedAt: new Date().toISOString(),
    source: PROGRAM_URL,
    eventDate: EVENT_DATE,
    events,
    venues
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(data, null, 2) + '\n');

  const unmapped = venues.filter(v => !Number.isFinite(v.lat) || !Number.isFinite(v.lng)).map(v => v.name);
  console.log(`Wrote ${OUT}`);
  console.log(`${venues.length - unmapped.length}/${venues.length} venues geocoded.`);
  if (unmapped.length) console.log('Unmapped venues:', unmapped.join('; '));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
