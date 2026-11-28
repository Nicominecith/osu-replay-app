// Service Worker: Offline-Unterstützung für Osu Replay
const V = 'osu-replay-v52', DATA = V + '-data';
const SHELL = ['/', '/index.html', '/extras.js', '/extras.css', '/manifest.json', '/vendor/jszip.min.js', '/vendor/lzma-d-min.js', '/banner.png', '/favicon.png'];
const EXTRA = [];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all([...SHELL.map(u => c.add(u).catch(() => {})), ...EXTRA.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {}))]);
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V && k !== DATA) await caches.delete(k);
  await self.clients.claim();
})()));
const netFirst = async (req, name, fallback) => {
  const c = await caches.open(name);
  try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
  catch { return (await c.match(req)) || (fallback && (await caches.match(fallback))) || Response.error(); }
};
const swr = async req => {
  const c = await caches.open(V), m = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => null);
  return m || (await net) || Response.error();
};
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.pathname === '/.netlify/functions/auth') { // Login/Logout nie zwischenspeichern; beim Logout private Daten löschen
      if (u.searchParams.has('logout')) e.waitUntil(caches.delete(DATA));
      return;
    }
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/.netlify/functions/')) {
      if (/\/(skin|skins)$/.test(u.pathname) || !/\/api\/(osu|beatmap)$/.test(u.pathname)) return; // nur Scores/Beatmaps offline vorhalten
      return e.respondWith(netFirst(req, DATA));
    }
    if (req.mode === 'navigate') return e.respondWith(netFirst(req, V, '/index.html'));
    return e.respondWith(swr(req));
  }
  if (/(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.host)) e.respondWith(swr(req));
});
