/* Czyści stare dane Potoku pod starym adresem i przekierowuje pod nowy.
   Dotyka tylko Potoku: kluczy „potok…” w localStorage, pamięci „potok-v…”
   i service workera z zakresu /potok/. Parametry z udostępnienia
   (?title=…&text=…&url=…) przechodzą pod nowy adres. */
(async () => {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('potok')) localStorage.removeItem(k); } catch { /* trudno */ }
  try { sessionStorage.clear(); } catch { /* trudno */ }
  try { if (window.caches) for (const n of await caches.keys()) if (n.startsWith('potok')) await caches.delete(n); } catch { /* trudno */ }
  try {
    if (navigator.serviceWorker)
      for (const r of await navigator.serviceWorker.getRegistrations()) if (r.scope.includes('/potok/')) await r.unregister();
  } catch { /* trudno */ }
  location.replace('https://potok-app.github.io/potok/' + location.search);
})();
 
