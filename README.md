# Lange Nacht Zürich 2026 — map

Interactive map for the **Lange Nacht der Zürcher Museen, 5 September 2026**.

- Search by event or museum
- Filter by time and event type
- See all programme entries in a compact list
- Open venue markers on an OpenStreetMap/Leaflet map
- Refresh programme data from the official site with Playwright

## Local preview

```bash
npm install
npm run dev
```

## Refresh the programme

```bash
npx playwright install chromium
npm run scrape
node scripts/enrich-venues.mjs
```

The scraper reads the official programme and writes `data/events.json`. It refuses to replace the dataset if extraction unexpectedly returns fewer than 300 timed events. Venue enrichment uses known public addresses when museum names alone cannot be geocoded reliably.

## Refresh workflow

`.github/workflows/refresh-data.yml` runs automatically when the scraper changes and can also be started manually from GitHub Actions. It commits only `data/events.json` when the programme data changed.

## Deploy on Vercel

Import the repository as a static site:

- Framework preset: **Other**
- Build command: leave empty
- Output directory: leave empty

Source programme: https://langenacht-zuerich.ch/programm
