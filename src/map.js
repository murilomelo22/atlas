import { totalDays } from './dates.js';
import { chronologicalStops } from './stats.js';
export function createMap(countries, onSelect, onAdd, onTileError) {
  const map = L.map('map', { zoomControl: false, minZoom: 2, maxZoom: 18, worldCopyJump: true }).setView([28, 15], 3);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Países: Natural Earth');
  const base = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 20, crossOrigin: true,
  }).addTo(map);
  base.on('tileerror', onTileError);
  let durations = new Map(), max = 1, routeVisible = false;
  const style = (feature) => {
    const days = durations.get(String(feature.id));
    return { color: days != null ? '#b99671' : '#545952', weight: 0.7, fillColor: days != null ? '#c09a71' : '#202923', fillOpacity: days != null ? 0.22 + 0.48 * (days / max) : 0.5 };
  };
  const layer = L.geoJSON(countries, { style, onEachFeature: (feature, country) => country.bindTooltip(feature.properties.name, { sticky: true }) }).addTo(map);
  const markers = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true, iconCreateFunction: (cluster) => L.divIcon({ className: 'atlas-cluster', html: `<span>${cluster.getChildCount()}</span>`, iconSize: [42, 42] }) }).addTo(map);
  const routes = L.layerGroup();
  const allMarkers = new Map();
  let allDestinations = [];
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
    if (routeVisible) routes.addTo(map);
  }
  return {
    map,
    update(destinations, photoURLs) {
      allDestinations = destinations;
      durations = new Map();
      for (const d of destinations) if (d.countryId) durations.set(d.countryId, (durations.get(d.countryId) || 0) + totalDays(d));
      max = Math.max(1, ...durations.values());
      layer.setStyle(style);
      markers.clearLayers(); allMarkers.clear();
      for (const d of destinations) {
        const container = document.createElement('span');
        container.className = 'pin-face';
        const photo = photoURLs.get(d.coverId);
        if (photo) { const img = document.createElement('img'); img.src = photo; img.alt = ''; container.append(img); }
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
    route(show) { routeVisible = show; if (show) routes.addTo(map); else map.removeLayer(routes); },
    resize() { map.invalidateSize(); },
  };
}
