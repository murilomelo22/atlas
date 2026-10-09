// Execute once when updating the already installed dependencies. No network access.
import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { feature } from 'topojson-client';
import { normalizeBoundaries } from './boundaries.mjs';
const root = new URL('../', import.meta.url);
const path = (name) => new URL(name, root);
await mkdir(path('vendor/leaflet'), { recursive: true });
await mkdir(path('vendor/markercluster'), { recursive: true });
for (const file of ['leaflet.js', 'leaflet.css']) {
  await copyFile(path(`node_modules/leaflet/dist/${file}`), path(`vendor/leaflet/${file}`));
}
await cp(path('node_modules/leaflet/dist/images'), path('vendor/leaflet/images'), { recursive: true });
for (const file of ['leaflet.markercluster.js', 'MarkerCluster.css', 'MarkerCluster.Default.css']) {
  await copyFile(path(`node_modules/leaflet.markercluster/dist/${file}`), path(`vendor/markercluster/${file}`));
}
for (const [source, target] of [['leaflet/LICENSE', 'leaflet/LICENSE'], ['leaflet.markercluster/MIT-LICENCE.txt', 'markercluster/LICENSE'], ['world-atlas/LICENSE', 'WORLD-ATLAS-LICENSE'], ['topojson-client/LICENSE', 'TOPOJSON-LICENSE']]) {
  await copyFile(path(`node_modules/${source}`), path(`vendor/${target}`));
}
const atlas = JSON.parse(await readFile(path('node_modules/world-atlas/countries-50m.json'), 'utf8'));
const regions = JSON.parse(await readFile(new URL('iso-regions.json', import.meta.url), 'utf8'));
const displayNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const countries = feature(atlas, atlas.objects.countries);
for (const country of countries.features) {
  const disputed = {
    'N. Cyprus': ['local-northern-cyprus', 'Chipre do Norte', 'Europa'],
    'Somaliland': ['local-somaliland', 'Somalilândia', 'África'],
    'Kosovo': ['local-kosovo', 'Kosovo', 'Europa'],
    'Siachen Glacier': ['local-siachen', 'Geleira de Siachen', 'Ásia'],
    'Indian Ocean Ter.': ['036', 'Austrália', 'Oceania'],
  }[country.properties.name];
  if (disputed) {
    [country.id, country.properties.name, country.properties.continent] = disputed;
  }
  const code = regions[String(country.id).padStart(3, '0')];
  if (code) country.properties.name = displayNames.of(code);
  country.properties.iso = code || null;
}
await writeFile(path('vendor/countries.geojson'), JSON.stringify(normalizeBoundaries(countries)));
console.log(`Arquivos locais preparados: ${countries.features.length} países.`);
