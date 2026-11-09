/* =====================================================================
   synchronizacja.js – zapis Potoku na Twoim Google Drive.

   Jak to działa:
   - na Drive jest folder „Potok”, a w nim jeden plik „Potok.json”
     z wszystkimi wpisami (ten sam format co kopia zapasowa),
   - aplikacja ma dostęp TYLKO do plików, które sama utworzyła
     (uprawnienie drive.file) – nie widzi reszty Twojego Drive,
   - każde urządzenie pracuje na swojej kopii (działa bez internetu),
     a synchronizacja łączy ją z plikiem na Drive:
       1. pobiera plik z Drive,
       2. łączy wpisy (funkcja scal – nic nie ginie),
       3. zapisuje wynik u siebie i z powrotem na Drive,
   - synchronizacja rusza sama: przy otwarciu aplikacji, chwilę po każdej
     zmianie i gdy wraca internet. Bez internetu zmiany czekają w kolejce
     („do wysłania”) – nic nie trzeba pamiętać.

   Logowanie: biblioteka Google Identity Services (skrypt z accounts.google.com).
   Daje „token” ważny ok. godziny; po wygaśnięciu wystarczy jedno kliknięcie
   w znaczek ☁ u góry.
   ===================================================================== */

// Client ID z Google Cloud (nie jest tajny). Testy mogą go podmienić.
window.USTAWIENIA = window.USTAWIENIA || {
  googleClientId: '',
};

const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ZAKRES = 'https://www.googleapis.com/auth/drive.file';

