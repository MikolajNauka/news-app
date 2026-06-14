const CACHE_NAME = 'news-app-v1';
const urlsToCache = [
  './',
  './index.html',
  './main.js',
  './manifest.json',
  // './icon-192.png',
  // './icon-512.png'
];

// Instalacja service workera - cache'owanie podstawowych plików
self.addEventListener('install', (event) => {
  console.log('Service Worker instaluje się...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache otwarty, dodaję pliki');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Instalacja zakończona, aktywuję...');
        return self.skipWaiting();
      })
  );
});

// Aktywacja service workera
self.addEventListener('activate', (event) => {
  console.log('Service Worker aktywowany');
  
  // Usuń stare cache'e
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Usuwam stary cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker gotowy do przejęcia kontroli');
      return self.clients.claim();
    })
  );
});

// Przechwytywanie zapytań fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Dla zapytań do API GNews - używaj tylko sieci (nie cache'uj)
  if (url.hostname === 'gnews.io' || url.hostname === 'nominatim.openstreetmap.org') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Jeśli API nie działa, zwróć błąd (aplikacja użyje localStorage)
          return new Response(JSON.stringify({ error: 'Offline - brak dostępu do API' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // Dla obrazków i innych zasobów - strategia "stale-while-revalidate"
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }
  
  // Dla HTML, CSS, JS - strategia "cache first, then network"
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Jeśli jest w cache, zwróć z cache
        if (response) {
          console.log('Zwracam z cache:', event.request.url);
          // W tle zaktualizuj cache z sieci
          fetch(event.request)
            .then((networkResponse) => {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            })
            .catch(() => {});
          return response;
        }
        
        // Nie ma w cache, pobierz z sieci
        console.log('Pobieram z sieci:', event.request.url);
        return fetch(event.request)
          .then((networkResponse) => {
            // Zapisz w cache na przyszłość
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
            return networkResponse;
          });
      })
      .catch(() => {
        // Fallback offline - zwróć stronę główną
        return caches.match('./index.html');
      })
  );
});

// Obsługa push notifications (opcjonalne na 4.5+)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nowe wiadomości w Twojej okolicy!',
    icon: './icons/icon-192.png',
    badge: './icons/badge-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: './'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification('📰 Newsy z Okolicy', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});