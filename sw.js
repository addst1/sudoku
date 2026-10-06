/* 서비스 워커: 앱 셸을 캐시해서 오프라인에서도 실행되게 합니다.
 * 배포할 때마다 VERSION을 올리면 사용자에게 "새 버전" 알림이 뜨고 캐시가 교체됩니다. */
const VERSION = 'v6';
const CACHE = `sudoku-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'sudoku.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('sudoku-') && k !== CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 페이지 이동은 항상 캐시된 index.html로 (오프라인 + 쿼리스트링 대응)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((hit) => hit || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
