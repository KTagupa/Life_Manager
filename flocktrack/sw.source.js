const CACHE_NAME = "flocktrack-app-shell-__CACHE_VERSION__";
const APP_SHELL_URLS = __PRECACHE_URLS__.map(ref => new URL(ref, self.registration.scope).toString());
const APP_SHELL_PATHS = new Set(APP_SHELL_URLS.map(url => new URL(url).pathname));
const INDEX_URL = new URL("./index.html", self.registration.scope).toString();

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL_URLS.map(url => new Request(url, {
    cache: "reload"
  })));
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
      if (request.url !== INDEX_URL) cache.put(INDEX_URL, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request, {
      ignoreSearch: true
    })) || (await cache.match(INDEX_URL, {
      ignoreSearch: true
    }));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, {
    ignoreSearch: true
  });
  const fetchPromise = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) return cached;
  return fetchPromise;
}

self.addEventListener("install", event => {
  event.waitUntil(precacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const {
    request
  } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (APP_SHELL_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
