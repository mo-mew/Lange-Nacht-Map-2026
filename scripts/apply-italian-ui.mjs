import fs from 'node:fs/promises';

const APP = 'app.js';
const INDEX = 'index.html';

let app = await fs.readFile(APP, 'utf8');
let index = await fs.readFile(INDEX, 'utf8');

const marker = `function eventTitle(event) {`;

if (!app.includes(marker)) {
  app = app.replace(
    `function groupBy(items, keyFn) {`,
    `function eventTitle(event) {\n  return event.titleIt || event.title || '';\n}\n\nfunction eventDescription(event) {\n  return event.descriptionIt || event.description || '';\n}\n\nfunction categoryLabel(category) {\n  if (!category) return '';\n  const match = data.events.find(event => event.category === category && event.categoryIt);\n  return match?.categoryIt || category;\n}\n\nfunction eventCategory(event) {\n  return event.categoryIt || categoryLabel(event.category);\n}\n\nfunction groupBy(items, keyFn) {`
  );

  app = app.replaceAll(`toLocaleLowerCase('de-CH')`, `toLocaleLowerCase('it-CH')`);

  app = app.replace(
    `const searchable = \`${'${event.title}'} ${'${event.venue}'} ${'${event.category || \'\'}'}\`.toLocaleLowerCase('it-CH');`,
    `const searchable = \`${'${eventTitle(event)}'} ${'${event.title}'} ${'${eventDescription(event)}'} ${'${event.description || \'\'}'} ${'${event.venue}'} ${'${eventCategory(event)}'} ${'${event.category || \'\'}'}\`.toLocaleLowerCase('it-CH');`
  );

  app = app.replace(
    `function eventPreviewHtml(event) {\n  return \`\n    <span class="event-preview">\n      <time>${'${escapeHtml(shortTime(event.start))}'}</time>\n      <span>${'${escapeHtml(event.title)}'}</span>\n    </span>\n  \`;\n}`,
    `function eventPreviewHtml(event) {\n  const description = eventDescription(event);\n  return \`\n    <span class="event-preview">\n      <time>${'${escapeHtml(shortTime(event.start))}'}</time>\n      <span class="event-preview-copy">\n        <strong>${'${escapeHtml(eventTitle(event))}'}</strong>\n        ${'${description ? `<small class="event-description">${escapeHtml(description)}</small>` : \'\'}'}\n      </span>\n    </span>\n  \`;\n}`
  );

  app = app.replace(
    `const categories = [...new Set(events.map(event => event.category).filter(Boolean))].slice(0, 2);`,
    `const categories = [...new Set(events.map(event => eventCategory(event)).filter(Boolean))].slice(0, 2);`
  );

  app = app.replace(
    `<span>${'${escapeHtml(event.title)}'}</span>`,
    `<span class="map-preview-copy"><strong>${'${escapeHtml(eventTitle(event))}'}</strong>${'${eventDescription(event) ? `<small class="event-description">${escapeHtml(eventDescription(event))}</small>` : \'\'}'}</span>`
  );

  app = app.replace(
    `.filter(event => !query || \`${'${event.title}'} ${'${event.venue}'} ${'${event.category || \'\'}'}\`.toLocaleLowerCase('it-CH').includes(query))`,
    `.filter(event => !query || \`${'${eventTitle(event)}'} ${'${event.title}'} ${'${eventDescription(event)}'} ${'${event.description || \'\'}'} ${'${event.venue}'} ${'${eventCategory(event)}'} ${'${event.category || \'\'}'}\`.toLocaleLowerCase('it-CH').includes(query))`
  );

  app = app.replace(
    `<strong>${'${escapeHtml(event.title)}'}</strong>\n        <div class="agenda-meta">\n          ${'${event.category ? `<span>${escapeHtml(event.category)}</span>` : \'\'}'}\n          <a href="${'${escapeHtml(event.url)}'}" target="_blank" rel="noreferrer">Dettagli ↗</a>`,
    `<strong>${'${escapeHtml(eventTitle(event))}'}</strong>\n        ${'${eventDescription(event) ? `<p class="event-description">${escapeHtml(eventDescription(event))}</p>` : \'\'}'}\n        <div class="agenda-meta">\n          ${'${event.category ? `<span>${escapeHtml(eventCategory(event))}</span>` : \'\'}'}\n          <a href="${'${escapeHtml(event.url)}'}" target="_blank" rel="noreferrer">Programma ufficiale ↗</a>`
  );

  app = app.replace(
    `if (state.category) bits.push(state.category);`,
    `if (state.category) bits.push(categoryLabel(state.category));`
  );

  app = app.replace(
    `.sort((a, b) => a.localeCompare(b, 'de-CH'));`,
    `.sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'it-CH'));`
  );

  app = app.replace(
    `...categories.map(category => ({ value: category, label: category }))`,
    `...categories.map(category => ({ value: category, label: categoryLabel(category) }))`
  );
}

index = index.replace(`\n  <script type="module" src="event-descriptions.js"></script>`, '');

await fs.writeFile(APP, app);
await fs.writeFile(INDEX, index);
console.log('Italian UI patch applied.');