const Synchronizacja = {
  // Aktualny stan, pokazywany w znaczku ☁ u góry ekranu.
  stan: 'niepolaczone',   // niepolaczone | offline | czeka | trwa | zapisane | zaloguj | blad
  ostatnio: null,         // czas ostatniej udanej synchronizacji
  blad: '',

  /* ---------------- Łączenie danych (bez sieci, testowane) -------- */

  /** Kiedy wpis zmienił się ostatnio (do wyboru nowszej wersji). */
  czasZmiany(w) {
    const h = (w.historia || [])[(w.historia || []).length - 1];
    return w.zmieniono || (h && h.data) || w.dodano || '';
  },

  /**
   * Łączy wpisy z tego urządzenia (lokalne) z wpisami z Drive (zdalne).
   * Zasady:
   *  - wpis, który jest tylko po jednej stronie, zostaje (nic nie ginie),
   *  - gdy wpis jest po obu stronach: wygrywa nowsza wersja (czasZmiany),
   *    a historie zmian z obu stron są sklejane – historia też nie ginie.
   * Zwraca { wpisy, inneNizZdalne } – czy trzeba wysłać wynik na Drive.
   */
  scal(lokalne, zdalne) {
    const wynik = new Map();
    for (const w of zdalne) wynik.set(w.id, w);
    for (const l of lokalne) {
      const z = wynik.get(l.id);
      if (!z) { wynik.set(l.id, l); continue; }
      const nowszy = this.czasZmiany(l) >= this.czasZmiany(z) ? l : z;
      // Sklejenie historii (bez powtórzeń), posortowane po dacie.
      const widziane = new Set();
      const historia = [...(z.historia || []), ...(l.historia || [])]
        .filter(h => { const k = h.data + '|' + h.z + '|' + h.na; if (widziane.has(k)) return false; widziane.add(k); return true; })
        .sort((a, b) => a.data.localeCompare(b.data));
      wynik.set(l.id, { ...nowszy, historia });
    }
    const wpisy = [...wynik.values()].sort((a, b) =>
      (a.kolejnosc - b.kolejnosc) || String(a.dodano).localeCompare(String(b.dodano)));
    const inneNizZdalne = JSON.stringify(wpisy) !== JSON.stringify(
      [...zdalne].sort((a, b) => (a.kolejnosc - b.kolejnosc) || String(a.dodano).localeCompare(String(b.dodano))));
    return { wpisy, inneNizZdalne };
  },

  /* ---------------- Logowanie Google ------------------------------ */

  dostepne() {
    return !!window.USTAWIENIA.googleClientId;
  },

  /** Token zapisany na tym urządzeniu (jeśli jeszcze ważny). */
  token() {
    try {
      const t = JSON.parse(localStorage.getItem(Magazyn.klucz + '.token') || 'null');
      return t && t.wygasa > Date.now() + 60000 ? t.token : null;
    } catch { return null; }
  },

  /** Czy kiedyś połączono to urządzenie z Drive. */
  polaczone() {
    return localStorage.getItem(Magazyn.klucz + '.drive') === '1';
  },

  /**
   * Logowanie do Google – wywoływane kliknięciem (przeglądarki blokują
   * okienka logowania otwierane bez kliknięcia). Po sukcesie: synchronizacja.
   */
  zaloguj() {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      this.ustawStan('blad', 'Brak połączenia z Google – sprawdź internet i odśwież stronę.');
      return;
    }
    const klient = google.accounts.oauth2.initTokenClient({
      client_id: window.USTAWIENIA.googleClientId,
      scope: ZAKRES,
      callback: (odp) => {
        if (odp.error) { this.ustawStan('blad', 'Logowanie przerwane: ' + odp.error); return; }
        localStorage.setItem(Magazyn.klucz + '.token', JSON.stringify({
          token: odp.access_token,
          wygasa: Date.now() + (Number(odp.expires_in) || 3600) * 1000,
        }));
        localStorage.setItem(Magazyn.klucz + '.drive', '1');
        this.synchronizuj();
      },
    });
    // prompt: '' – jeśli już kiedyś się zgodziłeś, okienko zamknie się samo.
    klient.requestAccessToken({ prompt: this.polaczone() ? '' : 'consent' });
  },

  /* ---------------- Google Drive: pliki --------------------------- */

  /** Zapytanie do Drive z tokenem. Błąd 401 = token wygasł. */
  async api(url, opcje = {}) {
    const odp = await fetch(url, {
      ...opcje,
      headers: { Authorization: 'Bearer ' + this.token(), ...(opcje.headers || {}) },
    });
    if (odp.status === 401) {
      localStorage.removeItem(Magazyn.klucz + '.token');
      throw Object.assign(new Error('Sesja Google wygasła.'), { zaloguj: true });
    }
    if (!odp.ok) throw new Error('Google Drive odpowiedział błędem ' + odp.status);
    return odp;
  },

  /** Szuka pliku/folderu utworzonego przez Potok. Zwraca id albo null. */
  async znajdz(zapytanie) {
    const q = encodeURIComponent(zapytanie + ' and trashed=false');
    const odp = await this.api(`${DRIVE}/files?q=${q}&fields=files(id,name)&spaces=drive`);
    const dane = await odp.json();
    return dane.files && dane.files.length ? dane.files[0].id : null;
  },

  /** Zwraca id pliku Potok.json (tworzy folder i plik, jeśli ich nie ma). */
  async idPliku() {
    const zapamietane = localStorage.getItem(Magazyn.klucz + '.plikId');
    if (zapamietane) return zapamietane;

    let folder = await this.znajdz("name='Potok' and mimeType='application/vnd.google-apps.folder'");
    if (!folder) {
      const odp = await this.api(`${DRIVE}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Potok', mimeType: 'application/vnd.google-apps.folder' }),
      });
      folder = (await odp.json()).id;
    }
    let plik = await this.znajdz(`name='Potok.json' and '${folder}' in parents`);
    if (!plik) {
      const odp = await this.api(`${DRIVE}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Potok.json', parents: [folder], mimeType: 'application/json' }),
      });
      plik = (await odp.json()).id;
      await this.wyslij(plik, []);   // pusty plik na start
    }
    localStorage.setItem(Magazyn.klucz + '.plikId', plik);
    return plik;
  },

  async pobierz(id) {
    const odp = await this.api(`${DRIVE}/files/${id}?alt=media`);
    const tekst = await odp.text();
    if (!tekst.trim()) return [];
    return JSON.parse(tekst).wpisy || [];
  },

  async wyslij(id, wpisy) {
    await this.api(`${DRIVE_UPLOAD}/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wersja: 1, zapisano: new Date().toISOString(), wpisy }, null, 1),
    });
  },

  /* ---------------- Synchronizacja -------------------------------- */

  /** Pobiera z Drive, łączy, zapisuje u siebie i na Drive. */
  async synchronizuj() {
    if (!this.dostepne()) return this.ustawStan('niepolaczone');
    if (!navigator.onLine) return this.ustawStan('offline');
    if (!this.token()) return this.ustawStan(this.polaczone() ? 'zaloguj' : 'niepolaczone');
    if (this.trwa) { this.ponow = true; return; }   // jedna synchronizacja naraz

    this.trwa = true;
    this.ustawStan('trwa');
    try {
      const id = await this.idPliku();
      const zdalne = await this.pobierz(id);
      const lokalne = Magazyn.wczytaj();
      const { wpisy, inneNizZdalne } = this.scal(lokalne, zdalne);
      Magazyn.zapisz(wpisy, false);               // u siebie, bez oznaczania „do wysłania”
      if (inneNizZdalne) await this.wyslij(id, wpisy);
      Magazyn.wyslano();
      this.ostatnio = new Date();
      this.ustawStan('zapisane');
      window.dispatchEvent(new Event('potok-odswiez'));   // ekran pokaże nowe dane
    } catch (e) {
      console.error('Synchronizacja', e);
      if (e.zaloguj) this.ustawStan('zaloguj');
      else if (!navigator.onLine) this.ustawStan('offline');
      else {
        // Plik mógł zostać usunięty z Drive – następnym razem utworzymy nowy.
        localStorage.removeItem(Magazyn.klucz + '.plikId');
        this.ustawStan('blad', e.message);
      }
    } finally {
      this.trwa = false;
      if (this.ponow) { this.ponow = false; this.synchronizuj(); }
    }
  },

  /** Ustawia stan i odświeża znaczek ☁. */
  ustawStan(stan, blad = '') {
    this.stan = stan;
    this.blad = blad;
    if (stan === 'zapisane' && Magazyn.czekaNaWyslanie()) this.stan = 'czeka';
    window.dispatchEvent(new Event('potok-stan-synchronizacji'));
  },

  /** Tekst znaczka ☁ u góry ekranu. */
  opisStanu() {
    const czas = this.ostatnio ? this.ostatnio.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';
    switch (this.stan) {
      case 'trwa':      return '☁ synchronizuję…';
      case 'zapisane':  return `☁ zapisane ${czas}`;
      case 'czeka':     return '☁ czeka na wysłanie';
      case 'offline':   return Magazyn.czekaNaWyslanie() ? '☁ bez internetu – wyślę później' : '☁ bez internetu';
      case 'zaloguj':   return '☁ kliknij, aby zsynchronizować';
      case 'blad':      return '☁ błąd – kliknij, aby ponowić';
      default:          return this.dostepne() ? '☁ połącz z Google Drive' : '';
    }
  },

  /* ---------------- Start ----------------------------------------- */

  /** Podpina automatyczną synchronizację. Wywoływane raz przy starcie. */
  start() {
    // Chwilę po każdej zmianie (zbieramy kilka kliknięć w jedno wysłanie).
    window.addEventListener('potok-zmiana', () => {
      clearTimeout(this.odczekaj);
      this.ustawStan(navigator.onLine ? 'czeka' : 'offline');
      this.odczekaj = setTimeout(() => this.synchronizuj(), 1500);
    });
    // Gdy wraca internet – wysyłamy to, co czekało.
    window.addEventListener('online', () => this.synchronizuj());
    window.addEventListener('offline', () => this.ustawStan('offline'));
    // Gdy wracasz do karty z aplikacją – pobieramy zmiany z innych urządzeń.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.synchronizuj();
    });
    this.synchronizuj();
  },
};
