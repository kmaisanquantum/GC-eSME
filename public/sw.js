const CACHE_NAME = 'garden-city-sme-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/backend.html',
  '/admin.html',
  '/index_scripts.js',
  '/garden-city.jpg',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Fetch Event with Offline Sync Simulation
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // For API calls, try network first, then fail gracefully
    event.respondWith(
      fetch(event.request).catch(async () => {
        // If it's a POST/PUT/DELETE, we might want to store it for "Sync Later"
        if (['POST', 'PUT', 'DELETE'].includes(event.request.method)) {
          // In a real PWA, we'd use Background Sync API or IndexedDB here.
          // For this simulation, we'll return a special status that the app can handle.
          return new Response(JSON.stringify({
            offline: true,
            message: 'You are offline. Your request has been queued for sync.'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // For GET requests, try to return cached data if available
        const cachedResponse = await caches.match(event.request);
        return cachedResponse || new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  } else {
    // For static assets, use Cache-First strategy
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
