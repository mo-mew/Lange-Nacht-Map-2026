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
```

The scraper reads the official programme and writes `data/events.json`. It refuses to replace the dataset if extraction unexpectedly returns fewer than 300 timed events.

## Automatic refresh

`.github/workflows/refresh-data.yml` runs the scraper on changes, manually, and once a day. If the official programme changes, it commits only `data/events.json`.

## Deploy on Vercel

Import the repository as a static site:

- Framework preset: **Other**
- Build command: leave empty
- Output directory: leave empty

Source programme: https://langenacht-zuerich.ch/programm
