/* e2e.js – test „jak człowiek”: otwiera aplikację w udawanym telefonie,
   importuje dokument, przegląda wpisy, eksportuje pliki.
   Domyślnie używa testy/przyklad.docx (zmyślona treść, układ jak w prawdziwym
   Potoku). Można podać własny plik, np. prawdziwy eksport z Google Docs.
   Uruchamiany automatycznie (Node + Playwright) przez Claude albo później
   na GitHubie. Na komputerze w pracy wystarczy testy.html.
   Użycie: node testy/e2e.js [ścieżka/do/pliku.docx] [katalog-na-zrzuty] */
const { chromium, devices } = require('playwright');
const path = require('path');
const assert = require('assert');

const KATALOG = path.resolve(__dirname, '..');
const DOCX = process.argv[2] || path.join(__dirname, 'przyklad.docx');
const ZRZUTY = process.argv[3];

(async () => {
  const przegladarka = await chromium.launch();
  const kontekst = await przegladarka.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
  const s = await kontekst.newPage();
  const bledy = [];
  s.on('pageerror', e => bledy.push(e.message));
  await s.goto('file://' + path.join(KATALOG, 'index.html'));

  // 1. Pusta aplikacja startuje w imporcie.
  assert(await s.isVisible('#widok-eksport'), 'start: powinien być widok importu');

  // 2. Import prawdziwego dokumentu.
  await s.setInputFiles('#plik-import', DOCX);
  await s.waitForFunction(() => /Zaimportowano/.test(document.querySelector('#wynik-importu').textContent));
  const wynik = await s.textContent('#wynik-importu');
  console.log(wynik);
  if (ZRZUTY) await s.screenshot({ path: path.join(ZRZUTY, '1-import.png') });

  // 3. Ponowny import – nic nowego.
  await s.setInputFiles('#plik-import', DOCX);
  await s.waitForFunction(() => /Zaimportowano 0/.test(document.querySelector('#wynik-importu').textContent));

  // 4. Przegląd: data zawsze widoczna, 4 decyzje.
  await s.click('nav [data-widok=przeglad]');
  assert(/Dodano:/.test(await s.textContent('.karta .data')), 'brak daty dodania');
  assert.strictEqual(await s.locator('.decyzje button').count(), 7);
  // Pierwszy wpis dokumentu to „XXDDDD …” – podpowiedź Śmieszne.
  assert.strictEqual(await s.getAttribute('.decyzje .sugerowany', 'data-status'), 'smieszne');
  if (ZRZUTY) await s.screenshot({ path: path.join(ZRZUTY, '2-przeglad.png') });
  const przed = await s.textContent('#licznik');
  await s.click('.decyzje [data-status=do_streszczenia]');
  const po = await s.textContent('#licznik');
  assert.notStrictEqual(przed, po, 'licznik się nie zmienił');

  // 4b. Przełącznik 🏠 – zostaje na tym samym wpisie, zmienia stan.
  const tytulPrzed = await s.textContent('.karta h2');
  await s.click('[data-prywatne]');
  assert.strictEqual(await s.textContent('.karta h2'), tytulPrzed, 'przełącznik przeskoczył do innego wpisu');
  assert(/TAK/.test(await s.textContent('[data-prywatne]')), 'przełącznik się nie włączył');
  // Na komputerze służbowym link do tego wpisu się nie otwiera.
  await s.click('nav [data-widok=eksport]');
  await s.click('[data-urzadzenie=sluzbowe]');
  await s.click('nav [data-widok=przeglad]');
  assert.strictEqual(await s.locator('.karta a.link').count(), 0, 'link widoczny na służbowym');
  assert(/Otwórz w domu/.test(await s.textContent('.karta')));
  if (ZRZUTY) await s.screenshot({ path: path.join(ZRZUTY, '2c-sluzbowy.png') });
  await s.click('[data-prywatne]');                       // wyłącz domek
  assert.strictEqual(await s.locator('.karta a.link').count(), 1, 'link nie wrócił po wyłączeniu domku');
  await s.click('nav [data-widok=eksport]');
  await s.click('[data-urzadzenie=prywatne]');
  await s.click('nav [data-widok=przeglad]');

  // 5. Cofnij przywraca wpis do skrzynki.
  await s.click('#cofnij');
  assert.strictEqual(await s.textContent('#licznik'), przed, 'cofnij nie zadziałał');

  // 6. Pomiń nic nie zmienia w liczbie.
  await s.click('[data-pomin]');
  assert.strictEqual(await s.textContent('#licznik'), przed);

  // 7. Kilka decyzji, potem eksport kolejki streszczeń.
  for (let i = 0; i < 2; i++) await s.click('.decyzje [data-status=do_streszczenia]');
  await s.click('.decyzje [data-status=obsidian]');
  if (ZRZUTY) await s.screenshot({ path: path.join(ZRZUTY, '2b-przeglad.png') });
  await s.click('nav [data-widok=eksport]');
  const [plik] = await Promise.all([s.waitForEvent('download'), s.click('#eksport-streszczen')]);
  console.log('Eksport streszczeń:', plik.suggestedFilename());
  const [obs] = await Promise.all([s.waitForEvent('download'), s.click('#eksport-obsidian')]);
  console.log('Eksport Obsidian:', obs.suggestedFilename());
  const [md] = await Promise.all([s.waitForEvent('download'), s.click('#eksport-md')]);
  console.log('Eksport .md:', md.suggestedFilename());

  // 8. Listy i ręczne dodanie.
  await s.click('nav [data-widok=dodaj]');
  await s.fill('#nowy-url', 'https://example.com/test');
  await s.fill('#nowy-opis', 'Streścić test ręczny');
  await s.click('#form-dodaj button');
  await s.click('nav [data-widok=listy]');
  if (ZRZUTY) await s.screenshot({ path: path.join(ZRZUTY, '3-listy.png') });

  // 8b. Lista „Streścić”: popchnięcie wpisu dalej do „Zgłębić”.
  await s.click('#statusy [data-lista=do_streszczenia]');
  const naLiscie = await s.locator('#lista li').count();
  await s.click('#lista li:first-child [data-na=zglebic]');
  assert.strictEqual(await s.locator('#lista li').count(), naLiscie - 1, 'wpis nie zniknął z listy Streścić');
  await s.click('#statusy [data-lista=zglebic]');
  assert(/Streścić → Zgłębić/.test(await s.textContent('#lista')), 'brak śladu skąd przyszedł wpis');
  if (ZRZUTY) await s.screenshot({ path: path.join(ZRZUTY, '4-zglebic.png') });

  // 8c. Podsumowanie liczb na Listach.
  const razem = await s.evaluate(() => Magazyn.wczytaj().length);
  assert(new RegExp('Razem: ' + razem + '$').test(await s.textContent('#podsumowanie-listy')), 'złe podsumowanie: ' + await s.textContent('#podsumowanie-listy'));

  // 8d. Zadanie bez linku: w skrzynce, w przeglądzie przyciski zadaniowe.
  await s.click('nav [data-widok=przeglad]');
  for (let i = 0; i < 20 && await s.locator('.karta a.link, .karta .zablokowany').count(); i++)
    await s.click('[data-pomin]');
  assert(/bez linku/.test(await s.textContent('.karta')), 'nie dotarłem do wpisu bez linku');
  assert.strictEqual(await s.locator('.decyzje button').count(), 3, 'zadanie powinno mieć 3 przyciski');
  if (ZRZUTY) await s.screenshot({ path: path.join(ZRZUTY, '5-zadanie-w-przegladzie.png') });
  // „Więcej wyborów →” rozwija pełny zestaw (9), „← Mniej wyborów” wraca do 3.
  await s.click('[data-przelacz]');
  assert.strictEqual(await s.locator('.decyzje button').count(), 9, 'brak pełnego wyboru');
  if (ZRZUTY) await s.screenshot({ path: path.join(ZRZUTY, '5b-wiecej-wyborow.png') });
  await s.click('[data-przelacz]');
  assert.strictEqual(await s.locator('.decyzje button').count(), 3);
  await s.click('.decyzje [data-status=zrobic_claude]');
  await s.click('nav [data-widok=zadania]');
  assert.strictEqual(await s.locator('#zadania-lista li:not(.pusto)').count(), 1, 'zadanie nie trafiło do „Dla Claude\'a”');
  await s.click('#zadania-lista li:first-child [data-na=zrobione]');
  assert.strictEqual(await s.locator('#zadania-lista li:not(.pusto)').count(), 0, '„Zrobione” nie przeniosło zadania');

  // 8e. „To zadanie →” na linku zmienia przyciski, „← To jednak treść” je przywraca.
  await s.click('nav [data-widok=przeglad]');
  for (let i = 0; i < 60 && !(await s.locator('.karta a.link').count()); i++) await s.click('[data-pomin]');
  await s.click('[data-przelacz]');                       // To zadanie →
  assert.strictEqual(await s.locator('.decyzje button').count(), 3);
  await s.click('[data-przelacz]');                       // ← To jednak treść
  assert.strictEqual(await s.locator('.decyzje button').count(), 7);

  // 9. Udostępnij → Potok (jak z Androida).
  await s.goto('file://' + path.join(KATALOG, 'index.html') + '?udostepnij=1&title=Film&text=' + encodeURIComponent('https://youtu.be/abc'));
  const ile = await s.evaluate(() => Magazyn.wczytaj().filter(w => w.zrodlo === 'udostępnij').length);
  assert.strictEqual(ile, 1, 'udostępnianie nie dodało wpisu');
  // Tak naprawdę buduje adres Chrome na Androidzie: bez „udostepnij=1”
  // (parametry z manifestu zastępują te z adresu), link z YouTube w „text”.
  await s.goto('file://' + path.join(KATALOG, 'index.html') + '?title=' + encodeURIComponent('Muzyczka') + '&text=' + encodeURIComponent('https://youtu.be/xyz123?si=AbC'));
  const ile2 = await s.evaluate(() => Magazyn.wczytaj().filter(w => w.zrodlo === 'udostępnij').length);
  assert.strictEqual(ile2, 2, 'udostępnianie z Androida (bez udostepnij=1) nie dodało wpisu');
  assert.match(await s.locator('#wersja').textContent(), /Wersja aplikacji: \d+ · Ostatnie udostępnienie: .*youtu\.be\/xyz123/);

  assert.deepStrictEqual(bledy, [], 'błędy JavaScript na stronie');
  console.log('E2E OK');
  await przegladarka.close();
})().catch(e => { console.error('E2E BŁĄD:', e.message); process.exit(1); });
