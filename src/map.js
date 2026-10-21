import { totalDays, visitedDestinations } from './dates.js';
import { chronologicalStops } from './stats.js';
import { createHeatLayer, heatPoints } from './heatmap.js';
import { createBrazilStateLayer } from './map-states.js';
import { countryFocusBounds } from './country-search.js';
import { initializePopupResize } from './popup-resize.js';
import { wrapFeature } from './geography.js';
const visitedGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6 7-12A7 7 0 1 0 5 9c0 6 7 12 7 12Z"/><path d="m9 9 2 2 4-4"/></svg>';
export function createMap(countries, onSelect, onAdd, onTileError, memories = {}) {
  const map = L.map('map', { zoomControl: false, minZoom: 2, maxZoom: 18, worldCopyJump: true }).setView([28, 15], 3);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Países e divisões: Natural Earth');
  map.attributionControl.addAttribution('UFs: Click That &rsquo;Hood');
  let base, theme = 'dark', cleanMode = false, focusedCountry = null, countryOutline, resolvedCountryVisits = [];
  let visitedCountries = new Set();
  const themes = {
    dark: null,
    light: null,
    streets: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap contributors'],
  };
  let durations = new Map(), homes = new Set(), max = 1, routeVisible = false, markersVisible = true, plannedVisible = false;
  try { markersVisible = localStorage.getItem('atlas-show-markers') !== 'false'; } catch {}
  const style = (feature) => {
    if (cleanMode || focusedCountry) {
      const chosen = focusedCountry && String(feature.id) === String(focusedCountry.id);
      const visited = !chosen && visitedCountries.has(String(feature.id)), light = theme !== 'dark';
      return { color: chosen ? '#91b6a1' : visited ? '#b99671' : light ? '#a8b3aa' : '#39483e', weight: chosen ? 1.4 : 0.7,
        fillColor: visited ? '#c09a71' : light ? '#e3ede3' : '#202923', fillOpacity: visited ? .5 : .85 };
    }
    const days = durations.get(String(feature.id));
    const home = homes.has(String(feature.id));
    const light = ['light', 'offline', 'streets'].includes(theme);
    return { color: home ? '#76b6c8' : days != null ? '#b99671' : light ? '#858b84' : '#545952', weight: home ? 1.2 : 0.7, fillColor: days != null ? '#c09a71' : home ? '#76b6c8' : theme === 'offline' ? '#e9dfc6' : light ? '#e3ede3' : '#202923', fillOpacity: days != null ? 0.22 + 0.48 * (days / max) : home ? 0.45 : ['light', 'offline'].includes(theme) ? .85 : light ? 0.08 : 0.5 };
  };
  const layer = L.geoJSON(countries, { style, onEachFeature: (feature, country) => {
    country.bindTooltip(document.createTextNode(feature.properties.name), { sticky: true });
    country.on('add', () => { const path = country.getElement(); if (path) { path.dataset.countryId = String(feature.id); path.setAttribute('aria-label', feature.properties.name); } });
    country.on('mouseover', () => { if (cleanMode || focusedCountry) return country.closeTooltip(); country.setStyle({ color: '#a5dfc6', weight: 1.8, fillColor: '#6ca78e', fillOpacity: 0.6 }); country.bringToFront(); country.getElement()?.classList.add('country-hover'); });
    country.on('mouseout', () => { layer.resetStyle(country); country.getElement()?.classList.remove('country-hover'); });
  } }).addTo(map);
  const states = createBrazilStateLayer(map, () => theme);
  const heat = createHeatLayer(map);
  let heatMode = 'off';
  try { const saved = localStorage.getItem('atlas-heat-mode'); if (['visits', 'days'].includes(saved)) heatMode = saved; } catch {}
  function setStyle(value) {
    theme = value in themes || value === 'offline' ? value : 'dark';
    if (base) { map.removeLayer(base); base = null; }
    if (themes[theme] && !cleanMode) {
      const [url, attribution] = themes[theme];
      base = L.tileLayer(url, { attribution, subdomains: 'abcd', maxZoom: theme === 'streets' ? 19 : 20, crossOrigin: true }).addTo(map);
      base.on('tileerror', onTileError);
    }
    layer.setStyle(style);
    countryOutline?.setStyle(style);
    states.refresh();
    document.getElementById('map').dataset.style = cleanMode && theme === 'streets' ? 'light' : theme;
    try { localStorage.setItem('atlas-map-style', theme); } catch {}
  }
  try { setStyle(localStorage.getItem('atlas-map-style') || 'dark'); } catch { setStyle('dark'); }
  const markers = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true, iconCreateFunction: (cluster) => {
    const face = document.createElement('span'); face.className = 'cluster-check'; face.innerHTML = visitedGlyph;
    face.setAttribute('role', 'img'); face.setAttribute('aria-label', `${cluster.getChildCount()} lugares próximos. Aproxime para explorar.`);
    face.title = `${cluster.getChildCount()} lugares próximos`;
    return L.divIcon({ className: 'atlas-cluster', html: face, iconSize: [32, 38], iconAnchor: [16, 34] });
  } }).addTo(map);
  const routes = L.layerGroup();
  const planned = L.layerGroup();
  const cleanMarkers = L.layerGroup();
  if (!markersVisible) map.removeLayer(markers);
  function setMarkersVisible(value) {
    markersVisible = Boolean(value);
    if (markersVisible && !cleanMode && !focusedCountry) { markers.addTo(map); if (routeVisible) routes.addTo(map); if (plannedVisible) planned.addTo(map); }
    else { map.removeLayer(markers); map.removeLayer(routes); map.removeLayer(planned); }
    try { localStorage.setItem('atlas-show-markers', String(markersVisible)); } catch {}
  }
  const allMarkers = new Map();
  let currentPhotoURLs = new Map();
  let allDestinations = [];
  const contentModes = { all: 'Tudo', memories: 'Anotações e fotos', score: 'Só a nota', scorePhotos: 'Só a nota e as fotos', notes: 'Só as anotações', photos: 'Só as fotos' };
  let cleanContentMode = 'all';
  try { const saved = localStorage.getItem('atlas-clean-popup-content'); if (Object.hasOwn(contentModes, saved)) cleanContentMode = saved; } catch {}
  const popupSizes = {
    compact: { label: 'Compacto', width: 240, height: 260 },
    medium: { label: 'Médio', width: 320, height: 400 },
    large: { label: 'Grande', width: 480, height: 560 },
  };
  let cleanPopupSize = 'compact', customPopupSize, resizeOpenPopup;
  try {
    const custom = JSON.parse(localStorage.getItem('atlas-clean-popup-custom-size'));
    if (custom && Number.isFinite(custom.width) && Number.isFinite(custom.height)) {
      customPopupSize = { width: Math.max(160, Math.min(custom.width, 640)), height: Math.max(112, Math.min(custom.height, 720)) };
    }
    const saved = localStorage.getItem('atlas-clean-popup-size');
    if (Object.hasOwn(popupSizes, saved) || saved === 'custom' && customPopupSize) cleanPopupSize = saved;
  } catch {}
  map.on('resize', () => resizeOpenPopup?.());
  function setHeatMode(value) {
    heatMode = ['visits', 'days'].includes(value) ? value : 'off';
    heat.update(heatPoints(allDestinations, heatMode)); heat.show(heatMode !== 'off' && !cleanMode && !focusedCountry);
    const legend = document.getElementById('heat-legend');
    legend.hidden = heatMode === 'off';
    legend.querySelector('[data-heat-label]').textContent = heatMode === 'days' ? 'Dias registrados por lugar' : 'Visitas registradas por lugar';
    document.getElementById('map').dataset.heat = heatMode;
    try { localStorage.setItem('atlas-heat-mode', heatMode); } catch {}
  }
  setHeatMode(heatMode);
  map.on('click', (e) => { if (!cleanMode) onAdd({ lat: Number(e.latlng.lat.toFixed(5)), lng: Number((((e.latlng.lng + 180) % 360 + 360) % 360 - 180).toFixed(5)) }); });
  function updateCleanPlaces() {
    const allVisited = visitedDestinations(allDestinations);
    visitedCountries = new Set(allVisited.map((d) => d.countryId).filter(Boolean));
    const visited = focusedCountry ? countryVisits(focusedCountry).map(d => d.countryId ? d : { ...d, countryName: focusedCountry.properties.name }) : allVisited;
    cleanMarkers.clearLayers();
    for (const d of visited) {
      const popup = document.createElement('div'); popup.className = 'clean-place-popup';
      const name = document.createElement('strong'); name.textContent = d.name;
      name.title = d.name;
      const country = document.createElement('small'); country.textContent = d.countryName || 'País não identificado';
      popup.append(name, country);
      const display = document.createElement('label'); display.className = 'clean-place-display'; display.append('Exibir');
      const contentSelect = document.createElement('select'); contentSelect.setAttribute('aria-label', 'Conteúdo da viagem no mapa');
      for (const [value, label] of Object.entries(contentModes)) contentSelect.add(new Option(label, value));
      display.append(contentSelect);
      const sizeLabel = document.createElement('label'); sizeLabel.className = 'clean-place-size'; sizeLabel.append('Tamanho');
      const sizeSelect = document.createElement('select'); sizeSelect.setAttribute('aria-label', 'Tamanho do cartão da viagem');
      for (const [value, { label }] of Object.entries(popupSizes)) sizeSelect.add(new Option(label, value));
      const customOption = new Option('Personalizado', 'custom');
      sizeSelect.add(customOption);
      sizeLabel.append(sizeSelect);
      const options = document.createElement('div'); options.className = 'clean-place-options'; options.append(display, sizeLabel); popup.append(options);
      options.id = `clean-place-options-${crypto.randomUUID()}`;
      const tools = document.createElement('button'); tools.type = 'button'; tools.className = 'clean-place-tools';
      tools.setAttribute('aria-label', 'Opções do cartão'); tools.setAttribute('aria-expanded', 'false');
      tools.setAttribute('aria-controls', options.id);
      tools.title = 'Exibir opções do cartão';
      tools.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14m-10-12v4m6 1v4m-6 1v4"/></svg>'; popup.append(tools);
      tools.onclick = () => tools.setAttribute('aria-expanded', String(popup.classList.toggle('show-popup-options')));
      options.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !popup.classList.contains('show-popup-options')) return;
        event.preventDefault(); event.stopPropagation(); popup.classList.remove('show-popup-options');
        tools.setAttribute('aria-expanded', 'false'); tools.focus();
      });
      const body = document.createElement('div'); body.className = 'clean-place-body'; popup.append(body);
      const rating = document.createElement('p'); rating.className = 'clean-place-rating';
      rating.setAttribute('aria-label', d.rating ? `Minha avaliação: ${d.rating} de 5` : 'Ainda sem avaliação');
      if (d.rating) {
        rating.setAttribute('role', 'img');
        for (let i = 0; i < 5; i++) {
          const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          star.setAttribute('viewBox', '0 0 24 24'); star.setAttribute('aria-hidden', 'true');
          star.classList.add('clean-rating-star');
          if (i < d.rating) star.classList.add('is-filled');
          star.innerHTML = '<path d="m12 3 2.78 5.63L21 9.5l-4.5 4.38 1.06 6.19L12 17.15l-5.56 2.92 1.06-6.19L3 9.5l6.22-.87Z"/>';
          rating.append(star);
        }
      } else { rating.classList.add('is-unrated'); rating.textContent = 'Ainda sem avaliação'; }
      body.append(rating);
      const notes = document.createElement('p'); notes.className = 'clean-place-notes'; notes.textContent = d.notes || 'Ainda sem anotações nesta memória.'; body.append(notes);
      const photos = memories.photos?.(d.id) || [];
      if (photos.length) {
        const grid = document.createElement('div'); grid.className = 'clean-place-gallery';
        photos.forEach((photo, index) => {
          const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', `Abrir memória ${index + 1} de ${d.name}`);
          const preview = document.createElement('span'); preview.dataset.mediaId = photo.id; preview.className = 'clean-place-thumbnail';
          const url = currentPhotoURLs.get(photo.id);
          if (url) { const image = document.createElement('img'); image.src = url; image.alt = photo.caption || `Foto de ${d.name}`; preview.append(image); }
          else preview.textContent = '◇';
          button.append(preview); button.onclick = () => memories.gallery?.(d.id, index); grid.append(button);
        });
        body.append(grid);
      } else { const empty = document.createElement('p'); empty.className = 'clean-place-no-photos'; empty.textContent = 'Ainda sem fotos nesta memória.'; body.append(empty); }
      function applyContentMode() {
        contentSelect.value = cleanContentMode;
        rating.hidden = !['all', 'score', 'scorePhotos'].includes(cleanContentMode);
        notes.hidden = !['all', 'memories', 'notes'].includes(cleanContentMode) || (!d.notes && cleanContentMode !== 'notes');
        for (const element of popup.querySelectorAll('.clean-place-gallery, .clean-place-no-photos')) element.hidden = !['all', 'memories', 'photos', 'scorePhotos'].includes(cleanContentMode);
      }
      applyContentMode();
      const view = focusedCountry && countryFocusBounds(focusedCountry);
      const anchor = view && (view[0][1] + view[1][1]) / 2;
      const lng = focusedCountry ? d.lng + 360 * Math.round((anchor - d.lng) / 360) : d.lng;
      let resizer;
      const marker = L.marker([d.lat, lng], { title: d.name, alt: d.name,
        icon: L.divIcon({ className: 'atlas-visited-pin', html: visitedGlyph, iconSize: [32, 38], iconAnchor: [16, 34] }) })
        .bindTooltip(document.createTextNode(d.name), { direction: 'top', offset: [0, -8] })
        .bindPopup(popup, { className: 'clean-place-card', maxWidth: 240, minWidth: 240, autoPanPaddingTopLeft: [12, 80], autoPanPaddingBottomRight: [12, 30] })
        .on('popupopen', () => {
          applyContentMode(); resizeOpenPopup = applyPopupSize; applyPopupSize();
          resizer ||= initializePopupResize(marker.getPopup(), popup, (width, height, pan) => {
            popup.classList.remove('show-popup-options'); tools.setAttribute('aria-expanded', 'false');
            customPopupSize = dimensions({ width, height }); cleanPopupSize = 'custom'; applyPopupSize(pan);
          }, () => { savePopupSize(); if (marker.isPopupOpen()) applyPopupSize(); });
          memories.previews?.();
        })
        .on('popupclose', () => {
          resizer?.cancel();
          if (resizeOpenPopup === applyPopupSize) resizeOpenPopup = null;
        }).addTo(cleanMarkers);
      function dimensions(size) {
        const available = map.getSize();
        return {
          width: Math.round(Math.max(160, Math.min(size.width, available.x - 76, 640))),
          height: Math.round(Math.max(112, Math.min(size.height, available.y - (cleanMode ? 220 : 60), 720))),
        };
      }
      function savePopupSize() {
        try {
          if (customPopupSize) localStorage.setItem('atlas-clean-popup-custom-size', JSON.stringify(customPopupSize));
          localStorage.setItem('atlas-clean-popup-size', cleanPopupSize);
        } catch {}
      }
      function applyPopupSize(pan = true) {
        const manual = cleanPopupSize === 'custom';
        const { width, height } = dimensions(manual ? customPopupSize : popupSizes[cleanPopupSize]);
        customOption.disabled = !customPopupSize;
        sizeSelect.value = cleanPopupSize;
        popup.style.setProperty('--clean-popup-height', `${height}px`);
        popup.style.height = manual ? `${height}px` : '';
        popup.classList.toggle('is-small', manual && (width < 220 || height < 200));
        if (!popup.classList.contains('is-small')) {
          popup.classList.remove('show-popup-options'); tools.setAttribute('aria-expanded', 'false');
        }
        const card = marker.getPopup();
        card.options.minWidth = width; card.options.maxWidth = width;
        card.options.autoPanPaddingTopLeft = [12, cleanMode ? 150 : 12];
        card.options.autoPan = pan;
        card.update(); card.options.autoPan = true;
      }
      sizeSelect.onchange = () => {
        cleanPopupSize = sizeSelect.value;
        savePopupSize();
        applyPopupSize(); memories.previews?.();
      };
      contentSelect.onchange = () => {
        cleanContentMode = contentSelect.value;
        try { localStorage.setItem('atlas-clean-popup-content', cleanContentMode); } catch {}
        if (popup.classList.contains('show-popup-options')) {
          popup.classList.remove('show-popup-options'); tools.setAttribute('aria-expanded', 'false'); tools.focus();
        }
        applyContentMode(); marker.getPopup().update(); memories.previews?.();
      };
    }
    document.getElementById('clean-map-empty').hidden = !cleanMode || Boolean(focusedCountry) || visited.length > 0;
    document.getElementById('map').dataset.visitedCount = String(visited.length);
  }
  function fit(destinations) {
    if (!destinations.length) { map.setView([20, 0], 2, { animate: false }); return; }
    map.fitBounds(destinations.map((d) => [d.lat, d.lng]), { padding: [48, 48], maxZoom: 6, animate: false });
  }
  function countryVisits(country) {
    const resolved = focusedCountry && String(focusedCountry.id) === String(country.id) ? new Set(resolvedCountryVisits.map(d => d.id)) : new Set();
    return visitedDestinations(allDestinations).filter(d => String(d.countryId) === String(country.id) || resolved.has(d.id));
  }
  function fitCountry() {
    if (!focusedCountry) return;
    const view = countryFocusBounds(focusedCountry), bounds = L.latLngBounds(view), anchor = (view[0][1] + view[1][1]) / 2;
    for (const d of countryVisits(focusedCountry)) bounds.extend([d.lat, d.lng + 360 * Math.round((anchor - d.lng) / 360)]);
    map.fitBounds(bounds, { paddingTopLeft: [24, 108], paddingBottomRight: [24, 140], maxZoom: 9, animate: false });
  }
  function restoreLayers() {
    if (cleanMode || focusedCountry) {
      map.removeLayer(markers); map.removeLayer(routes); map.removeLayer(planned); cleanMarkers.addTo(map);
    } else {
      map.removeLayer(cleanMarkers);
      if (markersVisible) { markers.addTo(map); if (routeVisible) routes.addTo(map); if (plannedVisible) planned.addTo(map); }
    }
    heat.show(heatMode !== 'off' && !cleanMode && !focusedCountry);
  }
  function clearCountry() {
    focusedCountry = null; resolvedCountryVisits = [];
    if (countryOutline) { map.removeLayer(countryOutline); countryOutline = null; }
    document.getElementById('map-area').classList.remove('has-country-search');
    delete document.getElementById('map').dataset.focusedCountry;
    map.closePopup(); updateCleanPlaces(); restoreLayers(); states.selectCountry(null); layer.setStyle(style);
  }
  async function showCountry(country, { fit = true } = {}) {
    focusedCountry = country; resolvedCountryVisits = [];
    if (countryOutline) map.removeLayer(countryOutline);
    const view = countryFocusBounds(country), anchor = (view[0][1] + view[1][1]) / 2;
    countryOutline = L.geoJSON(wrapFeature(country, anchor), { style, interactive: false }).addTo(map);
    document.getElementById('map-area').classList.add('has-country-search');
    document.getElementById('map').dataset.focusedCountry = String(country.id);
    map.closePopup(); map.eachLayer(item => item.closeTooltip?.());
    updateCleanPlaces(); restoreLayers(); layer.setStyle(style);
    // Start this request before fitting, so zoom events cannot reload the old country.
    const candidates = visitedDestinations(allDestinations).filter(d => !d.countryId || String(d.countryId) === String(country.id));
    const result = states.selectCountry(country, candidates);
    if (fit) fitCountry();
    const divisions = await result;
    if (focusedCountry === country) {
      resolvedCountryVisits = divisions.places || [];
      updateCleanPlaces();
      if (fit) fitCountry();
    }
    return divisions;
  }
  function setCleanMode(value) {
    cleanMode = Boolean(value);
    map.closePopup();
    map.eachLayer((item) => item.closeTooltip?.());
    if (cleanMode) {
      map.setMinZoom(0);
      updateCleanPlaces();
      if (base) map.removeLayer(base);
      map.removeLayer(markers); map.removeLayer(routes); map.removeLayer(planned);
      cleanMarkers.addTo(map);
    } else {
      map.setMinZoom(2);
      if (!focusedCountry) map.removeLayer(cleanMarkers);
      if (base) base.addTo(map);
      if (markersVisible && !focusedCountry) {
        markers.addTo(map);
        if (routeVisible) routes.addTo(map);
        if (plannedVisible) planned.addTo(map);
      }
      document.getElementById('clean-map-empty').hidden = true;
    }
    heat.show(heatMode !== 'off' && !cleanMode && !focusedCountry);
    layer.setStyle(style);
    countryOutline?.setStyle(style);
    states.refresh();
    document.getElementById('map').dataset.style = cleanMode && theme === 'streets' ? 'light' : theme;
    document.getElementById('map').setAttribute('aria-label', cleanMode ? 'Mapa dos lugares visitados' : 'Mapa interativo; clique para adicionar um destino');
  }
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
    if (routeVisible && markersVisible && !cleanMode && !focusedCountry) routes.addTo(map);
  }
  return {
    map,
    showCountry, clearCountry, countryVisits, fitCountry,
    hasCountryFocus: () => Boolean(focusedCountry),
    setStyle,
    getStyle: () => theme,
    setMarkersVisible,
    markersVisible: () => markersVisible,
    setHeatMode,
    getHeatMode: () => heatMode,
    refreshPhotos(photoURLs) {
      currentPhotoURLs = photoURLs;
      document.querySelectorAll('.clean-place-thumbnail[data-media-id]').forEach(preview => {
        const url = photoURLs.get(preview.dataset.mediaId);
        if (url && !preview.querySelector('img')) { const image = document.createElement('img'); image.src = url; image.alt = 'Foto da memória'; preview.replaceChildren(image); }
      });
      for (const destination of allDestinations) {
        const url = photoURLs.get(destination.coverId), marker = allMarkers.get(destination.id);
        if (!url || !marker || destination.kind === 'home') continue;
        const face = document.createElement('span'); face.className = 'pin-face';
        const img = document.createElement('img'); img.src = url; img.alt = ''; face.append(img);
        marker.setIcon(L.divIcon({ className: 'atlas-pin', html: face, iconSize: [42, 42], iconAnchor: [21, 21] }));
      }
    },
    setCleanMode,
    fitVisited: () => fit(visitedDestinations(allDestinations)),
    update(destinations, photoURLs) {
      plannedVisible = false; planned.clearLayers(); map.removeLayer(planned);
      allDestinations = destinations;
      resolvedCountryVisits = [];
      currentPhotoURLs = photoURLs;
      if (cleanMode || focusedCountry) updateCleanPlaces();
      if (focusedCountry) states.updateVisits(countryVisits(focusedCountry));
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
        else container.innerHTML = visitedGlyph;
        const marker = L.marker([d.lat, d.lng], { title: d.name, alt: d.name, icon: L.divIcon({ className: 'atlas-pin', html: container, iconSize: [42, 42], iconAnchor: [21, 21] }) });
        marker.on('click', () => onSelect(d.id));
        marker.bindTooltip(document.createTextNode(d.name), { direction: 'top' });
        marker.addTo(markers); allMarkers.set(d.id, marker);
      }
      redrawRoute();
    },
    flyTo(destination) { map.flyTo([destination.lat, destination.lng], 9, { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.7 }); },
    fit,
    route(show) { plannedVisible = false; planned.clearLayers(); map.removeLayer(planned); routeVisible = show; if (show && markersVisible && !cleanMode && !focusedCountry) routes.addTo(map); else map.removeLayer(routes); },
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
      L.polyline(points,{color:'#e4bc7e',weight:3,dashArray:'6 6'}).addTo(planned); plannedVisible = true; if (markersVisible && !cleanMode) planned.addTo(map); map.fitBounds(points,{padding:[40,40],maxZoom:9});
    },
    resize() { map.invalidateSize(); },
  };
}
