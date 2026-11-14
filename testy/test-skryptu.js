/* test-skryptu.js – sprawdza skrypt Google (skrypt-google/Kod.gs) bez Google:
   udajemy usługi DriveApp, LockService i ContentService w pamięci.
   Pilnuje też, żeby skrypt pokazywany w aplikacji był identyczny z Kod.gs.
   Użycie: node testy/test-skryptu.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const KATALOG = path.resolve(__dirname, '..');
const kod = fs.readFileSync(path.join(KATALOG, 'skrypt-google', 'Kod.gs'), 'utf8');

// 1. Skrypt w aplikacji = Kod.gs
const wAplikacji = {};
vm.runInNewContext(fs.readFileSync(path.join(KATALOG, 'js', 'skrypt-google.js'), 'utf8') + ';wynik.s = SKRYPT_GOOGLE;', { wynik: wAplikacji });
assert.strictEqual(wAplikacji.s, kod, 'js/skrypt-google.js różni się od skrypt-google/Kod.gs');

// 2. Udawany Google: foldery i pliki w pamięci.
function nowyGoogle() {
  const foldery = [];
  const iterator = lista => ({ hasNext: () => lista.length > 0, next: () => lista.shift() });
  let zegar = 0;   // kolejne „czasy zmian” plików
  const nowyFolder = (nazwa, lista = foldery) => {
    const pliki = [];
    const podfoldery = [];
    const f = {
      nazwa, pliki, podfoldery,
      getFilesByName: n => iterator(pliki.filter(p => p.nazwa === n)),
      getFiles: () => iterator(pliki.slice()),
      getFoldersByName: n => iterator(podfoldery.filter(x => x.nazwa === n)),
      createFolder: n => nowyFolder(n, podfoldery),
      createFile: (n, tresc) => {
        const p = { nazwa: n, tresc, czas: ++zegar,
          getBlob: () => ({ getDataAsString: () => p.tresc }),
          setContent: t => { p.tresc = t; p.czas = ++zegar; },
          getLastUpdated: () => new Date(Date.UTC(2026, 0, 1) + p.czas * 1000) };
        pliki.push(p); return p;
      },
    };
    lista.push(f);
    return f;
  };
  let blokady = 0;
  const g = {
    foldery,
    DriveApp: { getFoldersByName: n => iterator(foldery.filter(f => f.nazwa === n)), createFolder: n => nowyFolder(n) },
    LockService: { getScriptLock: () => ({ waitLock: () => { blokady++; }, releaseLock: () => { blokady--; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ tekst: t, setMimeType() { return this; } }) },
    blokady: () => blokady,
    // Udawany internet: adres → { kod, tekst, naglowki }.
    strony: {},
    // Udawane Gemini: funkcja (zapytanie, model) → { kod, odpowiedz }.
    gemini: null,
    zapytaniaGemini: [],
    wlasciwosci: {},
    pamiec: {},
    wyzwalacze: [],
    dziennik: [],
    Logger: { log: t => g.dziennik.push(String(t)) },
    Utilities: { sleep: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: n => (n in g.wlasciwosci ? g.wlasciwosci[n] : null) }) },
    CacheService: { getScriptCache: () => ({ get: k => g.pamiec[k] || null, put: (k, v) => { g.pamiec[k] = v; }, remove: k => { delete g.pamiec[k]; } }) },
    ScriptApp: {
      AuthMode: { FULL: 'FULL' }, requireAllScopes: () => {},
      getProjectTriggers: () => g.wyzwalacze.slice(),
      deleteTrigger: t => { g.wyzwalacze = g.wyzwalacze.filter(x => x !== t); },
      newTrigger: f => ({ timeBased: () => ({ everyHours: h => ({ create: () => { const t = { getHandlerFunction: () => f, h }; g.wyzwalacze.push(t); return t; } }) }) }),
    },
    UrlFetchApp: { fetch: (url, opcje = {}) => {
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        const model = decodeURIComponent((url.match(/models\/([^:]+):/) || [])[1] || '');
        const zap = { url, model, klucz: (opcje.headers || {})['x-goog-api-key'], dane: JSON.parse(opcje.payload) };
        g.zapytaniaGemini.push(zap);
        const o = g.gemini(zap);
        return { getResponseCode: () => o.kod || 200, getContentText: () => JSON.stringify(o.odpowiedz), getHeaders: () => ({}) };
      }
      const st = g.strony[url];
      if (!st) throw new Error('brak sieci');
      return { getResponseCode: () => st.kod || 200, getContentText: () => st.tekst, getHeaders: () => st.naglowki || { 'Content-Type': 'text/html; charset=utf-8' } };
    } },
  };
  vm.runInNewContext(kod.replace("'WSTAW_KLUCZ'", "'tajny'"), g);
  return g;
}
const zapytaj = (g, dane) => JSON.parse(g.doPost({ postData: { contents: JSON.stringify(dane) } }).tekst);

const g = nowyGoogle();
// Zły klucz – odmowa, nic nie powstaje.
assert.deepStrictEqual(zapytaj(g, { klucz: 'zly', akcja: 'pobierz' }), { blad: 'zły klucz' });
assert.strictEqual(g.foldery.length, 0, 'zły klucz nie może tworzyć plików');
// Pierwsze pobranie tworzy folder Potok i pusty Potok.json.
assert.deepStrictEqual(JSON.parse(zapytaj(g, { klucz: 'tajny', akcja: 'pobierz' }).tresc), { wersja: 1, wpisy: [] });
assert.strictEqual(g.foldery[0].nazwa, 'Potok');
assert.strictEqual(g.foldery[0].pliki[0].nazwa, 'Potok.json');
// Zapis i odczyt.
const tresc = JSON.stringify({ wersja: 1, wpisy: [{ id: 'w1', tytul: 'Zażółć gęślą jaźń' }] });
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'zapisz', tresc }), { ok: true });
assert.strictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'pobierz' }).tresc, tresc);
// Kolejne zapytania nie tworzą duplikatów folderu ani pliku.
assert.strictEqual(g.foldery.length, 1);
assert.strictEqual(g.foldery[0].pliki.length, 1);
// Blokada zawsze zwolniona; złe dane i nieznana akcja – czytelny błąd.
assert.strictEqual(g.blokady(), 0, 'blokada nie została zwolniona');
assert.deepStrictEqual(JSON.parse(g.doPost({ postData: { contents: 'to nie json' } }).tekst), { blad: 'złe dane' });
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'kasuj' }), { blad: 'nieznana akcja' });

// 3. Akcja „opis”: tytuł i autor linku.
const yt = 'https://youtu.be/abc?si=x';
g.strony['https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(yt)] = { tekst: JSON.stringify({ title: 'Piosenka – zażółć', author_name: 'Kanał Muzyczny' }) };
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: yt }), { tytul: 'Piosenka – zażółć', autor: 'Kanał Muzyczny' });
g.strony['https://example.com/artykul'] = { tekst: `<html><head><title>Zapasowy</title>
  <meta content="Rick&#39;s &quot;tekst&quot; o AI" property="og:title">
  <meta property='og:site_name' content="Blog Ani's"></head></html>` };
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'https://example.com/artykul' }), { tytul: 'Rick\'s "tekst" o AI', autor: "Blog Ani's" });
g.strony['https://example.com/bez-og'] = { tekst: '<title>Tylko &amp; tytuł</title>' };
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'https://example.com/bez-og' }), { tytul: 'Tylko & tytuł', autor: '' });
// Facebook z ekranem logowania – bez tytułu, a nie „Facebook”.
g.strony['https://www.facebook.com/reel/1'] = { tekst: '<meta property="og:title" content="Facebook"><title>Facebook</title>' };
assert.strictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'https://www.facebook.com/reel/1' }).tytul, '');
// Błąd sieci, 404, zły adres, zły klucz – bez wywrotki.
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'https://nie-ma.example' }), { tytul: '', problem: 'brak sieci' });
g.strony['https://example.com/404'] = { kod: 404, tekst: '' };
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'https://example.com/404' }), { tytul: '', problem: 'strona: kod 404' });
// Brak zgody Google na łączenie ze stronami – błąd widoczny, a nie cichy pusty tytuł.
const strony = g.strony; g.strony = new Proxy({}, { get: () => { throw new Error('Nie masz uprawnień do wywołania UrlFetchApp.fetch'); } });
assert.match(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'https://danluu.com/ambitious' }).problem, /uprawnień/);
g.strony = strony;
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'wersja' }), { wersja: 4 });
assert.deepStrictEqual(zapytaj(g, { klucz: 'zly', akcja: 'wersja' }), { blad: 'zły klucz' });
g.strony['https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=jNQXAC9IVRw')] = { tekst: JSON.stringify({ title: 'Me at the zoo', author_name: 'jawed' }) };
assert.strictEqual(g.sprawdzTytuly().tytul, 'Me at the zoo');
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'file:///C:/x' }), { blad: 'zły adres' });
assert.deepStrictEqual(zapytaj(g, { klucz: 'zly', akcja: 'opis', url: yt }), { blad: 'zły klucz' });
assert.strictEqual(JSON.parse(g.doGet().tekst).wersja, 4);

// 4. Streszczenia (wersja 4).
{
  const g = nowyGoogle();
  const dlugi = '<html><head><title>Artykuł o AI</title><script>var x="nie to";</script></head><body><nav>Menu Menu</nav><article>' +
    '<p>' + 'Zażółć gęślą jaźń. To jest długi akapit o modelach językowych i ich zastosowaniach. '.repeat(20) + '</p></article></body></html>';
  g.strony['https://example.com/dlugi'] = { tekst: dlugi };
  g.strony['https://example.com/krotki'] = { tekst: '<p>Zaloguj się, aby czytać dalej.</p>' };
  g.strony['https://example.com/plik.pdf'] = { tekst: '%PDF', naglowki: { 'Content-Type': 'application/pdf' } };
  const wpisy = [
    { id: 'a1', url: 'https://example.com/dlugi', tytul: 'Długi', status: 'do_streszczenia' },
    { id: 'a2', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=RDxyz&index=2', tytul: 'Film', status: 'do_streszczenia' },
    { id: 'a3', url: 'https://example.com/krotki', tytul: 'Paywall', status: 'do_streszczenia' },
    { id: 'a4', url: 'https://www.facebook.com/reel/1', tytul: 'FB', status: 'do_streszczenia' },
    { id: 'a5', url: 'https://example.com/plik.pdf', tytul: 'PDF', status: 'do_streszczenia' },
    { id: 'a6', url: 'https://example.com/dlugi', tytul: 'Szczegółowo', status: 'szczegolowo' },
    { id: 'a7', url: 'https://example.com/dlugi', tytul: 'Zgłębić – nie streszczamy', status: 'zglebic' },
    { id: 'a8', url: 'file:///C:/ksiazka.pdf', tytul: 'Plik z dysku', status: 'do_streszczenia' },
    { id: 'a9', url: null, tytul: 'Notatka', status: 'do_streszczenia' },
  ];
  zapytaj(g, { klucz: 'tajny', akcja: 'zapisz', tresc: JSON.stringify({ wersja: 1, wpisy }) });
  const przed = g.foldery[0].pliki[0].tresc;

  // Bez klucza Gemini: nic nie wysyłamy, problem zapisany, próba policzona.
  g.gemini = () => { throw new Error('nie powinno pytać Gemini bez klucza'); };
  const wynik0 = g.streszczajCoGodzine();
  assert.strictEqual(wynik0.czeka, 6, 'bez klucza nic nie jest streszczane');
  const folderS = () => g.foldery[0].podfoldery.find(f => f.nazwa === 'Streszczenia');
  const plikS = id => { const p = folderS().pliki.find(x => x.nazwa === id + '.json'); return p && JSON.parse(p.tresc); };
  assert.match(plikS('a1').problem, /GEMINI_KLUCZ/);
  assert.strictEqual(plikS('a1').proby, undefined, 'brak klucza nie zużywa prób');
  assert.strictEqual(plikS('a2'), undefined, 'po braku klucza przerwa do następnego uruchomienia');
  assert.strictEqual(g.zapytaniaGemini.length, 0);

  // Z kluczem: krótkie dla „Streścić”, szczegółowe dla „Streścić szczegółowo”.
  g.wlasciwosci.GEMINI_KLUCZ = 'klucz-gemini';
  g.gemini = z => ({ odpowiedz: { candidates: [{ content: { parts: [{ text: (z.dane.contents[0].parts.some(p => p.fileData) ? 'Film: ' : 'Tekst: ') + (/szczegółowe/.test(JSON.stringify(z.dane)) ? 'szczegółowo' : 'krótko') }] } }] } });
  const wynik1 = g.streszczajCoGodzine();
  assert.strictEqual(wynik1['ręcznie'], 3, 'paywall, Facebook i PDF od razu do ręcznego');
  assert.strictEqual(plikS('a1').krotkie.tekst, 'Tekst: krótko');
  assert.strictEqual(plikS('a1').krotkie.model, 'gemini-3.5-flash-lite');
  assert.strictEqual(plikS('a1').problem, undefined, 'po udanym streszczeniu problem znika');
  assert.strictEqual(plikS('a6').szczegolowe.tekst, 'Tekst: szczegółowo');
  // Film: sam film, bez listy, wysłany jako adres (Gemini go „ogląda”), mało klatek.
  assert.strictEqual(plikS('a2').krotkie.tekst, 'Film: krótko');
  const zapFilmu = g.zapytaniaGemini.find(z => z.dane.contents[0].parts[0].fileData);
  assert.strictEqual(zapFilmu.dane.contents[0].parts[0].fileData.fileUri, 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  assert.strictEqual(zapFilmu.klucz, 'klucz-gemini');
  // Tekst strony: bez skryptów i menu, z tytułem.
  const zapTekstu = g.zapytaniaGemini.find(z => !z.dane.contents[0].parts[0].fileData).dane.contents[0].parts[0].text;
  assert.match(zapTekstu, /Tytuł: Artykuł o AI/);
  assert.match(zapTekstu, /Zażółć gęślą jaźń/);
  assert.doesNotMatch(zapTekstu, /nie to|Menu Menu/);
  // Paywall, Facebook, PDF – do ręcznego, bez pytania AI.
  assert.match(plikS('a3').doRecznego.krotkie, /za mało tekstu/);
  assert.match(plikS('a4').doRecznego.krotkie, /logowania/);
  assert.match(plikS('a5').doRecznego.krotkie, /plik/);
  // Inne statusy, pliki z dysku i notatki – pomijane.
  for (const id of ['a7', 'a8', 'a9']) assert.strictEqual(plikS(id), undefined, id + ' nie powinien mieć streszczenia');
  assert.strictEqual(wynik1.ok, 3);
  // Potok.json nietknięty.
  assert.strictEqual(g.foldery[0].pliki[0].tresc, przed, 'automat nie może zmieniać Potok.json');

  // Drugie uruchomienie: nic nowego do zrobienia, żadnych zapytań.
  const ile = g.zapytaniaGemini.length;
  g.streszczajCoGodzine();
  assert.strictEqual(g.zapytaniaGemini.length, ile, 'gotowe streszczenia nie są robione drugi raz');

  // Aplikacja odczytuje streszczenia (wszystkie albo zmienione od podanej chwili).
  const odczyt = zapytaj(g, { klucz: 'tajny', akcja: 'streszczenia' });
  assert.strictEqual(odczyt.streszczenia.length, 6);
  assert.ok(odczyt.teraz);
  const ostatni = folderS().pliki.map(p => p.getLastUpdated().toISOString()).sort().pop();
  assert.strictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'streszczenia', od: ostatni }).streszczenia.length, 0);
  assert.deepStrictEqual(zapytaj(g, { klucz: 'zly', akcja: 'streszczenia' }), { blad: 'zły klucz' });

  // Limit Gemini (429): przerwa, próba nie jest liczona; inne błędy liczone do 3 prób.
  const g2 = nowyGoogle();
  g2.wlasciwosci.GEMINI_KLUCZ = 'k';
  g2.wlasciwosci.MODEL_KROTKI = 'inny-model';
  g2.strony['https://example.com/dlugi'] = { tekst: dlugi };
  zapytaj(g2, { klucz: 'tajny', akcja: 'zapisz', tresc: JSON.stringify({ wersja: 1, wpisy: [wpisy[0], { ...wpisy[0], id: 'b2' }] }) });
  g2.gemini = () => ({ kod: 429, odpowiedz: { error: { message: 'Quota exceeded' } } });
  const w429 = g2.streszczajCoGodzine();
  assert.strictEqual(g2.zapytaniaGemini.length, 1, 'po 429 nie pytamy dalej w tym uruchomieniu');
  assert.strictEqual(g2.zapytaniaGemini[0].model, 'inny-model', 'model z Właściwości skryptu');
  assert.strictEqual(w429.czeka, 2);
  const s429 = JSON.parse(g2.foldery[0].podfoldery[0].pliki[0].tresc);
  assert.match(s429.problem, /429/);
  assert.strictEqual(s429.proby, undefined);
  g2.gemini = () => ({ kod: 500, odpowiedz: {} });
  for (let i = 0; i < 4; i++) g2.streszczajCoGodzine();
  assert.strictEqual(g2.zapytaniaGemini.length, 1 + 2 * 3, 'po 3 nieudanych próbach wpis czeka na ręczne');

  // Silnik jako ustawienie: wyłączony – nic się nie dzieje; Ollama – inny adres, bez filmów.
  const g3 = nowyGoogle();
  g3.strony['https://example.com/dlugi'] = { tekst: dlugi };
  zapytaj(g3, { klucz: 'tajny', akcja: 'zapisz', tresc: JSON.stringify({ wersja: 1, wpisy: [wpisy[0], wpisy[1]] }) });
  g3.wlasciwosci.SILNIK = 'wylaczony';
  g3.streszczajCoGodzine();
  assert.strictEqual((g3.foldery[0].podfoldery[0] || { pliki: [] }).pliki.length, 0);
  g3.wlasciwosci.SILNIK = 'ollama';
  g3.wlasciwosci.OLLAMA_ADRES = 'https://ollama.example/';
  g3.strony['https://ollama.example/api/generate'] = { tekst: JSON.stringify({ response: 'Bielik: krótko' }) };
  g3.streszczajCoGodzine();
  const pl3 = id => JSON.parse(g3.foldery[0].podfoldery[0].pliki.find(p => p.nazwa === id + '.json').tresc);
  assert.strictEqual(pl3('a1').krotkie.tekst, 'Bielik: krótko');
  assert.strictEqual(pl3('a1').krotkie.model, 'SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0');
  assert.match(pl3('a2').doRecznego.krotkie, /Ollama nie streszcza filmów/);

  // „BRAK TREŚCI” od AI = do ręcznego.
  const g4 = nowyGoogle();
  g4.wlasciwosci.GEMINI_KLUCZ = 'k';
  g4.strony['https://example.com/dlugi'] = { tekst: dlugi };
  zapytaj(g4, { klucz: 'tajny', akcja: 'zapisz', tresc: JSON.stringify({ wersja: 1, wpisy: [wpisy[0]] }) });
  g4.gemini = () => ({ odpowiedz: { candidates: [{ content: { parts: [{ text: 'BRAK TREŚCI' }] } }] } });
  g4.streszczajCoGodzine();
  assert.match(JSON.parse(g4.foldery[0].podfoldery[0].pliki[0].tresc).doRecznego.krotkie, /AI nie znalazło/);

  // NA_RAZ: tylko tyle wpisów w jednym uruchomieniu.
  const g5 = nowyGoogle();
  g5.wlasciwosci.GEMINI_KLUCZ = 'k';
  g5.wlasciwosci.NA_RAZ = '2';
  g5.strony['https://example.com/dlugi'] = { tekst: dlugi };
  zapytaj(g5, { klucz: 'tajny', akcja: 'zapisz', tresc: JSON.stringify({ wersja: 1, wpisy: [1, 2, 3, 4].map(i => ({ ...wpisy[0], id: 'c' + i })) }) });
  g5.gemini = () => ({ odpowiedz: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
  assert.deepStrictEqual({ ...g5.streszczajCoGodzine() }, { ok: 2, 'ręcznie': 0, 'błąd': 0, czeka: 2 });

  // wlaczStreszczenia: próbne streszczenie + jeden harmonogram co godzinę (bez dubli).
  g5.wlaczStreszczenia();
  g5.wlaczStreszczenia();
  assert.strictEqual(g5.wyzwalacze.length, 1);
  assert.strictEqual(g5.wyzwalacze[0].getHandlerFunction(), 'streszczajCoGodzine');
  assert.strictEqual(g5.wyzwalacze[0].h, 1);
  g5.wylaczStreszczenia();
  assert.strictEqual(g5.wyzwalacze.length, 0);
}
console.log('Skrypt Google: OK (klucz, tworzenie pliku, zapis/odczyt, polskie znaki, blokada, tytuły linków, streszczenia: Gemini, YouTube, paywall, limity, Ollama, harmonogram)');
