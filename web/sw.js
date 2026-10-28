/* All cached resources belong to this game's scope; browser saves stay separate. */
const CACHE_PREFIX = `pkuards-static:${self.registration.scope}:`;
const CACHE_NAME = CACHE_PREFIX + '1.3.5';
const ASSETS = [
  './', 'index.html', 'app.js', 'data.js', 'engine.js', 'ai.js', 'tactics.js', 'ai-client.js', 'ai-worker.js',
  'art.js', 'storage.js', 'interactions.js', 'presentation.js', 'deck-code.js', 'offline.js',
  'style.css', 'duel.css', 'cinema.css', 'mobile.css', 'favicon.svg', 'manifest.webmanifest',
  ...['tower', 'lake', 'library', 'food', 'math', 'lab', 'stars', 'robot', 'laptop', 'flight',
    'stage', 'book', 'hike', 'law', 'debate', 'map', 'clock', 'radio', 'bike', 'notes'].map(id => `assets/art/${id}.webp`)
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS.map(asset => new Request(new URL(asset, self.registration.scope), { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return cache.match(self.registration.scope);
      throw error;
    }
  })());
});
