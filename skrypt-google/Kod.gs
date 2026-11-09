/* Potok – pośrednik między aplikacją a Twoim Google Drive.
   Wklej na script.google.com (instrukcja w aplikacji: Pliki → Google Drive).

   Co robi: trzyma wszystkie wpisy w pliku „Potok.json” w folderze „Potok”
   na Twoim Drive. Odpowiada tylko na zapytania z właściwym kluczem.
   Nie rusza żadnych innych plików. Kod jest krótki – możesz go przeczytać. */

const KLUCZ = 'WSTAW_KLUCZ';   // aplikacja wstawia tu Twój tajny klucz

/** Zapytanie z aplikacji: { klucz, akcja: 'pobierz' | 'zapisz', tresc? } */
function doPost(e) {
  let dane;
  try { dane = JSON.parse(e.postData.contents); } catch (x) { return wynik({ blad: 'złe dane' }); }
  if (dane.klucz !== KLUCZ) return wynik({ blad: 'zły klucz' });

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
  return wynik({ potok: 'skrypt działa' });
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
