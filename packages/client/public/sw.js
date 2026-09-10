/*
 * Greed service worker — caches the app shell so local & vs-bots play works
 * offline. Asset filenames are content-hashed, so instead of precaching them we
 * cache-first same-origin GETs (populating the cache as assets load) and fall
 * back to the cached index.html for navigations when the network is unavailable.
 * Online play still needs the WebSocket server (a different origin), which we
 * deliberately never intercept.
 */

// Bump on every SHELL change, or the old cache keeps winning.
const CACHE = "greed-shell-v5-visual-collection";
const SHELL = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/icon-maskable.svg",
  "/manifest.webmanifest",
  // Fonts are precached (not just cache-first) so the very first offline load
  // renders in the real typeface instead of falling back to a system font.
  "/fonts/fraunces-var-v1.woff2",
  "/fonts/nunito-sans-var-v1.woff2",
];

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

  // Never intercept media. Audio streams via HTTP Range requests, but the browser
  // hides the Range header from the service worker, so we can't detect them that
  // way — and streaming a cloned multi-MB response through the Cache API stalls
  // playback. Bypass by extension (the URL is always visible) and let the browser
  // handle range/streaming natively.
  if (req.destination === "audio" || /\.(mp3|ogg|wav|m4a|aac|flac|webm)$/i.test(url.pathname)) {
    return;
  }

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
            caches.open(CACHE).then((c) => c.put(req, copy).then(() => trim(c)));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

/**
 * Keep the cache from growing forever.
 *
 * Asset filenames are content-hashed, so every deploy adds a new set and the
 * old set is never requested again — but nothing ever removed them either. The
 * only cleanup was deleting caches with a DIFFERENT NAME, and the name only
 * changes when someone remembers to bump it by hand, so a returning player
 * accumulated every build they had ever loaded. On a phone, where per-origin
 * storage is finite and eviction takes the whole cache when it comes, that
 * eventually costs offline play.
 *
 * Oldest-first by insertion: the Cache API keeps keys in the order they were
 * added, so the front of the list is the least recently added — which for
 * hashed assets is the oldest build.
 */
const MAX_CACHED = 60;
let trimming = false;

async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    const over = keys.length - MAX_CACHED;
    for (let i = 0; i < over; i++) {
      // Never evict the shell: it is what makes an offline load work at all.
      const url = new URL(keys[i].url);
      if (SHELL.includes(url.pathname)) continue;
      await cache.delete(keys[i]);
    }
  } catch {
    /* a full or unavailable cache is not worth failing a request over */
  } finally {
    trimming = false;
  }
}
