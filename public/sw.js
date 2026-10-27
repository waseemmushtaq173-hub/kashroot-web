/*
 * KashRoot's service worker: the app keeps working on 2G, on unsteady 4G and
 * with no signal at all (high orchards, rural pockets). Registered in
 * production builds only (src/components/pwa/PwaRoot.tsx).
 *
 *   - The app's own files (/_next/static, icons, fonts, images) come from
 *     this phone first: a file never changes under the same name.
 *   - Pages come from the internet first. If it has not answered within
 *     4 seconds (or there is no signal), the copy saved on this phone shows;
 *     a page never saved here opens /offline instead.
 *   - Public mandi rates and weather show the saved copy at once and are
 *     refreshed behind it (stale-while-revalidate). Each copy keeps the time
 *     it was saved, and the page is told, so it can say "Saved at 10:42".
 *   - Nothing else is kept: not sign-in, the identity check (KYC), one-time
 *     codes, payments, signed-in data, nor anything sent (POST, PUT,
 *     DELETE…). Sending with no signal answers "You are offline — this
 *     needs the internet" (a question, a rate or a listing draft is kept by
 *     the page itself instead: src/components/pwa/outboxSend.ts).
 *
 * A new version: change VERSION. The first install takes over at once; an
 * update waits until the person taps "Refresh" on the "New version" message
 * (or closes every KashRoot tab), then deletes the older saved copies.
 */
const VERSION = '2026-10-28.1';
const SHELL = `kr-shell-${VERSION}`; // the offline page and its files
const STATIC = `kr-static-${VERSION}`; // the app's files
const PAGES = `kr-pages-${VERSION}`; // pages, network first
const DATA = `kr-data-${VERSION}`; // public rates and weather, stale-while-revalidate
const OURS = [SHELL, STATIC, PAGES, DATA];
/** The most copies kept of each kind (oldest saved go first). */
const LIMIT = { [STATIC]: 400, [PAGES]: 40, [DATA]: 60 };

/** How long a page may take before the saved copy shows instead. */
const PAGE_WAIT_MS = 4000;
/** A data copy this young counts as fresh: used as it is, nothing fetched again. */
const FRESH_MS = 60_000;
const SAVED_AT = 'x-kr-saved-at';

const NEEDS_INTERNET = 'You are offline — this needs the internet. Try again when you have signal.';
const NOT_SAVED = 'You are offline, and this was not saved on this phone yet. Open it once with internet to keep a copy.';

/** Pages never kept: money, the identity check, admin, codes and secret links (driver / delivery). */
const NEVER_KEEP_PAGE = /^\/(api|kyc|escrow|admin|deliver|drive|verify-otp|mfa-setup|reset-password|forgot-password)(\/|$)/;
/** Pages saved for offline use as soon as KashRoot is installed (with their files). */
const WARM_PAGES = ['/', '/mandi-weather'];

/** Public data kept for offline use: its key (null = not kept). */
function dataKey(url) {
  if (url.pathname === '/api/weather') {
    // Place search (typing a village name) is not kept: only forecasts.
    return url.searchParams.has('search') ? null : url.href;
  }
  if (url.pathname === '/api/mandi') return url.href;
  // Rates posted by Mandi Helpers (read by everyone, signed in or not).
  // The "since" date changes every day; yesterday's copy still answers today.
  if (url.pathname === '/api/supabase/rest/v1/mandi_rates') {
    const key = new URL(url.href);
    key.searchParams.delete('rate_date');
    return key.href;
  }
  return null;
}

function isStatic(url) {
  if (url.pathname.startsWith('/api/')) return false;
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image') ||
    /^\/(icons|hero|seasons|vendor)\//.test(url.pathname) ||
    /\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|wasm)$/.test(url.pathname)
  );
}

/** Next.js page data for moving inside the app: always from the server. */
const isPageData = (req, url) => req.headers.get('RSC') === '1' || req.headers.has('Next-Router-Prefetch') || url.searchParams.has('_rsc');

