// Mise en cache pour fonctionner sans connexion ; la version en ligne est rechargée dès que possible
var CACHE = 'gestion-rh-paie-v6';
var FICHIERS = ['./', './index.html', './manifest.webmanifest', './rh-icon-192.png', './rh-icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FICHIERS); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== CACHE; }).map(function (x) { return caches.delete(x); })); })); self.clients.claim(); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) { var copie = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copie); }); return r; })
    .catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); }); }));
});
