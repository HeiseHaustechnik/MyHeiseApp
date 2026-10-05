// Service Worker: hält App und Bibliotheken für den Offline-Betrieb auf der Baustelle vor.
// Gilt nur für den Ordner /projekte/. Daten (Supabase) werden NICHT hier gecacht, sondern von der App selbst lokal gespeichert.
const CACHE = 'heise-projekte-v6';
const LIBS = ['lib/exceljs.min.js', 'lib/jspdf.umd.min.js', 'lib/jspdf.plugin.autotable.min.js', 'lib/heise-logo.svg', 'lib/heise-logo.png', 'lib/montserrat.woff2', 'lib/heise-ui.css', 'lib/heise-icons.js', 'lib/pj-api.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(LIBS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const base = new URL('./', self.registration.scope).pathname;
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(base)) return;
  if (url.pathname.startsWith(base + 'lib/')) {
    // Bibliotheken: erst Cache, dann Netz
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
    })));
    return;
  }
  // Seiten: erst Netz (immer aktuelle Version), bei fehlendem Netz aus dem Cache
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
