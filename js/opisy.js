/* opisy.js – tytuł i autor dla „gołych” linków (np. udostępnionych z YouTube).

   Pobiera je Twój skrypt Google (akcja „opis”, od wersji 2 skryptu), bo
   przeglądarka sama nie może czytać cudzych stron. Działa w tle po każdej
   synchronizacji, po kolei, jeden link naraz. Bez internetu – czeka.
   Oryginalny tekst wpisu zostaje bez zmian, zmienia się tylko tytuł. */

const Opisy = {
  /** Czy wpis ma tytuł „z automatu” (sam adres albo „YouTube · id”) – wtedy warto pobrać prawdziwy. */
  potrzebuje(w) {
    // 'brak' i 'brak-2' to nieudane próby starszego skryptu (np. bez zgody Google
    // na łączenie ze stronami) – ze skryptem w wersji 3 próbujemy jeszcze raz.
    // 'brak-3' = skrypt w wersji 3 też nie dał rady – nie pytamy w kółko.
    if (!w.url || !/^https?:\/\//i.test(w.url) || (w.opisPobrany && !['brak', 'brak-2'].includes(w.opisPobrany))) return false;
    // „Streścić” jako tytuł – wpisy dodane przed wersją 16 też się poprawią.
    return !w.tytul || w.tytul === w.url || w.tytul === Import.tytulZAdresu(w.url) || Import.tylkoOznaczenia(w.tytul);
  },

  /**
   * Adres wysyłany po tytuł. YouTube: sam film (bez „&list=…”, „&index=…”),
   * bo YouTube nie podaje tytułu dla linków z miksów i list.
   */
  adresDoOpisu(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^(www|m|music)\./, '');
      let id = '';
      if (host === 'youtube.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/) || [])[1] || '';
      if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
      return id ? 'https://www.youtube.com/watch?v=' + id : url;
    } catch { return url; }
  },

  /** Ile razy link nie odpowiedział (pamiętane na tym urządzeniu). */
  proby() {
    try { return JSON.parse(localStorage.getItem(Magazyn.klucz + '.opisyProby') || '{}'); } catch { return {}; }
  },

  /** Krótkie podsumowanie do „Pliki”: ile tytułów jest, ile się nie udało, ile czeka. */
  podsumowanie(wpisy) {
    const linki = wpisy.filter(w => w.url && /^https?:/i.test(w.url));
    const ile = f => linki.filter(f).length;
    const tekst = `Tytuły linków: pobrane ${ile(w => w.opisPobrany && !/^brak/.test(w.opisPobrany))} · bez tytułu ${ile(w => w.opisPobrany === 'brak-3')} · czekają ${ile(w => this.potrzebuje(w))}.`;
    const b = this.ostatniBlad;
    return tekst + (b ? ` Ostatni problem (${b.kiedy.toLocaleTimeString('pl-PL')}): ${b.url} – ${b.tresc}` : '');
  },

  /** Czy skrypt Google jest za stary (nie umie „opis”) – wtedy Pliki pokazują, jak go zaktualizować. */
  skryptStary() {
    return localStorage.getItem(Magazyn.klucz + '.skryptStary') === '1';
  },

  /** Uzupełnia po kolei wszystkie wpisy, które tego potrzebują. */
  async uzupelnij() {
    if (this.trwa || !navigator.onLine || !Synchronizacja.skrypt()) return;
    this.trwa = true;
    // Raz na uruchomienie: czy skrypt jest w wersji 3 (stary nie zna akcji „wersja”).
    if (!this.wersjaSprawdzona) {
      try {
        await Synchronizacja.doSkryptu({ akcja: 'wersja' });
        this.wersjaSprawdzona = true;
        if (this.skryptStary()) {
          localStorage.removeItem(Magazyn.klucz + '.skryptStary');
          window.dispatchEvent(new Event('potok-stan-synchronizacji'));
        }
      } catch (e) {
        if (/nieznana akcja/.test(e.message)) {
          this.wersjaSprawdzona = true;
          localStorage.setItem(Magazyn.klucz + '.skryptStary', '1');
          window.dispatchEvent(new Event('potok-stan-synchronizacji'));
        }
        this.trwa = false;
        return;   // stary skrypt albo brak sieci – tytułów nie pobieramy
      }
    } else if (this.skryptStary()) { this.trwa = false; return; }
    const pominiete = new Set();   // linki, które w tym przebiegu nie odpowiedziały
    let bezOdpowiedziPodRzad = 0;
    try {
      for (;;) {
        const w = Magazyn.wczytaj().find(x => this.potrzebuje(x) && !pominiete.has(x.id));
        if (!w) return;
        let opis;
        try {
          opis = await Synchronizacja.doSkryptu({ akcja: 'opis', url: this.adresDoOpisu(w.url) });
        } catch (e) {
          if (/nieznana akcja/.test(e.message)) {
            localStorage.setItem(Magazyn.klucz + '.skryptStary', '1');
            window.dispatchEvent(new Event('potok-stan-synchronizacji'));
            return;
          }
          this.ostatniBlad = { url: w.url, tresc: e.message, kiedy: new Date() };
          if (!navigator.onLine) return;   // bez internetu – spróbujemy po następnej synchronizacji
          if (e instanceof TypeError) {
            // Brak odpowiedzi (np. skrypt Google przekroczył czas na wolnej stronie).
            // Ten link pomijamy, a po 2 takich próbach uznajemy „bez tytułu”.
            // 3 razy pod rząd bez odpowiedzi = raczej problem z siecią – przerwa.
            if (++bezOdpowiedziPodRzad >= 3) return;
            const proby = this.proby();
            proby[w.id] = (proby[w.id] || 0) + 1;
            localStorage.setItem(Magazyn.klucz + '.opisyProby', JSON.stringify(proby));
            window.dispatchEvent(new Event('potok-stan-synchronizacji'));
            if (proby[w.id] < 2) { pominiete.add(w.id); continue; }
          }
          opis = null;   // błąd tylko dla tego linku – nie blokuje pozostałych
        }
        bezOdpowiedziPodRzad = opis === null ? bezOdpowiedziPodRzad : 0;
        if (opis && opis.problem) this.ostatniBlad = { url: w.url, tresc: opis.problem, kiedy: new Date() };
        if (this.skryptStary()) {
          localStorage.removeItem(Magazyn.klucz + '.skryptStary');
          window.dispatchEvent(new Event('potok-stan-synchronizacji'));
        }
        Magazyn.ustawOpis(w.id, opis);
        window.dispatchEvent(new Event('potok-odswiez'));
        window.dispatchEvent(new Event('potok-stan-synchronizacji'));
      }
    } finally {
      this.trwa = false;
    }
  },
};
