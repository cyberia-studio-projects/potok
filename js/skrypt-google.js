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
   do uruchomienia w edytorze (daje skryptowi zgodę na łączenie ze stronami).
   Wersja 4: streszczenia. Co godzinę (harmonogram Google) bierze wpisy
   „Streścić” i „Streścić szczegółowo”, pobiera tekst strony albo film z YouTube,
   prosi silnik AI o streszczenie i zapisuje je w folderze „Potok/Streszczenia”
   (jeden plik na wpis). Pliku Potok.json NIE zmienia – tylko go czyta.
   Ustawienia (Ustawienia projektu → Właściwości skryptu), opis niżej
   przy USTAWIENIA_DOMYSLNE. Klucz Gemini NIE jest w kodzie. */

const KLUCZ = 'WSTAW_KLUCZ';   // aplikacja wstawia tu Twój tajny klucz
const WERSJA_SKRYPTU = 4;

/** Zapytanie z aplikacji: { klucz, akcja: 'pobierz' | 'zapisz' | 'opis' | 'wersja' | 'streszczenia', tresc?, url?, od? } */
function doPost(e) {
  let dane;
  try { dane = JSON.parse(e.postData.contents); } catch (x) { return wynik({ blad: 'złe dane' }); }
  if (dane.klucz !== KLUCZ) return wynik({ blad: 'zły klucz' });
  if (dane.akcja === 'wersja') return wynik({ wersja: WERSJA_SKRYPTU });
  if (dane.akcja === 'opis') return wynik(opisStrony(dane.url));
  if (dane.akcja === 'streszczenia') return wynik(odczytajStreszczenia(dane.od));

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
  // Jeśli kiedyś odmówiono zgody, Google zapyta o nią jeszcze raz
  // (w dzienniku pojawi się link „Kliknij tutaj, aby przyznać uprawnienia”).
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const o = opisStrony('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  Logger.log(JSON.stringify(o));
  return o;
}

/* ====================== STRESZCZENIA (wersja 4) ======================

   Właściwości skryptu (Ustawienia projektu ⚙ → Właściwości skryptu):
     GEMINI_KLUCZ       klucz z aistudio.google.com → Get API key (wymagany dla Gemini)
     SILNIK             gemini (domyślnie) | ollama | wylaczony
     MODEL_KROTKI       model do krótkich streszczeń
     MODEL_SZCZEGOLOWY  model do szczegółowych streszczeń
     OLLAMA_ADRES       np. https://moj-tunel.example (tylko dla SILNIK=ollama)
     OLLAMA_MODEL       np. SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0
     NA_RAZ             ile wpisów streszczać w jednym uruchomieniu (co godzinę)
   Brak właściwości = wartość domyślna poniżej. Zmiana silnika lub modelu
   nie wymaga zmiany kodu. */
const USTAWIENIA_DOMYSLNE = {
  SILNIK: 'gemini',
  // Flash-Lite: w darmowym limicie ok. 15 zapytań/min i 500 dziennie (stan z 11.2026).
  // Lepszy „Flash” daje za darmo tylko ok. 20 zapytań dziennie.
  MODEL_KROTKI: 'gemini-3.5-flash-lite',
  MODEL_SZCZEGOLOWY: 'gemini-3.5-flash-lite',
  OLLAMA_ADRES: '',
  OLLAMA_MODEL: 'SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0',
  NA_RAZ: '6',
};
const MAKS_PROB = 3;            // po tylu nieudanych próbach: „do ręcznego streszczenia”
const MAKS_ZNAKOW = 200000;     // ok. 50 tys. słów – więcej tekstu nie wysyłamy
const MIN_ZNAKOW = 600;         // mniej tekstu = raczej logowanie albo paywall

const POLECENIE = {
  krotkie: 'Streść poniższy materiał po polsku (nawet jeśli jest w innym języku) w 3–5 zdaniach: ' +
    'o czym to jest, jaka jest główna teza, dla kogo to jest i co wnosi nowego. ' +
    'Bez wstępów typu „Oto streszczenie”. Jeśli materiał jest pusty, jest stroną logowania ' +
    'albo nie da się go streścić, odpowiedz dokładnie: BRAK TREŚCI',
  szczegolowe: 'Przygotuj szczegółowe streszczenie poniższego materiału po polsku (nawet jeśli jest ' +
    'w innym języku), w Markdown: 1) w jednym akapicie: o czym to jest i główna teza; ' +
    '2) struktura materiału (części / rozdziały); 3) kluczowe tezy i argumenty, każda z ' +
    'przykładem lub dowodem z materiału; 4) co jest nowe lub zaskakujące; 5) słabe punkty ' +
    'lub wątpliwości. Pisz konkretnie, bez lania wody. Jeśli materiału nie da się streścić, ' +
    'odpowiedz dokładnie: BRAK TREŚCI',
};

function ustawienie(nazwa) {
  const v = PropertiesService.getScriptProperties().getProperty(nazwa);
  return v !== null && v !== '' ? String(v).trim() : USTAWIENIA_DOMYSLNE[nazwa];
}

/** Folder „Potok/Streszczenia” – tworzony przy pierwszym użyciu. */
function folderStreszczen() {
  const foldery = DriveApp.getFoldersByName('Potok');
  const potok = foldery.hasNext() ? foldery.next() : DriveApp.createFolder('Potok');
  const pod = potok.getFoldersByName('Streszczenia');
  return pod.hasNext() ? pod.next() : potok.createFolder('Streszczenia');
}

function nazwaPliku(id) { return String(id).replace(/[^\\w.-]/g, '_') + '.json'; }

function wczytajStreszczenie(folder, id) {
  const pliki = folder.getFilesByName(nazwaPliku(id));
  if (!pliki.hasNext()) return null;
  try { return JSON.parse(pliki.next().getBlob().getDataAsString('UTF-8')); } catch (x) { return null; }
}

function zapiszStreszczenie(folder, s) {
  s.zmieniono = new Date().toISOString();
  const tresc = JSON.stringify(s, null, 1);
  const pliki = folder.getFilesByName(nazwaPliku(s.id));
  if (pliki.hasNext()) pliki.next().setContent(tresc);
  else folder.createFile(nazwaPliku(s.id), tresc, 'application/json');
}

/** Dla aplikacji: wszystkie streszczenia zmienione po dacie „od” (ISO) albo wszystkie. */
function odczytajStreszczenia(od) {
  const folder = folderStreszczen();
  const pliki = folder.getFiles();
  const lista = [];
  while (pliki.hasNext()) {
    const p = pliki.next();
    if (od && p.getLastUpdated && p.getLastUpdated().toISOString() <= od) continue;
    try { lista.push(JSON.parse(p.getBlob().getDataAsString('UTF-8'))); } catch (x) { /* uszkodzony plik – pomijamy */ }
  }
  return { streszczenia: lista, teraz: new Date().toISOString() };
}

/** Które wpisy czekają na streszczenie (i jakie). Najstarsze decyzje pierwsze. */
function doStreszczenia(wpisy, folder) {
  const kolejka = [];
  for (const w of wpisy) {
    const rodzaj = w.status === 'do_streszczenia' ? 'krotkie' : w.status === 'szczegolowo' ? 'szczegolowe' : null;
    if (!rodzaj || !w.url || !/^https?:\\/\\//i.test(w.url)) continue;
    const s = wczytajStreszczenie(folder, w.id) || { id: w.id };
    if (s[rodzaj] && s[rodzaj].tekst) continue;
    if ((s.proby && s.proby[rodzaj] || 0) >= MAKS_PROB) continue;
    if (s.doRecznego && s.doRecznego[rodzaj]) continue;
    kolejka.push({ w, s, rodzaj });
  }
  return kolejka;
}

/** YouTube → adres samego filmu (bez list i miksów); inne → null. */
function filmYouTube(url) {
  const m = String(url).match(/^https?:\\/\\/(?:www\\.|m\\.|music\\.)?(?:youtube\\.com\\/(?:watch\\?(?:.*&)?v=|shorts\\/|live\\/|embed\\/)|youtu\\.be\\/)([\\w-]{6,})/i);
  return m ? 'https://www.youtube.com/watch?v=' + m[1] : null;
}

/** Strony, z których bez logowania nic nie pobierzemy – od razu „do ręcznego”. */
function wymagaLogowania(url) {
  return /^https?:\\/\\/([^\\/]+\\.)?(facebook\\.com|fb\\.watch|instagram\\.com|linkedin\\.com|x\\.com|twitter\\.com|tiktok\\.com)\\//i.test(url);
}

/** HTML → sam tekst (bez skryptów, stylów, menu). */
function tekstZHtml(html) {
  const tytul = encje((html.match(/<title[^>]*>([^<]*)</i) || [])[1] || '').trim();
  let t = html.replace(/<!--[\\s\\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)\\b[\\s\\S]*?<\\/\\1>/gi, ' ');
  const glowna = t.match(/<(article|main)\\b[\\s\\S]*<\\/\\1>/i);
  if (glowna && glowna[0].length > 2000) t = glowna[0];
  t = t.replace(/<\\/(p|div|h[1-6]|li|br|tr|section|article)>/gi, '\\n').replace(/<br\\s*\\/?>/gi, '\\n')
    .replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/g, ' ').split('\\n').map(l => encje(l).trim()).filter(Boolean).join('\\n');
  return { tytul, tekst: t.slice(0, MAKS_ZNAKOW) };
}

/** Błąd ustawień (np. brak klucza) – to nie wina wpisu, więc nie liczy się jako próba. */
function bladUstawien(tresc) { const e = new Error(tresc); e.limit = true; return e; }

/** Wywołanie silnika. material: { tekst } albo { film: adres YouTube }. Zwraca { tekst, model }. */
function zapytajSilnik(rodzaj, material) {
  const silnik = ustawienie('SILNIK').toLowerCase();
  const polecenie = POLECENIE[rodzaj];
  if (silnik === 'gemini') {
    const klucz = ustawienie('GEMINI_KLUCZ');
    if (!klucz) throw bladUstawien('brak GEMINI_KLUCZ we Właściwościach skryptu');
    const model = ustawienie(rodzaj === 'krotkie' ? 'MODEL_KROTKI' : 'MODEL_SZCZEGOLOWY');
    const czesci = material.film
      // Film: Gemini sam „ogląda” publiczny film z YouTube. Rzadkie klatki
      // (co 10 s) i niska rozdzielczość – mniej tokenów, mieści się w limicie.
      ? [{ fileData: { fileUri: material.film }, videoMetadata: { fps: 0.1 } }, { text: polecenie }]
      : [{ text: polecenie + '\\n\\n---\\n' + material.tekst }];
    const odp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': klucz },
      payload: JSON.stringify({ contents: [{ parts: czesci }], generationConfig: { mediaResolution: 'MEDIA_RESOLUTION_LOW' } }),
    });
    const kod = odp.getResponseCode();
    let o = {};
    try { o = JSON.parse(odp.getContentText()); } catch (x) { /* nie JSON */ }
    if (kod !== 200) {
      const e = new Error('Gemini: kod ' + kod + (o.error && o.error.message ? ' – ' + o.error.message.slice(0, 200) : ''));
      e.limit = kod === 429;
      throw e;
    }
    const c = (o.candidates || [])[0];
    const tekst = c && c.content && (c.content.parts || []).map(p => p.text || '').join('').trim();
    if (!tekst) throw new Error('Gemini: pusta odpowiedź' + (c && c.finishReason ? ' (' + c.finishReason + ')' : ''));
    return { tekst, model };
  }
  if (silnik === 'ollama') {
    // Ollama na Twoim komputerze – skrypt Google musi mieć do niej adres z internetu
    // (np. tunel). Filmów Ollama nie ogląda – te zostają do ręcznego streszczenia.
    if (material.film) { const e = new Error('Ollama nie streszcza filmów'); e.doRecznego = true; throw e; }
    const adres = ustawienie('OLLAMA_ADRES').replace(/\\/+$/, '');
    if (!adres) throw bladUstawien('brak OLLAMA_ADRES we Właściwościach skryptu');
    const model = ustawienie('OLLAMA_MODEL');
    const odp = UrlFetchApp.fetch(adres + '/api/generate', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ model, prompt: polecenie + '\\n\\n---\\n' + material.tekst, stream: false }),
    });
    if (odp.getResponseCode() !== 200) throw new Error('Ollama: kod ' + odp.getResponseCode());
    const tekst = String(JSON.parse(odp.getContentText()).response || '').trim();
    if (!tekst) throw new Error('Ollama: pusta odpowiedź');
    return { tekst, model };
  }
  const e = new Error('streszczenia wyłączone (SILNIK=' + silnik + ')');
  e.wylaczone = true;
  throw e;
}

