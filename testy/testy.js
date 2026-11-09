/* testy.js – testy logiki Potoku. Każdy test sprawdza jedną rzecz.
   Gdy coś zmieniamy w kodzie, te testy pilnują, żeby nic się nie zepsuło. */

// Osobny klucz w pamięci – testy nie dotykają prawdziwych danych.
Magazyn.klucz = 'potok.TESTY';
function czysto() { localStorage.removeItem(Magazyn.klucz); }

// Zamienia base64 na plik, jakby użytkownik go wybrał.
function plikZBase64(b64, nazwa) {
  const bajty = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new File([bajty], nazwa);
}

/* ---------------- Import: rozpoznawanie oznaczeń ---------------- */

test('sugestia: różne zapisy „Streścić” → do streszczenia', () => {
  for (const t of ['Streścić https://x', '(Streścić) x', '[Streścić] x', '(streścić) x', 'Strescic x'])
    rowne(Import.sugerujStatus(t), 'do_streszczenia', t);
});
test('sugestia: obczaić / poeksplorować → obczaić', () => {
  for (const t of ['Obczaić https://x', '-obczaić x', '-Obczaic to', 'Poeksplorować x'])
    rowne(Import.sugerujStatus(t), 'obczaic', t);
});
test('sugestia: przeczytać / zgłębić / obejrzeć → zgłębić', () => {
  for (const t of ['Przeczytać całe https://x', 'Zgłębić x', 'obejrzeć całe x'])
    rowne(Import.sugerujStatus(t), 'zglebic', t);
});
test('sugestia: XD / XDDDD na początku → Śmieszne', () => {
  for (const t of ['XDDDD https://www.facebook.com/reel/1', 'XXDDDD https://youtube.com/x', 'xd https://a.pl'])
    rowne(Import.sugerujStatus(t), 'smieszne', t);
  rowne(Import.sugerujStatus('Xbox https://a.pl'), null);
});
test('sugestia: (Obsidian) / zapisać do Obsidiana → Zapisać do Obsidian', () => {
  for (const t of ['(Obsidian) Zapisać w notatkach X', '[Obsidian] coś', 'Zapisać to do Obsidiana https://a.pl'])
    rowne(Import.sugerujStatus(t), 'obsidian', t);
});
test('sugestia: muzyczki / muzyka / piosenka → Muzyczki do zachowania', () => {
  for (const t of ['Muzyczki https://youtube.com/x', 'fajna piosenka https://a.pl', 'XD muzyka do biegania https://a.pl'])
    rowne(Import.sugerujStatus(t), 'muzyka', t);
});
test('sugestia: brak oznaczenia → brak sugestii', () => {
  rowne(Import.sugerujStatus('(Claude-dom) zapytać go'), null);
});

test('sugestia: „nie da się streścić” → brak sugestii', () => {
  rowne(Import.sugerujStatus('-Teego sie nie da strescic Dlaczego polski sukces'), null);
  rowne(Import.sugerujStatus('Tego nie da się streścić'), null);
});

/* ---------------- Import: tytuły ---------------- */

test('tytuł: z adresu YouTube, rolki Facebooka i pliku lokalnego', () => {
  rowne(Import.tytulZAdresu('https://www.youtube.com/watch?v=abc&list=x'), 'YouTube · abc');
  rowne(Import.tytulZAdresu('https://www.facebook.com/reel/123'), 'Facebook – rolka');
  rowne(Import.tytulZAdresu('file:///C:/Users/uzytkownik/Downloads/Rafa%C5%82+U.pdf'), 'plik: Rafał+U.pdf');
});
test('tytuł: bez oznaczenia i dwukropka na końcu', () => {
  rowne(Import.zTekstu('Ciekawe Ambient AI: https://www.omi.me/', 't')[0].tytul, 'Ciekawe Ambient AI');
  rowne(Import.zTekstu('Poeksplorować https://socphilinfo.github.io/r.pdf', 't')[0].tytul, 'socphilinfo.github.io/r.pdf');
});
test('tytuł: link bez tytułu nie bierze tytułu sąsiedniego linku', () => {
  const w = Import.zAkapitow([{ tekst: '[Streścić] https://a.pl/x.pdf Film o AI', linki: [
    { url: 'https://a.pl/x.pdf', tytul: '' }, { url: 'https://youtube.com/watch?v=q', tytul: 'Film o AI' }] }], 't');
  rowne(w.map(x => x.tytul), ['a.pl/x.pdf', 'Film o AI']);
});

