/*
 * The production build fills these markers from its output, independently of
 * release versions. Precache all JS/CSS, including unopened local/bot screens.
 * Audio/video continue to stream natively and are deliberately never cached.
 */
const BUILD_ID = "__GREED_BUILD_ID__";
const BUILD_ASSETS = /* __GREED_BUILD_ASSETS__ */ [];
const PREFIX = "greed-shell-";
const CACHE = PREFIX + BUILD_ID;
const RUNTIME = "greed-runtime-v1";
const SHELL = [
  "/index.html",
  "/favicon.svg",
  "/icon-maskable.svg",
  "/manifest.webmanifest",
  "/fonts/fraunces-var-v1.woff2",
  "/fonts/nunito-sans-var-v1.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          [...SHELL, ...BUILD_ASSETS].map((path) => new Request(path, { cache: "reload" })),
        ),
      ),
  );
  // Keep the normal waiting lifecycle: a new worker must not discard chunks
  // needed by a game still running in an older tab. It activates once those
  // controlled tabs close, rather than forcing a mid-game update.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const older = keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE);
      // The previous build also survives one update, while unrelated origin
      // caches are left alone. Required precached chunks are never FIFO-trimmed.
      const previous = older.at(-1);
      await Promise.all(older.filter((key) => key !== previous).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;
  if (/^\/api(?:\/|$)/i.test(url.pathname)) return;
  if (
    req.destination === "audio" ||
    req.destination === "video" ||
    req.headers.has("range") ||
    /\.(?:mp3|ogg|wav|m4a|aac|flac|webm|mp4|mov|m3u8)$/i.test(url.pathname)
  ) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(navigate(req, event));
    return;
  }
  // Only static files belong here: account/challenge responses and arbitrary
  // same-origin GETs must never accidentally become an offline data store.
  if (
    !SHELL.includes(url.pathname) &&
    !/\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|ico)$/i.test(url.pathname)
  ) {
    return;
  }
  event.respondWith(asset(req, event));
});

async function navigate(req, event) {
  try {
    const response = await fetch(req);
    if (response.ok) {
      // Update the exact fallback entry, not a query-specific navigation URL.
      // Otherwise a deployment appears current online but reloads stale HTML
      // offline, referring to an older set of chunks.
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(CACHE)
          .then((cache) => cache.put("/index.html", copy))
          .catch(() => {}),
      );
      return response;
    }
    return (await shell()) || response;
  } catch {
    return (await shell()) || Response.error();
  }
}

async function shell() {
  try {
    // CacheStorage.match would select an older build's index by creation order.
    return await (await caches.open(CACHE)).match("/index.html");
  } catch {
    return undefined;
  }
}

async function asset(req, event) {
  try {
    const current = await (await caches.open(CACHE)).match(req);
    const cached = current || (await caches.match(req));
    if (cached) return cached;
  } catch {
    // A disabled/full cache should not prevent online play.
  }
  const response = await fetch(req);
  if (response.ok) {
    const copy = response.clone();
    event.waitUntil(
      caches
        .open(RUNTIME)
        .then(async (cache) => {
          await cache.put(req, copy);
          await trim(cache);
        })
        .catch(() => {}),
    );
  }
  // Content-hashed scripts/styles are immutable. A cache hit performs no
  // background fetch: reopening a screen should not spend data refetching it.
  return response;
}

const MAX_RUNTIME = 60;
let trimQueue = Promise.resolve();
function trim(cache) {
  // Serialize snapshots so concurrent first-time asset requests still leave a
  // bounded runtime cache after their waitUntil work settles.
  const next = trimQueue.then(async () => {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_RUNTIME; i++) await cache.delete(keys[i]);
  });
  trimQueue = next.catch(() => {});
  return next;
}
