const originalFetch = window.fetch.bind(window);

function stop(time, name, description, lat, lng, mapsQuery) {
  return { time, name, description, lat, lng, mapsQuery };
}

function restaurant(name, description, mapsQuery) {
  return { name, description, mapsQuery };
}

function patchItinerary(data) {
  if (!data?.days) return data;

  data.note = 'Downtown, Wall Street, Battery, 9/11 Memorial e vista della Statua dal ferry sono già coperti. Itinerario ricalibrato il 9 settembre in base al meteo: privilegia l’outdoor venerdì e sabato; domenica resta la giornata più indoor/flessibile.';
  data.weatherUpdated = '2026-09-09T07:19:00-04:00';

  const byDate = new Map(data.days.map(day => [day.date, day]));

  Object.assign(byDate.get('2026-09-09') || {}, {
    weather: {
      high: 30,
      low: 23,
      summary: 'Prevalentemente soleggiato / parzialmente nuvoloso.',
      impact: 'Caldo ma buono per stare fuori: MoMA nelle ore centrali, poi più Midtown all’aperto e Top of the Rock al tramonto se avete energia.'
    },
    logic: 'Mantieni MoMA come grande blocco indoor nelle ore più calde e usa il pomeriggio per Rockefeller Center, Fifth Avenue, Bryant Park e Grand Central. Con il meteo attuale non serve aggiungere altri musei oggi.',
    note: 'Opzione sera: Top of the Rock verso il tramonto; col bel tempo ha più senso che un secondo museo.'
  });

  Object.assign(byDate.get('2026-09-10') || {}, {
    title: 'SoHo + Chinatown + LES + Guggenheim',
    short: 'SoHo → Chinatown → LES → Museum Mile · 09:45–17:30 · ~7¾ ore',
    vibe: ['CAST IRON', 'FOOD', 'TENEMENT', 'GUGGENHEIM'],
    weather: {
      high: 31,
      low: 21,
      summary: 'Parzialmente soleggiato; 30% di rovesci soprattutto presto e verso sera.',
      impact: 'Il grosso della giornata resta adatto all’outdoor. Tieni SoHo/Chinatown all’aperto e usa il Guggenheim come ultima tappa indoor nel tardo pomeriggio.'
    },
    logic: 'La previsione è migliore del previsto: pioggia possibile soprattutto prima delle 08:00 e di nuovo verso sera. Mantieni quindi il nucleo outdoor di SoHo/Chinatown/LES e aggiungi il Guggenheim nel tardo pomeriggio, quando fa più caldo e aumenta il rischio di rovesci.',
    stops: [
      stop('09:45', 'SoHo Cast-Iron District', 'Greene Street, Mercer, Crosby e Broome. 60–75 minuti tra facciate, negozi e gallerie.', 40.72439, -74.00295, 'Greene Street SoHo, New York, NY'),
      stop('11:00', 'Chinatown · Doyers Street', 'Mott, Pell, Doyers e Canal; poi verso East Broadway.', 40.71439, -73.99808, 'Doyers Street, New York, NY'),
      stop('12:00', 'Pranzo Chinatown / Two Bridges', 'Pranzo senza grandi deviazioni.', 40.71310, -73.99450, 'Two Bridges, New York, NY'),
      stop('13:15', 'Tenement Museum', 'Tour guidato di 60–75 minuti; prenota un solo tour.', 40.71878, -73.99002, 'Tenement Museum, 103 Orchard St, New York, NY'),
      stop('14:35', 'Orchard Street + Essex Market', 'Passeggiata breve e sosta al mercato coperto.', 40.71805, -73.98815, 'Essex Market, New York, NY'),
      stop('15:10', 'Trasferimento verso Museum Mile', 'Subway/taxi verso Upper East Side; considera 30–40 minuti porta a porta.', 40.78300, -73.95890, 'Solomon R. Guggenheim Museum, New York, NY'),
      stop('16:00', 'Solomon R. Guggenheim Museum', '90 minuti: soprattutto l’edificio di Frank Lloyd Wright + Guggenheim Pop: 1960 to Now e Modern European Currents. Chiusura 17:30.', 40.78300, -73.95895, 'Solomon R. Guggenheim Museum, 1071 5th Ave, New York, NY')
    ],
    pause: 'Essex Market è il buffer naturale prima del trasferimento verso Museum Mile.',
    routeUrl: 'https://www.google.com/maps/dir/Greene+Street,+SoHo,+New+York,+NY/Doyers+Street,+New+York,+NY/Tenement+Museum,+103+Orchard+St,+New+York,+NY/Essex+Market,+New+York,+NY/Solomon+R.+Guggenheim+Museum,+1071+5th+Ave,+New+York,+NY/',
    note: 'Pier 35 esce dal percorso principale: se il pomeriggio è perfettamente asciutto e non vi interessa il Guggenheim, può restare come alternativa outdoor.'
  });

  Object.assign(byDate.get('2026-09-11') || {}, {
    weather: {
      high: 27,
      low: 18,
      summary: 'Soleggiato.',
      impact: 'Una delle giornate migliori per stare fuori: non aggiungere altri grandi musei e sfrutta tram, Four Freedoms, ferry e waterfront.'
    },
    logic: 'La giornata più design/architecture resta invariata: il meteo è ideale per tram aereo, Four Freedoms Park, ferry verso Queens, Noguchi Museum e Socrates Sculpture Park.',
    note: 'Mantieni questa giornata il più possibile all’aperto: è una delle finestre meteo migliori del viaggio.'
  });

  Object.assign(byDate.get('2026-09-12') || {}, {
    weather: {
      high: 27,
      low: 20,
      summary: 'Prevalentemente soleggiato.',
      impact: 'Ottimo per una giornata quasi interamente a piedi. Non sacrificare Brooklyn Bridge, waterfront e Village per altri musei.'
    },
    logic: 'Prima parte interamente a Brooklyn; dopo pranzo rientro in metro verso il Village. Con il meteo attuale questa resta una delle giornate più outdoor.',
    routeUrl: 'https://www.google.com/maps/dir/Brooklyn+Bridge+City+Hall,+New+York,+NY/Washington+Street,+DUMBO,+Brooklyn,+NY/Brooklyn+Heights+Promenade,+Brooklyn,+NY/Washington+Square+Park,+New+York,+NY/Christopher+Street+Pier,+New+York,+NY/',
    note: 'Con il sole, tieni la giornata outdoor e non aggiungere visite indoor lunghe.'
  });

  Object.assign(byDate.get('2026-09-13') || {}, {
    title: 'Natural History + Whitney + Pioneer Works',
    short: 'Upper West Side → Meatpacking → Red Hook · 10:00–18:00 · ~8 ore',
    vibe: ['DINOSAURS', 'WHITNEY', 'RED HOOK', 'SECOND SUNDAYS'],
    weather: {
      high: 28,
      low: 21,
      summary: 'Molto nuvoloso con ~40% di probabilità di rovesci.',
      impact: 'È il giorno giusto per una struttura indoor-heavy: Natural History + Whitney, poi Pioneer Works. High Line e Little Island diventano opzionali se resta asciutto.'
    },
    logic: 'Sposto l’American Museum of Natural History qui perché è la giornata con il meteo meno affidabile. Il museo apre alle 10:00; dopo pranzo si scende sul West Side per una visita più corta al Whitney, poi taxi/rideshare verso Red Hook in tempo per Second Sundays, che dura fino alle 18:00.',
    stops: [
      stop('10:00', 'American Museum of Natural History', '2–2¼ ore: dinosauri, Blue Whale e Gems & Minerals. Il Butterfly Vivarium è chiuso fino al 18 settembre; alcuni hall sono temporaneamente chiusi.', 40.78132, -73.97399, 'American Museum of Natural History, 200 Central Park W, New York, NY'),
      stop('12:20', 'Pranzo Upper West Side / trasferimento', 'Pranzo rapido e poi metro/taxi verso Meatpacking.', 40.77670, -73.98150, 'Upper West Side, New York, NY'),
      stop('13:30', 'Whitney Museum', '90 minuti mirati tra collezione, una mostra temporanea e terrazze se il tempo regge.', 40.73959, -74.00886, 'Whitney Museum of American Art, New York, NY'),
      stop('15:10', 'Trasferimento verso Red Hook', 'Taxi/rideshare consigliato per non perdere il nucleo di Second Sundays.', 40.67965, -74.01109, 'Pioneer Works, Brooklyn, NY'),
      stop('16:00', 'Pioneer Works · Second Sundays', 'Open studios, mostre, workshop, musica e food. Evento 12:00–18:00; arriva per l’ultima parte più viva.', 40.67965, -74.01109, 'Pioneer Works, Brooklyn, NY'),
      stop('17:30', 'Louis Valentino Jr. Park & Pier · se asciutto', 'Breve chiusura sul waterfront; se piove, resta a Pioneer Works fino alle 18:00.', 40.67860, -74.01822, 'Louis Valentino Jr. Park and Pier, Brooklyn, NY')
    ],
    pause: 'AMNH e Whitney offrono pause indoor; Pioneer Works permette di restare flessibili fino alle 18:00.',
    restaurants: [
      restaurant('Daily Provisions · Upper West Side', 'Colazione/pranzo rapido vicino al museo.', 'Daily Provisions Upper West Side, New York, NY'),
      restaurant('Jacob’s Pickles', 'Comfort food sull’Upper West Side; più da pranzo seduto.', "Jacob's Pickles, New York, NY"),
      restaurant('Market 57', 'Food hall utile se preferisci mangiare dopo il trasferimento verso downtown.', 'Market 57, New York, NY'),
      restaurant('Red Hook Tavern', 'Se preferisci mangiare a Brooklyn dopo Pioneer Works.', 'Red Hook Tavern, Brooklyn, NY'),
      restaurant('Hometown Bar-B-Que', 'Opzione Red Hook informale, comoda nel quartiere.', 'Hometown Bar-B-Que, Brooklyn, NY')
    ],
    routeUrl: 'https://www.google.com/maps/dir/American+Museum+of+Natural+History,+200+Central+Park+W,+New+York,+NY/Whitney+Museum+of+American+Art,+New+York,+NY/Pioneer+Works,+Brooklyn,+NY/Louis+Valentino+Jr.+Park+and+Pier,+Brooklyn,+NY/',
    note: 'High Line/Little Island non sono più tappe obbligatorie. Se domenica si apre una finestra di bel tempo, puoi inserirne 20–30 minuti tra Whitney e Red Hook solo se non sacrifica Pioneer Works.'
  });

  return data;
}