/* ---------------- Import: wyciąganie linków ---------------- */

test('linki: dwa adresy w jednym akapicie („oraz”) → dwa linki', () => {
  const l = Import.znajdzLinki('(streścić) https://a.pl/1 oraz https://b.pl/2 ', []);
  rowne(l.map(x => x.url), ['https://a.pl/1', 'https://b.pl/2']);
});
test('linki: format Markdown [tytuł](adres "opis")', () => {
  const l = Import.znajdzLinki('-Radio: [Jak działa radio? \\| Zapytaj Fizyka](https://zapytajfizyka.fuw.edu.pl/x/ "Jak działa") [Drugi](https://howradio.works/ "H")', []);
  rowne(l.map(x => x.url), ['https://zapytajfizyka.fuw.edu.pl/x/', 'https://howradio.works/']);
  rowne(l[0].tytul, 'Jak działa radio? | Zapytaj Fizyka');
});
test('linki: hiperłącze z tytułem zamiast adresu – bierze tytuł', () => {
  const l = Import.znajdzLinki('[Streścić] TBM 442', [{ url: 'https://cutlefish.substack.com/p/tbm', tytul: 'TBM 442' }]);
  rowne(l, [{ url: 'https://cutlefish.substack.com/p/tbm', tytul: 'TBM 442' }]);
});
test('linki: ten sam adres dwa razy (tekst + hiperłącze) → jeden link', () => {
  const l = Import.znajdzLinki('Streścić https://socphilinfo.github.io/PI-Intro/ ', [{ url: 'https://socphilinfo.github.io/PI-Intro/', tytul: 'https://socphilinfo.github.io/PI-Intro/' }]);
  rowne(l.length, 1);
});
test('linki: lokalne pliki file:/// też są linkami', () => {
  const l = Import.znajdzLinki('Streścić file:///C:/Users/uzytkownik/Downloads/a.pdf', []);
  rowne(l[0].url, 'file:///C:/Users/uzytkownik/Downloads/a.pdf');
});
test('linki: adres bez spacji po dwukropku („AI: https://…”)', () => {
  const l = Import.znajdzLinki('Ciekawe Ambient AI: https://www.omi.me/?utm_source=chatgpt.com', []);
  rowne(l[0].url, 'https://www.omi.me/?utm_source=chatgpt.com');
});

/* ---------------- Import: akapity → wpisy ---------------- */

test('akapity: puste i bez liter pomijane, notatka bez linku zostaje', () => {
  const w = Import.zTekstu('\n“\n(Claude-dom) przemyśleć coś\n', 'test');
  rowne(w.length, 1);
  rowne(w[0].url, null);
  rowne(w[0].tekst, '(Claude-dom) przemyśleć coś');
});
test('akapity: każdy wpis zachowuje pełny oryginalny tekst', () => {
  const w = Import.zTekstu('(streścić) https://a.pl oraz https://b.pl', 'test');
  rowne(w.length, 2);
  prawda(w.every(x => x.tekst === '(streścić) https://a.pl oraz https://b.pl'));
  prawda(w.every(x => x.sugestia === 'do_streszczenia'));
});
test('akapity: każdy wpis ma datę dodania', () => {
  const w = Import.zTekstu('Obczaić https://github.com/x', 'test');
  prawda(!isNaN(new Date(w[0].dodano)), 'brak poprawnej daty');
});

/* ---------------- Import: prawdziwy format .docx ---------------- */