const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
/** What a failed request gets: every field the app's readers look for (error, message, msg). */
const offlineAnswer = (text) => json({ error: text, message: text, msg: `[setup] ${text}`, code: 'KR_OFFLINE' }, 503);

/** A copy with the time it was saved. */
async function stamped(res) {
  const headers = new Headers(res.headers);
  headers.set(SAVED_AT, String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}
const savedAtOf = (res) => Number(res.headers.get(SAVED_AT)) || 0;

const trimming = new Set();
async function trim(name) {
  const max = LIMIT[name];
  if (!max || trimming.has(name)) return;
  trimming.add(name);
  try {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
  } finally {
    trimming.delete(name);
  }
}

/** Saves a page and the app files it names, unless it is already saved. */
async function savePage(path, cacheName, again = false) {
  const url = new URL(path, self.location.origin);
  if (NEVER_KEEP_PAGE.test(url.pathname)) return;
  const pages = await caches.open(cacheName);
  if (!again && (await pages.match(url.href))) return;
  const res = await fetch(url.href, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok || res.redirected || !(res.headers.get('content-type') || '').includes('text/html')) return;
  const html = await res.clone().text();
  await pages.put(url.href, await stamped(res));
  const files = [...new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) || [])];
  await saveFiles(files);
  trim(cacheName);
}

async function saveFiles(urls) {
  const cache = await caches.open(STATIC);
  for (const u of urls) {
    try {
      const url = new URL(u, self.location.origin);
      if (url.origin !== self.location.origin || !isStatic(url) || (await cache.match(url.href))) continue;
      const res = await fetch(url.href);
      if (res.ok && res.type === 'basic') await cache.put(url.href, res);
    } catch {
      /* no signal: saved next time */
    }
  }
  trim(STATIC);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await savePage('/offline', SHELL, true).catch(() => undefined);
      // The first install takes over at once; an update waits for "Refresh".
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

/** Deletes the copies saved by older versions. */
async function dropOld() {
  for (const name of await caches.keys()) {
    if (name.startsWith('kr-') && !OURS.includes(name)) await caches.delete(name);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await dropOld();
      // The page request starts while this worker wakes up.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => undefined);
      await self.clients.claim();
    })(),
  );
});

/** Pages shown from the saved copy, by tab (the banner asks which time to show). */
const shownSaved = new Map();

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'kr-skip-waiting') {
    self.skipWaiting();
  } else if (msg.type === 'kr-warm') {
    // The page the person opened before KashRoot was installed, its files,
    // and the pages most needed offline (mandi rates and weather).
    event.waitUntil(
      (async () => {
        // An older version still finishing a request as this one took over can leave a copy behind.
        await dropOld();
        await saveFiles(Array.isArray(msg.files) ? msg.files.slice(0, 200) : []);
        const pages = [...(typeof msg.page === 'string' ? [msg.page] : []), ...(msg.saveData ? [] : WARM_PAGES)];
        for (const p of pages) await savePage(p, PAGES).catch(() => undefined);
      })(),
    );
  } else if (msg.type === 'kr-page-info' && event.ports[0]) {
    event.ports[0].postMessage({ savedAt: (event.source && shownSaved.get(event.source.id)) || null });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Other sites (maps, government data): the browser's own way.
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET') {
    // Never kept. With no signal: a plain answer instead of a broken request.
    if (url.pathname.startsWith('/api/')) event.respondWith(fetch(req).catch(() => offlineAnswer(NEEDS_INTERNET)));
    return;
  }
  if (req.mode === 'navigate') return event.respondWith(page(event));
  if (isPageData(req, url) || req.headers.has('range')) return;
  if (isStatic(url)) return event.respondWith(phoneFirst(event, req));
  const key = dataKey(url);
  if (key) return event.respondWith(savedData(event, req, key));
  // Everything else (signed-in data, sign-in, KYC, codes, payments): not kept.
});

async function phoneFirst(event, req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') {
    const copy = res.clone();
    event.waitUntil(cache.put(req, copy).then(() => trim(STATIC)));
  }
  return res;
}

