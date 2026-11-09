/* =====================================================================
   import.js – zamiana dokumentu Potoku (z Google Docs) na wpisy.

   Jak wygląda obecny dokument (przeanalizowane na „Potok - od 10.2026”):
   - jeden akapit = jeden wpis; puste akapity pomijamy,
   - na początku często jest oznaczenie czynności, w różnych formach:
       "Streścić …", "(Streścić) …", "[Streścić] …", "Obczaić …",
       "-obczaić …", "Poeksplorować …"
   - albo kontekst: "(Claude-dom)", "[Praca]", "(Obsidian)", "XDDDD" itd.
   - link bywa: zwykłym tekstem, hiperłączem z tytułem zamiast adresu,
     albo w formacie Markdown [tytuł](adres),
   - w jednym akapicie bywa kilka linków (np. "… oraz …"),
   - część akapitów to notatki/zadania bez linku,
   - dokument nie zawiera dat dodania.

   Decyzje:
   - akapit z kilkoma linkami dzielimy na osobne wpisy (jeden link naraz),
     każdy zachowuje pełny oryginalny tekst akapitu,
   - akapit bez linku staje się notatką (url = null) – nic nie ginie,
   - oznaczenie czynności daje tylko SUGESTIĘ statusu; decyzję podejmujesz
     sam w przeglądzie,
   - data dodania = moment importu, z dopiskiem, że oryginalna jest nieznana.
   ===================================================================== */

