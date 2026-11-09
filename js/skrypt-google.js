/* skrypt-google.js – treść skryptu Google, który wklejasz na script.google.com.
   Aplikacja pokazuje go w „Pliki → Google Drive” z Twoim tajnym kluczem
   w miejscu WSTAW_KLUCZ. Ten sam tekst jest w skrypt-google/Kod.gs
   (test pilnuje, żeby się nie rozjechały). */
const SKRYPT_GOOGLE = `/* Potok – pośrednik między aplikacją a Twoim Google Drive.
   Wklej na script.google.com (instrukcja w aplikacji: Pliki → Google Drive).

   Co robi: trzyma wszystkie wpisy w pliku „Potok.json” w folderze „Potok”
   na Twoim Drive. Odpowiada tylko na zapytania z właściwym kluczem.
   Nie rusza żadnych innych plików. Kod jest krótki – możesz go przeczytać.
   Od wersji 2 umie też odczytać tytuł i autora linku (np. filmu z YouTube).
   Wersja 3: mówi, co poszło nie tak przy tytule, i ma funkcję sprawdzTytuly
   do uruchomienia w edytorze (daje skryptowi zgodę na łączenie ze stronami). */

const KLUCZ = 'WSTAW_KLUCZ';   // aplikacja wstawia tu Twój tajny klucz
const WERSJA_SKRYPTU = 3;

/** Zapytanie z aplikacji: { klucz, akcja: 'pobierz' | 'zapisz' | 'opis' | 'wersja', tresc?, url? } */
function doPost(e) {
  let dane;
  try { dane = JSON.parse(e.postData.contents); } catch (x) { return wynik({ blad: 'złe dane' }); }
  if (dane.klucz !== KLUCZ) return wynik({ blad: 'zły klucz' });
  if (dane.akcja === 'wersja') return wynik({ wersja: WERSJA_SKRYPTU });
  if (dane.akcja === 'opis') return wynik(opisStrony(dane.url));

  // Blokada: dwa urządzenia naraz nie nadpiszą sobie pliku w połowie zapisu.
  const blokada = LockService.getScriptLock();
  blokada.waitLock(20000);
  try {
    const plik = plikPotoku();
    if (dane.akcja === 'pobierz') return wynik({ tresc: plik.getBlob().getDataAsString('UTF-8') });
    if (dane.akcja === 'zapisz') { plik.setContent(dane.tresc); return wynik({ ok: true }); }
    return wynik({ blad: 'nieznana akcja' });
  } finally {
    blokada.releaseLock();
  }
}

/** Otwarcie adresu w przeglądarce – tylko sprawdzenie, że skrypt działa. */
function doGet() {
  return wynik({ potok: 'skrypt działa', wersja: WERSJA_SKRYPTU });
}

/** Tytuł i autor linku – żeby w Potoku nie było gołych adresów.
    YouTube: oficjalne „oEmbed”. Inne strony: znaczniki og:title itp. z HTML.
    Facebook często wymaga logowania – wtedy tytułu po prostu nie będzie. */
function opisStrony(url) {
  const host = ((String(url || '').match(/^https?:\\/\\/([^\\/?#]+)/i) || [])[1] || '').toLowerCase();
  if (!host) return { blad: 'zły adres' };
  try {
    if (/(^|\\.)(youtube\\.com|youtu\\.be)$/.test(host)) {
      const odp = UrlFetchApp.fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { muteHttpExceptions: true });
      if (odp.getResponseCode() !== 200) return { tytul: '', problem: 'YouTube: kod ' + odp.getResponseCode() };
      const o = JSON.parse(odp.getContentText());
      return { tytul: o.title || '', autor: o.author_name || '' };
    }
    const odp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'Accept-Language': 'pl,en' } });
    if (odp.getResponseCode() !== 200) return { tytul: '', problem: 'strona: kod ' + odp.getResponseCode() };
    const html = odp.getContentText().slice(0, 300000);
    const meta = nazwa => {
      const znacznik = (html.match(new RegExp('<meta[^>]+(?:property|name)=["\\']' + nazwa + '["\\'][^>]*>', 'i')) || [])[0] || '';
      const m = znacznik.match(/content=(?:"([^"]*)"|'([^']*)')/i) || [];
      return encje(m[1] || m[2] || '');
    };
    let tytul = meta('og:title') || meta('twitter:title') || encje((html.match(/<title[^>]*>([^<]*)</i) || [])[1] || '');
    if (/^(facebook|instagram|log in|zaloguj się|log into facebook)/i.test(tytul)) tytul = '';
    return { tytul: tytul.trim(), autor: (meta('author') || meta('og:site_name')).trim() };
  } catch (x) {
    return { tytul: '', problem: String(x && x.message || x) };
  }
}

/** Uruchom raz w edytorze (wybierz u góry „sprawdzTytuly” → Uruchom):
    Google zapyta o zgodę na łączenie ze stronami, a w dzienniku
    pojawi się tytuł przykładowego filmu – znak, że wszystko działa. */
function sprawdzTytuly() {
  const o = opisStrony('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  Logger.log(JSON.stringify(o));
  return o;
}

/** &amp; &quot; &#39; &#x105; itp. → zwykłe znaki. */
function encje(t) {
  return t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\\s+/g, ' ');
}

/** Folder „Potok” i plik „Potok.json” – tworzone przy pierwszym użyciu. */
function plikPotoku() {
  const foldery = DriveApp.getFoldersByName('Potok');
  const folder = foldery.hasNext() ? foldery.next() : DriveApp.createFolder('Potok');
  const pliki = folder.getFilesByName('Potok.json');
  return pliki.hasNext() ? pliki.next() : folder.createFile('Potok.json', '{"wersja":1,"wpisy":[]}', 'application/json');
}

function wynik(obiekt) {
  return ContentService.createTextOutput(JSON.stringify(obiekt)).setMimeType(ContentService.MimeType.JSON);
}
`;
