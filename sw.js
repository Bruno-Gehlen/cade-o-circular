// O nome do cache é derivado da versão do manifest.json: para publicar uma
// nova versão basta incrementar "version" no manifest — não é mais preciso
// editar este arquivo a cada release.
let cacheNamePromise = null;

function getCacheName() {
  if (!cacheNamePromise) {
    cacheNamePromise = fetch('/manifest.json', { cache: 'no-store' })
      .then((res) => res.json())
      .then((manifest) => `cade-o-circular-${manifest.version || 'dev'}`)
      .catch(() => 'cade-o-circular-fallback');
  }
  return cacheNamePromise;
}

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

async function precache() {
  const cacheName = await getCacheName();
  console.log(`Service Worker: precache em ${cacheName} (${PRECACHE_URLS.length} recursos)`);
  const cache = await caches.open(cacheName);
  await cache.addAll(PRECACHE_URLS);
  return cacheName;
}

// Instalação e cache inicial.
// ATENÇÃO: sem skipWaiting() aqui — a ativação de um novo SW é decidida pela
// página (o overlay de atualização obrigatória envia SKIP_WAITING). Na primeira
// visita (sem controller ativo) o SW ativa automaticamente após o install.
self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const current = await getCacheName();
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== current) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin resources
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== location.origin) return;

  // manifest.json sempre da rede: a página o usa para detectar novas versões
  // (se viesse do cache, a verificação de versão nunca veria a nova release)
  if (reqUrl.pathname === '/manifest.json') return;

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
    const cacheName = await getCacheName();
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      const dest = event.request.destination;
      if (['image', 'script', 'style', 'document'].includes(dest) && response.ok) {
        // attempt to cache in background, but guard clone errors
        try {
          const cache = await caches.open(cacheName);
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
  // (re-derivando o nome do cache, pois a versão pode ter mudado)
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      cacheNamePromise = null;
      await precache();
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ cleared: true });
      }
    })());
  }
});
