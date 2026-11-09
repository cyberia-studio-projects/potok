/* =====================================================================
   app.js – interfejs Potoku.

   Widoki (zakładki u góry):
   - Przegląd: jeden wpis ze skrzynki naraz + 4 decyzje,
   - Listy: wszystkie wpisy wg statusu, z możliwością zmiany statusu,
   - Dodaj: ręczne dodanie linku (np. na komputerze w pracy),
   - Import / eksport: wczytanie dokumentu z Google Docs, pliki wyjściowe.
   ===================================================================== */

// Skrót do szukania elementów na stronie.
const $ = (sel) => document.querySelector(sel);

// Polski format daty, np. „8 lis 2026, 16:40”.
function ladnaData(iso) {
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Zabezpieczenie tekstu przed wstawieniem jako HTML.
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Krótki komunikat na dole ekranu.
function komunikat(tekst) {
  const el = $('#komunikat');
  el.textContent = tekst;
  el.hidden = false;
  clearTimeout(komunikat.t);
  komunikat.t = setTimeout(() => (el.hidden = true), 3500);
}

// Decyzje dostępne w przeglądzie (status → etykieta przycisku).
// Decyzje: Streścić / Obczaić / Zgłębić / Archiwum (znaczenia w magazyn.js).
const DECYZJE = ['do_streszczenia', 'obczaic', 'zglebic', 'obsidian', 'muzyka', 'smieszne', 'archiwum'].map(s => [s, STATUSY[s]]);
// Decyzje dla zadania / pomysłu (wpis bez linku albo „To zadanie →”).
const DECYZJE_ZADANIA = ['zrobic_claude', 'zrobic_sam', 'archiwum'].map(s => [s, STATUSY[s]]);
// Pełny wybór dla wpisu bez linku („Więcej wyborów →”): wszystko naraz.
const DECYZJE_WSZYSTKIE = ['do_streszczenia', 'obczaic', 'zglebic', 'obsidian', 'muzyka', 'smieszne',
  'zrobic_claude', 'zrobic_sam', 'archiwum'].map(s => [s, STATUSY[s]]);

/* ---------------------- 🏠 Tylko prywatnie ------------------------ */

// Na komputerze służbowym wpis z domkiem nie ma klikalnego linku.
function zablokowany(w) {
  return Magazyn.urzadzenie() === 'sluzbowe' && Import.czyPrywatne(w);
}

/* ------------------------- Przegląd ------------------------------- */

// Wpisy pominięte w tej sesji („Pomiń” nic nie zapisuje, tylko przesuwa dalej).
const pominiete = new Set();
// Ostatnia decyzja – do przycisku „Cofnij”.
let ostatnia = null;
// Który zestaw przycisków pokazuje bieżąca karta. Domyślnie: link → decyzje
// treściowe, bez linku → zadaniowe. Przycisk pod decyzjami przełącza zestaw.
let trybKarty = { id: null, przelaczony: false };

function pokazPrzeglad() {
  const skrzynka = Magazyn.wczytaj()
    .filter(w => w.status === 'skrzynka')
    .sort((a, b) => a.kolejnosc - b.kolejnosc);
  const doPokazania = skrzynka.filter(w => !pominiete.has(w.id));
  const w = doPokazania[0] || skrzynka[0]; // po przejściu wszystkich – od nowa
  const el = $('#widok-przeglad');

  $('#cofnij').hidden = !ostatnia;

  if (!w) {
    el.querySelector('.karta').innerHTML = `
      <p class="pusto">Skrzynka jest pusta. 🎉</p>
      <p class="pomoc">Nowe rzeczy dodasz w zakładce „Dodaj” albo zaimportujesz w „Pliki”.</p>`;
    $('#licznik').textContent = '';
    return;
  }
  if (!doPokazania.length) pominiete.clear();

  $('#licznik').textContent = `W skrzynce: ${skrzynka.length}`;
  // Podpowiedź liczona na bieżąco – wpisy zaimportowane starszą wersją
  // też dostają nowe podpowiedzi (np. „Śmieszne”).
  // Wpis bez linku to zadanie/pomysł – pokazujemy przyciski zadania.
  if (trybKarty.id !== w.id) trybKarty = { id: w.id, przelaczony: false };
  const p = trybKarty.przelaczony;
  //            link                        bez linku
  // domyślnie: 7 decyzji treściowych       3 zadaniowe
  // po kliku:  3 zadaniowe („To zadanie”)  wszystkie 9 („Więcej wyborów”)
  const przyciski = w.url ? (p ? DECYZJE_ZADANIA : DECYZJE) : (p ? DECYZJE_WSZYSTKIE : DECYZJE_ZADANIA);
  const etykietaPrzelacznika = w.url
    ? (p ? '← To jednak treść' : 'To zadanie →')
    : (p ? '← Mniej wyborów' : 'Więcej wyborów →');
  w.sugestia = Magazyn.statusZadania(w.tekst) || Import.sugerujStatus(w.tekst) || w.sugestia;
  const domena = w.url ? (() => { try { return new URL(w.url).hostname.replace(/^www\./, ''); } catch { return ''; } })() : '';

  el.querySelector('.karta').innerHTML = `
    <div class="data">Dodano: <strong>${esc(ladnaData(w.dodano))}</strong>
      ${w.uwagaDaty ? `<span class="uwaga">(${esc(w.uwagaDaty)})</span>` : ''}</div>
    <h2>${esc(w.tytul)}</h2>
    ${!w.url ? `<p class="notatka">Zadanie / pomysł (bez linku)</p>`
      : zablokowany(w) ? `<p class="link zablokowany">🏠 Otwórz w domu <span>${esc(domena)}</span></p>`
      : `<a class="link" href="${esc(w.url)}" target="_blank" rel="noopener">Otwórz ↗ <span>${esc(domena || w.url)}</span></a>`}
    ${w.tekst && w.tekst !== w.tytul ? `<p class="oryginal"><span>Oryginalny wpis:</span> ${esc(w.tekst)}</p>` : ''}
    ${w.sugestia && przyciski.some(([s]) => s === w.sugestia) ? `<p class="sugestia">Podpowiedź z oznaczenia w tekście: <strong>${esc(STATUSY[w.sugestia])}</strong></p>` : ''}
    <button class="prywatne ${Import.czyPrywatne(w) ? 'wlaczone' : ''}" data-prywatne="1" aria-pressed="${Import.czyPrywatne(w)}">
      🏠 Tylko prywatnie: <strong>${Import.czyPrywatne(w) ? 'TAK' : 'nie'}</strong>
    </button>
    <div class="decyzje">
      ${przyciski.map(([s, etykieta]) =>
        `<button data-status="${s}" class="${s === w.sugestia ? 'sugerowany' : ''}">${etykieta}</button>`).join('')}
    </div>
    <div class="drugorzedne">
      <button data-przelacz="1">${etykietaPrzelacznika}</button>
      <button data-pomin="1">Pomiń na razie →</button>
    </div>`;

  // Obsługa przycisków na karcie.
  el.querySelectorAll('[data-status]').forEach(b => b.onclick = () => {
    ostatnia = { id: w.id, poprzedni: w.status };
    Magazyn.zmienStatus(w.id, b.dataset.status);
    komunikat(`Przeniesiono do: ${STATUSY[b.dataset.status]}`);
    pokazPrzeglad();
  });
  el.querySelector('[data-pomin]').onclick = () => { pominiete.add(w.id); pokazPrzeglad(); };
  // Przełącznik 🏠 – zostajemy na tym samym wpisie.
  el.querySelector('[data-prywatne]').onclick = () => {
    Magazyn.ustawPrywatne(w.id, !Import.czyPrywatne(w));
    pokazPrzeglad();
  };
  // Przełącznik zestawu przycisków – nic nie zapisuje, decyzja dalej należy do Ciebie.
  el.querySelector('[data-przelacz]').onclick = () => {
    trybKarty = { id: w.id, przelaczony: !trybKarty.przelaczony };
    pokazPrzeglad();
  };
}

/* --------------------------- Listy -------------------------------- */

// Która lista jest otwarta w każdej z dwóch części aplikacji.
const aktywna = { potok: 'do_streszczenia', zadania: 'zrobic_claude' };

/**
 * Rysuje zakładki statusów i listę wpisów jednej części aplikacji.
 * Używane przez „Listy” (Potok) i „Do zrobienia” (zadania).
 *   czesc     – 'potok' albo 'zadania'
 *   grupa     – statusy tej części (GRUPA_POTOK / GRUPA_ZADANIA)
 *   cele      – statusy, do których można przesunąć wpis przyciskiem
 *   el        – { statusy, lista, szukaj } – elementy na stronie
 *   dodatki   – funkcja zwracająca dodatkowe przyciski dla wpisu (HTML)
 */
function rysujListy({ czesc, grupa, cele, el, dodatki = () => '' }) {
  const wpisy = Magazyn.wczytaj();
  const szukaj = el.szukaj ? (el.szukaj.value || '').toLowerCase() : '';

  // Podsumowanie: ile czego jest w całym Potoku.
  if (el.podsumowanie) {
    const ile = grupa => wpisy.filter(w => grupa.includes(w.status)).length;
    el.podsumowanie.textContent =
      `W skrzynce: ${ile(['skrzynka'])} · Potok: ${ile(GRUPA_POTOK) - ile(['skrzynka'])} · Zadania: ${ile(GRUPA_ZADANIA)} · Razem: ${wpisy.length}`;
  }

  // Zakładki statusów z licznikami.
  el.statusy.innerHTML = grupa.map(s => {
    const ile = wpisy.filter(w => w.status === s).length;
    return `<button data-lista="${s}" class="${s === aktywna[czesc] ? 'aktywny' : ''}">${esc(STATUSY[s])} <b>${ile}</b></button>`;
  }).join('');
  el.statusy.querySelectorAll('[data-lista]').forEach(b =>
    b.onclick = () => { aktywna[czesc] = b.dataset.lista; pokazWidok(czesc === 'potok' ? 'listy' : 'zadania'); });

  const lista = wpisy
    .filter(w => w.status === aktywna[czesc])
    .filter(w => !szukaj || (w.tytul + ' ' + w.tekst + ' ' + (w.url || '')).toLowerCase().includes(szukaj))
    .sort((a, b) => a.kolejnosc - b.kolejnosc);

  el.lista.innerHTML = lista.length ? lista.map(w => `
    <li>
      <div class="data">Dodano: ${esc(ladnaData(w.dodano))}</div>
      <div class="tytul">${Import.czyPrywatne(w) ? '🏠 ' : ''}${w.url && !zablokowany(w)
        ? `<a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.tytul)}</a>`
        : esc(w.tytul) + (w.url ? ' <span class="uwaga">(otwórz w domu)</span>' : '')}</div>
      ${ostatniaZmiana(w)}
      <div class="dalej">
        ${cele.filter(([s]) => s !== w.status).map(([s, n]) =>
          `<button data-id="${w.id}" data-na="${s}">→ ${esc(n)}</button>`).join('')}
        ${dodatki(w)}
        <button data-dom="${w.id}" class="${Import.czyPrywatne(w) ? 'wlaczone' : ''}" title="Tylko prywatnie">🏠</button>
      </div>
    </li>`).join('') : '<li class="pusto">Nic tu nie ma.</li>';

  el.lista.querySelectorAll('[data-dom]').forEach(b => b.onclick = () => {
    const w = wpisy.find(x => x.id === b.dataset.dom);
    Magazyn.ustawPrywatne(w.id, !Import.czyPrywatne(w));
    pokazWidok(czesc === 'potok' ? 'listy' : 'zadania');
  });

  // Przesunięcie wpisu, np. Streścić → Zgłębić po przeczytaniu streszczenia.
  el.lista.querySelectorAll('[data-na]').forEach(b => b.onclick = () => {
    Magazyn.zmienStatus(b.dataset.id, b.dataset.na);
    komunikat(`Przeniesiono do: ${STATUSY[b.dataset.na]}`);
    pokazWidok(czesc === 'potok' ? 'listy' : 'zadania');
  });
}

