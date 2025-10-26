/* Cesium CubeSat — Service Worker (MIT 2025) */
const CACHE = 'cesium-cubesat-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e)=>{
  e.waitUntil((async ()=>{
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
  })());
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k=> k!==CACHE ? caches.delete(k) : null));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith((async ()=>{
      const cached = await caches.match(e.request);
      if (cached) return cached;
      try {
        const resp = await fetch(e.request);
        const cache = await caches.open(CACHE);
        cache.put(e.request, resp.clone());
        return resp;
      } catch (err) {
        return cached || new Response('Offline', {status: 503});
      }
    })());
  }
});
