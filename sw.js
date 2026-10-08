/* 소하천 조사 — 오프라인 캐시
   앱 껍데기는 설치 시 미리 받고, 위성 타일은 본 것부터 쌓인다. */

const APP = 'sohacheon-app-v5';
const TILES = 'sohacheon-tiles-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

const TILE_HOSTS = ['api.vworld.kr', 'server.arcgisonline.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    // 하나가 실패해도 설치는 끝낸다 (현장에서 통신이 끊기는 경우가 있다)
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // 위성 타일: 캐시 우선. 없으면 받아서 쌓는다.
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        // 불투명 응답(opaque)도 그대로 저장된다 — 지도 타일은 이걸로 충분하다
        c.put(req, res.clone()).catch(() => {});
        return res;
      } catch (_) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }

  // 앱 껍데기와 라이브러리: 캐시 우선, 뒤에서 갱신
  e.respondWith((async () => {
    const c = await caches.open(APP);
    const hit = await c.match(req, { ignoreSearch: false });
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);

    if (hit) { net; return hit; }
    const res = await net;
    if (res) return res;

    if (req.mode === 'navigate') {
      const fallback = await c.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('오프라인입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
