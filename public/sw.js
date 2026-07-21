const CACHE_NAME = 'garden-city-sme-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/backend.html',
  '/admin.html',
  '/index_scripts.js',
  '/garden-city.jpg',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/inter-400.woff2',
  '/fonts/inter-600.woff2',
  '/fonts/inter-700.woff2',
  '/fonts/inter-800.woff2',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://accounts.google.com/gsi/client',
  'https://connect.facebook.net/en_US/sdk.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2'
];

// Native IndexedDB Helper
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('OfflineSyncDB', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('mutations')) {
        db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function saveMutation(mutation) {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('mutations', 'readwrite');
      const store = transaction.objectStore('mutations');
      const request = store.add(mutation);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

function getAllMutations() {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('mutations', 'readonly');
      const store = transaction.objectStore('mutations');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function deleteMutation(id) {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('mutations', 'readwrite');
      const store = transaction.objectStore('mutations');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

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

// Fetch Event with Native IndexedDB Offline Sync
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) {
    // For API calls, try network first, then fail/sync gracefully
    event.respondWith(
      fetch(event.request).catch(async () => {
        // If it's a mutating request, store it in IndexedDB for Background Sync
        if (['POST', 'PUT', 'DELETE'].includes(event.request.method)) {
          try {
            const requestText = await event.request.clone().text();
            const headers = {};
            for (const [key, val] of event.request.headers.entries()) {
              headers[key] = val;
            }

            const mutation = {
              url: event.request.url,
              method: event.request.method,
              headers: headers,
              body: requestText,
              timestamp: Date.now()
            };

            await saveMutation(mutation);

            // Try to register background sync tag
            if (self.registration.sync) {
              try {
                await self.registration.sync.register('replay-mutations');
                console.log('Registered background sync for mutation replay');
              } catch (syncErr) {
                console.error('Background sync registration failed inside SW:', syncErr);
              }
            }

            return new Response(JSON.stringify({
              offline: true,
              message: 'You are offline. Your request has been queued in IndexedDB for sync.'
            }), {
              status: 202, // Accepted offline
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: 'Failed to queue offline sync: ' + err.message }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        // For GET API requests, fallback to cache if available
        const cachedResponse = await caches.match(event.request);
        return cachedResponse || new Response(JSON.stringify({ error: 'Offline and no cached data' }), {
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

// Replay mutations sequentially on `'sync'` event
async function replayMutations() {
  const mutations = await getAllMutations();
  console.log(`Starting background replay of ${mutations.length} mutations...`);
  for (const mutation of mutations) {
    try {
      const headers = { ...mutation.headers, 'X-Offline-Synced': 'true' };
      const options = {
        method: mutation.method,
        headers: headers,
      };
      if (mutation.body) {
        options.body = mutation.body;
      }
      const response = await fetch(mutation.url, options);
      if (response.ok) {
        await deleteMutation(mutation.id);
        console.log(`Replayed mutation #${mutation.id} successfully`);
      } else {
        console.warn(`Replaying mutation #${mutation.id} returned status:`, response.status);
      }
    } catch (err) {
      console.error(`Network error during mutation #${mutation.id} replay:`, err);
      // Pause further execution to maintain sequencing
      break;
    }
  }
}

// Background Sync Listener
self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-mutations') {
    event.waitUntil(replayMutations());
  }
});
