// Versão do cache: incrementar manualmente a cada release para invalidar
// os caches antigos dos clientes.
const CACHE_NAME = 'cade-o-circular-v3';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css', 
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-72.png',      
  '/icons/icon-96.png',      
  '/icons/icon-128.png',     
  '/icons/icon-256.png',     
  '/icons/icon-512.png',     
  '/src/main.js',
  '/src/busTracker.js',
  '/src/mapManager.js',
  '/src/utils.js',
  '/src/uiHelpers.js',
  '/src/presetLines.js',     
  '/src/routeShapes.js',     
  '/src/shapesData.js',      
  '/src/stopsData.js'  
];

console.log(`Service Worker instalado: ${CACHE_NAME}`);
console.log(`Recursos em cache: ${PRECACHE_URLS.length}`);

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

  // Chamadas de API: sempre rede, sem cache e sem fallback em HTML.
  // Offline, responde um JSON de erro que o frontend consegue tratar.
  if (reqUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sem conexão com o servidor' }), {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      const dest = event.request.destination;
      if (['image', 'script', 'style', 'document'].includes(dest) && response.ok) {
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
      // network failed — fallback apenas para navegação/documentos
      if (event.request.destination === 'document') {
        const fallback = await caches.match('/index.html');
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Limpeza de emergência: apaga todos os caches e refaz o precache
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ cleared: true });
      }
    })());
  }
});
