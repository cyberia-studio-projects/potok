/* opisy.js – tytuł i autor dla „gołych” linków (np. udostępnionych z YouTube).

   Pobiera je Twój skrypt Google (akcja „opis”, od wersji 2 skryptu), bo
   przeglądarka sama nie może czytać cudzych stron. Działa w tle po każdej
   synchronizacji, po kolei, jeden link naraz. Bez internetu – czeka.
   Oryginalny tekst wpisu zostaje bez zmian, zmienia się tylko tytuł. */

const Opisy = {
  /** Czy wpis ma tytuł „z automatu” (sam adres albo „YouTube · id”) – wtedy warto pobrać prawdziwy. */
  potrzebuje(w) {
    // 'brak' (bez „-2”) to nieudana próba sprzed wersji 18 – wtedy linki z miksów
    // YouTube („&list=RD…”) nie dawały tytułu. Próbujemy je jeszcze raz.
    if (!w.url || !/^https?:\/\//i.test(w.url) || (w.opisPobrany && w.opisPobrany !== 'brak')) return false;
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

  /** Czy skrypt Google jest za stary (nie umie „opis”) – wtedy Pliki pokazują, jak go zaktualizować. */
  skryptStary() {
    return localStorage.getItem(Magazyn.klucz + '.skryptStary') === '1';
  },

  /** Uzupełnia po kolei wszystkie wpisy, które tego potrzebują. */
  async uzupelnij() {
    if (this.trwa || !navigator.onLine || !Synchronizacja.skrypt()) return;
    this.trwa = true;
    try {
      for (;;) {
        const w = Magazyn.wczytaj().find(x => this.potrzebuje(x));
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
          // Bez internetu – spróbujemy po następnej synchronizacji.
          if (!navigator.onLine || e instanceof TypeError) return;
          // Błąd tylko dla tego linku – nie blokuje pozostałych.
          opis = null;
        }
        if (this.skryptStary()) {
          localStorage.removeItem(Magazyn.klucz + '.skryptStary');
          window.dispatchEvent(new Event('potok-stan-synchronizacji'));
        }
        Magazyn.ustawOpis(w.id, opis);
        window.dispatchEvent(new Event('potok-odswiez'));
      }
    } finally {
      this.trwa = false;
    }
  },
};
