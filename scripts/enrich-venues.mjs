import fs from 'node:fs/promises';

const FILE = 'data/events.json';
const ADDRESS_OVERRIDES = {
  'Archäologische Fenster': 'Schifflände 30/32, 8001 Zürich, Switzerland',
  'Archäologische Sammlung UZH': 'Rämistrasse 73, 8006 Zürich, Switzerland',
  'extract ETH Zürich': 'Rämistrasse 101, 8092 Zürich, Switzerland',
  'focusTerra – ETH Zürich': 'Sonneggstrasse 5, 8092 Zürich, Switzerland',
  'Friedhof Forum Museum über Leben und Tod': 'Aemtlerstrasse 149, 8003 Zürich, Switzerland',
  'Graphische Sammlung ETH Zürich': 'Rämistrasse 101, 8092 Zürich, Switzerland',
  'Kunstsammlung der Zürcher Kantonalbank (Gast)': 'Bahnhofstrasse 9, 8001 Zürich, Switzerland',
  'Musée Visionnaire': 'Predigerplatz 10, 8001 Zürich, Switzerland',
  'Museum für Gestaltung Zürich, Toni-Areal': 'Pfingstweidstrasse 96, 8005 Zürich, Switzerland',
  'Stadtgärtnerei – Zentrum für Pflanzen und Bildung': 'Sackzelg 27, 8047 Zürich, Switzerland',
  'Völkerkundemuseum UZH': 'Pelikanstrasse 40, 8001 Zürich, Switzerland',
  'Zivilschutz-Museum': 'Habsburgstrasse 14, 8037 Zürich, Switzerland',
  'Alterthümer-Magazin': 'Sihlamtsstrasse 4, 8001 Zürich, Switzerland',
  'echoes@Cigarettenfabrik (Gast)': 'Sihlquai 268, 8005 Zürich, Switzerland',
  'Thomas-Mann-Archiv der ETH Zürich': 'Rämistrasse 101, 8092 Zürich, Switzerland',
  'Altstadtkirchen · Fraumünster': 'Münsterhof 2, 8001 Zürich, Switzerland',
  'Altstadtkirchen · Grossmünster': 'Zwingliplatz 7, 8001 Zürich, Switzerland',
  'Altstadtkirchen · St. Peter': 'St.-Peterhofstatt 1, 8001 Zürich, Switzerland',
  'Altstadtkirchen · Wasserkirche': 'Limmatquai 31, 8001 Zürich, Switzerland'
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function splitAltstadtkirche(event) {
  if (event.venue !== 'Altstadtkirchen') return event;
  if (/Fraumünster/i.test(event.title)) return { ...event, venue: 'Altstadtkirchen · Fraumünster' };
  if (/Grossmünster/i.test(event.title)) return { ...event, venue: 'Altstadtkirchen · Grossmünster' };
  if (/\bSt\.?[- ]?Peter\b/i.test(event.title)) return { ...event, venue: 'Altstadtkirchen · St. Peter' };
  if (/Wasserkirche/i.test(event.title)) return { ...event, venue: 'Altstadtkirchen · Wasserkirche' };
  return event;
}

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ch&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'lange-nacht-map-2026/1.0' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  const [hit] = await response.json();
  if (!hit) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), displayName: hit.display_name };
}

const data = JSON.parse(await fs.readFile(FILE, 'utf8'));
data.events = data.events.map(splitAltstadtkirche);

const existing = new Map(data.venues.map(venue => [venue.name, venue]));
const venueNames = [...new Set(data.events.map(event => event.venue).filter(Boolean))];
const venues = [];

for (const name of venueNames) {
  const current = existing.get(name);
  if (Number.isFinite(current?.lat) && Number.isFinite(current?.lng)) {
    venues.push(current);
    continue;
  }

  const query = ADDRESS_OVERRIDES[name];
  if (!query) {
    venues.push(current || { name, lat: null, lng: null, displayName: null });
    continue;
  }

  process.stdout.write(`Resolving ${name}… `);
  try {
    const location = await geocode(query);
    if (location) {
      venues.push({ name, ...location });
      console.log('ok');
    } else {
      venues.push({ name, lat: null, lng: null, displayName: query });
      console.log('not found');
    }
  } catch (error) {
    venues.push({ name, lat: null, lng: null, displayName: query });
    console.log(`failed (${error.message})`);
  }
  await sleep(1100);
}

data.venues = venues;
await fs.writeFile(FILE, JSON.stringify(data, null, 2) + '\n');

const unmapped = venues.filter(v => !Number.isFinite(v.lat) || !Number.isFinite(v.lng));
console.log(`${venues.length - unmapped.length}/${venues.length} venue groups mapped after enrichment.`);
if (unmapped.length) console.log('Still unmapped:', unmapped.map(v => v.name).join('; '));
