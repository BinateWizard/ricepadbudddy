const CACHE_NAME = 'padbuddy-v4';
const STATIC_CACHE = 'padbuddy-static-v4';
const DYNAMIC_CACHE = 'padbuddy-dynamic-v4';

// Static assets to cache immediately on install
const STATIC_ASSETS = [
  '/icons/rice_logo.png',
  '/manifest.json',
  '/offline.html'
];

// App shell - pages to cache for offline access
const APP_SHELL = [
  '/',
  '/auth',
  '/about',
  '/help',
  '/varieties',
  // Admin pages
  '/admin',
  '/admin/content',
  '/admin/devices',
  '/admin/fields',
  '/admin/settings',
  '/admin/users'
];

// Install service worker and cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache app shell pages
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[SW] Caching app shell');
        // Cache each page individually to avoid failing all if one fails
        return Promise.allSettled(
          APP_SHELL.map(url => 
            cache.add(url).catch(err => console.log(`[SW] Failed to cache ${url}:`, err))
          )
        );
      })
    ])
  );
  self.skipWaiting();
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  const cacheWhitelist = [CACHE_NAME, STATIC_CACHE, DYNAMIC_CACHE];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Helper function to determine caching strategy
function getCacheStrategy(request) {
  const url = new URL(request.url);
  
  // Static assets - Cache First
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    return 'cache-first';
  }
  
  // Next.js static files - Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    return 'cache-first';
  }
  
  // Next.js data/build files - Network First with cache fallback
  if (url.pathname.startsWith('/_next/')) {
    return 'network-first';
  }
  
  // API calls - Network only (don't cache)
  if (url.pathname.startsWith('/api/')) {
    return 'network-only';
  }
  
  // HTML pages - Stale While Revalidate
  return 'stale-while-revalidate';
}

// Cache First Strategy
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Cache first fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

// Network First Strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline', { status: 503 });
  }
}

// Network First Navigation Strategy (for page loads)
// This ensures PWA cold starts get fresh content
async function networkFirstNavigation(request) {
  try {
    // Try network first with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Navigation network failed, trying cache:', error);
    
    // Try to get from cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cache, try to return the offline page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
    
    // Last resort - return a basic offline response
    return new Response(
      '<!DOCTYPE html><html><head><title>Offline</title></head><body><h1>Offline</h1><p>Please check your connection.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' }, status: 503 }
    );
  }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Fetch from network in background
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.log('[SW] Stale-while-revalidate fetch failed:', error);
    return null;
  });
  
  // Return cached response immediately, or wait for network
  if (cachedResponse) {
    return cachedResponse;
  }
  
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }
  
  // If both fail, show offline page for navigation requests
  if (request.mode === 'navigate') {
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
  }
  
  return new Response('Offline', { status: 503 });
}

// Fetch event handler
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith('http')) {
    return;
  }
  
  // IMPORTANT: Skip Firebase and Google API requests - let them go to network
  // This ensures authentication works properly in PWA mode
  const skipDomains = [
    'firebaseapp.com',
    'firebase.google.com',
    'firebaseio.com',
    'firebasedatabase.app',
    'googleapis.com',
    'google.com',
    'gstatic.com',
    'accounts.google.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com'
  ];
  
  if (skipDomains.some(domain => url.hostname.includes(domain))) {
    return;
  }
  
  // Skip external requests (any other external origin)
  if (url.origin !== location.origin) {
    return;
  }
  
  // IMPORTANT: Use network-first for navigation requests (page loads)
  // This ensures PWA always gets the latest HTML on launch
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  
  const strategy = getCacheStrategy(request);
  
  switch (strategy) {
    case 'cache-first':
      event.respondWith(cacheFirst(request));
      break;
    case 'network-first':
      event.respondWith(networkFirst(request));
      break;
    case 'network-only':
      // Don't intercept, let it go to network
      break;
    case 'stale-while-revalidate':
    default:
      event.respondWith(staleWhileRevalidate(request));
      break;
  }
});

// Handle background sync for offline data
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Placeholder for syncing offline data when back online
  console.log('[SW] Syncing data...');
}

// Handle push notifications (FCM)
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let notificationData = { 
    title: 'PadBuddy', 
    body: 'New notification',
    icon: '/icons/rice_logo.png',
    badge: '/icons/rice_logo.png',
    data: {}
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      // Handle FCM notification payload
      if (payload.notification) {
        notificationData = {
          title: payload.notification.title || 'PadBuddy',
          body: payload.notification.body || 'New notification',
          icon: payload.notification.icon || '/icons/rice_logo.png',
          badge: '/icons/rice_logo.png',
          data: payload.data || {}
        };
      } else {
        // Handle custom data payload
        notificationData = {
          title: payload.title || 'PadBuddy',
          body: payload.body || 'New notification',
          icon: payload.icon || '/icons/rice_logo.png',
          badge: '/icons/rice_logo.png',
          data: payload.data || payload
        };
      }
    } catch (e) {
      // Fallback for text payload
      notificationData.body = event.data.text();
    }
  }
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: [100, 50, 100],
    data: {
      ...notificationData.data,
      dateOfArrival: Date.now(),
    },
    requireInteraction: false,
    silent: false,
    actions: [
      { action: 'view', title: 'View' },
      { action: 'close', title: 'Close' }
    ],
    tag: notificationData.data.notificationId || 'padbuddy-notification',
  };
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.action, event.notification.data);
  event.notification.close();
  
  const notificationData = event.notification.data || {};
  let urlToOpen = '/';
  
  // Determine URL from notification data
  if (notificationData.actionUrl) {
    urlToOpen = notificationData.actionUrl;
  } else if (notificationData.paddyId) {
    urlToOpen = `/device/${notificationData.paddyId}`;
  } else if (notificationData.fieldId) {
    urlToOpen = `/field/${notificationData.fieldId}`;
  }
  
  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Focus existing window if app is already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => {
              // Navigate to the notification URL
              if (client.navigate) {
                return client.navigate(urlToOpen);
              }
            });
          }
        }
        // Open new window if app is not open
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
  // 'close' action - just close the notification (already closed above)
});

// Message handler for manual cache updates
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

console.log('[SW] Service worker loaded');
