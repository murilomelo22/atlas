let collection;
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
  const found = collection?.features.find((feature) => {
    const { type, coordinates } = feature.geometry;
    return type === 'Polygon' ? inPolygon(lng, lat, coordinates) : type === 'MultiPolygon' && coordinates.some((rings) => inPolygon(lng, lat, rings));
  });
  if (!found) return { countryId: null, countryName: 'País não identificado', continent: null };
  return { countryId: String(found.id), countryName: found.properties.name, continent: found.properties.continent || continentFor(found.properties.iso) };
}
export function normalizeCoordinates(lat, lng) {
  if (lat === '' || lng === '') throw new Error('Informe latitude e longitude.');
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < -90 || a > 90 || b < -180 || b > 180) throw new Error('Latitude deve estar entre −90 e 90; longitude entre −180 e 180.');
  return { lat: a, lng: b };
}
