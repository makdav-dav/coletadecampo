/* ================================================================
   Service Worker — deixa o app instalável (PWA) e abre offline.
   Estratégia: network-first para arquivos do próprio app (assim o
   coletor sempre pega a versão mais nova quando tem internet, e cai
   no cache quando está sem sinal). APIs e mapas (outra origem) passam
   direto, sem cache.
   Suba a versão do cache (v1 → v2 …) quando quiser forçar limpeza.
   ================================================================ */
const CACHE = 'coleta-campo-v1';

const ASSETS = [
  './',
  './index.html',
  './painel.html',
  './manifest.webmanifest',
  './logo.png',
  './icon-maskable.svg',
  './css/tokens.css',
  './css/app.css',
  './css/painel.css',
  './js/blindagem.js',
  './js/core.js',
  './js/arborizacao.js',
  './js/jardinagem.js',
  './js/importacao.js',
  './js/consulta.js',
  './js/painel-dash.js',
  './js/fila-boot.js',
  './js/mapa-ponto.js',
  './js/pwa.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {}))   // não falha a instalação se um item faltar
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Só cuidamos dos arquivos do próprio app. Supabase, Nominatim,
  // tiles do OpenStreetMap e CDN do Leaflet passam direto pela rede.
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
