let collection;
let boundaries = [];
const groups = {
  'Europa': 'AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA',
  'África': 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH',
  'América do Norte': 'AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US GL PR',
  'América do Sul': 'AR BO BR CL CO EC GY PY PE SR UY VE FK',
  'Oceania': 'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU NC',
  'Antártida': 'AQ TF',
};
export async function loadCountries() {
  const response = await fetch('./vendor/countries.geojson');
  if (!response.ok) throw new Error('Não foi possível carregar os países. Verifique os arquivos locais e recarregue.');
  collection = await response.json();
  boundaries = collection.features.flatMap(feature => (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates).flatMap(polygon => polygon.map(ring => ({ feature, ring,
    west: Math.min(...ring.map(p=>p[0])), east: Math.max(...ring.map(p=>p[0])), south: Math.min(...ring.map(p=>p[1])), north: Math.max(...ring.map(p=>p[1])),
  }))));
  return collection;
}
export const continentFor = (code) => Object.entries(groups).find(([, codes]) => codes.split(' ').includes(code))?.[0] || 'Ásia';
function onSegment(x, y, a, b) {
  const cross = (y - a[1]) * (b[0] - a[0]) - (x - a[0]) * (b[1] - a[1]);
  return Math.abs(cross) < 1e-9 && x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]) && y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1]);
}
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (onSegment(lng, lat, a, b)) return true;
    if ((a[1] > lat) !== (b[1] > lat) && lng < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function inPolygon(lng, lat, rings) {
  return inRing(lng, lat, rings[0]) && !rings.slice(1).some((ring) => inRing(lng, lat, ring));
}
export function countryAt(lat, lng) {
  let found = collection?.features.find((feature) => {
    const { type, coordinates } = feature.geometry;
    return type === 'Polygon' ? inPolygon(lng, lat, coordinates) : type === 'MultiPolygon' && coordinates.some((rings) => inPolygon(lng, lat, rings));
  });
  let approximate = false;
  if (!found) {
    // Natural Earth's coastlines omit tiny islands and simplify coastal cities.
    // Lookup tolerance only: the displayed polygons are never enlarged.
    const cos = Math.max(0.0001, Math.cos(lat * Math.PI / 180));
    let distance = 3;
    for (const boundary of boundaries) {
      if (lat < boundary.south - 3/111.2 || lat > boundary.north + 3/111.2) continue;
      for (const target of [lng,lng-360,lng+360]) {
        if (target < boundary.west - 3/(111.2*cos) || target > boundary.east + 3/(111.2*cos)) continue;
        for (let i=1;i<boundary.ring.length;i++) {
          const a=boundary.ring[i-1],b=boundary.ring[i],x=(a[0]-target)*cos,y=a[1]-lat,dx=(b[0]-a[0])*cos,dy=b[1]-a[1];
          const t=Math.min(1,Math.max(0,-(x*dx+y*dy)/(dx*dx+dy*dy || 1)));
          const km=Math.hypot(x+t*dx,y+t*dy)*111.2;
          if(km<distance){distance=km;found=boundary.feature;approximate=true;}
        }
      }
    }
  }
  if (!found) return { countryId: null, countryName: 'País não identificado', continent: null };
  return { countryId: String(found.id), countryName: found.properties.name, continent: found.properties.continent || continentFor(found.properties.iso), ...(approximate ? { countryApproximate:true } : {}) };
}
export function normalizeCoordinates(lat, lng) {
  if (lat === '' || lng === '') throw new Error('Informe latitude e longitude.');
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < -90 || a > 90 || b < -180 || b > 180) throw new Error('Latitude deve estar entre −90 e 90; longitude entre −180 e 180.');
  return { lat: a, lng: b };
}
