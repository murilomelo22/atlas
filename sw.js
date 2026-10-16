const VERSION = '24';
const CACHE = `atlas-pessoal-v${VERSION}-fresh-assets`;
let originOffline = false;
const FILES = [ './', './index.html', './styles.css', './src/main.js', './src/ui.js', './src/db.js', './src/map.js', './src/geography.js', './src/geocoding.js', './src/gallery.js', './src/photos.js', './src/stats.js', './src/dates.js', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/leaflet/images/marker-icon.png', './vendor/leaflet/images/marker-icon-2x.png', './vendor/leaflet/images/marker-shadow.png', './vendor/leaflet/images/layers.png', './vendor/leaflet/images/layers-2x.png', './vendor/markercluster/leaflet.markercluster.js', './vendor/markercluster/MarkerCluster.css', './vendor/markercluster/MarkerCluster.Default.css', './vendor/countries.geojson' ];
FILES.push('./config.js', './src/cloud.js', './src/session.js', './src/sync.js', './src/social.js');
FILES.push('./src/journeys.js', './src/trip-data.js', './src/sharing.js', './src/recap.js');
FILES.push('./src/heatmap.js', './src/trip-gallery.js', './src/trip-view.js', './src/trip-route.js', './src/trip-photo-location.js', './src/media.js', './src/wishlist.js', './src/wishlist-data.js', './src/wishlist-sync.js');
FILES.push('./src/map-focus.js');
FILES.push('./src/cloud-media.js');
FILES.push('./src/cloud-diagnostics.js');
FILES.push('./src/trip-media-import.js', './src/trip-photo-picker.js');
FILES.push('./src/app-updates.js', './src/premium.js', './src/poster.js', './src/poster-render.js');
FILES.push('./src/commercial.js');
FILES.push('./src/resumable.js');
FILES.push('./src/privacy.js','./legal/termos.html','./legal/privacidade.html');
FILES.push('./src/app-context.js');
FILES.push('./app.css', './src/app-shell.js', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png', './assets/apple-touch-icon.png');
// Keep the ZIP on demand: do not precache the application download.
FILES.push('./download.css', './instalar.html');
// Bypass fresh HTTP-cache entries when installing a release. The browser cache
// can otherwise populate the new offline cache with the previous release.
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('atlas-pessoal-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('message', event => { if (event.data?.type === 'ATLAS_VERSION') event.ports[0]?.postMessage({ version: VERSION }); });
self.addEventListener('message', event => { if (event.data?.type === 'ATLAS_CONNECTION') event.ports[0]?.postMessage({ offline: originOffline }); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !FILES.some((file) => new URL(file, self.registration.scope).pathname === url.pathname)) return;
  const key = new Request(`${url.origin}${url.pathname}`);
  // Revalidate transitive modules as well as the versioned entry points. Only
  // local app files pass this filter; cloud requests and media are unaffected.
  event.respondWith(fetch(event.request, { cache: 'no-cache' }).then((response) => {
    if (event.request.mode === 'navigate') originOffline = false;
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then((cache) => cache.put(key, copy))); }
    return response;
  }).catch(async () => { if (event.request.mode === 'navigate') originOffline = true; const cache = await caches.open(CACHE); return await cache.match(key) || (event.request.mode === 'navigate' ? await cache.match(new URL('./index.html', self.registration.scope)) : Response.error()); }));
});
