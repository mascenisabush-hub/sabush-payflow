const CACHE_NAME = 'sabush-erp-cache-v1';
const OFFLINE_URL = '/';

// Core static assets to cache eagerly on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-192-maskable.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/robots.txt'
];

// Perform install and cash files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching app shell assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First with Cache Fallback for documents; Stale-While-Revalidate for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests or database requests (Firebase websocket/REST calls)
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Handle HTML document / SPA routing (Network-First)
  if (request.headers.get('accept')?.includes('text/html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(OFFLINE_URL, responseCopy);
          });
          return response;
        })
        .catch(() => {
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Handle JS, CSS, fonts, and images (Stale-While-Revalidate)
  const isStaticAsset = 
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2|woff|ttf|json)$/) ||
    url.pathname.includes('/assets/');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const responseCopy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseCopy);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Quietly swallow network failures for static fetch
          });

        return cachedResponse || fetchPromise;
      })
    );
  }
});

// --- PUSH NOTIFICATION SUPPORT ---
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received:', event);

  let data = {
    title: 'Sabush System ERP',
    body: 'Nova atualização no seu sistema de gestão!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    type: 'general',
    url: '/'
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (err) {
      // Fallback if data is raw text
      data.body = event.data.text();
    }
  }

  // Personalize icons based on notification type for maximum visual polish
  let notificationIcon = '/icon-192.png';
  let badgeIcon = '/icon-192.png';

  if (data.type === 'encomenda' || data.type === 'order') {
    data.title = data.title || '📦 Nova Encomenda Recebida';
    // Blue accents
  } else if (data.type === 'low_stock' || data.type === 'stock') {
    data.title = data.title || '⚠️ Alerta de Stock Baixo';
    // Orange/rose warning accents
  } else if (data.type === 'payment' || data.type === 'receita') {
    data.title = data.title || '✅ Pagamento Recebido';
    // Emerald green payment accents
  }

  const options = {
    body: data.body,
    icon: notificationIcon,
    badge: badgeIcon,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      type: data.type
    },
    actions: [
      { action: 'open', title: 'Abrir Sistema 🚀' },
      { action: 'close', title: 'Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// --- NOTIFICATION CLICK ROUTING ---
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;

  notification.close();

  if (action === 'close') {
    return;
  }

  // Get deep-link target URL from custom notification metadata
  const targetUrl = notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Search for an active ERP window that is already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Post custom navigate signal
            client.postMessage({ type: 'NAVIGATE', url: targetUrl });
            return client.focus();
          }
        }
        // If no app tabs are open, open a new browser window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
