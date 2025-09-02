// Service Worker for USP Bus Monitor PWA
const CACHE_NAME = 'usp-bus-monitor-v1';
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/manifest.json',
    '/favicon.ico',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('Service Worker installed');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Error during service worker installation:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - cache first strategy
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle API requests - always go to network
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then((response) => response)
                .catch((error) => {
                    console.error('API request failed:', error);
                    return new Response(
                        JSON.stringify({
                            success: false,
                            error: 'Network error',
                            offline: true
                        }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }

    // Handle static assets - cache first
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request)
                    .then((response) => {
                        if (response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(request, responseClone);
                                });
                        }
                        return response;
                    });
            })
            .catch(() => {
                // Fallback for offline scenarios
                if (request.destination === 'document') {
                    return caches.match('/index.html');
                }
            })
    );
});

// Push notification event
self.addEventListener('push', (event) => {
    console.log('Push event received');
    let data = {};
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (error) {
            data = { title: 'Monitor USP', body: event.data.text() };
        }
    }

    const options = {
        title: data.title || 'Monitor Ônibus USP',
        body: data.body || 'Atualização de ônibus disponível',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: data.url || '/',
        actions: [
            {
                action: 'open',
                title: 'Abrir App'
            },
            {
                action: 'close',
                title: 'Fechar'
            }
        ],
        requireInteraction: false,
        vibrate: [200, 100, 200],
        tag: 'usp-bus-notification'
    };

    event.waitUntil(
        self.registration.showNotification(options.title, options)
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('Notification click received');
    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    const urlToOpen = event.notification.data || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if app is already open
                for (const client of clientList) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }

                // Open new window if app is not open
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Message event
self.addEventListener('message', (event) => {
    console.log('Service Worker received message:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Error handling
self.addEventListener('error', (event) => {
    console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Service Worker unhandled promise rejection:', event.reason);
});