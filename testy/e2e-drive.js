/* e2e-drive.js – test synchronizacji z Google Drive „jak człowiek”,
   na udawanym Google Drive (prawdziwe konto nie jest potrzebne).

   Scenariusz: dwa urządzenia (komputer i telefon) z tym samym Drive.
   1. Komputer importuje dokument i wysyła go na Drive.
   2. Telefon (pusty) pobiera wszystko z Drive.
   3. Telefon bez internetu podejmuje decyzję – zmiana czeka w kolejce.
   4. Wraca internet – zmiana sama trafia na Drive.
   5. Komputer pobiera zmianę z telefonu. Nic nie zginęło.

   Scenariusz przechodzi dwa razy: przez skrypt Google (sposób A)
   i przez Google Cloud (sposób B).

   Użycie: node testy/e2e-drive.js */
const { chromium, devices } = require('playwright');
const path = require('path');
const assert = require('assert');

const KATALOG = path.resolve(__dirname, '..');
const STRONA = 'file://' + path.join(KATALOG, 'index.html');
const DOCX = path.join(__dirname, 'przyklad.docx');

/* ---------- Udawany Google Drive: pliki trzymane w pamięci ---------- */
let drive;
const ADRES_SKRYPTU = 'https://script.google.com/macros/s/TESTOWY_SKRYPT/exec';

