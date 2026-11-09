// e2e-offline.js – aplikacja z prawdziwego adresu http (jak GitHub Pages),
// z service workerem: działa bez internetu, a „Udostępnij → Potok” bez sieci
// też dodaje wpis. Uruchom: node testy/e2e-offline.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const KATALOG = path.join(__dirname, '..');
const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

// Mały serwer plików, z nagłówkiem jak na GitHub Pages (pamięć 10 minut).
const serwer = http.createServer((req, res) => {
  let plik = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (plik.endsWith('/')) plik += 'index.html';
  const sciezka = path.join(KATALOG, plik);
  if (!sciezka.startsWith(KATALOG) || !fs.existsSync(sciezka)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPY[path.extname(sciezka)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
  fs.createReadStream(sciezka).pipe(res);
});

(async () => {
  await new Promise(r => serwer.listen(0, r));
  const ADRES = `http://localhost:${serwer.address().port}/`;
  const przegladarka = await chromium.launch();
  const kontekst = await przegladarka.newContext();
  const s = await kontekst.newPage();
  const bledy = [];
  s.on('pageerror', e => bledy.push(e.message));

  // 1. Pierwsze otwarcie z internetem – service worker zapamiętuje pliki.
  await s.goto(ADRES);
  await s.evaluate(() => navigator.serviceWorker.ready);
  await s.reload();
  await s.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.match(await s.locator('#wersja').textContent(), /Wersja aplikacji: \d+/);

  // 2. Bez internetu: aplikacja się otwiera, udostępnienie dodaje wpis.
  await kontekst.setOffline(true);
  await s.goto(ADRES + '?title=Bez%20sieci&text=' + encodeURIComponent('https://youtu.be/offline1'));
  const ile = await s.evaluate(() => Magazyn.wczytaj().filter(w => w.url === 'https://youtu.be/offline1').length);
  assert.strictEqual(ile, 1, 'udostępnienie bez internetu nie dodało wpisu');

  assert.deepStrictEqual(bledy, [], 'błędy JavaScript na stronie');
  console.log('E2E OFFLINE OK');
  await przegladarka.close();
  serwer.close();
})().catch(e => { console.error('E2E OFFLINE BŁĄD:', e.message); process.exit(1); });
