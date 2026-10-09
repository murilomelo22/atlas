const CACHE = 'atlas-pessoal-v5-territories';
const FILES = [ './', './index.html', './styles.css', './src/main.js', './src/ui.js', './src/db.js', './src/map.js', './src/geography.js', './src/geocoding.js', './src/gallery.js', './src/photos.js', './src/stats.js', './src/dates.js', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/leaflet/images/marker-icon.png', './vendor/leaflet/images/marker-icon-2x.png', './vendor/leaflet/images/marker-shadow.png', './vendor/leaflet/images/layers.png', './vendor/leaflet/images/layers-2x.png', './vendor/markercluster/leaflet.markercluster.js', './vendor/markercluster/MarkerCluster.css', './vendor/markercluster/MarkerCluster.Default.css', './vendor/countries.geojson' ];
FILES.push('./config.js', './src/cloud.js', './src/session.js', './src/sync.js', './src/social.js');
FILES.push('./src/journeys.js', './src/trip-data.js', './src/sharing.js', './src/recap.js');
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('atlas-pessoal-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !FILES.some((file) => new URL(file, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy))); }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
