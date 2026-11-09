/* sw.js – service worker: zapamiętuje pliki aplikacji, żeby działała offline.
   Przy każdej zmianie plików podbij WERSJA – wtedy telefon pobierze nowe. */
const WERSJA = 'potok-v17';
const PLIKI = ['./', 'index.html', 'styl.css', 'manifest.webmanifest', 'ikona.svg',
  'js/magazyn.js', 'js/zip.js', 'js/import.js', 'js/eksport.js', 'js/skrypt-google.js', 'js/synchronizacja.js', 'js/opisy.js', 'js/app.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(WERSJA).then(c => c.addAll(PLIKI))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(n => n !== WERSJA).map(n => caches.delete(n))))));
// Najpierw sieć (świeża wersja), a bez sieci – kopia z pamięci.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Google (logowanie, Drive) – zawsze prosto do sieci, nic nie zapamiętujemy.
  if (!e.request.url.startsWith(self.location.origin)) return;
  // cache: 'no-cache' – nie bierz starej kopii z pamięci przeglądarki
  // (GitHub Pages pozwala jej trzymać pliki do 10 minut), zawsze pytaj serwer.
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => {
    const kopia = r.clone();
    caches.open(WERSJA).then(c => c.put(e.request, kopia));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
