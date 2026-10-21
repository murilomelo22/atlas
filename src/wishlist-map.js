import { hasWishlistLocation, wishlistStatus, wishlistStatuses } from './wishlist-data.js';

// Uses the same bundled cartography as the atlas, including when offline.
export function createWishlistMap({ element, countries, select, pick }) {
  const map = L.map(element, { minZoom: 1, maxZoom: 18, scrollWheelZoom: false, worldCopyJump: true }).setView([25, 10], 2);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Países: Natural Earth');
  L.geoJSON(countries, { interactive: false, style: { color: '#536154', fillColor: '#26372d', fillOpacity: .9, weight: .7 } }).addTo(map);
  const markers = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 44,
    iconCreateFunction(cluster) {
      const count = cluster.getChildCount(), face = document.createElement('span');
      face.className = 'wishlist-cluster-face'; face.textContent = count;
      return L.divIcon({ className: 'wishlist-cluster', html: face, iconSize: [38, 38] });
    },
  }).addTo(map);
  const byId = new Map();
  let items = [], candidate;
  const fit = () => {
    map.invalidateSize();
    const points = items.filter(hasWishlistLocation).map(item => [item.location.lat, item.location.lng]);
    if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom: 7, animate: false });
    else map.setView([25, 10], 2, { animate: false });
  };
  map.on('click', event => pick({
    lat: Number(event.latlng.lat.toFixed(5)),
    lng: Number((((event.latlng.lng + 180) % 360 + 360) % 360 - 180).toFixed(5)),
  }));
  return {
    update(next) {
      items = next; markers.clearLayers(); byId.clear();
      for (const item of items.filter(hasWishlistLocation)) {
        const status = wishlistStatus(item), face = document.createElement('span');
        face.className = `wishlist-pin wishlist-pin-${status}`;
        const glyph = status === 'visited' ? '<path d="m5 12 4 4L19 6"/>' : status === 'planning' ? '<path d="M6 18 18 6M6 6h12v12"/>' : '<path d="M12 20 4 12a5 5 0 0 1 8-6 5 5 0 0 1 8 6Z"/>';
        face.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${glyph}</svg>`;
        const popup = document.createElement('div'); popup.className = 'wishlist-place-popup';
        const name = document.createElement('strong'); name.textContent = item.name;
        const info = document.createElement('small'); info.textContent = [item.country, wishlistStatuses[status]].filter(Boolean).join(' · ');
        const notes = document.createElement('p'); notes.textContent = item.notes;
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'text-button'; edit.textContent = 'Editar lugar'; edit.onclick = () => select(item.id);
        popup.append(name, info, notes, edit);
        const marker = L.marker([item.location.lat, item.location.lng], {
          title: `${item.name} · ${wishlistStatuses[status]}`, alt: `${item.name} · ${wishlistStatuses[status]}`,
          icon: L.divIcon({ className: 'wishlist-marker', html: face, iconSize: [32, 38], iconAnchor: [16, 32] }),
        }).bindPopup(popup).bindTooltip(document.createTextNode(item.name));
        markers.addLayer(marker); byId.set(item.id, marker);
      }
      fit();
    },
    focus(id) { const marker = byId.get(id); if (marker) markers.zoomToShowLayer(marker, () => marker.openPopup()); },
    candidate(location) {
      if (candidate) { map.removeLayer(candidate); candidate = null; }
      if (location) {
        candidate = L.circleMarker([location.lat, location.lng], { color: '#f1d7a9', fillColor: '#f1d7a9', radius: 9, fillOpacity: .4, dashArray: '3 3', interactive: false }).addTo(map);
        map.setView([location.lat, location.lng], Math.max(map.getZoom(), 5), { animate: false });
      }
    },
    fit,
    destroy() { map.remove(); },
  };
}
