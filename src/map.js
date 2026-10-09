import { totalDays } from './dates.js';
import { chronologicalStops } from './stats.js';
import { createHeatLayer, heatPoints } from './heatmap.js';
export function createMap(countries, onSelect, onAdd, onTileError) {
  const map = L.map('map', { zoomControl: false, minZoom: 2, maxZoom: 18, worldCopyJump: true }).setView([28, 15], 3);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Países: Natural Earth');
  let base, theme = 'dark';
  const themes = {
    dark: null,
    light: null,
    streets: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap contributors'],
  };
  let durations = new Map(), homes = new Set(), max = 1, routeVisible = false, markersVisible = true, plannedVisible = false;
  try { markersVisible = localStorage.getItem('atlas-show-markers') !== 'false'; } catch {}
  const style = (feature) => {
    const days = durations.get(String(feature.id));
    const home = homes.has(String(feature.id));
    const light = ['light', 'offline', 'streets'].includes(theme);
    return { color: home ? '#76b6c8' : days != null ? '#b99671' : light ? '#858b84' : '#545952', weight: home ? 1.2 : 0.7, fillColor: days != null ? '#c09a71' : home ? '#76b6c8' : theme === 'offline' ? '#e9dfc6' : light ? '#e3ede3' : '#202923', fillOpacity: days != null ? 0.22 + 0.48 * (days / max) : home ? 0.45 : ['light', 'offline'].includes(theme) ? .85 : light ? 0.08 : 0.5 };
  };
  const layer = L.geoJSON(countries, { style, onEachFeature: (feature, country) => {
    country.bindTooltip(document.createTextNode(feature.properties.name), { sticky: true });
    country.on('add', () => { const path = country.getElement(); if (path) { path.dataset.countryId = String(feature.id); path.setAttribute('aria-label', feature.properties.name); } });
    country.on('mouseover', () => { country.setStyle({ color: '#a5dfc6', weight: 1.8, fillColor: '#6ca78e', fillOpacity: 0.6 }); country.bringToFront(); country.getElement()?.classList.add('country-hover'); });
    country.on('mouseout', () => { layer.resetStyle(country); country.getElement()?.classList.remove('country-hover'); });
  } }).addTo(map);
  const heat = createHeatLayer(map);
  let heatMode = 'off';
  try { const saved = localStorage.getItem('atlas-heat-mode'); if (['visits', 'days'].includes(saved)) heatMode = saved; } catch {}
  function setStyle(value) {
    theme = value in themes || value === 'offline' ? value : 'dark';
    if (base) { map.removeLayer(base); base = null; }
    if (themes[theme]) {
      const [url, attribution] = themes[theme];
      base = L.tileLayer(url, { attribution, subdomains: 'abcd', maxZoom: theme === 'streets' ? 19 : 20, crossOrigin: true }).addTo(map);
      base.on('tileerror', onTileError);
    }
    layer.setStyle(style);
    document.getElementById('map').dataset.style = theme;
    try { localStorage.setItem('atlas-map-style', theme); } catch {}
  }
  try { setStyle(localStorage.getItem('atlas-map-style') || 'dark'); } catch { setStyle('dark'); }
  const markers = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true, iconCreateFunction: (cluster) => L.divIcon({ className: 'atlas-cluster', html: `<span>${cluster.getChildCount()}</span>`, iconSize: [42, 42] }) }).addTo(map);
  const routes = L.layerGroup();
  const planned = L.layerGroup();
  if (!markersVisible) map.removeLayer(markers);
  function setMarkersVisible(value) {
    markersVisible = Boolean(value);
    if (markersVisible) { markers.addTo(map); if (routeVisible) routes.addTo(map); if (plannedVisible) planned.addTo(map); }
    else { map.removeLayer(markers); map.removeLayer(routes); map.removeLayer(planned); }
    try { localStorage.setItem('atlas-show-markers', String(markersVisible)); } catch {}
  }
  const allMarkers = new Map();
  let allDestinations = [];
  function setHeatMode(value) {
    heatMode = ['visits', 'days'].includes(value) ? value : 'off';
    heat.update(heatPoints(allDestinations, heatMode)); heat.show(heatMode !== 'off');
    const legend = document.getElementById('heat-legend');
    legend.hidden = heatMode === 'off';
    legend.querySelector('[data-heat-label]').textContent = heatMode === 'days' ? 'Dias registrados por lugar' : 'Visitas registradas por lugar';
    document.getElementById('map').dataset.heat = heatMode;
    try { localStorage.setItem('atlas-heat-mode', heatMode); } catch {}
  }
  setHeatMode(heatMode);
  map.on('click', (e) => onAdd({ lat: Number(e.latlng.lat.toFixed(5)), lng: Number((((e.latlng.lng + 180) % 360 + 360) % 360 - 180).toFixed(5)) }));
  function redrawRoute() {
    routes.clearLayers();
    const stops = chronologicalStops(allDestinations);
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      let targetLng = b.lng;
      while (targetLng - a.lng > 180) targetLng -= 360;
      while (targetLng - a.lng < -180) targetLng += 360;
      const delta = targetLng - a.lng;
      const curve = Math.min(8, Math.hypot(b.lat - a.lat, delta) * 0.15);
      const points = Array.from({ length: 33 }, (_, n) => {
        const t = n / 32;
        return [a.lat + (b.lat - a.lat) * t + Math.sin(t * Math.PI) * curve, a.lng + delta * t];
      });
      L.polyline(points, { color: '#d0ac83', weight: 2, opacity: 0.8, dashArray: '5 7', interactive: false, smoothFactor: 0 }).addTo(routes);
    }
    if (routeVisible && markersVisible) routes.addTo(map);
  }
  return {
    map,
    setStyle,
    getStyle: () => theme,
    setMarkersVisible,
    markersVisible: () => markersVisible,
    setHeatMode,
    getHeatMode: () => heatMode,
    update(destinations, photoURLs) {
      plannedVisible = false; planned.clearLayers(); map.removeLayer(planned);
      allDestinations = destinations;
      heat.update(heatPoints(destinations, heatMode));
      durations = new Map();
      homes = new Set(destinations.filter((d) => d.kind === 'home').map((d) => d.countryId).filter(Boolean));
      for (const d of destinations) if (d.countryId && d.kind !== 'home') durations.set(d.countryId, (durations.get(d.countryId) || 0) + totalDays(d));
      max = Math.max(1, ...durations.values());
      layer.setStyle(style);
      markers.clearLayers(); allMarkers.clear();
      for (const d of destinations) {
        const container = document.createElement('span');
        container.className = 'pin-face';
        const photo = photoURLs.get(d.coverId);
        if (d.kind === 'home') { container.textContent = '⌂'; container.classList.add('home-pin'); }
        else if (photo) { const img = document.createElement('img'); img.src = photo; img.alt = ''; container.append(img); }
        else container.textContent = '◇';
        const marker = L.marker([d.lat, d.lng], { title: d.name, alt: d.name, icon: L.divIcon({ className: 'atlas-pin', html: container, iconSize: [42, 42], iconAnchor: [21, 21] }) });
        marker.on('click', () => onSelect(d.id));
        marker.bindTooltip(document.createTextNode(d.name), { direction: 'top' });
        marker.addTo(markers); allMarkers.set(d.id, marker);
      }
      redrawRoute();
    },
    flyTo(destination) { map.flyTo([destination.lat, destination.lng], 9, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.7 }); },
    fit(destinations) { if (destinations.length) map.fitBounds(destinations.map((d) => [d.lat, d.lng]), { padding: [60, 60], maxZoom: 6 }); },
    route(show) { plannedVisible = false; planned.clearLayers(); map.removeLayer(planned); routeVisible = show; if (show && markersVisible) routes.addTo(map); else map.removeLayer(routes); },
    itinerary(stops) {
      routeVisible = false; map.removeLayer(routes); planned.clearLayers();
      let previous;
      const points = stops.map((stop,i) => {
        let lng = stop.lng;
        if (previous != null) { while (lng-previous>180) lng-=360; while (lng-previous< -180) lng+=360; }
        previous = lng;
        L.marker([stop.lat,lng]).bindTooltip(document.createTextNode(`${i+1}. ${stop.name}`)).addTo(planned);
        return [stop.lat,lng];
      });
      L.polyline(points,{color:'#e4bc7e',weight:3,dashArray:'6 6'}).addTo(planned); plannedVisible = true; if (markersVisible) planned.addTo(map); map.fitBounds(points,{padding:[40,40],maxZoom:9});
    },
    resize() { map.invalidateSize(); },
  };
}
