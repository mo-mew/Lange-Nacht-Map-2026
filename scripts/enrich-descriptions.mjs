import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const PROGRAM_URL = 'https://langenacht-zuerich.ch/programm?culture=de-ch&limit=1000&skip=0';
const OUT = path.resolve('data/events.json');
const MIN_MATCHED_EVENTS = 250;

async function expandAll(page) {
  for (let i = 0; i < 100; i += 1) {
    const candidates = page.getByText(/weitere anzeigen/i);
    const count = await candidates.count();
    if (!count) break;

    let clicked = false;
    for (let j = 0; j < count; j += 1) {
      const element = candidates.nth(j);
      if (await element.isVisible().catch(() => false)) {
        await element.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
  }
}

async function extractDescriptions(page, knownVenues) {
  return page.evaluate(({ knownVenues }) => {
    const clean = value => (value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    const timeRe = /(?:\d{1,2}(?::\d{2})?\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*Uhr)|(?:Ab\s+\d{1,2}(?::\d{2})?\s*Uhr)|(?:\d{1,2}(?::\d{2})?\s*Uhr)/i;
    const boilerplateRe = /^(Spezialhinweis|Findet mehrmals statt|Deutsch|Englisch|Sprachneutral|Für Kinder \/ Familien|Rollstuhlgängig)$/i;
    const venueSet = new Set(knownVenues);
    const result = new Map();

    for (const heading of document.querySelectorAll('h2,h3,h4')) {
      const title = clean(heading.textContent);
      if (!title || title.length < 2 || /^(Programm|Anschrift|Zürcher Museen|Social Media|Sprache)$/i.test(title)) continue;

      let node = heading;
      let card = null;
      for (let depth = 0; depth < 9 && node?.parentElement; depth += 1, node = node.parentElement) {
        const candidate = node.parentElement;
        const text = clean(candidate.innerText);
        const headingCount = candidate.querySelectorAll('h2,h3,h4').length;
        if (timeRe.test(text) && headingCount <= 2 && text.length < 2200) {
          card = candidate;
          break;
        }
      }
      if (!card) continue;

      const lines = card.innerText.split(/\n+/).map(clean).filter(Boolean);
      const titleIndex = lines.findIndex(line => line === title);
      if (titleIndex < 0) continue;

      const descriptionLines = [];
      for (const line of lines.slice(titleIndex + 1)) {
        if (timeRe.test(line)) break;
        if (boilerplateRe.test(line) || venueSet.has(line) || line === title || line.length < 3) continue;
        if (line.startsWith(`${title} `)) continue;
        descriptionLines.push(line);
      }

      const description = clean(descriptionLines.join(' '));
      if (description && description.length <= 600 && !result.has(title)) {
        result.set(title, description);
      }
    }

    return [...result.entries()].map(([title, description]) => ({ title, description }));
  }, { knownVenues });
}

async function main() {
  const dataset = JSON.parse(await fs.readFile(OUT, 'utf8'));
  if (!Array.isArray(dataset.events) || !dataset.events.length) {
    throw new Error('events.json has no events to enrich.');
  }

  const knownVenues = [...new Set(dataset.events.map(event => String(event.venue || '').split(' · ')[0]).filter(Boolean))];

  console.log('Opening official programme for descriptions…');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'de-CH' });

  try {
    await page.goto(PROGRAM_URL, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1200);
    await expandAll(page);
    const extracted = await extractDescriptions(page, knownVenues);
    const byTitle = new Map(extracted.map(item => [item.title, item.description]));

    let matched = 0;
    dataset.events = dataset.events.map(event => {
      const description = byTitle.get(event.title);
      if (!description) return event;
      matched += 1;
      return { ...event, description };
    });

    console.log(`Matched descriptions for ${matched}/${dataset.events.length} events (${byTitle.size} unique titles).`);
    if (matched < MIN_MATCHED_EVENTS) {
      throw new Error(`Only ${matched} events matched descriptions; refusing to overwrite the dataset.`);
    }

    await fs.writeFile(OUT, `${JSON.stringify(dataset, null, 2)}\n`);
    console.log(`Wrote descriptions to ${OUT}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
