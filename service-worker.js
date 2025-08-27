// service-worker.js
// Service Worker completo para PWA, cache offline e notificações push

const CACHE_NAME = 'sptrans-monitor-v2.1.0';
const API_CACHE_NAME = 'sptrans-api-cache-v1.0.0';

// Recursos para cache offline
const urlsToCache = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/manifest.json',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
];

// URLs da API para cache estratégico
const apiUrlsToCache = [
    '/api/sptrans-proxy?path=/Linha/Buscar&termosBusca=8082',
    '/api/sptrans-proxy?path=/Linha/Buscar&termosBusca=8083',
    '/api/sptrans-proxy?path=/Linha/Buscar&termosBusca=8084'
];

// Install - Cache inicial
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Install');
    
    event.waitUntil(
        Promise.all([
            // Cache recursos estáticos
            caches.open(CACHE_NAME)
                .then((cache) => {
                    console.log('[ServiceWorker] Caching app shell');
                    return cache.addAll(urlsToCache);
                }),
            
            // Skip waiting para ativar imediatamente
            self.skipWaiting()
        ])
    );
});

// Activate - Limpar cache antigo
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activate');
    
    event.waitUntil(
        Promise.all([
            // Limpar caches antigos
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                            console.log('[ServiceWorker] Removing old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            
            // Claim clients para controlar imediatamente
            self.clients.claim()
        ])
    );
});

// Fetch - Estratégias de cache diferenciadas
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Ignorar extensões do Chrome e requests não-HTTP
    if (!request.url.startsWith('http')) {
        return;
    }
    
    // Estratégia para API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstAPI(request));
        return;
    }
    
    // Estratégia para recursos estáticos
    if (request.destination === 'document' || 
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'image') {
        event.respondWith(cacheFirstStatic(request));
        return;
    }
    
    // Fallback: network first
    event.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});

// Estratégia Network-First para API
async function networkFirstAPI(request) {
    const cache = await caches.open(API_CACHE_NAME);
    
    try {
        // Tentar network primeiro
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful responses
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[ServiceWorker] Network failed, trying cache');
        
        // Fallback para cache
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Se não há cache, retornar erro
        return new Response(JSON.stringify({
            error: 'Offline',
            message: 'Sem conexão e dados não disponíveis no cache'
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Estratégia Cache-First para recursos estáticos
async function cacheFirstStatic(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        // Fallback para página offline se disponível
        if (request.destination === 'document') {
            return cache.match('/offline.html') || cache.match('/index.html');
        }
        throw error;
    }
}

// Push Notifications
self.addEventListener('push', (event) => {
    console.log('[ServiceWorker] Push received');
    
    const data = event.data ? event.data.json() : {};
    
    const title = data.title || 'Monitor Ônibus USP';
    const options = {
        body: data.body || 'Nova atualização disponível!',
        icon: data.icon || generateBusIcon(),
        badge: generateBadgeIcon(),
        vibrate: [100, 50, 100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: data.primaryKey || 1,
            url: data.url || '/',
            linha: data.linha,
            tempo: data.tempo
        },
        actions: [
            {
                action: 'view',
                title: '📍 Ver no Mapa',
                icon: generateMapIcon()
            },
            {
                action: 'dismiss',
                title: '✖️ Dispensar'
            }
        ],
        requireInteraction: true,
        tag: data.tag || 'general'
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
    console.log('[ServiceWorker] Notification click received');
    
    event.notification.close();
    
    const data = event.notification.data;
    let urlToOpen = data.url || '/';
    
    // Ações específicas
    if (event.action === 'view') {
        // Adicionar parâmetros para abrir linha específica
        if (data.linha) {
            urlToOpen += `?linha=${data.linha}`;
        }
    } else if (event.action === 'dismiss') {
        return; // Just close
    }
    
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // Se já há uma aba aberta, focar nela
                for (const client of clientList) {
                    if (client.url.includes(urlToOpen.split('?')[0]) && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Senão, abrir nova aba
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Background Sync (para quando voltar online)
self.addEventListener('sync', (event) => {
    console.log('[ServiceWorker] Background sync', event.tag);
    
    if (event.tag === 'background-sync-bus-data') {
        event.waitUntil(syncBusData());
    }
});

// Sync bus data when back online
async function syncBusData() {
    try {
        // Notificar cliente que dados foram sincronizados
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETE',
                timestamp: new Date().toISOString()
            });
        });
    } catch (error) {
        console.error('[ServiceWorker] Sync failed:', error);
    }
}

// Periodic Background Sync (experimental)
self.addEventListener('periodicsync', (event) => {
    console.log('[ServiceWorker] Periodic sync', event.tag);
    
    if (event.tag === 'bus-data-update') {
        event.waitUntil(updateBusDataPeriodically());
    }
});

async function updateBusDataPeriodically() {
    // Atualizar dados de ônibus em background
    // Enviar notificação apenas se há mudanças relevantes
    try {
        const response = await fetch('/api/sptrans-proxy?path=/Posicao');
        if (response.ok) {
            const data = await response.json();
            // Processar dados e enviar notificações se necessário
            await checkForImportantUpdates(data);
        }
    } catch (error) {
        console.error('[ServiceWorker] Periodic update failed:', error);
    }
}

async function checkForImportantUpdates(data) {
    // Verificar se há atualizações importantes para notificar
    // Por exemplo: ônibus próximo do usuário, atrasos significativos, etc.
    
    const importantUpdates = analyzeDataForUpdates(data);
    
    if (importantUpdates.length > 0) {
        for (const update of importantUpdates) {
            await self.registration.showNotification(update.title, update.options);
        }
    }
}

function analyzeDataForUpdates(data) {
    // Análise dos dados para identificar atualizações importantes
    // Implementar lógica de negócio aqui
    return [];
}

// Utility functions for generating icons
function generateBusIcon() {
    // SVG icon para ônibus
    return `data:image/svg+xml;base64,${btoa(`
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="64" height="64" rx="12" fill="#2180C4"/>
            <text x="32" y="42" text-anchor="middle" font-family="Arial" font-size="32px" fill="white">🚌</text>
        </svg>
    `)}`;
}

function generateBadgeIcon() {
    return `data:image/svg+xml;base64,${btoa(`
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="12" fill="#2180C4"/>
            <text x="12" y="16" text-anchor="middle" font-family="Arial" font-size="12px" fill="white">🚌</text>
        </svg>
    `)}`;
}

function generateMapIcon() {
    return `data:image/svg+xml;base64,${btoa(`
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="12" fill="#4CAF50"/>
            <text x="12" y="16" text-anchor="middle" font-family="Arial" font-size="12px" fill="white">📍</text>
        </svg>
    `)}`;
}

// Message handler para comunicação com o app
self.addEventListener('message', (event) => {
    console.log('[ServiceWorker] Message received:', event.data);
    
    const { type, payload } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_VERSION':
            event.ports[0].postMessage({
                version: CACHE_NAME
            });
            break;
            
        case 'CLEAR_CACHE':
            clearAllCaches();
            break;
            
        case 'UPDATE_CACHE':
            updateCache(payload);
            break;
    }
});

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(name => caches.delete(name))
    );
}

async function updateCache(urls) {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(urls);
}