/** Jedno streszczenie: pobiera materiał, pyta silnik, zapisuje wynik albo problem. */
function streszczJeden(folder, zadanie) {
  const { w, s, rodzaj } = zadanie;
  s.url = w.url;
  s.tytul = w.tytul || '';
  const doRecznego = powod => {
    s.doRecznego = s.doRecznego || {};
    s.doRecznego[rodzaj] = powod;
    s.problem = powod;
    zapiszStreszczenie(folder, s);
    return 'ręcznie';
  };
  try {
    if (wymagaLogowania(w.url)) return doRecznego('strona wymaga logowania – streść ręcznie');
    const film = filmYouTube(w.url);
    let material;
    if (film) material = { film };
    else {
      const odp = UrlFetchApp.fetch(w.url, { muteHttpExceptions: true, followRedirects: true, headers: { 'Accept-Language': 'pl,en' } });
      const kod = odp.getResponseCode();
      if (kod === 401 || kod === 403) return doRecznego('strona nie wpuszcza (kod ' + kod + ') – streść ręcznie');
      if (kod !== 200) throw new Error('strona: kod ' + kod);
      const typ = String((odp.getHeaders() || {})['Content-Type'] || (odp.getHeaders() || {})['content-type'] || '');
      if (/pdf|octet-stream/i.test(typ)) return doRecznego('to plik (' + typ.split(';')[0] + '), nie strona – streść ręcznie');
      const { tytul, tekst } = tekstZHtml(odp.getContentText());
      if (tekst.length < MIN_ZNAKOW) return doRecznego('za mało tekstu na stronie (logowanie / paywall?) – streść ręcznie');
      material = { tekst: (tytul ? 'Tytuł: ' + tytul + '\\n\\n' : '') + tekst };
    }
    const odp = zapytajSilnik(rodzaj, material);
    if (/^BRAK TREŚCI\\.?$/i.test(odp.tekst)) return doRecznego('AI nie znalazło treści – streść ręcznie');
    s[rodzaj] = { tekst: odp.tekst, model: odp.model, data: new Date().toISOString() };
    delete s.problem;
    zapiszStreszczenie(folder, s);
    return 'ok';
  } catch (x) {
    if (x.wylaczone) throw x;
    if (x.doRecznego) return doRecznego(x.message + ' – streść ręcznie');
    s.problem = String(x && x.message || x);
    // Przekroczony limit albo brak klucza to nie wina wpisu – nie liczymy próby,
    // przerywamy i spróbujemy za godzinę.
    if (!x.limit) { s.proby = s.proby || {}; s.proby[rodzaj] = (s.proby[rodzaj] || 0) + 1; }
    zapiszStreszczenie(folder, s);
    if (x.limit) throw x;
    return 'błąd';
  }
}

