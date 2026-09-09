const previousFetch = window.fetch.bind(window);

function todayStop(time, name, description, lat, lng, mapsQuery) {
  return { time, name, description, lat, lng, mapsQuery };
}

function todayRestaurant(name, description, mapsQuery) {
  return { name, description, mapsQuery };
}

function patchToday(data) {
  if (!data?.days) return data;
  const day = data.days.find(item => item.date === '2026-09-09');
  if (!day) return data;

  Object.assign(day, {
    title: 'Little Island + High Line + MoMA + Midtown',
    short: 'West Side → MoMA → Bryant Park / Grand Central · 09:30–18:30 · ~9 ore con pranzo e pause',
    vibe: ['LITTLE ISLAND', 'HIGH LINE', 'MoMA', 'MIDTOWN'],
    weather: {
      high: 30,
      low: 23,
      summary: 'Nuvole e sole, asciutto e caldo.',
      impact: 'Mattina ideale per stare fuori sul West Side; MoMA nel pomeriggio evita la parte più calda della giornata.'
    },
    logic: 'Rockefeller Center e St. Patrick’s sono già fatti, quindi li elimino. Con il meteo asciutto sposto oggi il blocco outdoor che era opzionale domenica: Little Island + High Line al mattino. Dopo pranzo vai al MoMA nel primo pomeriggio e chiudi con Bryant Park, Grand Central e Chrysler Building, senza tornare sui luoghi già visti.',
    stops: [
      todayStop('09:30', 'Little Island', '45 minuti tra giardini, belvedere e Hudson River. È aperta dalle 06:00 e oggi il meteo è favorevole.', 40.74205, -74.01078, 'Little Island, New York, NY'),
      todayStop('10:20', 'High Line · 14th St → 30th St', 'Percorri la High Line verso nord senza fretta, fermandoti ai belvedere e alle installazioni. Circa 75–90 minuti.', 40.74800, -74.00480, 'High Line 14th Street, New York, NY'),
      todayStop('11:50', 'Pranzo Chelsea / Hudson Yards', 'Pranzo di circa un’ora vicino all’uscita della High Line, così eviti deviazioni inutili.', 40.75190, -74.00150, 'Chelsea Market, New York, NY'),
      todayStop('13:00', 'Trasferimento verso MoMA', 'Subway o taxi verso 53rd Street; considera 25–35 minuti porta a porta.', 40.76143, -73.97762, 'Museum of Modern Art, New York, NY'),
      todayStop('13:45', 'MoMA', 'Circa 3 ore. Parti dalla collezione moderna, scegli una sola mostra temporanea e non cercare di vedere tutto. Il museo chiude alle 17:30.', 40.76143, -73.97762, 'Museum of Modern Art, 11 W 53rd St, New York, NY'),
      todayStop('17:00', 'Bryant Park + NYPL', 'Passeggiata verso sud e pausa nel parco; passa davanti alla New York Public Library.', 40.75360, -73.98323, 'Bryant Park, New York, NY'),
      todayStop('17:45', 'Grand Central Terminal', 'Main Concourse, soffitto astronomico e orologio centrale.', 40.75273, -73.97723, 'Grand Central Terminal, New York, NY'),
      todayStop('18:20', 'Chrysler Building dall’esterno', 'Ultima tappa breve: facciata e skyline da Lexington / 42nd Street.', 40.75162, -73.97550, 'Chrysler Building, New York, NY')
    ],
    pause: 'Prima pausa a Little Island; seconda pausa naturale a Bryant Park dopo il MoMA.',
    restaurants: [
      todayRestaurant('Chelsea Market', 'Molte opzioni nello stesso posto; è direttamente sulla rotta della High Line.', 'Chelsea Market, New York, NY'),
      todayRestaurant('Los Tacos No. 1 · Chelsea Market', 'Tacos rapidi e molto comodi prima di spostarti verso il MoMA.', 'Los Tacos No. 1 Chelsea Market, New York, NY'),
      todayRestaurant('The Modern · Bar Room', 'Se preferisci pranzare direttamente al MoMA e accorciare la pausa a Chelsea.', 'The Modern, 9 W 53rd St, New York, NY'),
      todayRestaurant('Urban Hawker', 'Food hall del Sud-est asiatico vicino al MoMA, utile se arrivi in zona prima.', 'Urban Hawker, 135 W 50th St, New York, NY'),
      todayRestaurant('Joe & The Juice · Bryant Park', 'Solo per una pausa leggera nel tardo pomeriggio.', 'Joe & The Juice Bryant Park, New York, NY')
    ],
    routeUrl: 'https://www.google.com/maps/dir/Little+Island,+New+York,+NY/High+Line,+New+York,+NY/Museum+of+Modern+Art,+11+W+53rd+St,+New+York,+NY/Bryant+Park,+New+York,+NY/Grand+Central+Terminal,+New+York,+NY/Chrysler+Building,+New+York,+NY/',
    note: 'Rockefeller Center e St. Patrick’s sono rimossi perché già visitati. High Line e Little Island vengono anticipati da domenica a oggi, sfruttando il tempo asciutto; domenica resta così più semplice per Natural History + Whitney + Pioneer Works.'
  });

  return data;
}

window.fetch = async (...args) => {
  const request = args[0];
  const url = typeof request === 'string' ? request : request?.url || '';
  const response = await previousFetch(...args);
  if (!url.includes('data/nyc-itinerary.json') || !response.ok) return response;

  try {
    const patched = patchToday(await response.clone().json());
    return new Response(JSON.stringify(patched), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.warn('Sep 9 itinerary override failed', error);
    return response;
  }
};