function pokazListy() {
  rysujListy({
    czesc: 'potok',
    grupa: GRUPA_POTOK,
    cele: DECYZJE,
    el: { statusy: $('#statusy'), lista: $('#lista'), szukaj: $('#szukaj'), podsumowanie: $('#podsumowanie-listy') },
  });
}

/* ------------------------ Do zrobienia ---------------------------- */

function pokazZadania() {
  rysujListy({
    czesc: 'zadania',
    grupa: GRUPA_ZADANIA,
    cele: [...GRUPA_ZADANIA.map(s => [s, STATUSY[s]]), ['skrzynka', 'Potok']],
    el: { statusy: $('#zadania-statusy'), lista: $('#zadania-lista'), podsumowanie: $('#podsumowanie-zadan') },
    // Pomysły dla Claude'a da się skopiować i wkleić prosto do rozmowy.
    dodatki: w => w.status === 'zrobic_claude' ? `<button data-kopiuj="${w.id}">Kopiuj</button>` : '',
  });
  $('#zadania-lista').querySelectorAll('[data-kopiuj]').forEach(b => b.onclick = async () => {
    const w = Magazyn.wczytaj().find(x => x.id === b.dataset.kopiuj);
    try { await navigator.clipboard.writeText(w.tekst); komunikat('Skopiowano – wklej w rozmowę z Claude.'); }
    catch { komunikat('Przeglądarka nie pozwoliła skopiować.'); }
  });
}

