const CACHE_NAME = 'erby';
const urlsToCache = [
    '/erby/',                   // Корневая страница
    '/erby/index.html',         // Главная страница
    '/erby/script.js',          // Основной скрипт
    '/erby/images/logo.png',    // Логотип
    '/erby/images/bg.png',      // Фон
    '/erby/manifest.json',      // Манифест
    '/erby/pwa.js'              // service worker PWA
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