test('docx: przykładowy dokument → właściwe wpisy', async () => {
  const w = await Import.zDocx(plikZBase64(PRZYKLAD_DOCX_BASE64, 'przyklad.docx'));
  rowne(w.map(x => x.url), [
    'https://www.youtube.com/watch?v=aaa',
    'https://www.youtube.com/watch?v=bbb',
    'https://www.facebook.com/reel/123',
    null,
    'https://blog.example.com/llm',
  ]);
  rowne(w[4].tytul, 'The LLM Blindspot', 'tytuł sklejony z dwóch kawałków:');
  rowne(w[0].sugestia, 'do_streszczenia');
  rowne(w[0].zrodlo, 'import: przyklad.docx');
});
test('docx: plik, który nie jest ZIP-em → czytelny błąd', async () => {
  let blad = null;
  try { await Import.zDocx(new File(['to nie docx'], 'zly.docx')); } catch (e) { blad = e; }
  prawda(blad && /docx/.test(blad.message), 'brak komunikatu o złym pliku');
});

/* ---------------- Magazyn: nic nie ginie ---------------- */

test('magazyn: nie ma żadnej funkcji usuwania wpisu', () => {
  const nazwy = Object.keys(Magazyn).join(' ');
  prawda(!/usun|kasuj|delete|remove/i.test(nazwy), 'znaleziono funkcję usuwania: ' + nazwy);
});
test('magazyn: ponowny import nie dubluje wpisów', () => {
  czysto();
  const w = Import.zTekstu('Obczaić https://a.pl\nStreścić https://b.pl', 'test');
  rowne(Magazyn.dodaj(w), { dodane: 2, pominiete: 0 });
  rowne(Magazyn.dodaj(Import.zTekstu('Obczaić https://a.pl\nStreścić https://b.pl', 'test')), { dodane: 0, pominiete: 2 });
  rowne(Magazyn.wczytaj().length, 2);
});
test('magazyn: nowy wpis trafia do skrzynki', () => {
  czysto();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  rowne(Magazyn.wczytaj()[0].status, 'skrzynka');
});
test('magazyn: zmiana statusu zapisuje historię', () => {
  czysto();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  const id = Magazyn.wczytaj()[0].id;
  Magazyn.zmienStatus(id, 'archiwum');
  const w = Magazyn.wczytaj()[0];
  rowne(w.status, 'archiwum');
  rowne(w.historia.length, 1);
  rowne([w.historia[0].z, w.historia[0].na], ['skrzynka', 'archiwum']);
});
test('magazyn: data dodania nie zmienia się przy zmianie statusu', () => {
  czysto();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  const przed = Magazyn.wczytaj()[0];
  Magazyn.zmienStatus(przed.id, 'obczaic');
  rowne(Magazyn.wczytaj()[0].dodano, przed.dodano);
});
test('magazyn: przywrócenie kopii dokłada brakujące, niczego nie nadpisuje', () => {
  czysto();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  const kopia = Magazyn.kopiaJSON();
  const id = Magazyn.wczytaj()[0].id;
  Magazyn.zmienStatus(id, 'archiwum');
  Magazyn.dodaj([{ url: 'https://b.pl', tytul: 'b', tekst: 'b' }]);
  rowne(Magazyn.przywrocKopie(kopia), 0);
  rowne(Magazyn.wczytaj().length, 2);
  rowne(Magazyn.wczytaj()[0].status, 'archiwum', 'stara kopia nadpisała nowszy stan:');
});

test('statusy: dokładnie Streścić / Obczaić / Zgłębić / Archiwum (+ skrzynka)', () => {
  rowne(GRUPA_POTOK.map(s => STATUSY[s]), ['Skrzynka (nieprzejrzane)', 'Streścić', 'Obczaić', 'Zgłębić', 'Zapisać do Obsidian', 'Muzyczki do zachowania', 'Śmieszne', 'Archiwum']);
  rowne(GRUPA_ZADANIA.map(s => STATUSY[s]), ["Dla Claude'a", 'Zrobię sam', 'Zrobione']);
});
test('magazyn: stare „do przeczytania” samo przechodzi do „Zgłębić”, historia zostaje', () => {
  czysto();
  // Tak zapisywała dane wersja z 8.11.2026 (przed zmianą nazw).
  localStorage.setItem(Magazyn.klucz, JSON.stringify({ wersja: 1, wpisy: [{
    id: 'w_stary', url: 'https://a.pl', tytul: 'a', tekst: 'a', status: 'do_przeczytania',
    sugestia: 'do_przeczytania', dodano: '2026-11-08T10:00:00Z',
    historia: [{ data: '2026-11-08T11:00:00Z', z: 'skrzynka', na: 'do_przeczytania' }],
  }] }));
  const w = Magazyn.wczytaj()[0];
  rowne([w.status, w.sugestia, w.historia[0].na], ['zglebic', 'zglebic', 'zglebic']);
  rowne(w.dodano, '2026-11-08T10:00:00Z', 'data dodania zmieniona:');
});
test('magazyn: popchnięcie dalej Streścić → Zgłębić zapisuje obie zmiany', () => {
  czysto();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  const id = Magazyn.wczytaj()[0].id;
  Magazyn.zmienStatus(id, 'do_streszczenia');
  Magazyn.zmienStatus(id, 'zglebic');
  const w = Magazyn.wczytaj()[0];
  rowne(w.status, 'zglebic');
  rowne(w.historia.map(h => h.na), ['do_streszczenia', 'zglebic']);
});

