const DESCRIPTION_DATA_URL = 'data/events.json';

const normalize = value => String(value || '').trim();
const eventKey = (venue, title) => `${normalize(venue)}\u0000${normalize(title)}`;

let descriptions = new Map();
let framePending = false;

function scheduleEnrichment() {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(() => {
    framePending = false;
    enrichVisibleEvents();
  });
}

function descriptionFor(venue, title) {
  return descriptions.get(eventKey(venue, title)) || '';
}

function makeDescription(text, className = 'event-description') {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

function enrichVenueCards() {
  document.querySelectorAll('.venue-card').forEach(card => {
    const venue = normalize(card.querySelector('.venue-card-title')?.textContent);
    if (!venue) return;

    card.querySelectorAll('.event-preview').forEach(preview => {
      if (preview.querySelector('.event-description')) return;
      const titleNode = preview.querySelector(':scope > span');
      const title = normalize(titleNode?.textContent);
      const description = descriptionFor(venue, title);
      if (!titleNode || !description) return;

      titleNode.textContent = '';
      titleNode.classList.add('event-preview-copy');
      const titleElement = document.createElement('strong');
      titleElement.textContent = title;
      const descriptionElement = document.createElement('small');
      descriptionElement.className = 'event-description';
      descriptionElement.textContent = description;
      titleNode.append(titleElement, descriptionElement);
    });
  });
}

function enrichAgenda() {
  const detail = document.querySelector('#detailView:not([hidden])');
  if (!detail) return;
  const venue = normalize(detail.querySelector('.detail-hero h2')?.textContent);
  if (!venue) return;

  detail.querySelectorAll('.agenda-row').forEach(row => {
    if (row.querySelector('.event-description')) return;
    const title = normalize(row.querySelector('strong')?.textContent);
    const description = descriptionFor(venue, title);
    if (!description) return;

    const meta = row.querySelector('.agenda-meta');
    const paragraph = makeDescription(description);
    meta?.before(paragraph);
  });

  detail.querySelectorAll('.agenda-meta a').forEach(link => {
    if (link.textContent !== 'Programma ufficiale ↗') link.textContent = 'Programma ufficiale ↗';
  });
}

function enrichMapCard() {
  const card = document.querySelector('#mapCard:not([hidden])');
  if (!card) return;
  const venue = normalize(card.querySelector('h2')?.textContent);
  if (!venue) return;

  card.querySelectorAll('.map-preview').forEach(preview => {
    if (preview.querySelector('.event-description')) return;
    const titleNode = preview.querySelector(':scope > span');
    const title = normalize(titleNode?.textContent);
    const description = descriptionFor(venue, title);
    if (!description) return;

    preview.append(makeDescription(description));
  });
}

function enrichVisibleEvents() {
  if (!descriptions.size) return;
  enrichVenueCards();
  enrichAgenda();
  enrichMapCard();
}

async function loadDescriptions() {
  try {
    const response = await fetch(DESCRIPTION_DATA_URL, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    descriptions = new Map(
      (data.events || [])
        .filter(event => event.description)
        .map(event => [eventKey(event.venue, event.title), event.description])
    );
    enrichVisibleEvents();
  } catch {
    // Descriptions are progressive enhancement; the core app remains usable without them.
  }
}

const observer = new MutationObserver(scheduleEnrichment);
observer.observe(document.body, { childList: true, subtree: true });
loadDescriptions();