/** Uruchamiana co godzinę przez harmonogram (i ręcznie, do sprawdzenia). */
function streszczajCoGodzine() {
  // Dwa uruchomienia naraz nie zrobią dwa razy tego samego.
  const pamiec = CacheService.getScriptCache();
  if (pamiec.get('streszczanie')) { Logger.log('Poprzednie streszczanie jeszcze trwa.'); return { pominieto: true }; }
  pamiec.put('streszczanie', '1', 360);
  const start = Date.now();
  const licznik = { ok: 0, 'ręcznie': 0, 'błąd': 0, czeka: 0 };
  try {
    const tresc = plikPotoku().getBlob().getDataAsString('UTF-8');
    const wpisy = tresc && tresc.trim() ? JSON.parse(tresc).wpisy || [] : [];
    const folder = folderStreszczen();
    const kolejka = doStreszczenia(wpisy, folder);
    const naRaz = Math.max(1, parseInt(ustawienie('NA_RAZ'), 10) || 6);
    for (let i = 0; i < kolejka.length; i++) {
      // Limit wpisów i czasu (Google przerywa skrypt po 6 minutach).
      if (i >= naRaz || Date.now() - start > 4 * 60 * 1000) { licznik.czeka = kolejka.length - i; break; }
      if (i > 0) Utilities.sleep(5000);   // nie więcej niż ok. 12 zapytań na minutę
      try { licznik[streszczJeden(folder, kolejka[i])]++; }
      catch (x) {
        Logger.log('Przerwa: ' + x.message);
        licznik.czeka = kolejka.length - i;
        break;
      }
    }
  } finally {
    pamiec.remove('streszczanie');
  }
  Logger.log('Streszczenia: ' + JSON.stringify(licznik));
  return licznik;
}

