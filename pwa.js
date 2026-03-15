const CACHE_NAME = 'ERBY_v1_3_0';
const urlsToCache = [
    '/ERBY/',                   // Корневая страница
    '/ERBY/index.html',         // Главная страница
    '/ERBY/script.js',          // Основной скрипт
    '/ERBY/images/logo.png',    // Логотип
    '/ERBY/images/bg.png',      // Фон
    '/ERBY/manifest.json',      // Манифест
    '/ERBY/pwa.js'              // service worker PWA
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('✅ Установлен кэш:', CACHE_NAME);
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName.startsWith('ERBY')) {
                            console.log('🗑️ Удаляем старый кэш:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});