/* ---------------- Do zrobienia ---------------- */

test('zadania: podpowiedź „Dla Claude\'a” tylko przy oznaczeniu (Claude…)/[Claude…]', () => {
  for (const t of ['(Claude-dom) zapytać go', '(Claude) pomysł', '[Claude] konfiguracja', '-[Claude] sprawdzić', '(CLAUDE-dom) gra'])
    rowne(Magazyn.statusZadania(t), 'zrobic_claude', t);
  // Bez oznaczenia nie zgadujemy – decydujesz w przeglądzie.
  for (const t of ['Weekend: muzyczki suno', '(Dom) zdjęcia do albumu', 'zapytać Claude o coś', 'pomyśleć jak gromadzić'])
    rowne(Magazyn.statusZadania(t), null, t);
});
test('zapis bez decyzji: wszystko (także bez linku) trafia do skrzynki', () => {
  czysto();
  Magazyn.dodaj(Import.zTekstu('(Claude-dom) pomysł\nWeekend: Suno\nObczaić https://a.pl', 'test'));
  rowne(Magazyn.wczytaj().map(w => w.status), ['skrzynka', 'skrzynka', 'skrzynka']);
});
test('zapis bez decyzji: wpisy przeniesione wcześniej automatycznie wracają do skrzynki', () => {
  czysto();
  localStorage.setItem(Magazyn.klucz, JSON.stringify({ wersja: 1, wpisy: [
    // przeniesiony automatycznie przez wersję z wieczoru 8.11
    { id: 'w_a', url: null, tytul: 'x', tekst: '(Claude) x', status: 'zrobic_claude', dodano: '2026-11-08T10:00:00Z',
      historia: [{ data: '2026-11-08T19:05:00Z', z: 'skrzynka', na: 'zrobic_claude', automatycznie: true }] },
    // przesunięty przez użytkownika (bez „automatycznie”) – zostaje
    { id: 'w_b', url: null, tytul: 'y', tekst: 'y', status: 'zrobic_sam', dodano: '2026-11-08T10:00:00Z',
      historia: [{ data: '2026-11-08T19:05:00Z', z: 'skrzynka', na: 'zrobic_sam' }] },
    // automatycznie, a potem użytkownik dał „Zrobione” – zostaje
    { id: 'w_c', url: null, tytul: 'z', tekst: 'z', status: 'zrobione', dodano: '2026-11-08T10:00:00Z',
      historia: [{ data: '2026-11-08T19:05:00Z', z: 'skrzynka', na: 'zrobic_sam', automatycznie: true },
                 { data: '2026-11-08T19:10:00Z', z: 'zrobic_sam', na: 'zrobione' }] },
  ] }));
  rowne(Magazyn.wczytaj().map(w => w.status), ['skrzynka', 'zrobic_sam', 'zrobione']);
  rowne(Magazyn.wczytaj()[0].historia.length, 2, 'powrót zapisany w historii, i tylko raz:');
});
test('zadania: „Zrobione” nie usuwa wpisu, można go wrócić do skrzynki', () => {
  czysto();
  Magazyn.dodaj([{ url: null, tytul: 'x', tekst: 'Weekend: x' }]);
  const id = Magazyn.wczytaj()[0].id;
  Magazyn.zmienStatus(id, 'zrobione');
  rowne(Magazyn.wczytaj().length, 1);
  Magazyn.zmienStatus(id, 'skrzynka');
  rowne(Magazyn.wczytaj()[0].status, 'skrzynka');
});

