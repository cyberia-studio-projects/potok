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
  const nowyFolder = nazwa => {
    const pliki = [];
    const f = {
      nazwa, pliki,
      getFilesByName: n => iterator(pliki.filter(p => p.nazwa === n)),
      createFile: (n, tresc) => { const p = { nazwa: n, tresc, getBlob: () => ({ getDataAsString: () => p.tresc }), setContent: t => { p.tresc = t; } }; pliki.push(p); return p; },
    };
    foldery.push(f);
    return f;
  };
  let blokady = 0;
  const g = {
    foldery,
    DriveApp: { getFoldersByName: n => iterator(foldery.filter(f => f.nazwa === n)), createFolder: nowyFolder },
    LockService: { getScriptLock: () => ({ waitLock: () => { blokady++; }, releaseLock: () => { blokady--; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ tekst: t, setMimeType() { return this; } }) },
    blokady: () => blokady,
    // Udawany internet dla akcji „opis”: adres → { kod, tekst }.
    strony: {},
    UrlFetchApp: { fetch: url => { const st = g.strony[url]; if (!st) throw new Error('brak sieci'); return { getResponseCode: () => st.kod || 200, getContentText: () => st.tekst }; } },
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
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'https://nie-ma.example' }), { tytul: '' });
g.strony['https://example.com/404'] = { kod: 404, tekst: '' };
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'https://example.com/404' }), { tytul: '' });
assert.deepStrictEqual(zapytaj(g, { klucz: 'tajny', akcja: 'opis', url: 'file:///C:/x' }), { blad: 'zły adres' });
assert.deepStrictEqual(zapytaj(g, { klucz: 'zly', akcja: 'opis', url: yt }), { blad: 'zły klucz' });
assert.strictEqual(JSON.parse(g.doGet().tekst).wersja, 2);
console.log('Skrypt Google: OK (klucz, tworzenie pliku, zapis/odczyt, polskie znaki, blokada, tytuły linków)');
