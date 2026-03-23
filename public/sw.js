// PrivateBrain Service Worker — Offline-First
// Caches JS bundles, CSS, static assets.
// WebLLM model weights are cached automatically by WebLLM's own
// IndexedDB/Cache-Storage internals — we just make sure fetch
// requests for those CDN URLs pass through our cache-first handler.

const CACHE_NAME = 'privatebrain-v1';

// Assets to pre-cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: stale-while-revalidate for app, cache-first for model CDN ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // WebLLM model CDN files — cache-first (these are huge, never change)
  const isModelFile =
    url.hostname.includes('huggingface.co') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.bin') ||
    url.pathname.endsWith('-MLC') ||
    url.pathname.includes('mlc-ai') ||
    url.pathname.includes('webllm');

  if (isModelFile) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return cached ?? new Response('Offline', { status: 503 });
        }
      })
    );
    return;
  }

  // App shell / JS bundles / CSS — stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);

      return cached ?? (await fetchPromise) ?? new Response('Offline', { status: 503 });
    })
  );
});