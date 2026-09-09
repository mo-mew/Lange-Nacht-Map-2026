const baseFetch = window.fetch.bind(window);

function patchAfternoon(data) {
  if (!data?.days) return data;
  const day = data.days.find(item => item.date === '2026-09-09');
  if (!day) return data;

  Object.assign(day, {
    title: 'Manhattan West → Hudson Yards lobbies',
    short: 'Da One Manhattan West → Moynihan → Pendry → 50 HY → 30 HY → The Shed · ~1h45–2h',
    vibe: ['LOBBIES', 'CORPORATE HQ', 'PUBLIC ART', 'HUDSON YARDS'],
    logic: 'Partendo da One Manhattan West conviene fare prima il piccolo detour verso est a Moynihan, poi tornare una sola volta verso ovest e scendere progressivamente dentro Manhattan West/Hudson Yards. Pendry viene dopo le 16:00, quando il Garden Room è aperto. Niente MoMA oggi.',
    stops: [
      {
        time: 'Adesso',
        name: 'One Manhattan West',
        description: 'Punto di partenza. Se avete già visto bene la lobby, uscite verso 33rd Street e andate subito a Moynihan.',
        lat: 40.7519,
        lng: -73.9979,
        mapsQuery: 'One Manhattan West, 395 9th Avenue, New York, NY'
      },
      {
        time: '15:45 circa',
        name: 'Moynihan Train Hall',
        description: '10–15 minuti. Grande tetto vetrato, struttura in acciaio e arte pubblica di Kehinde Wiley, Elmgreen & Dragset e Stan Douglas. È completamente pubblico e aperto 05:00–01:00.',
        lat: 40.751355,
        lng: -73.995239,
        mapsQuery: 'Moynihan Train Hall, 421 8th Avenue, New York, NY'
      },
      {
        time: '16:05 circa',
        name: 'Pendry Manhattan West',
        description: '10–15 minuti. Entrate nella lobby e guardate il Garden Room accanto al cuore dell’hotel: legni, pietra e atmosfera molto più domestica rispetto alle torri corporate. Il Garden Room apre alle 16:00.',
        lat: 40.75316,
        lng: -73.99849,
        mapsQuery: 'Pendry Manhattan West, 438 W 33rd St, New York, NY'
      },
      {
        time: '16:25 circa',
        name: '50 Hudson Yards',
        description: '15 minuti. Priorità alta: Foster + Partners, lobby pubbliche, scala scultorea e due grandi opere di Frank Stella. È il passaggio più vicino all’effetto “mega HQ americano”.',
        lat: 40.754775,
        lng: -74.001114,
        mapsQuery: '50 Hudson Yards, New York, NY'
      },
      {
        time: '16:50 circa',
        name: '30 Hudson Yards',
        description: '15 minuti. Lobby a tripla altezza con Voices di Jaume Plensa. L’upper lobby funziona come concourse pubblico fra la piazza e 10th Avenue; le aree tenant restano naturalmente controllate.',
        lat: 40.7541,
        lng: -74.0008,
        mapsQuery: '30 Hudson Yards, 500 W 33rd St, New York, NY'
      },
      {
        time: '17:10 circa',
        name: 'The Shed',
        description: '15–20 minuti per chiudere con un edificio più culturale che corporate. Guardate volume, shell mobile e Doctoroff Lobby. L’ingresso da 30th Street risulta temporaneamente chiuso: usate Hudson Yards Public Square / ingresso sul lato est.',
        lat: 40.753328,
        lng: -74.002898,
        mapsQuery: 'The Shed, 545 W 30th St, New York, NY'
      }
    ],
    pause: 'Se volete una pausa vera, fatela al Pendry dopo le 16:00. Altrimenti tenete il giro compatto e finite al The Shed verso le 17:30.',
    restaurants: [
      {
        name: 'Garden Room · Pendry Manhattan West',
        description: 'Sosta elegante e vicina alla lobby; apre alle 16:00.',
        mapsQuery: 'Garden Room Pendry Manhattan West, New York, NY'
      },
      {
        name: 'Cedric’s at The Shed',
        description: 'Bar dentro The Shed; utile solo se volete fermarvi alla fine del giro.',
        mapsQuery: 'Cedric’s at The Shed, New York, NY'
      }
    ],
    note: 'Moynihan viene prima solo per geografia: è il piccolo detour a est. Da Pendry in poi il percorso scorre tutto verso Hudson Yards senza tornare indietro. Se avete poco tempo, tagliate Pendry o The Shed, non 50 e 30 Hudson Yards.',
    alternatives: [
      {
        time: 'Se volete accorciare',
        name: 'Solo 50 + 30 Hudson Yards',
        description: 'Sono i due passaggi con più “wow” da lobby corporate. Da One Manhattan West fate direttamente 50 HY → 30 HY e chiudete lì.',
        lat: 40.754775,
        lng: -74.001114,
        mapsQuery: '50 Hudson Yards, New York, NY',
        kind: 'Versione corta'
      }
    ],
    legs: [
      { fromStop: 0, toStop: 1, mode: 'walking', estimate: '3–5 min a piedi, stima' },
      { fromStop: 1, toStop: 2, mode: 'walking', estimate: '5–7 min a piedi, stima' },
      { fromStop: 2, toStop: 3, mode: 'walking', estimate: '5–7 min a piedi, stima' },
      { fromStop: 3, toStop: 4, mode: 'walking', estimate: '3–5 min a piedi, stima' },
      { fromStop: 4, toStop: 5, mode: 'walking', estimate: '5–8 min a piedi, stima' }
    ],
    gallery: [
      { title: 'Moynihan Train Hall', file: 'Moynihan Train Hall interior.jpg' },
      { title: '50 Hudson Yards', file: '50 Hudson Yards (55379880087).jpg', credit: 'Ajay Suresh', license: 'CC BY 4.0' },
      { title: '30 Hudson Yards', file: '30 Hudson Yards 2026 001.jpg', credit: 'Kidfly182' },
      { title: 'The Shed', file: 'The Shed.jpg', credit: 'Kentuckyfriedtucker', license: 'CC0' }
    ],
    sources: [
      'https://moynihantrainhall.nyc/discover/art/',
      'https://www.pendry.com/manhattan-west/dining/garden-room/',
      'https://www.fosterandpartners.com/projects/50-hudson-yards',
      'https://www.kpf.com/project/30-hudson-yards-lobby-cafe',
      'https://www.theshed.org/about/building',
      'https://www.theshed.org/support/rentals'
    ],
    routeUrl: 'https://www.google.com/maps/dir/?api=1&origin=One+Manhattan+West%2C+395+9th+Avenue%2C+New+York%2C+NY&destination=The+Shed%2C+545+W+30th+St%2C+New+York%2C+NY&waypoints=Moynihan+Train+Hall%2C+421+8th+Avenue%2C+New+York%2C+NY%7CPendry+Manhattan+West%2C+438+W+33rd+St%2C+New+York%2C+NY%7C50+Hudson+Yards%2C+New+York%2C+NY%7C30+Hudson+Yards%2C+500+W+33rd+St%2C+New+York%2C+NY&travelmode=walking'
  });

  return data;
}

window.fetch = async (...args) => {
  const request = args[0];
  const url = typeof request === 'string' ? request : request?.url || '';
  const response = await baseFetch(...args);
  if (!url.includes('data/nyc-itinerary.json') || !response.ok) return response;

  try {
    const patched = patchAfternoon(await response.clone().json());
    return new Response(JSON.stringify(patched), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.warn('Sep 9 afternoon update failed', error);
    return response;
  }
};