window.fetch = async (...args) => {
  const request = args[0];
  const url = typeof request === 'string' ? request : request?.url || '';
  const response = await originalFetch(...args);
  if (!url.includes('data/nyc-itinerary.json') || !response.ok) return response;

  try {
    const data = patchItinerary(await response.clone().json());
    return new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.warn('Itinerary patch failed', error);
    return response;
  }
};

const galleryOverrides = {
  '2026-09-10': ['Guggenheim Museum', 'Guggenheim Museum. Exterior.jpg'],
  '2026-09-13': ['American Museum of Natural History', 'AMNH-exterior.jpg']
};

function activeDate() {
  return document.querySelector('#dayRail .day-chip.is-active')?.dataset.date || null;
}

function commonsImage(file) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1600`;
}

function commonsPage(file) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
}

function patchGallery() {
  const date = activeDate();
  const override = galleryOverrides[date];
  const cards = document.querySelectorAll('.nyc-gallery .nyc-carousel-card');
  if (!override || cards.length < 3) return;
  const target = cards[cards.length - 1];
  if (target.dataset.itineraryOverride === date) return;
  const [title, file] = override;
  target.dataset.itineraryOverride = date;
  const image = target.querySelector('img');
  const strong = target.querySelector('strong');
  const link = target.querySelector('a');
  if (image) { image.src = commonsImage(file); image.alt = title; }
  if (strong) strong.textContent = title;
  if (link) link.href = commonsPage(file);
}

new MutationObserver(() => requestAnimationFrame(patchGallery)).observe(document.documentElement, { childList: true, subtree: true });
