const CACHE_NAME = 'news-app';
const urlsToCache = [
  '/',
  '/index.html',
  '/main.js',
  '/manifest.json'
];

// Instalacja
self.addEventListener('install', event => {
  console.log('Service Worker: Instalowanie...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cacheowanie plików');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Instalacja zakończona');
        return self.skipWaiting();
      })
  );
});

// Aktywacja
self.addEventListener('activate', event => {
  console.log('Service Worker: Aktywacja...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Usuwanie starego cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Gotowy do pracy');
      return self.clients.claim();
    })
  );
});

// Przechwytywanie zapytań
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // API nie cache'ujemy (bo ma własny cache w localStorage)
  if (url.hostname === 'gnews.io' || url.hostname === 'nominatim.openstreetmap.org') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200) {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          });
      })
  );
});