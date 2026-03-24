// Service Worker SurfAI — cache minimal pour PWA
const CACHE_NAME = 'surfai-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('fetch', event => {
  // Network-first strategy — l'app a besoin de données fraîches
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
