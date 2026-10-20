import { containsCoordinates, wrapFeature } from './geography.js';
import { countryFocusBounds } from './country-search.js';

const key = feature => feature.properties.sigla || String(feature.id);
function distanceToBoundary(feature, lat, lng) {
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const cos = Math.max(0.001, Math.cos(lat * Math.PI / 180));
  let nearest = Infinity;
  for (const rings of polygons) for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], x = (a[0] - lng) * cos, y = a[1] - lat;
    const dx = (b[0] - a[0]) * cos, dy = b[1] - a[1];
    const t = Math.min(1, Math.max(0, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(x + t * dx, y + t * dy) * 111.2);
  }
  return nearest;
}
function visitedRegions(features, places) {
  const ids = new Set(), matched = [];
  for (const place of places) {
    let found = features.find(feature => containsCoordinates(feature, place.lat, place.lng));
    // Display-only coastal tolerance for simplified reference outlines.
    if (!found) {
      let nearest = 5;
      for (const feature of features) {
        const distance = distanceToBoundary(feature, place.lat, place.lng);
        if (distance < nearest) { nearest = distance; found = feature; }
      }
    }
    if (found) ids.add(key(found));
    if (found || place.countryId) matched.push(place);
  }
  return { ids, places: matched };
}

export function createBrazilStateLayer(map, getTheme) {
  const bounds = L.latLngBounds([[-34, -74], [6, -34]]);
  const pane = map.createPane('brazilStates');
  pane.style.zIndex = '410';
  pane.style.pointerEvents = 'none';
  let selected = null, places = [], layer, data = [], dataCountry, loadingCode, generation = 0, catalog;
  let visited = new Set();
  const requests = new Map();
  const visible = () => selected || (map.getZoom() >= 4 && map.getBounds().intersects(bounds));
  const style = feature => ({
    color: getTheme() === 'dark' ? '#a3b29a' : '#566c58',
    weight: map.getZoom() >= 6 ? 1.2 : 0.8,
    opacity: 0.85, fill: visited.has(key(feature)), fillColor: '#d4a76f', fillOpacity: 0.48, interactive: false,
  });
  async function load(code) {
    if (!code) return [];
    if (!requests.has(code)) {
      const promise = (async () => {
        let file = 'brazil-states.geojson';
        if (code !== 'BR') {
          catalog ||= fetch('./vendor/subdivisions/index.json').then(response => {
            if (!response.ok) throw new Error('Divisões indisponíveis');
            return response.json();
          }).catch(error => { catalog = null; throw error; });
          const entry = (await catalog)[code];
          if (!entry) return [];
          file = entry.file;
        }
        const response = await fetch(`./vendor/${file}`);
        if (!response.ok) throw new Error('Divisões indisponíveis');
        return (await response.json()).features;
      })().catch(error => { requests.delete(code); throw error; });
      requests.set(code, promise);
    }
    return requests.get(code);
  }
  function paint() {
    if (!layer) return;
    layer.setStyle(style);
    layer.eachLayer(region => { region.getElement()?.setAttribute('data-visited', String(visited.has(key(region.feature)))); });
    if (visible()) { if (!map.hasLayer(layer)) layer.addTo(map); }
    else map.removeLayer(layer);
  }
  async function display(code) {
    const token = ++generation; loadingCode = code;
    try {
      const features = await load(code);
      if (token !== generation) return { count: 0, visited: 0 };
      if (layer) map.removeLayer(layer);
      data = features; dataCountry = code;
      const matches = selected ? visitedRegions(data, places) : { ids: new Set(), places: [] };
      visited = matches.ids;
      const view = selected && countryFocusBounds(selected);
      const anchor = view && (view[0][1] + view[1][1]) / 2;
      const rendered = selected ? features.map(feature => wrapFeature(feature, anchor)) : features;
      layer = L.geoJSON({ type: 'FeatureCollection', features: rendered }, {
        pane: 'brazilStates', interactive: false, style,
        onEachFeature(feature, region) {
          region.on('add', () => {
            const path = region.getElement();
            if (!path) return;
            path.dataset.subdivisionId = key(feature); path.dataset.regionName = feature.properties.name;
            path.dataset.visited = String(visited.has(key(feature)));
            if (feature.properties.sigla) path.dataset.uf = feature.properties.sigla;
          });
        },
      });
      paint();
      return { count: features.length, visited: visited.size, places: matches.places };
    } catch {
      if (token !== generation) return { count: 0, visited: 0 };
      document.getElementById('map-status').textContent = 'Divisões administrativas indisponíveis. Pesquise novamente para tentar carregar.';
      return { count: 0, visited: 0, error: true };
    } finally { if (token === generation) loadingCode = undefined; }
  }
  function refresh() {
    if (!visible()) { if (layer) map.removeLayer(layer); return; }
    const code = selected ? selected.properties.iso : 'BR';
    if (dataCountry !== code) { if (loadingCode !== code) display(code); return; }
    paint();
  }
  map.on('zoomend moveend', refresh);
  return {
    refresh,
    selectCountry(country, destinations = []) {
      generation++; selected = country; places = destinations; loadingCode = undefined; dataCountry = undefined;
      if (layer) map.removeLayer(layer);
      layer = null; data = []; visited = new Set();
      if (country) return display(country.properties.iso);
      refresh(); return Promise.resolve({ count: 0, visited: 0 });
    },
    updateVisits(destinations) { places = destinations; if (selected) { visited = visitedRegions(data, places).ids; paint(); } },
  };
}
