import { dateDays } from './dates.js';
import { haversine } from './stats.js';
import { countryAt } from './geography.js';

export function orderedTripStops(trip) {
  return trip.stops.map((stop, index) => ({ ...stop, originalIndex: index })).sort((a, b) => {
    const first = dateDays(a.date), second = dateDays(b.date);
    return first != null && second != null ? first - second || a.originalIndex - b.originalIndex : first != null ? -1 : second != null ? 1 : a.originalIndex - b.originalIndex;
  });
}
export function tripRoutePoints(stops) {
  let previous;
  return stops.map(stop => {
    let lng = Number(stop.lng);
    if (previous != null) { while (lng - previous > 180) lng -= 360; while (lng - previous < -180) lng += 360; }
    previous = lng; return [Number(stop.lat), lng];
  });
}
export function tripRouteDistance(stops) { return Math.round(stops.slice(1).reduce((sum, stop, index) => sum + haversine(stops[index], stop), 0)); }

export function createTripRoute({ element, countries, stops, select }) {
  const map = L.map(element, { zoomControl: false, minZoom: 1, maxZoom: 18, scrollWheelZoom: false, worldCopyJump: true }).setView([25,10],2);
  L.control.zoom({ position: 'bottomright' }).addTo(map); map.attributionControl.setPrefix(false); map.attributionControl.addAttribution('Países: Natural Earth');
  const visitedCountries = new Set(stops.map(stop => countryAt(Number(stop.lat), Number(stop.lng))?.countryId).filter(Boolean));
  L.geoJSON(countries, { interactive: false, style: feature => ({ color: visitedCountries.has(String(feature.id)) ? '#a89068' : '#39483d', fillColor: visitedCountries.has(String(feature.id)) ? '#756143' : '#26342a', fillOpacity: .7, weight: .65 }) }).addTo(map);
  const points = tripRoutePoints(stops), markers = [];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index], bend = Math.min(6, Math.hypot(b[0] - a[0], b[1] - a[1]) * .13);
    const arc = Array.from({ length: 41 }, (_, n) => { const t = n / 40; return [a[0] + (b[0] - a[0]) * t + Math.sin(Math.PI * t) * bend, a[1] + (b[1] - a[1]) * t]; });
    L.polyline(arc, { color: '#152119', weight: 9, opacity: .85, interactive: false }).addTo(map);
    L.polyline(arc, { color: '#d8b589', weight: 3, opacity: .9, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(map);
    const mid = arc[20], before = arc[19], after = arc[21];
    const arrow = document.createElement('span'); arrow.className = 'trip-route-arrow'; arrow.textContent = '›'; arrow.style.rotate = `${Math.atan2(-(after[0] - before[0]), after[1] - before[1]) * 180 / Math.PI}deg`;
    L.marker(mid, { interactive: false, icon: L.divIcon({ className: 'trip-route-direction', html: arrow, iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(map);
  }
  stops.forEach((stop, index) => {
    const face = document.createElement('span'); face.className = 'trip-route-pin';
    face.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 16-7-4-7 4Z"/></svg>';
    const number = document.createElement('small'); number.textContent = String(index + 1); face.append(number);
    const marker = L.marker(points[index], { title: `${index + 1}. ${stop.name}`, alt: stop.name, icon: L.divIcon({ className: 'trip-route-marker', html: face, iconSize: [42, 42], iconAnchor: [21, 21] }) }).bindTooltip(document.createTextNode(stop.name), { direction: 'top' }).on('click', () => select(index)).addTo(map);
    markers.push({ marker, face });
  });
  const fit = () => { map.invalidateSize(); if (points.length) map.fitBounds(points, { padding: [44, 44], maxZoom: 8, animate: false }); else map.setView([25, 10], 2); };
  fit();
  return {
    fit,
    focus(index) { markers.forEach(({ face }, i) => face.classList.toggle('is-selected', index === i)); if (points[index]) map.flyTo(points[index], Math.max(map.getZoom(), 6), { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : .6 }); },
    thumbnail(index, url) { const face = markers[index]?.face; if (!face || face.querySelector('img')) return; const image = document.createElement('img'); image.src = url; image.alt = ''; face.prepend(image); face.querySelector('svg')?.remove(); },
    destroy() { map.remove(); },
  };
}
