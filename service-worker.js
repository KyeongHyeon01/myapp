// 앱 파일을 캐시해서 인터넷 없이도 열리게 합니다.
// 파일을 수정해서 배포할 때는 CACHE_VERSION을 올려주세요.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `imgzip-${CACHE_VERSION}`;

const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

// 이전 버전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('imgzip-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 구글 폰트: 한 번 받으면 바뀌지 않으므로 캐시 우선
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 앱 파일: 온라인이면 최신 파일, 오프라인이면 캐시
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // 폰트 CSS는 no-cors로 요청돼서 opaque 응답이 옴
  if (response.ok || response.type === 'opaque') {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // 오프라인에서 처음 보는 주소로 들어오면 첫 화면을 보여줌
    if (request.mode === 'navigate') {
      const home = await caches.match('./index.html');
      if (home) return home;
    }
    throw err;
  }
}