/* ---------------- 🏠 Tylko prywatnie ---------------- */

test('prywatne: podpowiedź z oznaczeń „dom”', () => {
  for (const t of ['(Dom) Książka do skanowania', '(Claude-dom) zapytać', '(CLAUDE-dom) gra', 'prywatne: wyciąg z banku'])
    prawda(Import.sugerujPrywatne(t), t);
  for (const t of ['(Claude) pomysł', '[Praca] dokończyć', 'domena https://a.pl', 'XDDDD https://fb.com/reel/1'])
    prawda(!Import.sugerujPrywatne(t), t);
});
test('prywatne: Twój wybór wygrywa z podpowiedzią (w obie strony)', () => {
  rowne(Import.czyPrywatne({ tekst: '(Dom) x' }), true);
  rowne(Import.czyPrywatne({ tekst: '(Dom) x', prywatne: false }), false);
  rowne(Import.czyPrywatne({ tekst: 'zwykły link', prywatne: true }), true);
});
test('prywatne: przełączenie zapisuje się i nie zmienia statusu ani daty', () => {
  czysto();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  const przed = Magazyn.wczytaj()[0];
  Magazyn.ustawPrywatne(przed.id, true);
  const po = Magazyn.wczytaj()[0];
  rowne([po.prywatne, po.status, po.dodano], [true, przed.status, przed.dodano]);
});
test('urządzenie: domyślnie prywatne, ustawienie się zapamiętuje', () => {
  localStorage.removeItem(Magazyn.klucz + '.urzadzenie');
  rowne(Magazyn.urzadzenie(), 'prywatne');
  Magazyn.ustawUrzadzenie('sluzbowe');
  rowne(Magazyn.urzadzenie(), 'sluzbowe');
  localStorage.removeItem(Magazyn.klucz + '.urzadzenie');
});

/* ---------------- Synchronizacja: łączenie danych ---------------- */

const wpis = (id, zmieniono, dod = {}) => ({ id, url: 'https://' + id + '.pl', tytul: id, tekst: id,
  status: 'skrzynka', dodano: '2026-11-01T10:00:00Z', zmieniono, historia: [], kolejnosc: 0, ...dod });

test('scal: wpisy tylko po jednej stronie zostają (nic nie ginie)', () => {
  const { wpisy } = Synchronizacja.scal([wpis('a', '2026-11-09T10:00:00Z')], [wpis('b', '2026-11-09T10:00:00Z')]);
  rowne(wpisy.map(w => w.id).sort(), ['a', 'b']);
});
test('scal: przy konflikcie wygrywa nowsza zmiana – z obu stron', () => {
  const lok = wpis('a', '2026-11-09T12:00:00Z', { status: 'zglebic' });
  const zd = wpis('a', '2026-11-09T11:00:00Z', { status: 'obczaic' });
  rowne(Synchronizacja.scal([lok], [zd]).wpisy[0].status, 'zglebic');
  rowne(Synchronizacja.scal([{ ...lok, zmieniono: '2026-11-09T10:00:00Z' }], [zd]).wpisy[0].status, 'obczaic');
});
test('scal: historie zmian z obu urządzeń są sklejane bez powtórzeń', () => {
  const h1 = { data: '2026-11-09T10:00:00Z', z: 'skrzynka', na: 'do_streszczenia' };
  const h2 = { data: '2026-11-09T11:00:00Z', z: 'do_streszczenia', na: 'zglebic' };
  const lok = wpis('a', '2026-11-09T11:00:00Z', { status: 'zglebic', historia: [h1, h2] });
  const zd = wpis('a', '2026-11-09T10:00:00Z', { status: 'do_streszczenia', historia: [h1] });
  rowne(Synchronizacja.scal([lok], [zd]).wpisy[0].historia, [h1, h2]);
});
test('scal: bez zmian → nie trzeba nic wysyłać; z nowym wpisem → trzeba', () => {
  const a = wpis('a', '2026-11-09T10:00:00Z');
  rowne(Synchronizacja.scal([a], [a]).inneNizZdalne, false);
  rowne(Synchronizacja.scal([a, wpis('b', '2026-11-09T10:00:00Z')], [a]).inneNizZdalne, true);
});
test('scal: data dodania nigdy się nie zmienia', () => {
  const lok = wpis('a', '2026-11-09T12:00:00Z', { dodano: '2026-10-01T08:00:00Z' });
  const zd = wpis('a', '2026-11-09T11:00:00Z', { dodano: '2026-10-01T08:00:00Z' });
  rowne(Synchronizacja.scal([lok], [zd]).wpisy[0].dodano, '2026-10-01T08:00:00Z');
});
test('kolejka: każda zmiana oznacza „do wysłania”, synchronizacja to czyści', () => {
  czysto(); Magazyn.wyslano();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  rowne(Magazyn.czekaNaWyslanie(), true);
  Magazyn.wyslano();
  Magazyn.zmienStatus(Magazyn.wczytaj()[0].id, 'obczaic');
  rowne(Magazyn.czekaNaWyslanie(), true);
  Magazyn.wyslano();
  Magazyn.zapisz(Magazyn.wczytaj(), false);   // zapis danych z Drive
  rowne(Magazyn.czekaNaWyslanie(), false);
});
test('zmiana wpisu ustawia czas „zmieniono” (do łączenia urządzeń)', () => {
  czysto();
  Magazyn.dodaj([{ url: 'https://a.pl', tytul: 'a', tekst: 'a' }]);
  const w = Magazyn.wczytaj()[0];
  const przed = w.zmieniono;
  prawda(przed, 'brak „zmieniono” przy dodaniu');
  Magazyn.ustawPrywatne(w.id, true);
  prawda(Magazyn.wczytaj()[0].zmieniono >= przed);
});