async function page(event) {
  const req = event.request;
  const url = new URL(req.url);
  const network = (async () => (await event.preloadResponse) || fetch(req))();
  if (NEVER_KEEP_PAGE.test(url.pathname)) {
    try {
      return await network;
    } catch {
      return offlinePage(url);
    }
  }
  const key = new URL(url.pathname + url.search, url.origin).href;
  const saved = (await caches.match(key)) || (await caches.match(key, { ignoreSearch: true }));
  const fresh = network.then((res) => {
    if (res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html')) {
      const copy = res.clone();
      event.waitUntil(
        (async () => {
          const cache = await caches.open(PAGES);
          await cache.put(key, await stamped(copy));
          await trim(PAGES);
        })().catch(() => undefined),
      );
    }
    return res;
  });
  // A late answer still refreshes the saved copy.
  event.waitUntil(fresh.catch(() => undefined));
  if (!saved) {
    try {
      return await fresh;
    } catch {
      return offlinePage(url);
    }
  }
  const late = new Promise((resolve) => setTimeout(resolve, PAGE_WAIT_MS, null));
  const first = await Promise.race([fresh.catch(() => null), late]);
  // A server error is no better than the saved copy.
  if (first && first.status < 500) return first;
  if (event.resultingClientId) {
    shownSaved.set(event.resultingClientId, savedAtOf(saved));
    if (shownSaved.size > 50) shownSaved.delete(shownSaved.keys().next().value);
  }
  return saved;
}

async function offlinePage(url) {
  if (url.pathname !== '/offline' && (await caches.match(new URL('/offline', self.location.origin).href))) {
    const to = new URL('/offline', self.location.origin);
    to.searchParams.set('from', url.pathname + url.search);
    return Response.redirect(to.href, 302);
  }
  // Not even the offline page is saved yet (installed with no signal).
  return new Response(
    '<!doctype html><html lang="en-IN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline | KashRoot</title>' +
      '<body style="margin:0;font:18px/1.5 system-ui,sans-serif;background:#f7fdf9;color:#0f172a;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box">' +
      '<main style="max-width:28rem;text-align:center"><h1 style="font-size:28px;margin:0 0 8px">You are offline</h1>' +
      '<p>This page needs the internet. Try again when you have signal.</p>' +
      '<p><button onclick="location.reload()" style="font:inherit;font-weight:700;min-height:48px;padding:0 24px;border:0;border-radius:12px;background:#047857;color:#fff">Try again</button></p></main></body></html>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

async function savedData(event, req, key) {
  const cache = await caches.open(DATA);
  const saved = await cache.match(key);
  const age = saved ? Date.now() - savedAtOf(saved) : Infinity;
  const fetchAndKeep = async () => {
    const res = await fetch(req);
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
      await cache.put(key, await stamped(res.clone()));
      trim(DATA);
    }
    return res;
  };
  if (saved && age < FRESH_MS) {
    // Fresh enough to count as live; with no signal the page still says "Saved at".
    event.waitUntil(tell(event.clientId, req.url, { savedAt: savedAtOf(saved), fresh: true }));
    return saved;
  }
  if (saved) {
    // The saved copy now; a fresh one behind it, and the page is told when it is in.
    event.waitUntil(
      fetchAndKeep().then(
        (res) => res.ok && tell(event.clientId, req.url, { updated: true }),
        () => undefined,
      ),
    );
    event.waitUntil(tell(event.clientId, req.url, { savedAt: savedAtOf(saved), fresh: false }));
    return saved;
  }
  try {
    const res = await fetchAndKeep();
    event.waitUntil(tell(event.clientId, req.url, { savedAt: null, fresh: true }));
    return res;
  } catch {
    return offlineAnswer(NOT_SAVED);
  }
}

/**
 * Tells the tab that asked where its data came from: { savedAt, fresh } —
 * savedAt null for a fresh answer from the internet — or { updated } once a
 * fresher copy has been saved behind the one shown.
 */
async function tell(clientId, url, note) {
  if (!clientId) return;
  const client = await self.clients.get(clientId).catch(() => null);
  if (client) client.postMessage({ type: 'kr-data', url, savedAt: null, fresh: true, updated: false, ...note });
}
