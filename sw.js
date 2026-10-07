/* ============================================================
   sw.js — Service Worker cho DurianSoil pH-Vision
   Chiến lược:
     - App shell (HTML/CSS/JS)  → cache-first, update nền
     - JSON data                → stale-while-revalidate
     - CDN libs (QRCode, fonts) → cache-first, TTL dài
     - API bên ngoài (weather)  → network-only (không cache)
   ============================================================ */

'use strict';

const CACHE_VERSION = 'v1.0.0';
const CACHE_STATIC  = 'duriansoil-static-' + CACHE_VERSION;
const CACHE_RUNTIME = 'duriansoil-runtime-' + CACHE_VERSION;
const CACHE_CDN     = 'duriansoil-cdn-' + CACHE_VERSION;

// Tài nguyên app shell — bắt buộc cache khi install
const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './app.js',
  './colorScience.js',
  './recommendations.json',
  './manifest.json',
  './background.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// CDN libs — cache lâu dài
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', function(event){
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_STATIC).then(function(cache){
        return cache.addAll(APP_SHELL).catch(function(err){
          console.warn('[SW] Một số file không cache được:', err);
          // Vẫn cache từng cái — không fail toàn bộ
          return Promise.all(APP_SHELL.map(function(url){
            return cache.add(url).catch(function(){ return null; });
          }));
        });
      }),
      caches.open(CACHE_CDN).then(function(cache){
        return Promise.all(CDN_ASSETS.map(function(url){
          return cache.add(url).catch(function(){ return null; });
        }));
      })
    ]).then(function(){
      return self.skipWaiting();
    })
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', function(event){
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(key){
          return key.startsWith('duriansoil-') &&
                 key !== CACHE_STATIC &&
                 key !== CACHE_RUNTIME &&
                 key !== CACHE_CDN;
        }).map(function(key){
          console.log('[SW] Xóa cache cũ:', key);
          return caches.delete(key);
        })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', function(event){
  const req = event.request;
  const url = new URL(req.url);

  // Bỏ qua non-GET và request chrome-extension
  if(req.method !== 'GET') return;
  if(url.protocol === 'chrome-extension:') return;

  // WebSocket — để browser tự xử lý
  if(url.protocol === 'wss:' || url.protocol === 'ws:') return;

  // Navigation (mở trang) → network-first, fallback offline.html
  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req)
        .then(function(res){
          const copy = res.clone();
          caches.open(CACHE_STATIC).then(function(c){ c.put(req, copy); });
          return res;
        })
        .catch(function(){
          return caches.match(req).then(function(cached){
            return cached || caches.match('./offline.html');
          });
        })
    );
    return;
  }

  // CDN (fonts, qrcodejs) → cache-first
  if(url.origin !== self.location.origin){
    event.respondWith(
      caches.match(req).then(function(cached){
        if(cached) return cached;
        return fetch(req).then(function(res){
          if(res && res.status === 200){
            const copy = res.clone();
            caches.open(CACHE_CDN).then(function(c){ c.put(req, copy); });
          }
          return res;
        }).catch(function(){
          return cached || Response.error();
        });
      })
    );
    return;
  }

  // JSON data → stale-while-revalidate
  if(url.pathname.endsWith('.json')){
    event.respondWith(
      caches.open(CACHE_RUNTIME).then(function(cache){
        return cache.match(req).then(function(cached){
          const networkFetch = fetch(req).then(function(res){
            if(res && res.status === 200){
              cache.put(req, res.clone());
            }
            return res;
          }).catch(function(){
            return cached;
          });
          return cached || networkFetch;
        });
      })
    );
    return;
  }

  // App shell (JS/CSS/HTML/images) → cache-first, update nền
  event.respondWith(
    caches.match(req).then(function(cached){
      if(cached){
        // Trả cache ngay, update nền
        fetch(req).then(function(res){
          if(res && res.status === 200){
            caches.open(CACHE_STATIC).then(function(c){ c.put(req, res.clone()); });
          }
        }).catch(function(){});
        return cached;
      }
      return fetch(req).then(function(res){
        if(res && res.status === 200 && res.type === 'basic'){
          const copy = res.clone();
          caches.open(CACHE_STATIC).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    })
  );
});

/* ---------- MESSAGE từ page ---------- */
self.addEventListener('message', function(event){
  if(!event.data) return;
  if(event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
  if(event.data.type === 'CLEAR_CACHE'){
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ return caches.delete(k); }));
    }).then(function(){
      event.ports[0] && event.ports[0].postMessage({ ok: true });
    });
  }
});