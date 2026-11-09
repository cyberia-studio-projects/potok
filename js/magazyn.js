/* =====================================================================
   magazyn.js – przechowywanie wpisów Potoku na tym urządzeniu.

   Wszystko trzymamy w localStorage przeglądarki pod jednym kluczem
   (Magazyn.klucz) jako JSON. To prosty i czytelny wybór: kilka tysięcy linków
   to kilkaset KB, a limit localStorage to ok. 5 MB.

   ZASADA: nic nigdy nie jest usuwane. W tym pliku celowo NIE MA
   funkcji kasowania wpisu. „Archiwum” to zwykły status.

   Kształt jednego wpisu:
   {
     id:        "w_..."            unikalny identyfikator
     url:       "https://..."     albo null (notatka bez linku)
     tytul:     "..."             co pokazujemy jako nagłówek
     tekst:     "..."             oryginalny wpis (np. linia z Google Docs)
     status:    Potok:   "skrzynka" | "do_streszczenia" | "obczaic"
                         | "zglebic" | "obsidian" | "muzyka" | "smieszne" | "archiwum"
                Zadania: "zrobic_claude" | "zrobic_sam" | "zrobione"
     dodano:    "2026-11-08T16:40:00.000Z"   data dodania (automatycznie)
     uwagaDaty: "..."             opcjonalnie, np. że to data importu
     zrodlo:    "import: plik.docx" | "ręcznie" | "udostępnij"
     sugestia:  status zaproponowany z oznaczenia w tekście albo null
     kolejnosc: liczba – kolejność z dokumentu (do przeglądu)
     historia:  [{ data, z, na }]  każda zmiana statusu
     zmieniono: "2026-11-09T…"    ostatnia zmiana wpisu – do łączenia danych z kilku urządzeń
     prywatne:  true/false        🏠 „otwierać tylko na prywatnym komputerze”;
                                  brak pola = podpowiedź z tekstu (Import.czyPrywatne)
   }
   ===================================================================== */


// Statusy w kolejności wyświetlania + polskie nazwy.
// Znaczenie (decyzja z 8.11.2026):
//   Streścić – niech streści AI (NotebookLM); po streszczeniu można popchnąć dalej,
//   Obczaić  – przejrzeć, poeksplorować samemu,
//   Zgłębić  – poświęcić czas: przeczytać / obejrzeć w całości (artykuł albo film),
//   Zapisać do Obsidian – wiedza do notatek; lista eksportuje się osobno jako .md,
//   Muzyczki do zachowania – utwory do zapamiętania / słuchania,
//   Śmieszne – rozrywka (rolki, memy), żeby nie mieszała się z resztą,
//   Archiwum – nic nie robię, ale wpis zostaje na zawsze.
const STATUSY = {
  skrzynka:        'Skrzynka (nieprzejrzane)',
  do_streszczenia: 'Streścić',
  obczaic:         'Obczaić',
  zglebic:         'Zgłębić',
  obsidian:        'Zapisać do Obsidian',
  muzyka:          'Muzyczki do zachowania',
  smieszne:        'Śmieszne',
  archiwum:        'Archiwum',
  // „Do zrobienia” (decyzja z 8.11.2026): wpisy bez linku to plany i pomysły,
  // nie treści do przyswojenia, więc mają osobne miejsce i nie zaśmiecają Potoku.
  zrobic_claude:   "Dla Claude'a",
  zrobic_sam:      'Zrobię sam',
  zrobione:        'Zrobione',
};

// Podział statusów na dwie części aplikacji.
const GRUPA_POTOK   = ['skrzynka', 'do_streszczenia', 'obczaic', 'zglebic', 'obsidian', 'muzyka', 'smieszne', 'archiwum'];
const GRUPA_ZADANIA = ['zrobic_claude', 'zrobic_sam', 'zrobione'];

// Stare nazwy statusów → nowe. Stosowane przy każdym odczycie, więc dane
// zapisane przez starszą wersję aplikacji same się przenoszą (nic nie ginie).
const STARE_STATUSY = {
  do_przeczytania: 'zglebic',   // do 8.11.2026 „Do przeczytania”
};

