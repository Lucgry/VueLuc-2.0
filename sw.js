const CACHE_NAME = 'vueluc-cache-v2'; // Versión actualizada para forzar la actualización
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
  // El JS y CSS principal se cachearán dinámicamente en la primera visita
];

// Evento de instalación: abre el caché y añade los archivos principales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache abierto y listo.');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activa el nuevo SW inmediatamente
  );
});

// Evento de activación: limpia los cachés antiguos
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[SW] Eliminando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma control de los clientes abiertos
  );
});

// Evento de fetch: Estrategia "Stale-While-Revalidate"
self.addEventListener('fetch', event => {
  // Ignora peticiones que no sean GET o de extensiones de Chrome
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }
  
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        // Pide el recurso a la red en paralelo
        const fetchPromise = fetch(event.request).then(networkResponse => {
          // Si la respuesta es válida, actualiza el caché
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(error => {
          // La petición de red falló, probablemente por estar sin conexión.
          // La respuesta del caché (si existe) ya ha sido devuelta.
          console.warn('[SW] Fallo de red. Sirviendo desde caché si está disponible.', error);
        });

        // Devuelve la versión del caché primero (stale)
        // y permite que la petición a la red actualice el caché para la próxima vez (revalidate).
        return response || fetchPromise;
      });
    })
  );
});
