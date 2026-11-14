/* =====================================================================
   eksport.js – tworzenie plików do pobrania.
   - kolejka „Streścić” → jeden plik .txt z adresami (do NotebookLM),
   - cały Potok → plik .md do Obsidiana,
   - kopia zapasowa → .json.
   ===================================================================== */

const Eksport = {
  /** Data w formacie RRRR-MM-DD (do nazw plików i do .md). */
  dzien(iso) {
    const d = iso ? new Date(iso) : new Date();
    const dwa = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dwa(d.getMonth() + 1)}-${dwa(d.getDate())}`;
  },

  /** Pobiera tekst jako plik (działa w przeglądarce, bez serwera). */
  pobierz(nazwa, tekst, typ = 'text/plain') {
    const blob = new Blob([tekst], { type: typ + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nazwa;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  /**
   * Kolejka do streszczenia. NotebookLM przyjmuje wklejoną listę adresów
   * (Dodaj źródło → Witryna / YouTube), więc plik zawiera same adresy
   * http(s), po jednym w linii. Lokalne pliki (file://) i notatki bez linku
   * trzeba dodać ręcznie – zwracamy je osobno, żeby było widać, co zostało.
   */
  kolejkaStreszczen(wpisy) {
    const kolejka = wpisy.filter(w => w.status === 'do_streszczenia');
    const www = kolejka.filter(w => w.url && /^https?:/.test(w.url));
    const reszta = kolejka.filter(w => !w.url || !/^https?:/.test(w.url));
    return { tekst: www.map(w => w.url).join('\n') + '\n', www, reszta };
  },

  /** Cały Potok jako jeden plik Markdown, pogrupowany po statusach. */
  markdown(wpisy) {
    const linie = [
      '---',
      `eksport: ${this.dzien()}`,
      'zrodlo: Potok',
      '---',
      '',
      '# Potok',
      '',
    ];
    for (const [status, nazwa] of Object.entries(STATUSY)) {
      const grupa = wpisy.filter(w => w.status === status);
      if (!grupa.length) continue;
      linie.push(`## ${nazwa} (${grupa.length})`, '');
      for (const w of grupa) {
        const tytul = (w.tytul || '').replace(/[\[\]]/g, '');
        const glowna = w.url ? `[${tytul}](${w.url})` : tytul;
        const dom = Import.czyPrywatne(w) ? ' · 🏠 prywatne' : '';
        linie.push(`- ${glowna} · dodano ${this.dzien(w.dodano)}${dom}`);
        // Oryginalny wpis dopisujemy, jeśli różni się od tytułu.
        if (w.tekst && w.tekst !== w.tytul) linie.push(`  - oryginalnie: ${w.tekst}`);
        // Streszczenia AI (jeśli są) – żeby trafiły do Obsidiana razem z linkiem.
        const s = typeof Streszczenia !== 'undefined' && Streszczenia.dla(w.id);
        if (s && s.krotkie) linie.push(`  - streszczenie: ${s.krotkie.tekst.replace(/\s*\n\s*/g, ' ')}`);
        if (s && s.szczegolowe) linie.push('  - szczegółowe streszczenie:', ...s.szczegolowe.tekst.split('\n').map(l => '    ' + l));
      }
      linie.push('');
    }
    return linie.join('\n');
  },
};