// Krótka informacja, skąd wpis przyszedł do tej listy, np. „Streścić → Zgłębić, 8 lis 2026”.
function ostatniaZmiana(w) {
  const historia = w.historia || [];
  const h = historia[historia.length - 1];
  if (!h || h.z === 'skrzynka') return '';
  return `<div class="data">${esc(STATUSY[h.z] || h.z)} → ${esc(STATUSY[h.na] || h.na)}, ${esc(ladnaData(h.data))}</div>`;
}

/* --------------------------- Dodaj -------------------------------- */

function dodajRecznie(url, opis, zrodlo) {
  url = (url || '').trim();
  opis = (opis || '').trim();
  if (!url && !opis) return komunikat('Wpisz link albo opis.');
  const tekst = [opis, url].filter(Boolean).join(' ');
  const { dodane } = Magazyn.dodaj([{
    url: url || null,
    tytul: opis || url,
    tekst,
    zrodlo,
    sugestia: Import.sugerujStatus(opis),
  }]);
  komunikat(dodane ? 'Dodano do skrzynki.' : 'Ten wpis już jest w Potoku.');
}

/* ------------------------ Nawigacja ------------------------------- */

function pokazWidok(nazwa) {
  document.querySelectorAll('.widok').forEach(w => (w.hidden = w.id !== 'widok-' + nazwa));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('aktywny', b.dataset.widok === nazwa));
  if (nazwa === 'przeglad') pokazPrzeglad();
  if (nazwa === 'listy') pokazListy();
  if (nazwa === 'zadania') pokazZadania();
  if (nazwa === 'eksport') pokazStanEksportu();
}