/* ---------------- Opisy: tytuł i autor gołych linków ---------------- */

test('opisy: pobieramy tylko dla tytułów „z automatu”, raz', () => {
  const yt = 'https://www.youtube.com/watch?v=abc123';
  prawda(Opisy.potrzebuje({ url: yt, tytul: yt }), 'goły adres');
  prawda(Opisy.potrzebuje({ url: yt, tytul: Import.tytulZAdresu(yt) }), '„YouTube · id”');
  prawda(!Opisy.potrzebuje({ url: yt, tytul: 'Mój własny opis' }), 'Twój opis zostaje');
  prawda(Opisy.potrzebuje({ url: yt, tytul: 'Streścić' }), 'samo oznaczenie jako tytuł (stare wpisy)');
  prawda(!Opisy.potrzebuje({ url: yt, tytul: yt, opisPobrany: 'brak-3' }), 'nie pytamy w kółko');
  prawda(Opisy.potrzebuje({ url: yt, tytul: yt, opisPobrany: 'brak' }), 'stara nieudana próba – jeszcze raz');
  prawda(Opisy.potrzebuje({ url: yt, tytul: yt, opisPobrany: 'brak-2' }), 'próba skryptu w wersji 2 – jeszcze raz');
  prawda(!Opisy.potrzebuje({ url: 'file:///C:/x.pdf', tytul: 'plik: x.pdf' }), 'pliki z dysku – nie');
  prawda(!Opisy.potrzebuje({ url: null, tytul: 'notatka' }), 'bez linku – nie');
});
test('opisy: dopisane „Streścić” itp. nie blokuje pobrania tytułu, Twój opis tak', () => {
  for (const t of ['Streścić', '(Streścić)', '[Zgłębić]', 'obczaić', 'XDDDD', 'Zapisać do Obsidian', 'muzyczka -dom', ''])
    prawda(Import.tylkoOznaczenia(t), t);
  for (const t of ['Streścić – wywiad z Karpathym', 'fajny przepis', 'Claude: zrób z tego notatkę o AI'])
    prawda(!Import.tylkoOznaczenia(t), t);
});
test('opisy: po tytuł z YouTube idzie sam film, bez miksu/listy', () => {
  const film = 'https://www.youtube.com/watch?v=chrT06BDlhM';
  rowne(Opisy.adresDoOpisu('https://www.youtube.com/watch?v=chrT06BDlhM&list=RDSdPkjh6X_iw&index=4'), film);
  rowne(Opisy.adresDoOpisu('https://youtu.be/chrT06BDlhM?si=abc'), film);
  rowne(Opisy.adresDoOpisu('https://m.youtube.com/watch?v=chrT06BDlhM&t=30'), film);
  rowne(Opisy.adresDoOpisu('https://music.youtube.com/watch?v=chrT06BDlhM&list=X'), film);
  rowne(Opisy.adresDoOpisu('https://www.youtube.com/shorts/chrT06BDlhM'), film);
  rowne(Opisy.adresDoOpisu('https://example.com/a?b=1'), 'https://example.com/a?b=1');
});
test('opisy: tytuł i autor zapisane, tekst i „zmieniono” bez zmian', () => {
  czysto();
  Magazyn.dodaj([{ url: 'https://youtu.be/xyz', tytul: 'https://youtu.be/xyz', tekst: 'XDDD https://youtu.be/xyz' }]);
  const w = Magazyn.wczytaj()[0];
  Magazyn.ustawOpis(w.id, { tytul: 'Piosenka', autor: 'Kanał' });
  const po = Magazyn.wczytaj()[0];
  rowne([po.tytul, po.autor, po.tekst, po.zmieniono], ['Piosenka', 'Kanał', 'XDDD https://youtu.be/xyz', w.zmieniono]);
  prawda(po.opisPobrany);
  // Brak tytułu (np. Facebook z logowaniem): tytuł zostaje, nie pytamy ponownie.
  Magazyn.dodaj([{ url: 'https://facebook.com/reel/1', tytul: 'Facebook – rolka', tekst: 'https://facebook.com/reel/1' }]);
  const fb = Magazyn.wczytaj().find(x => x.url.includes('facebook'));
  Magazyn.ustawOpis(fb.id, { tytul: '' });
  const fbPo = Magazyn.wczytaj().find(x => x.id === fb.id);
  rowne([fbPo.tytul, fbPo.opisPobrany], ['Facebook – rolka', 'brak-3']);
});
test('scal: tytuł pobrany na jednym urządzeniu nie ginie przez decyzję z drugiego', () => {
  const zTytulem = wpis('a', '2026-11-09T10:00:00Z', { tytul: 'Piosenka', autor: 'Kanał', opisPobrany: '2026-11-09T12:00:00Z' });
  const zDecyzja = wpis('a', '2026-11-09T11:00:00Z', { status: 'muzyka' });
  for (const [l, z] of [[zTytulem, zDecyzja], [zDecyzja, zTytulem]]) {
    const w = Synchronizacja.scal([l], [z]).wpisy[0];
    rowne([w.status, w.tytul, w.autor], ['muzyka', 'Piosenka', 'Kanał']);
  }
});

