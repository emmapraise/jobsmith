/* Jobsmith service worker. Plain JS, no build step.
 *
 * What it does
 *  - Caches the static app shell (hashed /_next/static files, icons) so pages render fast and offline.
 *  - Keeps a copy of the app pages you've opened (dashboard, tracker, applications, tailored CVs, roles, resume)
 *    so you can READ them without a connection. Network first; the saved copy is used when offline or slow.
 *  - Shows /offline when a page isn't saved.
 *
 * What it never does
 *  - Touch non-GET requests (every change is a POST and always goes to the network).
 *  - Cache /api/*, sign-in/auth pages, settings, editors, downloads or any cross-origin request.
 *  - Keep private pages after you sign out (the app clears the "pages" cache; see src/lib/pwa.ts).
 */
const VERSION = "v1";
const STATIC = "jobsmith-static-" + VERSION;
const PAGES = "jobsmith-pages-" + VERSION;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/pwa-icon/192"];
const MAX_PAGES = 40;
const NAV_TIMEOUT_MS = 4000;
const MAX_WARM_ASSETS = 60;

/** Pages that may be saved for offline reading. */
const PAGE_RE = /^\/(?:dashboard|resume|roles|tailor|tracker|prep)$|^\/(?:tailor|tracker|prep)\/[0-9a-f-]{36}$/i;
const isSavedPage = (pathname) => PAGE_RE.test(pathname);
const isStaticAsset = (pathname) => pathname.indexOf("/_next/static/") === 0 || pathname.indexOf("/pwa-icon/") === 0;

/* ───────────────────────────── lifecycle ───────────────────────────── */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => undefined))))
      .then(async () => {
        // The offline screen has a small client script (it lists saved pages): keep that working offline too.
        const cache = await caches.open(STATIC);
        const offline = await cache.match(OFFLINE_URL);
        if (offline) await cacheAssets(assetsIn(await offline.text()), MAX_WARM_ASSETS);
      })
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf("jobsmith-") === 0 && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* ───────────────────────────── helpers ───────────────────────────── */

function pageKey(url) {
  return new Request(url.origin + url.pathname); // drop the query string: one copy per page
}

function titleOf(html) {
  const m = /<title>([^<]*)<\/title>/i.exec(html);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

/** Store a page for offline reading, with its title in a header so the offline screen can list it. */
async function savePage(url, response) {
  if (!response.ok || response.redirected || response.type === "opaqueredirect") return null;
  const type = response.headers.get("content-type") || "";
  if (type.indexOf("text/html") === -1) return null;
  const html = await response.clone().text();
  const headers = new Headers(response.headers);
  headers.set("x-jobsmith-title", titleOf(html));
  headers.set("x-jobsmith-saved-at", String(Date.now()));
  const copy = new Response(html, { status: response.status, statusText: response.statusText, headers });
  const cache = await caches.open(PAGES);
  await cache.put(pageKey(url), copy);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await cache.delete(keys[i]); // oldest first
  return html;
}

async function forgetPage(url) {
  const cache = await caches.open(PAGES);
  await cache.delete(pageKey(url));
}

async function offlineResponse() {
  const cache = await caches.open(STATIC);
  return (await cache.match(OFFLINE_URL)) || new Response("You're offline.", { status: 503, headers: { "content-type": "text/plain" } });
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

/** Saved app pages: network first, falling back to the saved copy when offline or slower than NAV_TIMEOUT_MS. */
async function networkFirstPage(event) {
  const request = event.request;
  const url = new URL(request.url);
  const cache = await caches.open(PAGES);
  const saved = await cache.match(pageKey(url));

  const network = fetch(request).then(async (res) => {
    if (res.redirected) {
      // Sent elsewhere (typically to sign-in): the session is gone, so don't keep serving a private copy.
      await forgetPage(url);
    } else {
      event.waitUntil(savePage(url, res.clone()).catch(() => undefined));
    }
    return res;
  });

  if (!saved) return network.catch(offlineResponse);
  return Promise.race([
    network.catch(() => saved),
    new Promise((resolve) => setTimeout(() => resolve(saved), NAV_TIMEOUT_MS)),
  ]);
}

/* ───────────────────────────── fetch ───────────────────────────── */

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // changes always go to the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/api/") === 0) return; // auth, uploads, downloads, health: never cached

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    if (isSavedPage(url.pathname)) event.respondWith(networkFirstPage(event));
    else event.respondWith(fetch(request).catch(offlineResponse)); // other pages: online only, friendly fallback
  }
  // Everything else (RSC payloads, prefetches, etc.) goes straight to the network.
});

/* ───────────────────────────── messages ───────────────────────────── */

/** JS/CSS/font files a page needs, so a page saved ahead of time can also run offline. */
function assetsIn(html) {
  const found = new Set();
  const re = /\/_next\/static\/[^"'\s)\\]+\.(?:js|css|woff2)/g;
  let m;
  while ((m = re.exec(html)) !== null) found.add(m[0]);
  return Array.from(found);
}

/** Fetch and keep the given build files. Returns how many were newly fetched. */
async function cacheAssets(list, budget) {
  const cache = await caches.open(STATIC);
  let fetched = 0;
  for (const a of list) {
    if (fetched >= budget) break;
    try {
      if (!(await cache.match(a))) {
        const res = await fetch(a);
        if (res.ok) { await cache.put(a, res); fetched++; }
      }
    } catch { /* offline or failed: skip */ }
  }
  return fetched;
}

/**
 * Save pages for offline reading. Each page's scripts are fetched right after the page itself, so every saved page
 * can run offline as soon as it is saved (even if the connection drops halfway through).
 */
async function warm(urls) {
  let saved = 0;
  let budget = MAX_WARM_ASSETS;
  for (const raw of urls) {
    try {
      const url = new URL(raw, self.location.origin);
      if (url.origin !== self.location.origin || !isSavedPage(url.pathname)) continue;
      const res = await fetch(url.pathname, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (res.redirected) { await forgetPage(url); continue; }
      const html = await savePage(url, res);
      if (html) {
        saved++;
        budget -= await cacheAssets(assetsIn(html), Math.max(budget, 0));
      }
    } catch { /* offline or failed: skip this one */ }
  }
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: "WARM_DONE", saved }));
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "WARM" && Array.isArray(data.urls)) {
    event.waitUntil(warm(data.urls.slice(0, 20).map(String)));
  } else if (data.type === "CLEAR") {
    event.waitUntil(caches.delete(PAGES));
  }
});