const Magazyn = {
  // Klucz w localStorage. Testy podmieniają go na własny, żeby nie ruszać Twoich danych.
  klucz: 'potok.v1',

  /** Wczytuje wszystkie wpisy (tablica). */
  wczytaj() {
    try {
      const surowe = localStorage.getItem(this.klucz);
      const wpisy = (surowe ? JSON.parse(surowe).wpisy || [] : []).map(w => this.uaktualnij(w));
      // ZASADA (8.11.2026): zapis bez decyzji, decyzja dopiero w przeglądzie.
      // Wersja z wieczoru 8.11 sama przenosiła wpisy bez linku do „Do zrobienia”.
      // Takie wpisy (ostatni ruch automatyczny ze skrzynki) wracają do skrzynki,
      // żebyś zdecydował o nich sam. Wpisy przesunięte przez Ciebie zostają.
      let zmiany = 0;
      for (const w of wpisy) {
        const h = (w.historia || [])[w.historia.length - 1];
        if (h && h.automatycznie && h.z === 'skrzynka' && h.na === w.status) {
          w.historia.push({ data: new Date().toISOString(), z: w.status, na: 'skrzynka', automatycznie: true });
          w.status = 'skrzynka';
          w.zmieniono = new Date().toISOString();
          zmiany++;
        }
      }
      if (zmiany) this.zapisz(wpisy);
      return wpisy;
    } catch (e) {
      console.error('Nie udało się odczytać danych', e);
      return [];
    }
  },

  /**
   * Przenosi wpis ze starej nazwy statusu na nową – w statusie,
   * podpowiedzi i historii. Sama historia zmian zostaje.
   */
  uaktualnij(w) {
    const nowa = s => STARE_STATUSY[s] || s;
    w.status = nowa(w.status);
    if (w.sugestia) w.sugestia = nowa(w.sugestia);
    for (const h of w.historia || []) { h.z = nowa(h.z); h.na = nowa(h.na); }
    return w;
  },

  /**
   * Podpowiedź dla zadania: oznaczenie „(Claude…)” albo „[Claude…]”
   * → Dla Claude'a. Bez oznaczenia – brak podpowiedzi (null).
   * To tylko podświetlenie przycisku; decyzja zawsze należy do Ciebie.
   */
  statusZadania(tekst) {
    return /[(\[]\s*claude/i.test(tekst || '') ? 'zrobic_claude' : null;
  },

  /**
   * Zapisuje całą tablicę wpisów.
   * Domyślnie oznacza też, że jest coś „do wysłania” na Google Drive
   * i daje znać synchronizacji (zdarzenie „potok-zmiana”).
   * Synchronizacja sama zapisuje dane pobrane z Drive z oznacz = false.
   */
  zapisz(wpisy, oznacz = true) {
    localStorage.setItem(this.klucz, JSON.stringify({ wersja: 1, wpisy }));
    if (oznacz) {
      localStorage.setItem(this.klucz + '.doWyslania', '1');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('potok-zmiana'));
    }
  },

  /** Czy są zmiany, których jeszcze nie ma na Google Drive. */
  czekaNaWyslanie() {
    return localStorage.getItem(this.klucz + '.doWyslania') === '1';
  },
  wyslano() {
    localStorage.removeItem(this.klucz + '.doWyslania');
  },

  /** Tworzy nowy identyfikator. */
  noweId() {
    return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  /**
   * Dodaje nowe wpisy, pomijając duplikaty (ten sam url + ten sam tekst).
   * Zwraca { dodane, pominiete }.
   */
  dodaj(nowe) {
    const wpisy = this.wczytaj();
    const znane = new Set(wpisy.map(w => (w.url || '') + '|' + w.tekst));
    let dodane = 0, pominiete = 0;
    for (const n of nowe) {
      const klucz = (n.url || '') + '|' + n.tekst;
      if (znane.has(klucz)) { pominiete++; continue; }
      znane.add(klucz);
      wpisy.push({
        id: this.noweId(),
        status: 'skrzynka',
        dodano: new Date().toISOString(),   // data dodania – zawsze automatycznie
        zmieniono: new Date().toISOString(),
        historia: [],
        kolejnosc: wpisy.length,
        ...n,
      });
      dodane++;
    }
    this.zapisz(wpisy);
    return { dodane, pominiete };
  },

  /** Ustawia znaczek 🏠 „tylko prywatnie” (true/false). */
  /**
   * Tytuł i autor pobrane z internetu (Opisy). Bez zmiany „zmieniono”:
   * to nie jest Twoja decyzja, więc nie może wygrać z decyzją z innego
   * urządzenia przy scalaniu (scal przenosi opis osobno).
   */
  ustawOpis(id, opis) {
    const wpisy = this.wczytaj();
    const w = wpisy.find(x => x.id === id);
    if (!w) return;
    if (opis && opis.tytul) { w.tytul = opis.tytul; w.autor = opis.autor || ''; }
    w.opisPobrany = opis && opis.tytul ? new Date().toISOString() : 'brak';
    this.zapisz(wpisy);
  },

  ustawPrywatne(id, wartosc) {
    const wpisy = this.wczytaj();
    const w = wpisy.find(x => x.id === id);
    if (!w) return;
    w.prywatne = !!wartosc;
    w.zmieniono = new Date().toISOString();
    this.zapisz(wpisy);
  },

  /**
   * Rodzaj TEGO urządzenia: 'prywatne' albo 'sluzbowe'.
   * Zapisywane osobno od wpisów – każde urządzenie ma własne ustawienie
   * (także po przyszłej synchronizacji z Google Drive).
   */
  urzadzenie() {
    return localStorage.getItem(this.klucz + '.urzadzenie') || 'prywatne';
  },
  ustawUrzadzenie(rodzaj) {
    localStorage.setItem(this.klucz + '.urzadzenie', rodzaj);
  },

  /** Zmienia status wpisu i dopisuje zmianę do historii. */
  zmienStatus(id, nowyStatus) {
    const wpisy = this.wczytaj();
    const w = wpisy.find(x => x.id === id);
    if (!w || w.status === nowyStatus) return;
    w.historia.push({ data: new Date().toISOString(), z: w.status, na: nowyStatus });
    w.zmieniono = new Date().toISOString();
    w.status = nowyStatus;
    this.zapisz(wpisy);
  },

  /**
   * Kopia zapasowa: zwraca cały stan jako tekst JSON.
   * Do czasu synchronizacji z Google Drive to jest główne zabezpieczenie.
   */
  kopiaJSON() {
    return JSON.stringify({ wersja: 1, eksport: new Date().toISOString(), wpisy: this.wczytaj() }, null, 2);
  },

  /**
   * Przywraca kopię: DOKŁADA wpisy z kopii, których jeszcze nie ma
   * (po id). Niczego istniejącego nie nadpisuje ani nie usuwa.
   */
  przywrocKopie(tekstJSON) {
    const dane = JSON.parse(tekstJSON);
    const wpisy = this.wczytaj();
    const ids = new Set(wpisy.map(w => w.id));
    let dodane = 0;
    for (const w of dane.wpisy || []) {
      if (!ids.has(w.id)) { wpisy.push(w); dodane++; }
    }
    this.zapisz(wpisy);
    return dodane;
  },
};
