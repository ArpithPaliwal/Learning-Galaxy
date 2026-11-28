// Stale-while-revalidate for the app shell: serve the cached copy instantly, refresh it in the background.
// A new deploy shows as a "new version is ready" banner. The build stamps CACHE with the commit, which purges old entries.
const CACHE = 'lg-__VERSION__';
const SHELL = ['/', '/index.html', '/theme.css', '/theme-radar.css', '/config.js', '/lg-store.js', '/lg-runtime.js', '/lg-app.js', '/lg-visuals.js', '/lg-brain.js', '/lg-pets.js', '/pets/krishna.webp', '/lg-scenes.js', '/theme-glass.css', '/theme-skins.css', '/vendor/3d-force-graph.min.js', '/brain-seed.json', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  if (u.pathname.startsWith('/.netlify/scripts/')) { e.respondWith(new Response('', { headers: { 'content-type': 'text/javascript' } })); return; }
  if (u.pathname.startsWith('/.netlify/')) return;
  const isNav = req.mode === 'navigate';
  const key = isNav ? '/index.html' : u.pathname;
  if (!isNav && !SHELL.includes(key)) return;
  const net = fetch(req).then((res) => (res.ok ? caches.open(CACHE).then((c) => c.put(key, res.clone())).then(() => res) : res));
  e.waitUntil(net.then(() => {}, () => {}));
  e.respondWith(caches.match(key).then((hit) => hit || net));
});
