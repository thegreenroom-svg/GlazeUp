/**
 * GlazeUp · Service Worker
 * Caches the app shell for offline use and fast loading.
 */

const CACHE_VERSION = 'glazeup-v3-2026-07-21-3tile';

const SHELL_FILES = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/studio-config.js',
  '/js/designs.js',
  '/js/glazes.js',
  '/manifest.json'
];

// Install — cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ═══════════════════════════════════════════════════════════
// CACHE-FIRST WAS THE WHOLE PROBLEM. 17 July 2026.
// ═══════════════════════════════════════════════════════════
// Reported: "nothing links" after a plain reload, on the night fifteen
// separate fixes shipped. Every one had been confirmed byte-for-byte on
// GitHub. The gap was never the code — it was this function.
//
// caches.match() FIRST meant: if a cached copy exists, return it and
// NEVER TOUCH THE NETWORK. Correct for a shell that hasn't changed.
// Exactly wrong for one that changed fifteen times in one evening,
// because CACHE_VERSION was a hand-typed string nobody had reason to
// bump mid-session. A reload asks the service worker before it ever
// asks the network, and the service worker had no way to know anything
// had shipped — from its perspective v1 was still v1.
//
// My first attempt at fixing this was ALSO wrong, and I want that on
// the record rather than quietly corrected: I wrote CACHE_VERSION as
// 'glazeup-__BUILD_TIME__', a placeholder that looks dynamic. Nothing
// on this server substitutes that string. It would have shipped exactly
// as static as v1 — a fix that does nothing while reading like one.
// Caught before pushing, not after, by asking what actually replaces
// the placeholder and finding the honest answer: nothing does.
//
// The real fix isn't a smarter version string that someone still has to
// remember to change. It is not depending on versioning at all:
// NETWORK FIRST for the shell, falling back to cache ONLY when the
// network genuinely fails. That is what a service worker is actually
// for — resilience when the studio's wifi drops mid-shift — not staying
// stale indefinitely while online. A version bump can never be
// forgotten again because nothing needs one.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('supabase')) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && url.protocol === 'https:') {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      // Network genuinely failed — THIS is when cache earns its keep.
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});