/* ---------------- Eksport ---------------- */

test('eksport: kolejka streszczeń = same adresy www, po jednym w linii', () => {
  const wpisy = [
    { status: 'do_streszczenia', url: 'https://a.pl' },
    { status: 'do_streszczenia', url: 'file:///C:/x.pdf' },
    { status: 'do_streszczenia', url: null, tytul: 'notatka' },
    { status: 'obczaic', url: 'https://c.pl' },
    { status: 'do_streszczenia', url: 'https://b.pl' },
  ];
  const k = Eksport.kolejkaStreszczen(wpisy);
  rowne(k.tekst, 'https://a.pl\nhttps://b.pl\n');
  rowne(k.reszta.length, 2);
});
test('eksport .md: sekcje wg statusu, data dodania przy każdym wpisie', () => {
  const md = Eksport.markdown([
    { status: 'obczaic', url: 'https://a.pl', tytul: 'Coś [ważnego]', tekst: 'Obczaić https://a.pl', dodano: '2026-11-08T10:00:00Z' },
    { status: 'archiwum', url: null, tytul: 'notatka', tekst: 'notatka', dodano: '2026-11-07T10:00:00Z' },
  ]);
  prawda(md.includes('## Obczaić (1)'));
  prawda(md.includes('- [Coś ważnego](https://a.pl) · dodano 2026-11-08'));
  prawda(md.includes('  - oryginalnie: Obczaić https://a.pl'));
  prawda(md.includes('## Archiwum (1)'));
  prawda(!md.includes('Zgłębić'), 'pusta sekcja nie powinna się pojawić');
});
