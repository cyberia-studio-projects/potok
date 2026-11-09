/* e2e-drive.js – test synchronizacji z Google Drive „jak człowiek”,
   na udawanym Google Drive (prawdziwe konto nie jest potrzebne).

   Scenariusz: dwa urządzenia (komputer i telefon) z tym samym Drive.
   1. Komputer importuje dokument i wysyła go na Drive.
   2. Telefon (pusty) pobiera wszystko z Drive.
   3. Telefon bez internetu podejmuje decyzję – zmiana czeka w kolejce.
   4. Wraca internet – zmiana sama trafia na Drive.
   5. Komputer pobiera zmianę z telefonu. Nic nie zginęło.

   Użycie: node testy/e2e-drive.js */
const { chromium, devices } = require('playwright');
const path = require('path');
const assert = require('assert');

const KATALOG = path.resolve(__dirname, '..');
const STRONA = 'file://' + path.join(KATALOG, 'index.html');
const DOCX = path.join(__dirname, 'przyklad.docx');

/* ---------- Udawany Google Drive: pliki trzymane w pamięci ---------- */
const drive = { pliki: {}, licznik: 0, zapisy: 0 };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

async function obsluzDrive(route) {
  const z = route.request();
  const url = new URL(z.url());
  const odpowiedz = (body, status = 200) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  if (z.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (z.headers()['authorization'] !== 'Bearer TOKEN-TESTOWY') return odpowiedz({ error: 'brak tokenu' }, 401);

  // Szukanie pliku/folderu po nazwie.
  if (z.method() === 'GET' && url.pathname === '/drive/v3/files') {
    const q = url.searchParams.get('q');
    const nazwa = (q.match(/name='([^']+)'/) || [])[1];
    const pasujace = Object.entries(drive.pliki).filter(([, p]) => p.name === nazwa).map(([id, p]) => ({ id, name: p.name }));
    return odpowiedz({ files: pasujace });
  }
  // Utworzenie pliku/folderu.
  if (z.method() === 'POST' && url.pathname === '/drive/v3/files') {
    const id = 'plik' + (++drive.licznik);
    drive.pliki[id] = { ...JSON.parse(z.postData()), tresc: '' };
    return odpowiedz({ id });
  }
  // Pobranie treści.
  const pobierz = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  if (z.method() === 'GET' && pobierz) return odpowiedz(drive.pliki[pobierz[1]].tresc || '');
  // Zapis treści.
  const zapisz = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
  if (z.method() === 'PATCH' && zapisz) {
    drive.pliki[zapisz[1]].tresc = z.postData();
    drive.zapisy++;
    return odpowiedz({ id: zapisz[1] });
  }
  return odpowiedz({ error: 'nieznane zapytanie ' + z.method() + ' ' + url.pathname }, 400);
}

/** Nowe „urządzenie”: osobna przeglądarka z udawanym kontem Google. */
async function urzadzenie(przegladarka, opcje) {
  const k = await przegladarka.newContext({ ...opcje, acceptDownloads: true });
  await k.route('https://www.googleapis.com/**', obsluzDrive);
  await k.route('https://accounts.google.com/**', r => r.abort());   // logowanie udajemy tokenem
  await k.addInitScript(() => {
    window.USTAWIENIA = { googleClientId: 'testowy.apps.googleusercontent.com' };
    if (!localStorage.getItem('potok.v1.token')) {
      localStorage.setItem('potok.v1.token', JSON.stringify({ token: 'TOKEN-TESTOWY', wygasa: Date.now() + 3600e3 }));
      localStorage.setItem('potok.v1.drive', '1');
    }
  });
  const s = await k.newPage();
  const bledy = [];
  s.on('pageerror', e => bledy.push(e.message));
  await s.goto(STRONA);
  return { k, s, bledy };
}

const stanSync = s => s.textContent('#stan-sync');
const czekajNa = (s, wzor) => s.waitForFunction(w => new RegExp(w).test(document.querySelector('#stan-sync').textContent), wzor.source, { timeout: 10000 });

(async () => {
  const przegladarka = await chromium.launch();

  // 1. Komputer: import i wysłanie na Drive.
  const komp = await urzadzenie(przegladarka, {});
  await komp.s.setInputFiles('#plik-import', DOCX);
  await czekajNa(komp.s, /zapisane/);
  const ileWpisow = await komp.s.evaluate(() => Magazyn.wczytaj().length);
  const naDrive = JSON.parse(Object.values(drive.pliki).find(p => p.name === 'Potok.json').tresc).wpisy.length;
  assert.strictEqual(naDrive, ileWpisow, 'na Drive nie ma wszystkich wpisów');
  console.log(`1. Komputer wysłał ${naDrive} wpisów na Drive.`);

  // 2. Telefon: pusty, pobiera wszystko.
  const tel = await urzadzenie(przegladarka, devices['Pixel 7']);
  await czekajNa(tel.s, /zapisane/);
  assert.strictEqual(await tel.s.evaluate(() => Magazyn.wczytaj().length), ileWpisow, 'telefon nie pobrał wpisów');
  console.log('2. Telefon pobrał wszystko z Drive.');

  // 3. Telefon bez internetu: decyzja czeka w kolejce.
  await tel.k.setOffline(true);
  await tel.s.click('nav [data-widok=przeglad]');
  const tytul = await tel.s.textContent('.karta h2');
  await tel.s.click('.decyzje [data-status=zglebic]');
  await czekajNa(tel.s, /bez internetu/);
  assert.strictEqual(await tel.s.evaluate(() => Magazyn.czekaNaWyslanie()), true, 'zmiana nie czeka w kolejce');
  const zapisyPrzed = drive.zapisy;
  await tel.s.screenshot({ path: path.join(process.argv[2] || '/tmp', 'sync-offline.png') }).catch(() => {});
  console.log(`3. Bez internetu: „${tytul}” → Zgłębić czeka w kolejce.`);

  // 4. Wraca internet: zmiana wysyła się sama.
  await tel.k.setOffline(false);
  await czekajNa(tel.s, /zapisane/);
  assert(drive.zapisy > zapisyPrzed, 'po powrocie internetu nic nie wysłano');
  assert.strictEqual(await tel.s.evaluate(() => Magazyn.czekaNaWyslanie()), false);
  console.log('4. Po powrocie internetu zmiana poszła na Drive.');

  // 5. Komputer pobiera zmianę z telefonu (np. po powrocie do karty).
  await komp.s.click('#stan-sync');
  await czekajNa(komp.s, /zapisane/);
  const status = await komp.s.evaluate(t => Magazyn.wczytaj().find(w => w.tytul === t).status, tytul);
  assert.strictEqual(status, 'zglebic', 'komputer nie widzi zmiany z telefonu');
  assert.strictEqual(await komp.s.evaluate(() => Magazyn.wczytaj().length), ileWpisow, 'liczba wpisów się zmieniła');
  console.log('5. Komputer widzi decyzję z telefonu. Nic nie zginęło.');

  // 6. Równoczesne dodanie na obu urządzeniach – oba wpisy zostają.
  for (const [u, url] of [[komp, 'https://example.com/z-komputera'], [tel, 'https://example.com/z-telefonu']]) {
    await u.s.click('nav [data-widok=dodaj]');
    await u.s.fill('#nowy-url', url);
    await u.s.click('#form-dodaj button');
  }
  await czekajNa(komp.s, /zapisane/); await czekajNa(tel.s, /zapisane/);
  await komp.s.click('#stan-sync'); await czekajNa(komp.s, /zapisane/);
  const adresy = await komp.s.evaluate(() => Magazyn.wczytaj().map(w => w.url));
  assert(adresy.includes('https://example.com/z-komputera') && adresy.includes('https://example.com/z-telefonu'), 'zginął wpis dodany równocześnie');
  console.log('6. Wpisy dodane równocześnie na dwóch urządzeniach – oba są.');

  // 7. Wygasła sesja Google: znaczek prosi o kliknięcie, dane zostają.
  await tel.s.evaluate(() => localStorage.setItem('potok.v1.token', JSON.stringify({ token: 'STARY', wygasa: Date.now() + 3600e3 })));
  await tel.s.click('#stan-sync');
  await czekajNa(tel.s, /kliknij/);
  console.log('7. Wygasła sesja: znaczek ☁ prosi o kliknięcie.');

  assert.deepStrictEqual([...komp.bledy, ...tel.bledy], [], 'błędy JavaScript na stronie');
  console.log('E2E DRIVE OK');
  await przegladarka.close();
})().catch(e => { console.error('E2E DRIVE BŁĄD:', e.message); process.exit(1); });
