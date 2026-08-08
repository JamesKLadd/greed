/*
 * Greed service worker — caches the app shell so local & vs-bots play works
 * offline. Asset filenames are content-hashed, so instead of precaching them we
 * cache-first same-origin GETs (populating the cache as assets load) and fall
 * back to the cached index.html for navigations when the network is unavailable.
 * Online play still needs the WebSocket server (a different origin), which we
 * deliberately never intercept.
 */

const CACHE = "greed-shell-v1";
const SHELL = ["/", "/index.html", "/favicon.svg", "/icon-maskable.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch the ws server / cross-origin

  // Navigations: try the network, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }

  // Same-origin assets: cache-first, refreshing the cache in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