/** Uruchom raz w edytorze po wklejeniu wersji 4 (wybierz „wlaczStreszczenia” → Uruchom):
    sprawdza klucz Gemini, robi próbne streszczenie i ustawia harmonogram co godzinę. */
function wlaczStreszczenia() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const silnik = ustawienie('SILNIK');
  Logger.log('Silnik: ' + silnik + ', modele: ' + ustawienie('MODEL_KROTKI') + ' / ' + ustawienie('MODEL_SZCZEGOLOWY'));
  const proba = zapytajSilnik('krotkie', { tekst: 'Potok to aplikacja do zbierania linków. Użytkownik zapisuje linki jednym ruchem, ' +
    'a później w przeglądzie decyduje, co z nimi zrobić: streścić, przeczytać w całości albo odłożyć do archiwum. ' +
    'Nic nie jest usuwane. Streszczenia robi automat co godzinę, bez udziału użytkownika.' });
  Logger.log('Próbne streszczenie (' + proba.model + '): ' + proba.tekst);
  const juz = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'streszczajCoGodzine');
  if (!juz) ScriptApp.newTrigger('streszczajCoGodzine').timeBased().everyHours(1).create();
  Logger.log(juz ? 'Harmonogram już był ustawiony.' : 'Ustawiono harmonogram: co godzinę.');
  return { proba: proba.tekst, harmonogram: true };
}

/** Pomocnicze: w dzienniku lista modeli Gemini dostępnych dla Twojego klucza. */
function pokazModele() {
  const odp = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': ustawienie('GEMINI_KLUCZ') || '' }, muteHttpExceptions: true });
  const modele = (JSON.parse(odp.getContentText()).models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
  Logger.log(modele.join('\\n') || odp.getContentText());
  return modele;
}

/** Wyłączenie harmonogramu (streszczenia zostają na Drive). */
function wylaczStreszczenia() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'streszczajCoGodzine').forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Harmonogram wyłączony. Streszczenia zostają w Potok/Streszczenia.');
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
