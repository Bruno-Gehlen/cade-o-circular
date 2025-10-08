// Variáveis de cache com timestamp para evitar conflitos
const STATIC_CACHE = `static-${new Date().getTime()}`;
const RUNTIME_CACHE = `runtime-${new Date().getTime()}`;
const API_CACHE = `api-cache-${new Date().getTime()}`;

const CACHE_NAME = `cade-o-circular-${new Date().getTime()}`;
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css', 
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/src/main.js',
  '/src/busTracker.js',
  '/src/mapManager.js',
  '/src/utils.js',
  '/src/uiHelpers.js',
  // Dependências externas críticas
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

console.log(`Service Worker: ${CACHE_NAME} instalado`);
console.log(`Recursos ${PRECACHE_URLS.length} em cache`);

// Instalação e cache inicial

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin resources
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      const dest = event.request.destination;
      if (['image', 'script', 'style', 'document'].includes(dest)) {
        // attempt to cache in background, but guard clone errors
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        } catch (err) {
          // cloning or cache.put can fail for opaque responses or once-used bodies; ignore
          console.warn('Failed to cache resource:', event.request.url, err);
        }
      }
      return response;
    } catch (err) {
      // network failed — try fallback
      const fallback = await caches.match('/index.html');
      return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
