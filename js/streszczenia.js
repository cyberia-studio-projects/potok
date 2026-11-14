/* streszczenia.js – streszczenia AI przy wpisach (od wersji 4 skryptu Google).

   Streszczenia robi sam skrypt Google co godzinę (harmonogram), bez udziału
   aplikacji: wpisy „Streścić” dostają krótkie streszczenie (3–5 zdań),
   a „Streścić szczegółowo” – szczegółowe. Skrypt zapisuje je w folderze
   „Potok/Streszczenia” na Twoim Drive (jeden plik na wpis), a Potok.json
   zostaje nietknięty.

   Aplikacja tylko je odczytuje (akcja „streszczenia”) po każdej synchronizacji
   i pamięta na tym urządzeniu, żeby były widoczne także bez internetu.
   Pobiera tylko to, co zmieniło się od ostatniego razu. */

const Streszczenia = {
  // Własne drobne pomocniki (app.js ma podobne), żeby plik działał też w testach.
  esc: t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  data: iso => new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }),

  kluczPamieci() { return Magazyn.klucz + '.streszczenia'; },

  /** { od, mapa: { idWpisu: streszczenie } } zapisane na tym urządzeniu. */
  pamiec() {
    try { return JSON.parse(localStorage.getItem(this.kluczPamieci()) || 'null') || { od: '', mapa: {} }; }
    catch { return { od: '', mapa: {} }; }
  },

  /** Streszczenie wpisu albo null. */
  dla(id) { return this.pamiec().mapa[id] || null; },

  /** Dokłada streszczenia (nowsze zastępują starsze) – używane też w testach. */
  zapamietaj(lista, od) {
    const p = this.pamiec();
    for (const s of lista || []) if (s && s.id) p.mapa[s.id] = s;
    if (od) p.od = od;
    localStorage.setItem(this.kluczPamieci(), JSON.stringify(p));
  },

  /** Czy skrypt Google jest starszy niż wersja 4 (nie robi streszczeń). */
  skryptStary() {
    return localStorage.getItem(Magazyn.klucz + '.skryptBezStreszczen') === '1';
  },

  /** Po synchronizacji: sprawdza wersję skryptu (raz na uruchomienie) i pobiera nowe streszczenia. */
  async pobierz() {
    if (this.trwa || !navigator.onLine || !Synchronizacja.skrypt()) return;
    this.trwa = true;
    const stary = this.skryptStary();
    try {
      if (!this.wersjaSprawdzona) {
        let wersja = 0;
        try { wersja = (await Synchronizacja.doSkryptu({ akcja: 'wersja' })).wersja || 0; }
        catch (e) { if (!/nieznana akcja/.test(e.message)) return; }   // brak sieci – spróbujemy później
        this.wersjaSprawdzona = true;
        if (wersja < 4) localStorage.setItem(Magazyn.klucz + '.skryptBezStreszczen', '1');
        else localStorage.removeItem(Magazyn.klucz + '.skryptBezStreszczen');
      }
      if (this.skryptStary()) return;
      const { streszczenia, teraz } = await Synchronizacja.doSkryptu({ akcja: 'streszczenia', od: this.pamiec().od || undefined });
      this.zapamietaj(streszczenia, teraz);
      if ((streszczenia || []).length) window.dispatchEvent(new Event('potok-odswiez'));
    } catch (e) {
      this.ostatniBlad = e.message;
    } finally {
      this.trwa = false;
      if (stary !== this.skryptStary() || this.ostatniBlad) window.dispatchEvent(new Event('potok-stan-synchronizacji'));
    }
  },

  /** Krótko do „Pliki”: ile gotowych, ile czeka, ile do ręcznego. */
  podsumowanie(wpisy) {
    if (this.skryptStary()) return 'Streszczenia: potrzebny skrypt Google w wersji 4 (ramka niżej).';
    const mapa = this.pamiec().mapa;
    const doZrobienia = wpisy.filter(w => (w.status === 'do_streszczenia' || w.status === 'szczegolowo') && w.url && /^https?:/i.test(w.url));
    const rodzaj = w => (w.status === 'szczegolowo' ? 'szczegolowe' : 'krotkie');
    const gotowe = doZrobienia.filter(w => mapa[w.id] && mapa[w.id][rodzaj(w)]).length;
    const reczne = doZrobienia.filter(w => mapa[w.id] && mapa[w.id].doRecznego && mapa[w.id].doRecznego[rodzaj(w)]).length;
    return `Streszczenia AI: gotowe ${gotowe} · do ręcznego ${reczne} · czekają ${doZrobienia.length - gotowe - reczne} (skrypt Google robi je co godzinę).`
      + (this.ostatniBlad ? ` Ostatni problem: ${this.ostatniBlad}` : '');
  },

  /** Tekst AI → bezpieczny HTML: akapity, listy „- ” i **pogrubienia**. */
  naHtml(tekst) {
    return this.esc(tekst).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>').replace(/\n/g, '<br>');
  },

  /** Ramka ze streszczeniem przy wpisie (na liście i w przeglądzie). Pusty tekst, gdy nie ma czego pokazać. */
  html(w) {
    const s = this.dla(w.id);
    const czeka = !this.skryptStary() && Synchronizacja.skrypt() && w.url && /^https?:/i.test(w.url);
    const esc = this.esc;
    const opis = r => `${esc(r.model || 'AI')}, ${esc(this.data(r.data))}`;
    const czesci = [];
    if (s && s.krotkie) czesci.push(`<div class="streszczenie"><div class="naglowek">Streszczenie <span>(${opis(s.krotkie)})</span></div><p>${this.naHtml(s.krotkie.tekst)}</p></div>`);
    if (s && s.szczegolowe) czesci.push(`<details class="streszczenie szczegolowe"${w.status === 'szczegolowo' ? ' open' : ''}><summary>Szczegółowe streszczenie <span>(${opis(s.szczegolowe)})</span></summary><p>${this.naHtml(s.szczegolowe.tekst)}</p></details>`);
    const rodzaj = w.status === 'szczegolowo' ? 'szczegolowe' : w.status === 'do_streszczenia' ? 'krotkie' : null;
    if (rodzaj && !(s && s[rodzaj])) {
      if (s && s.doRecznego && s.doRecznego[rodzaj]) czesci.push(`<p class="streszczenie-stan">✋ Do ręcznego streszczenia: ${esc(s.doRecznego[rodzaj])}</p>`);
      else if (czeka) czesci.push(`<p class="streszczenie-stan">⏳ ${rodzaj === 'szczegolowe' ? 'Szczegółowe streszczenie' : 'Streszczenie'} w kolejce (automat co godzinę)${s && s.problem ? ` · ostatnia próba: ${esc(s.problem)}` : ''}</p>`);
    }
    return czesci.join('');
  },
};
