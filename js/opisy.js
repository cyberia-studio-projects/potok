/* opisy.js – tytuł i autor dla „gołych” linków (np. udostępnionych z YouTube).

   Pobiera je Twój skrypt Google (akcja „opis”, od wersji 2 skryptu), bo
   przeglądarka sama nie może czytać cudzych stron. Działa w tle po każdej
   synchronizacji, po kolei, jeden link naraz. Bez internetu – czeka.
   Oryginalny tekst wpisu zostaje bez zmian, zmienia się tylko tytuł. */

const Opisy = {
  /** Czy wpis ma tytuł „z automatu” (sam adres albo „YouTube · id”) – wtedy warto pobrać prawdziwy. */
  potrzebuje(w) {
    if (!w.url || !/^https?:\/\//i.test(w.url) || w.opisPobrany) return false;
    return !w.tytul || w.tytul === w.url || w.tytul === Import.tytulZAdresu(w.url);
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
          opis = await Synchronizacja.doSkryptu({ akcja: 'opis', url: w.url });
        } catch (e) {
          if (/nieznana akcja/.test(e.message)) {
            localStorage.setItem(Magazyn.klucz + '.skryptStary', '1');
            window.dispatchEvent(new Event('potok-stan-synchronizacji'));
          }
          return;   // bez internetu / błąd – spróbujemy po następnej synchronizacji
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
