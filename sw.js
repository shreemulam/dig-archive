// DIG.ARCHIVE service worker — app shell + archive cached for offline use
const V = 'dig-v1';
const SHELL = ['/', '/index.html', '/records.json', '/drops.json',
               '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const {request} = e;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);

  // app shell + data: network first so records stay fresh, cache as fallback
  if(url.origin === location.origin){
    e.respondWith(
      fetch(request)
        .then(r=>{ const copy=r.clone(); caches.open(V).then(c=>c.put(request, copy)); return r; })
        .catch(()=>caches.match(request).then(r=>r || caches.match('/index.html')))
    );
    return;
  }
  // remote images (Commons/Met/AIC): cache first, they never change
  if(/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url.pathname) || url.hostname.includes('wikimedia') ||
     url.hostname.includes('artic.edu') || url.hostname.includes('metmuseum')){
    e.respondWith(
      caches.match(request).then(hit=> hit || fetch(request).then(r=>{
        if(r.ok){ const copy=r.clone(); caches.open(V+'-img').then(c=>c.put(request, copy)); }
        return r;
      }).catch(()=>hit))
    );
  }
});
