/* Cesium CubeSat v3e — Service Worker */
const CACHE = 'cesium-cubesat-v3e';
const ASSETS = ['./','./index.html','./app.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null)))); });
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(cached=>cached || fetch(e.request).then(resp=>{
      return caches.open(CACHE).then(c=>{ c.put(e.request, resp.clone()); return resp; });
    })));
  }
});
