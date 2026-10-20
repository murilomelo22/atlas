// Input: Natural Earth's admin-1 GeoJSON, simplified with shared topology:
// npm_config_cache=/tmp/atlas-npm-cache npx --yes --package=mapshaper mapshaper \
//   /tmp/atlas-admin1.geojson -simplify weighted 8% keep-shapes \
//   -filter-fields iso_a2,iso_3166_2,adm1_code,name,name_pt,type_en \
//   -o format=geojson precision=0.001 /tmp/atlas-admin1-small.geojson
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { normalizeBoundaries } from './boundaries.mjs';
const input = process.argv[2];
if (!input) throw new Error('Pass the path to the simplified admin-1 GeoJSON.');
const source = JSON.parse(await readFile(input, 'utf8'));
const directory = new URL('../vendor/subdivisions/', import.meta.url);
await mkdir(directory, { recursive: true });
const groups = new Map();
for (const feature of source.features) {
  const p = feature.properties, code = p.iso_a2;
  if (!/^[A-Z]{2}$/.test(code) || code === 'BR') continue;
  const features = groups.get(code) || [];
  features.push({ type: 'Feature', id: p.adm1_code, properties: {
    name: p.name_pt || p.name, code: p.iso_3166_2 === '-1' ? p.adm1_code : p.iso_3166_2,
    type: p.type_en || 'Divisão administrativa',
  }, geometry: feature.geometry });
  groups.set(code, features);
}
const index = { BR: { count: 27, file: 'brazil-states.geojson' } };
for (const [code, features] of [...groups].sort()) {
  if (features.length < 2) continue;
  await writeFile(new URL(`${code}.geojson`, directory), JSON.stringify(normalizeBoundaries({ type: 'FeatureCollection', features })) + '\n');
  index[code] = { count: features.length, file: `subdivisions/${code}.geojson` };
}
await writeFile(new URL('index.json', directory), JSON.stringify(index) + '\n');
console.log(`${Object.keys(index).length} country subdivision files prepared.`);
