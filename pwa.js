const CACHE_NAME = 'ERBY';
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
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});