const Import = {
  /** Plik .docx → tablica wpisów. */
  async zDocx(plik) {
    const bufor = await plik.arrayBuffer();
    const xmlDok  = await Zip.czytajPlik(bufor, 'word/document.xml');
    const xmlRels = await Zip.czytajPlik(bufor, 'word/_rels/document.xml.rels');
    if (!xmlDok) throw new Error('W pliku nie ma treści dokumentu Word.');

    const parser = new DOMParser();
    const dok  = parser.parseFromString(xmlDok, 'application/xml');
    const rels = xmlRels ? parser.parseFromString(xmlRels, 'application/xml') : null;

    // Mapa: identyfikator relacji (rId7) → adres hiperłącza.
    const adresy = {};
    if (rels) {
      for (const r of rels.getElementsByTagName('Relationship')) {
        if ((r.getAttribute('Type') || '').endsWith('/hyperlink')) {
          adresy[r.getAttribute('Id')] = r.getAttribute('Target');
        }
      }
    }

    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const akapity = [];

    for (const p of dok.getElementsByTagNameNS(W, 'p')) {
      const tekst = this.tekstElementu(p, W).trim();
      // Hiperłącza z Worda: adres + widoczny tekst (często tytuł strony).
      const linki = [];
      for (const h of p.getElementsByTagNameNS(W, 'hyperlink')) {
        const adres = adresy[h.getAttributeNS(R, 'id')];
        if (!adres) continue;
        const tytul = this.tekstElementu(h, W);
        // Google Docs potrafi pociąć jedno hiperłącze na kilka kawałków
        // z tym samym adresem – sklejamy ich tekst w jeden tytuł.
        const poprzedni = linki[linki.length - 1];
        if (poprzedni && poprzedni.url === adres) poprzedni.tytul += tytul;
        else linki.push({ url: adres, tytul });
      }
      for (const l of linki) l.tytul = l.tytul.replace(/\s+/g, ' ').trim();
      akapity.push({ tekst, linki });
    }
    return this.zAkapitow(akapity, 'import: ' + plik.name);
  },

  /** Zwykły tekst (.txt albo wklejony) → tablica wpisów. Jedna linia = akapit. */
  zTekstu(tekst, zrodlo) {
    const akapity = tekst.split(/\r?\n/).map(l => ({ tekst: l.trim(), linki: [] }));
    return this.zAkapitow(akapity, zrodlo);
  },

  /** Skleja tekst wszystkich przebiegów <w:t> w elemencie (tabulator = spacja). */
  tekstElementu(el, W) {
    let wynik = '';
    const idz = (n) => {
      for (const d of n.childNodes) {
        if (d.namespaceURI === W && d.localName === 't') wynik += d.textContent;
        else if (d.namespaceURI === W && (d.localName === 'tab' || d.localName === 'br')) wynik += ' ';
        else if (d.childNodes && d.childNodes.length) idz(d);
      }
    };
    idz(el);
    return wynik;
  },

  /** Wspólna część: akapity → wpisy. */
  zAkapitow(akapity, zrodlo) {
    const wpisy = [];
    const teraz = new Date();
    for (const a of akapity) {
      // Pomijamy tylko akapity puste / bez liter i cyfr (np. samotny cudzysłów).
      if (!/[\p{L}\p{N}]/u.test(a.tekst)) continue;

      const linki = this.znajdzLinki(a.tekst, a.linki);
      const sugestia = this.sugerujStatus(a.tekst);
      const wspolne = {
        tekst: a.tekst,
        zrodlo,
        sugestia,
        uwagaDaty: 'data importu – oryginalna data dodania nieznana',
        dodano: teraz.toISOString(),
      };

      if (linki.length === 0) {
        wpisy.push({ ...wspolne, url: null, tytul: a.tekst });
      } else {
        for (const l of linki) {
          const inneTytuly = linki.map(x => x.tytul).filter(Boolean);
          wpisy.push({ ...wspolne, url: l.url, tytul: l.tytul || this.tytulZTekstu(a.tekst, l.url, inneTytuly) });
        }
      }
    }
    return wpisy;
  },

  /**
   * Zbiera linki z akapitu: hiperłącza Worda, Markdown [tytuł](adres)
   * i gołe adresy w tekście. Usuwa duplikaty (Word potrafi podzielić jedno
   * hiperłącze na kilka kawałków z tym samym adresem).
   */
  znajdzLinki(tekst, linkiWorda) {
    const wynik = [];
    const widziane = new Set();
    const dodajLink = (url, tytul) => {
      url = url.replace(/[)\].,;]+$/, '');
      const klucz = url.replace(/\/$/, '');
      if (widziane.has(klucz)) {
        // Jeśli wcześniej był bez tytułu, a teraz mamy tytuł – uzupełnij.
        const ist = wynik.find(x => x.url.replace(/\/$/, '') === klucz);
        if (ist && !ist.tytul && tytul) ist.tytul = tytul;
        return;
      }
      widziane.add(klucz);
      wynik.push({ url, tytul });
    };

    // Markdown: [tytuł](adres "opcjonalny opis")
    for (const m of tekst.matchAll(/\[([^\]]+)\]\(((?:https?|file):\/\/[^\s)]+)[^)]*\)/g)) {
      dodajLink(m[2], m[1].replace(/\\\|/g, '|').trim());
    }
    // Hiperłącza Worda – tytuł tylko, jeśli widoczny tekst nie jest adresem.
    for (const l of linkiWorda) {
      dodajLink(l.url, /^(https?|file):\/\//.test(l.tytul) ? '' : l.tytul);
    }
    // Gołe adresy w tekście (http, https, file).
    for (const m of tekst.matchAll(/(?:https?|file):\/\/[^\s"“”<>\]]+/g)) {
      dodajLink(m[0], '');
    }
    return wynik;
  },

  /**
   * Sugestia statusu z oznaczenia czynności. Tylko podpowiedź!
   * Porównujemy bez polskich znaków i bez wielkości liter.
   */
  sugerujStatus(tekst) {
    const t = tekst.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
    // Muzyka: „muzyczki”, „muzyka”, „piosenka”, „utwór”.
    if (/muzycz|muzyk|piosenk|utwor/.test(t)) return 'muzyka';
    // Rozrywka: „XD”, „XDDDD” na początku wpisu.
    if (/^\W*x+d+\b/.test(t)) return 'smieszne';
    // Oznaczenie „(Obsidian)” / „[Obsidian]” albo „zapisać … obsidian”.
    if (/[(\[]\s*obsidian|zapisac.*obsidian/.test(t)) return 'obsidian';
    // „nie da się streścić” to nie jest prośba o streszczenie.
    if (/nie (da )?(sie )?(da )?strescic/.test(t)) return null;
    if (/strescic|streszcz/.test(t)) return 'do_streszczenia';
    if (/przeczytac|poczytac|doczytac|zglebic|obejrzec/.test(t)) return 'zglebic';
    if (/obczaic|obczajan|poeksplorowac|zapoznac/.test(t)) return 'obczaic';
    return null;
  },

  /**
   * Gdy link nie ma tytułu: tekst akapitu bez adresów, oznaczeń
   * i tytułów innych linków z tego akapitu. Jeśli nic sensownego
   * nie zostanie – opis z samego adresu (tytulZAdresu).
   */
  tytulZTekstu(tekst, url, inneTytuly = []) {
    let bez = tekst;
    for (const t of inneTytuly) bez = bez.split(t).join(' ');
    bez = bez
      .replace(/\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/(?:https?|file):\/\/\S+/g, '')
      .replace(/^[\s\-–]*(\(|\[)[^)\]]*(\)|\])\s*/, '')
      .replace(/^\s*(stre[sś]ci[cć]|obcza[ij][cć]?|poeksplorowa[cć])\s*:?\s*/i, '')
      .replace(/\boraz\b/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[\s:–-]+$/, '')
      .trim();
    if (bez.length >= 4 && !/^x+d+$/i.test(bez)) return bez;
    return this.tytulZAdresu(url);
  },

  /**
   * Czy tekst to same oznaczenia („Streścić”, „(Zgłębić)”, „XDDD”, „-dom”…),
   * a nie Twój opis. Wtedy przy dodawaniu tytuł pobierze się z internetu.
   */
  tylkoOznaczenia(tekst) {
    const slowa = (tekst || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(Boolean);
    return slowa.every(s => /^(strescic|obczaic?|zglebic|przeczytac|obejrzec|poeksplorowac|zapoznac|zapisac|do|w|na|obsidian|obsidiana|muzyczka|muzyczki|muzyka|smieszne|x+d+|dom|prywatne|claude|dla|zadanie)$/.test(s));
  },

  /**
   * Podpowiedź 🏠: oznaczenia „(Dom)”, „(Claude-dom)”, „-dom”, „prywatne”.
   */
  sugerujPrywatne(tekst) {
    const t = (tekst || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /\bdom\b|-dom\b|prywatn/.test(t);
  },

  /** Czy wpis jest „tylko prywatnie”: Twój wybór, a bez wyboru – podpowiedź z tekstu. */
  czyPrywatne(w) {
    return typeof w.prywatne === 'boolean' ? w.prywatne : this.sugerujPrywatne(w.tekst);
  },

  /** Czytelny opis z samego adresu, np. „YouTube · c9Rm-MGHu0c”, „plik: raport.pdf”. */
  tytulZAdresu(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'file:') return 'plik: ' + decodeURIComponent(u.pathname.split('/').pop());
      const host = u.hostname.replace(/^www\./, '');
      if (/youtube\.com$/.test(host) && u.searchParams.get('v')) return 'YouTube · ' + u.searchParams.get('v');
      if (host === 'youtu.be') return 'YouTube · ' + u.pathname.slice(1);
      if (/facebook\.com$/.test(host) && u.pathname.startsWith('/reel/')) return 'Facebook – rolka';
      const sciezka = decodeURIComponent(u.pathname).replace(/\/$/, '');
      return host + (sciezka.length > 1 ? sciezka : '');
    } catch { return url; }
  },
};
