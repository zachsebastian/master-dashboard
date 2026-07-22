const CACHE = 'dashboard-suite-v17';

const PRECACHE = [
  '/',
  '/index.html',
  '/today/',
  '/today/index.html',
  '/links/',
  '/links/index.html',
  '/projects/',
  '/projects/index.html',
  '/metrics/',
  '/metrics/index.html',
  '/digest/',
  '/digest/index.html',
  '/scratchpad/',
  '/scratchpad/index.html',
  '/wins-log/',
  '/wins-log/index.html',
  '/data-inventory/',
  '/data-inventory/index.html',
  '/case-writer/',
  '/case-writer/index.html',
  '/product-ideas/',
  '/product-ideas/index.html',
  '/rock-management/',
  '/rock-management/index.html',
  '/feedback/',
  '/feedback/index.html',
  '/shared/css/tokens.css',
  '/shared/css/glass.css',
  '/shared/css/mobile.css',
  '/shared/js/supabase-client.js',
  '/shared/js/auth.js',
  '/shared/js/theme.js',
  '/shared/js/module-header.js',
  '/shared/js/banner.js',
  '/shared/js/rocks.js',
  '/shared/js/app-modules.js',
  '/shared/js/pwa.js',
  '/dashboard/css/dashboard.css',
  '/dashboard/js/app.js',
  '/dashboard/js/modules.js',
  '/dashboard/js/admin.js',
  '/today/css/today.css',
  '/today/js/app.js',
  '/today/js/render.js',
  '/today/js/state.js',
  '/links/css/links.css',
  '/links/js/app.js',
  '/links/js/render.js',
  '/links/js/state.js',
  '/links/js/actions.js',
  '/projects/css/projects.css',
  '/projects/js/app.js',
  '/projects/js/render.js',
  '/projects/js/state.js',
  '/projects/js/modals.js',
  '/metrics/css/metrics.css',
  '/metrics/js/app.js',
  '/metrics/js/render.js',
  '/metrics/js/state.js',
  '/metrics/js/actions.js',
  '/digest/css/digest.css',
  '/digest/js/app.js',
  '/digest/js/render.js',
  '/digest/js/state.js',
  '/scratchpad/css/scratchpad.css',
  '/scratchpad/js/app.js',
  '/scratchpad/js/render.js',
  '/scratchpad/js/state.js',
  '/wins-log/css/wins-log.css',
  '/wins-log/js/app.js',
  '/wins-log/js/render.js',
  '/wins-log/js/state.js',
  '/data-inventory/css/data-inventory.css',
  '/data-inventory/js/app.js',
  '/case-writer/css/case-writer.css',
  '/case-writer/js/app.js',
  '/case-writer/js/render.js',
  '/case-writer/js/state.js',
  '/product-ideas/css/product-ideas.css',
  '/product-ideas/js/app.js',
  '/product-ideas/js/render.js',
  '/product-ideas/js/state.js',
  '/rock-management/css/rock-management.css',
  '/rock-management/js/app.js',
  '/rock-management/js/render.js',
  '/rock-management/js/state.js',
  '/feedback/css/feedback.css',
  '/feedback/js/app.js',
  '/feedback/js/render.js',
  '/feedback/js/state.js',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Let Supabase API calls go directly to network — never cache auth/data
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) {
    return;
  }

  // Navigation requests: network-first, fall back to cached HTML
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Static assets: cache-first, populate cache on miss
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