function pokazUrzadzenie() {
  const r = Magazyn.urzadzenie();
  document.querySelectorAll('[data-urzadzenie]').forEach(b =>
    b.classList.toggle('aktywny', b.dataset.urzadzenie === r));
  $('#znak-urzadzenia').textContent = r === 'sluzbowe' ? '💼 służbowy' : '';
}

function pokazStanEksportu() {
  const wpisy = Magazyn.wczytaj();
  const { www, reszta } = Eksport.kolejkaStreszczen(wpisy);
  $('#stan-streszczen').textContent =
    `W kolejce: ${www.length} adresów www` + (reszta.length ? ` + ${reszta.length} do dodania ręcznie (lokalne pliki / notatki).` : '.');
  $('#stan-calosci').textContent = `Wszystkich wpisów: ${wpisy.length}.`;
}

/* ------------------------- Start ---------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => pokazWidok(b.dataset.widok));

  $('#cofnij').onclick = () => {
    if (!ostatnia) return;
    Magazyn.zmienStatus(ostatnia.id, ostatnia.poprzedni);
    ostatnia = null;
    komunikat('Cofnięto ostatnią decyzję.');
    pokazPrzeglad();
  };

  $('#szukaj').oninput = pokazListy;

  document.querySelectorAll('[data-urzadzenie]').forEach(b => b.onclick = () => {
    Magazyn.ustawUrzadzenie(b.dataset.urzadzenie);
    pokazUrzadzenie();
    komunikat(b.dataset.urzadzenie === 'sluzbowe'
      ? 'Ustawiono: komputer służbowy – wpisy z 🏠 nie otworzą się tutaj.'
      : 'Ustawiono: prywatne urządzenie.');
  });
  pokazUrzadzenie();

  $('#form-dodaj').onsubmit = (e) => {
    e.preventDefault();
    dodajRecznie($('#nowy-url').value, $('#nowy-opis').value, 'ręcznie');
    e.target.reset();
  };

  // Import pliku .docx / .txt
  $('#plik-import').onchange = async (e) => {
    const plik = e.target.files[0];
    if (!plik) return;
    try {
      const nowe = /\.docx$/i.test(plik.name)
        ? await Import.zDocx(plik)
        : Import.zTekstu(await plik.text(), 'import: ' + plik.name);
      const { dodane, pominiete } = Magazyn.dodaj(nowe);
      $('#wynik-importu').textContent =
        `Zaimportowano ${dodane} wpisów` + (pominiete ? `, pominięto ${pominiete} już istniejących` : '') + '.';
    } catch (err) {
      $('#wynik-importu').textContent = 'Błąd importu: ' + err.message;
    }
    e.target.value = '';
    pokazStanEksportu();
  };

  // Eksport kolejki streszczeń
  $('#eksport-streszczen').onclick = () => {
    const { tekst, www } = Eksport.kolejkaStreszczen(Magazyn.wczytaj());
    if (!www.length) return komunikat('Kolejka „Streścić” jest pusta.');
    Eksport.pobierz(`do-streszczenia-${Eksport.dzien()}.txt`, tekst);
  };
  $('#kopiuj-streszczenia').onclick = async () => {
    const { tekst, www } = Eksport.kolejkaStreszczen(Magazyn.wczytaj());
    if (!www.length) return komunikat('Kolejka „Streścić” jest pusta.');
    try { await navigator.clipboard.writeText(tekst); komunikat(`Skopiowano ${www.length} adresów.`); }
    catch { komunikat('Przeglądarka nie pozwoliła skopiować – użyj pobierania pliku.'); }
  };
  $('#eksport-md').onclick = () =>
    Eksport.pobierz(`Potok-${Eksport.dzien()}.md`, Eksport.markdown(Magazyn.wczytaj()), 'text/markdown');
  // Tylko lista „Zapisać do Obsidian” – do wrzucenia prosto do skarbca.
  $('#eksport-obsidian').onclick = () => {
    const lista = Magazyn.wczytaj().filter(w => w.status === 'obsidian');
    if (!lista.length) return komunikat('Lista „Zapisać do Obsidian” jest pusta.');
    Eksport.pobierz(`Do-Obsidiana-${Eksport.dzien()}.md`, Eksport.markdown(lista), 'text/markdown');
  };
  $('#eksport-json').onclick = () =>
    Eksport.pobierz(`Potok-kopia-${Eksport.dzien()}.json`, Magazyn.kopiaJSON(), 'application/json');
  $('#plik-kopia').onchange = async (e) => {
    const plik = e.target.files[0];
    if (!plik) return;
    try { komunikat(`Przywrócono ${Magazyn.przywrocKopie(await plik.text())} brakujących wpisów.`); }
    catch (err) { komunikat('Błąd kopii: ' + err.message); }
    e.target.value = '';
    pokazStanEksportu();
  };

  // „Udostępnij → Potok” na Androidzie: system otwiera aplikację z adresem
  // w parametrach (?url=…&title=…&text=…), patrz share_target w manifeście.
  const par = new URLSearchParams(location.search);
  if (par.has('udostepnij')) {
    const tekst = par.get('text') || '';
    const url = par.get('url') || (tekst.match(/https?:\/\/\S+/) || [''])[0];
    const tytul = par.get('title') || tekst.replace(url, '').trim();
    dodajRecznie(url, tytul, 'udostępnij');
    history.replaceState(null, '', location.pathname);
  }

  // Service worker = działanie offline. Działa tylko z adresu http(s),
  // przy otwarciu pliku z dysku (file://) po prostu go pomijamy.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js');
  }

  pokazWidok(Magazyn.wczytaj().length ? 'przeglad' : 'eksport');
});
