
const C = "hudgames-shell-v1";
const FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icon.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(C).then(cache => cache.addAll(FILES))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== C).map(key => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);

  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request)
        .then(response => {
          if (response.ok && u.origin === location.origin) {
            caches.open(C).then(cache =>
              cache.put(e.request, response.clone())
            );
          }

          return response;
        })
        .catch(() => caches.match("/index.html"))
    )
  );
});