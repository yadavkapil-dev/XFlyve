// Basic app-shell service worker — caches this app's own static shell
// (HTML/JS/CSS/icons) so the app still loads when offline or on a flaky
// connection. Deliberately does NOT cache /api/* or any user data, and does
// NOT implement offline data sync — out of scope for this phase.
//
// Strategy: network-first, falling back to cache. Online, the browser
// always gets the latest deployed shell (important since Vite hashes
// bundle filenames on every build — this avoids ever needing a hardcoded
// list of those hashed names, which would go stale on the next deploy).
// Offline, whatever was last cached is served instead; a request for a
// client-side route that was never directly fetched (e.g. "/jobs", handled
// by react-router, not a real server route) falls back to the cached "/"
// shell so the SPA can still boot and route itself once JS runs.
const CACHE_NAME = "xflyve-shell-v1";

const PRECACHE_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