/** Udawany skrypt Google: { klucz, akcja, tresc } → jak skrypt-google/Kod.gs. */
async function obsluzSkrypt(route) {
  const z = route.request();
  const odp = obj => route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
  if (z.method() !== 'POST') return odp({ potok: 'skrypt działa' });
  const dane = JSON.parse(z.postData());
  if (dane.klucz !== 'TAJNY-KLUCZ') return odp({ blad: 'zły klucz' });
  if (dane.akcja === 'pobierz') return odp({ tresc: drive.skrypt || '{"wersja":1,"wpisy":[]}' });
  if (dane.akcja === 'zapisz') { drive.skrypt = dane.tresc; drive.zapisy++; return odp({ ok: true }); }
  // Akcja „opis” jest od wersji 2 skryptu; stary skrypt jej nie zna.
  if (dane.akcja === 'wersja' && drive.wersjaSkryptu >= 3) return odp({ wersja: drive.wersjaSkryptu });
  if (dane.akcja === 'opis' && drive.wersjaSkryptu >= 2) {
    // Jak prawdziwy YouTube: link z miksu („&list=RD…”) – bez tytułu.
    if (/youtube\.com.*[?&]list=/.test(dane.url)) return odp({ tytul: '' });
    if (/zepsuty/.test(dane.url)) return route.fulfill({ status: 200, body: '<html>błąd Google</html>' });
    if (/wolny/.test(dane.url)) return route.abort();   // skrypt nie odpowiedział (np. przekroczony czas)
    return odp({ tytul: 'Tytuł: ' + dane.url, autor: 'Autor testowy' });
  }
  // Streszczenia AI – od wersji 4 skryptu (robi je harmonogram po stronie Google).
  if (dane.akcja === 'streszczenia' && drive.wersjaSkryptu >= 4) {
    drive.odczytyStreszczen.push(dane.od || '');
    return odp({ streszczenia: drive.streszczenia.filter(x => !dane.od || x.zmieniono > dane.od), teraz: new Date().toISOString() });
  }
  return odp({ blad: 'nieznana akcja' });
}
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
async function urzadzenie(przegladarka, opcje, tryb) {
  const k = await przegladarka.newContext({ ...opcje, acceptDownloads: true });
  await k.route('https://www.googleapis.com/**', obsluzDrive);
  await k.route(ADRES_SKRYPTU, obsluzSkrypt);
  await k.route('https://accounts.google.com/**', r => r.abort());   // logowanie udajemy tokenem
  if (tryb === 'cloud') await k.addInitScript(() => {
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
/** Czeka, aż urządzenie wyśle wszystko na Drive (kolejka pusta, stan „zapisane”). */
const czekajWysylke = s => s.waitForFunction(() => !Magazyn.czekaNaWyslanie() && Synchronizacja.stan === 'zapisane', null, { timeout: 10000 });
const czekajNa = (s, wzor) => s.waitForFunction(w => new RegExp(w).test(document.querySelector('#stan-sync').textContent), wzor.source, { timeout: 10000 });

/** Treść Potok.json na udawanym Drive (w obu trybach). */
const plikNaDrive = tryb => JSON.parse(tryb === 'skrypt' ? drive.skrypt : Object.values(drive.pliki).find(p => p.name === 'Potok.json').tresc);

async function scenariusz(przegladarka, tryb) {
  drive = { pliki: {}, licznik: 0, zapisy: 0, skrypt: '', wersjaSkryptu: 1, streszczenia: [], odczytyStreszczen: [] };
  console.log(`--- Tryb: ${tryb === 'skrypt' ? 'skrypt Google' : 'Google Cloud'} ---`);

  // 0. Komputer: połączenie (w trybie skryptu – jak człowiek, przez ekran „Pliki”).
  const komp = await urzadzenie(przegladarka, {}, tryb);
  let kodPolaczenia = '';
  if (tryb === 'skrypt') {
    await komp.s.click('nav [data-widok=eksport]');
    await komp.s.click('#pokaz-skrypt');
    const skrypt = await komp.s.inputValue('#skrypt-tekst');
    const klucz = (skrypt.match(/const KLUCZ = '([^']+)'/) || [])[1];
    assert(klucz && klucz.length === 32 && klucz !== 'WSTAW_KLUCZ', 'skrypt bez klucza');
    // Udawany skrypt zna tylko 'TAJNY-KLUCZ' – podmieniamy wygenerowany klucz w pamięci.
    await komp.s.evaluate(() => localStorage.setItem('potok.v1.nowyKlucz', 'TAJNY-KLUCZ'));
    await komp.s.fill('#skrypt-adres', 'https://example.com/zly-adres');
    await komp.s.click('#polacz-skrypt');
    assert(/exec/.test(await komp.s.textContent('#komunikat')), 'brak ostrzeżenia o złym adresie');
    await komp.s.fill('#skrypt-adres', ADRES_SKRYPTU);
    await komp.s.click('#polacz-skrypt');
    await czekajNa(komp.s, /zapisane/);
    assert(!(await komp.s.isVisible('#sync-konfiguracja')), 'instrukcja widoczna po połączeniu');
    kodPolaczenia = await komp.s.evaluate(() => Synchronizacja.kodPolaczenia());
    assert.strictEqual(kodPolaczenia, ADRES_SKRYPTU + '#TAJNY-KLUCZ');
    console.log('0. Połączono przez ekran „Pliki” (skrypt + adres /exec).');
  }

  // 1. Komputer: import i wysłanie na Drive.
  await komp.s.setInputFiles('#plik-import', DOCX);
  await komp.s.waitForFunction(() => /Zaimportowano/.test(document.querySelector('#wynik-importu').textContent));
  await czekajWysylke(komp.s);
  const ileWpisow = await komp.s.evaluate(() => Magazyn.wczytaj().length);
  const naDrive = plikNaDrive(tryb).wpisy.length;
  assert.strictEqual(naDrive, ileWpisow, 'na Drive nie ma wszystkich wpisów');
  console.log(`1. Komputer wysłał ${naDrive} wpisów na Drive.`);

  // 2. Telefon: pusty, pobiera wszystko (w trybie skryptu – po wklejeniu kodu połączenia).
  const tel = await urzadzenie(przegladarka, devices['Pixel 7'], tryb);
  if (tryb === 'skrypt') {
    await tel.s.click('nav [data-widok=eksport]');
    await tel.s.fill('#skrypt-adres', kodPolaczenia);
    await tel.s.click('#polacz-skrypt');
  }
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
  await czekajWysylke(komp.s); await czekajWysylke(tel.s);
  await komp.s.click('#stan-sync'); await czekajNa(komp.s, /zapisane/);
  const adresy = await komp.s.evaluate(() => Magazyn.wczytaj().map(w => w.url));
  assert(adresy.includes('https://example.com/z-komputera') && adresy.includes('https://example.com/z-telefonu'), 'zginął wpis dodany równocześnie');
  console.log('6. Wpisy dodane równocześnie na dwóch urządzeniach – oba są.');

  if (tryb === 'cloud') {
    // 7. Wygasła sesja Google: znaczek prosi o kliknięcie, dane zostają.
    await tel.s.evaluate(() => localStorage.setItem('potok.v1.token', JSON.stringify({ token: 'STARY', wygasa: Date.now() + 3600e3 })));
    await tel.s.click('#stan-sync');
    await czekajNa(tel.s, /kliknij/);
    console.log('7. Wygasła sesja: znaczek ☁ prosi o kliknięcie.');
  } else {
    // 7. Zły klucz (np. skrypt wdrożony od nowa): czytelny błąd, wpisy zostają.
    const przed = await tel.s.evaluate(() => Magazyn.wczytaj().length);
    await tel.s.evaluate(() => localStorage.setItem('potok.v1.skrypt', JSON.stringify({ url: Synchronizacja.skrypt().url, klucz: 'ZLY' })));
    await tel.s.click('#stan-sync');
    await czekajNa(tel.s, /błąd/);
    assert(/zły klucz/.test(await tel.s.getAttribute('#stan-sync', 'title')), 'brak opisu błędu');
    assert.strictEqual(await tel.s.evaluate(() => Magazyn.wczytaj().length), przed, 'błąd usunął wpisy');
    // 8. Odłączenie urządzenia nie usuwa wpisów.
    tel.s.once('dialog', d => d.accept());
    await tel.s.click('nav [data-widok=eksport]');
    await tel.s.click('#rozlacz');
    assert(await tel.s.isVisible('#sync-konfiguracja'), 'po odłączeniu brak instrukcji');
    assert.strictEqual(await tel.s.evaluate(() => Magazyn.wczytaj().length), przed, 'odłączenie usunęło wpisy');
    console.log('7. Zły klucz: czytelny błąd. 8. Odłączenie: wpisy zostają.');

    // 9. Tytuły linków: stary skrypt → Pliki proszą o aktualizację; nowy → tytuł i autor same się uzupełniają.
    await komp.s.click('nav [data-widok=eksport]');
    await komp.s.waitForSelector('#skrypt-aktualizacja', { state: 'visible', timeout: 10000 });
    await komp.s.click('#pokaz-nowy-skrypt');
    const nowy = await komp.s.inputValue('#nowy-skrypt-tekst');
    assert(nowy.includes("const KLUCZ = 'TAJNY-KLUCZ'") && nowy.includes('WERSJA_SKRYPTU = 4') && nowy.includes('function sprawdzTytuly') && nowy.includes('function wlaczStreszczenia'), 'nowy skrypt bez klucza lub wersji');
    // Skrypt w wersji 3 (tytuły działają, streszczeń brak) – ramka dalej prosi o wersję 4.
    drive.wersjaSkryptu = 3;
    await komp.s.click('#sync-teraz');
    await komp.s.waitForFunction(() => Magazyn.wczytaj().find(w => w.url === 'https://example.com/z-komputera').autor === 'Autor testowy', null, { timeout: 15000 });
    await komp.s.waitForFunction(() => Streszczenia.skryptStary(), null, { timeout: 10000 });
    assert(await komp.s.isVisible('#skrypt-aktualizacja'), 'przy skrypcie v3 brak prośby o wersję 4');
    drive.wersjaSkryptu = 4;   // „wdrożono nową wersję”
    await komp.s.click('#sync-teraz');
    await komp.s.waitForFunction(() => Magazyn.wczytaj().find(w => w.url === 'https://example.com/z-komputera').autor === 'Autor testowy', null, { timeout: 15000 });
    // Na komputerze: link z YouTube + dopisane „Streścić” → tytuł i autor też się pobierają, podpowiedź zostaje.
    // Link z miksu (jak w Twoim imporcie) i link, przy którym skrypt się wywraca – oba nie blokują reszty.
    for (const url of ['https://example.com/wolny', 'https://example.com/zepsuty', 'https://www.youtube.com/watch?v=miks456&list=RDxyz&index=4']) {
      await komp.s.click('nav [data-widok=dodaj]');
      await komp.s.fill('#nowy-url', url);
      await komp.s.click('#form-dodaj button');
    }
    await komp.s.waitForFunction(() => Magazyn.wczytaj().find(x => (x.url || '').includes('miks456')).tytul === 'Tytuł: https://www.youtube.com/watch?v=miks456', null, { timeout: 15000 });
    // Link bez odpowiedzi po 2 próbach: „bez tytułu”, a w Pliki widać, co poszło nie tak.
    await komp.s.click('#stan-sync');
    await komp.s.waitForFunction(() => Magazyn.wczytaj().find(x => x.url === 'https://example.com/wolny').opisPobrany === 'brak-3', null, { timeout: 15000 });
    await komp.s.click('nav [data-widok=eksport]');
    assert.match(await komp.s.textContent('#stan-opisow'), /bez tytułu [1-9].*Ostatni problem.*example\.com\/wolny/);
    await komp.s.click('nav [data-widok=dodaj]');
    await komp.s.fill('#nowy-url', 'https://www.youtube.com/watch?v=komp123');
    await komp.s.fill('#nowy-opis', 'Streścić');
    await komp.s.click('#form-dodaj button');
    await komp.s.waitForFunction(() => { const w = Magazyn.wczytaj().find(x => (x.url || '').includes('komp123')); return w && w.autor === 'Autor testowy' && w.sugestia === 'do_streszczenia' && w.tekst.startsWith('Streścić'); }, null, { timeout: 15000 });
    await komp.s.click('nav [data-widok=eksport]');
    await komp.s.waitForSelector('#skrypt-aktualizacja', { state: 'hidden', timeout: 10000 });
    await czekajWysylke(komp.s);
    await komp.s.click('#stan-sync'); await czekajNa(komp.s, /zapisane/);
    const naDysku = plikNaDrive('skrypt').wpisy.find(w => w.url === 'https://example.com/z-komputera');
    assert.strictEqual(naDysku.tytul, 'Tytuł: https://example.com/z-komputera', 'tytuł nie trafił na Drive');
    await komp.s.click('nav [data-widok=listy]');
    await komp.s.click('#statusy [data-lista=skrzynka]');
    await komp.s.fill('#szukaj', 'Autor testowy');
    assert(await komp.s.locator('#lista .autor').count() > 0, 'autor nie widać na liście');
    console.log('9. Tytuły: prośba o nowy skrypt, potem tytuł i autor same się uzupełniają (też na Drive).');

    // 10. Streszczenia AI: skrypt (harmonogram) zapisał streszczenie → widać je na liście „Streścić”,
    //     a stamtąd jednym kliknięciem „→ Streścić szczegółowo”. Potok.json nie dostaje streszczeń.
    const w10 = await komp.s.evaluate(() => Magazyn.wczytaj().find(x => (x.url || '').includes('komp123')));
    await komp.s.evaluate(id => Magazyn.zmienStatus(id, 'do_streszczenia'), w10.id);
    await komp.s.click('nav [data-widok=listy]');
    await komp.s.fill('#szukaj', '');
    await komp.s.click('#statusy [data-lista=do_streszczenia]');
    assert.match(await komp.s.textContent('#lista'), /w kolejce \(automat co godzinę\)/, 'brak informacji, że streszczenie czeka');
    drive.streszczenia.push({ id: w10.id, url: w10.url, krotkie: { tekst: 'Film o <testach> po polsku.', model: 'gemini-3.5-flash-lite', data: new Date().toISOString() }, zmieniono: new Date().toISOString() });
    await komp.s.click('#stan-sync');
    await komp.s.waitForSelector('#lista .streszczenie', { timeout: 15000 });
    assert.match(await komp.s.textContent('#lista .streszczenie'), /Film o <testach> po polsku\..*|Streszczenie.*Film o <testach>/s);
    const od = drive.odczytyStreszczen[drive.odczytyStreszczen.length - 1];
    assert(od, 'kolejne odczyty powinny pytać tylko o nowe streszczenia (od)');
    await komp.s.click(`#lista [data-id="${w10.id}"][data-na=szczegolowo]`);
    assert.strictEqual(await komp.s.evaluate(id => Magazyn.wczytaj().find(x => x.id === id).status, w10.id), 'szczegolowo');
    await komp.s.click('#statusy [data-lista=szczegolowo]');
    assert.match(await komp.s.textContent('#lista'), /Szczegółowe streszczenie w kolejce/);
    await komp.s.click('nav [data-widok=eksport]');
    assert.match(await komp.s.textContent('#stan-streszczen-ai'), /Streszczenia AI: gotowe 0 · do ręcznego 0 · czekają 1/);
    await czekajWysylke(komp.s);
    await komp.s.click('#stan-sync'); await czekajNa(komp.s, /zapisane/);
    const zapisany = plikNaDrive('skrypt').wpisy.find(x => x.id === w10.id);
    assert.strictEqual(zapisany.status, 'szczegolowo', 'decyzja „Streścić szczegółowo” nie trafiła na Drive');
    assert(!JSON.stringify(plikNaDrive('skrypt')).includes('Film o <testach>'), 'streszczenie nie powinno trafiać do Potok.json');
    console.log('10. Streszczenia AI: widać je przy wpisie, „→ Streścić szczegółowo” trafia na Drive.');
  }

  assert.deepStrictEqual([...komp.bledy, ...tel.bledy], [], 'błędy JavaScript na stronie');
  await komp.k.close(); await tel.k.close();
}

(async () => {
  const przegladarka = await chromium.launch();
  await scenariusz(przegladarka, 'skrypt');
  await scenariusz(przegladarka, 'cloud');
  console.log('E2E DRIVE OK');
  await przegladarka.close();
})().catch(e => { console.error('E2E DRIVE BŁĄD:', e.message); process.exit(1); });
