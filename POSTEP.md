# Potok – postęp prac i decyzje

## 9.11.2026 – „Streszczone” jednym kliknięciem
- Po pobraniu pliku / skopiowaniu adresów Potok pamięta (na tym urządzeniu), które wpisy wysłano do NotebookLM. W Pliki → Kolejka „Streścić” pojawia się przycisk „Streszczone – przenieś N wysłanych do Archiwum”, z potwierdzeniem i „Cofnij”.
- Przenosi tylko te wysłane, które dalej są w „Streścić”: przesunięte wcześniej do „Zgłębić” i dodane po wysłaniu zostają. Test 8c w e2e.js.

## 9.11.2026 – kolejka „Streścić”: które wpisy ręcznie
- Pytanie: „Streścić 25”, a w pliku 20 adresów. Odpowiedź: 5 to pliki z dysku (file://) lub notatki bez linku, których NotebookLM nie pobierze z adresu. Teraz pod licznikiem jest rozwijana lista tych wpisów (z nazwą/ścieżką pliku). Test w e2e.js sprawdza, że www + ręczne = lista „Streścić”.
- Usuwanie z Archiwum: na razie zostaje jak jest (nic nie usuwamy).

## 9.11.2026 – tytuł i autor linków (YouTube, strony, Facebook na ile się da)
- Prośba: link udostępniony z YouTube zapisywał się jako goły adres. Tytuł i autor przyspieszają segregację.
- Skrypt Google w wersji 2 ma akcję „opis”. Dla YouTube używa oficjalnego oEmbed, dla innych stron czyta og:title / <title>. Facebook zwykle wymaga logowania, więc tam tytuł bywa pusty.
- Aplikacja (`js/opisy.js`) po każdej synchronizacji uzupełnia w tle wpisy z tytułem „z automatu” (goły adres, „YouTube · id”), jeden link naraz. Twoje własne opisy i oryginalny tekst się nie zmieniają. Pod tytułem widać autora, na karcie i na liście; wyszukiwarka szuka też po autorze.
- Opis nie zmienia „zmieniono”, a scalanie przenosi go osobno, więc pobrany tytuł nie nadpisze decyzji z innego urządzenia.
- Stary skrypt: Pliki → Google Drive pokazują ramkę „Zaktualizuj skrypt Google” z nowym skryptem (ten sam klucz) i 4 krokami (Zarządzaj wdrożeniami → Nowa wersja; adres się nie zmienia).
- Testy: 3 nowe w testy.js, „opis” w test-skryptu.js (YouTube, og:title z apostrofami i encjami, Facebook-logowanie, 404, brak sieci), krok 9 w e2e-drive.js (stary skrypt → ramka; nowy → tytuł i autor, też na Drive).

## 9.11.2026 – poprawka „Udostępnij → Potok”
- Błąd: udostępnienie z YouTube na Androidzie nic nie dodawało. Chrome przy share_target typu GET zastępuje parametry z adresu „action”, więc znikało nasze `udostepnij=1`.
- Poprawka: udostępnienie rozpoznajemy po samych parametrach title/text/url. Nowy test e2e odtwarza adres taki, jak buduje go Chrome.
- Telefon połączony z Drive kodem połączenia – działa (90 wpisów).
- Telefon mógł trzymać starą wersję do 10 minut (pamięć przeglądarki przy GitHub Pages). Service worker pyta teraz zawsze serwer (`cache: 'no-cache'`). Na dole „Pliki” jest numer wersji i ślad ostatniego udostępnienia.
- Nowy test `testy/e2e-offline.js`: aplikacja z adresu http z service workerem, bez internetu się otwiera, a udostępnienie bez sieci dodaje wpis.

## 9.11.2026 – Drive przez skrypt Google (decyzja)
- Google Cloud wymaga weryfikacji dwuetapowej, a nie chcę telefonu ani PIN-u w Windowsie. **Wybrałem skrypt Google** (bez Google Cloud).
- Jak to działa: krótki skrypt `skrypt-google/Kod.gs` wklejasz raz na script.google.com i wdrażasz jako „Aplikacja internetowa” (Wykonuj jako: Ja, Dostęp: Każdy). Skrypt odpowiada tylko na zapytania z Twoim tajnym kluczem (32 znaki, wygenerowany przez aplikację) i zapisuje wyłącznie `Potok/Potok.json`.
- Konfiguracja w aplikacji: **Pliki → Google Drive** (5 kroków z instrukcją). Na drugim urządzeniu wklejasz **kod połączenia** (adres#klucz) z pierwszego.
- Zaleta: bez logowania co godzinę. Ryzyko: kto zna kod połączenia, ma dostęp do Potok.json. Dlatego kodu nie wysyłaj nikomu, a w razie wycieku wdróż skrypt z nowym kluczem.
- „Odłącz to urządzenie” nie usuwa wpisów.
- Testy: `testy/test-skryptu.js` (skrypt na udawanym Google: klucz, plik, zapis/odczyt, polskie znaki, blokada) + `e2e-drive.js` przechodzi cały scenariusz w obu trybach (skrypt i Google Cloud).
- Sposób przez Google Cloud (Client ID) zostaje w kodzie jako alternatywa, nieużywana.

## 9.11.2026 – synchronizacja z Google Drive (krok 2b)
- **Gotowe w kodzie** (`js/synchronizacja.js`). Włączy się po wpisaniu Client ID z Google Cloud w `window.USTAWIENIA.googleClientId`. Bez niego znaczek ☁ jest ukryty i aplikacja działa jak dotąd.
- Dane: folder **Potok** → plik **Potok.json** na Twoim Drive. Uprawnienie `drive.file`, więc aplikacja widzi tylko pliki, które sama utworzyła.
- Łączenie urządzeń: wpis z jednej strony zostaje zawsze, przy konflikcie wygrywa nowsza zmiana (pole `zmieniono`), a historie z obu stron są sklejane. Nic nie ginie, data dodania się nie zmienia.
- Automatycznie: przy otwarciu, 1,5 s po każdej zmianie, po powrocie internetu i po powrocie do karty. Bez internetu zmiany czekają w kolejce („do wysłania”).
- Znaczek **☁** u góry pokazuje stan: zapisane HH:MM / czeka na wysłanie / bez internetu – wyślę później / kliknij, aby zsynchronizować (sesja Google trwa ok. 1 h, potem jedno kliknięcie).
- Testy: 48 w przeglądarce + `testy/e2e-drive.js` – dwa urządzenia na udawanym Drive, decyzja bez internetu, powrót sieci, równoczesne dodanie, wygasła sesja.
- Google Cloud wymaga weryfikacji dwuetapowej. Można ją włączyć kluczem dostępu (Windows Hello), bez numeru telefonu.

## 9.11.2026 – Potok pod adresem https (krok 2a)
- Adres: **https://cyberia-studio-projects.github.io/potok/** (repozytorium: github.com/cyberia-studio-projects/potok, publiczne – tylko kod).
- Do repozytorium NIE trafiają: Twoje pliki .docx, zrzuty ekranu, kopie .json (plik `.gitignore`). Testy używają zmyślonego `testy/przyklad.docx`.
- Przy każdej zmianie GitHub uruchamia testy (w przeglądarce + „jak człowiek”). Strona publikuje się tylko wtedy, gdy przejdą (`.github/workflows/testy-i-strona.yml`; tego pliku nie ma w folderze na dysku, jest tylko w repozytorium).
- Uwaga: dane w przeglądarce są osobne dla każdego adresu. Wersja z pliku `index.html` i wersja z adresu https mają osobne wpisy. Żeby przenieść wpisy, użyj kopii .json (Pliki → Pobierz kopię → na stronie https: Przywróć z kopii) albo zaimportuj dokument ponownie.
- Następny krok (2b): zapis na Google Drive.

## 8.11.2026 (noc, 2) – „Więcej wyborów” dla wpisu bez linku
- Wpis bez linku pokazuje najpierw 3 przyciski (Dla Claude'a / Zrobię sam / Archiwum). Przycisk **„Więcej wyborów →”** rozwija wszystkie 9 decyzji (Streścić, Obczaić, Zgłębić, Obsidian, Muzyczki, Śmieszne, Dla Claude'a, Zrobię sam, Archiwum). „← Mniej wyborów” wraca do 3.
- Dla linku działa to tak samo jak wcześniej: „To zadanie →” i „← To jednak treść”.
- Ramka z podpowiedzią pokazuje się tylko wtedy, gdy podpowiadany przycisk jest widoczny.

## 8.11.2026 (noc) – ZASADA: zapis bez decyzji, decyzja w przeglądzie
- **Dlaczego:** zapisuję szybko, żeby nie obciążać głowy. Nie chcę przy zapisie pisać nawiasów ani decydować, co z tym zrobić. Decyzja przychodzi później, kiedy mam czas.
- **Zmiana:** *wszystko* trafia do skrzynki, także wpisy bez linku. Nie ma już automatycznego sortowania do „Zadań” (to zastępuje regułę z sekcji „wieczór, 2”).
- W przeglądzie wpis bez linku ma przyciski zadaniowe: **Dla Claude'a / Zrobię sam / Archiwum**. Link ma 7 decyzji treściowych oraz przycisk **„To zadanie →”**, który przełącza na przyciski zadaniowe („← To jednak treść” wraca).
- Oznaczenia w tekście, np. „(Claude…)”, tylko podświetlają podpowiadany przycisk. Bez oznaczenia nic nie jest podpowiadane.
- Wpisy przeniesione wcześniej automatycznie (bez Twojej decyzji) wróciły do skrzynki. Wpisy, które przesunąłeś sam, zostały na miejscu. Wszystko jest zapisane w historii.
- „Sam” nazywa się teraz „Zrobię sam”.
- Na „Listach” i w „Zadaniach” jest u góry podsumowanie: „W skrzynce · Potok · Zadania · Razem”.
- Testowanie od zera: okno incognito (Ctrl+Shift+N) i przeciągnięcie `index.html`. Zamknięcie okna wyrzuca próbne dane, a prawdziwe zostają.
- Testy: 41 w przeglądarce + test „jak człowiek” (zadanie w przeglądzie, „To zadanie →”, podsumowanie).

## 8.11.2026 (wieczór, 5) – 🏠 „Tylko prywatnie”
- **Problem:** część rzeczy chcę otwierać tylko na prywatnym komputerze.
- **Decyzja:** to nie jest kolejna lista, tylko **znaczek przy wpisie** (niezależny od decyzji Streścić / Zgłębić / …).
  - W przeglądzie, nad decyzjami, jest duży przełącznik **„🏠 Tylko prywatnie: TAK / nie”**. Domyślnie wyłączony, a włączenie nie przeskakuje do następnego wpisu.
  - Na listach i w Zadaniach każdy wpis ma przycisk 🏠 do zmiany później.
  - W „Pliki → To urządzenie” wybierasz raz: **prywatny** albo **💼 służbowy**. Na służbowym wpisy z 🏠 są widoczne, ale link się nie otwiera („🏠 Otwórz w domu”). Ustawienie jest osobne dla każdego urządzenia.
  - Podpowiedź: „(Dom)”, „(Claude-dom)”, „-dom”, „prywatne” od razu włączają domek. Twój wybór zawsze wygrywa z podpowiedzią.
  - W eksporcie .md wpis z domkiem ma dopisek „🏠 prywatne”.
- Pełny pożytek będzie po synchronizacji z Google Drive, bo na razie każde urządzenie ma własne dane.
- Testy: 41 w przeglądarce + test „jak człowiek” (przełącznik, tryb służbowy, link blokowany i odblokowany).

## 8.11.2026 (wieczór, 4) – „Muzyczki do zachowania”
- Nowa decyzja i lista **Muzyczki do zachowania**. W przeglądzie jest 7 przycisków (Archiwum na całą szerokość).
- Podpowiedź dają słowa: muzyczki, muzyka, piosenka, utwór.
- Testy: 37 w przeglądarce + test „jak człowiek”.

## 8.11.2026 (wieczór, 3) – „Śmieszne” i „Zapisać do Obsidian”
- Dwie nowe decyzje w przeglądzie i nowe listy: **Zapisać do Obsidian** (wiedza do notatek) i **Śmieszne** (rolki, memy – rozrywka osobno). Razem w przeglądzie jest teraz 6 przycisków: Streścić / Obczaić / Zgłębić / Zapisać do Obsidian / Śmieszne / Archiwum.
- Podpowiedzi: „XD”, „XDDDD” na początku wpisu → Śmieszne; „(Obsidian)”, „[Obsidian]”, „zapisać … Obsidian” → Zapisać do Obsidian.
- W „Pliki” jest nowy przycisk: **lista „Zapisać do Obsidian” jako osobny .md** (do wrzucenia do skarbca). Eksport całego Potoku zostaje bez zmian.
- Przycisk „To zadanie, nie treść →” skrócony do „To zadanie →”.
- Testy: 36 w przeglądarce + test „jak człowiek” (sprawdza m.in. podpowiedź „Śmieszne” i eksport listy Obsidian).

## 8.11.2026 (wieczór, 2) – osobne „Do zrobienia”, czysty Potok
- **Problem:** w Potoku lądowały też plany i pomysły (np. „Weekend: …”, „(Claude-dom) …”). W dokumencie było ich 41 na 90 wpisów i zaśmiecały przegląd linków.
- **Decyzja:** Potok jest tylko na *treści do przyswojenia*. Plany i pomysły trafiają do zakładki **Zadania** („Do zrobienia”), gdzie są trzy listy: **Dla Claude'a / Sam / Zrobione**. „Zrobione” niczego nie kasuje.
- Wpis **bez linku** trafia tam automatycznie, także przy imporcie i przy ręcznym dodaniu. Oznaczenie „(Claude…)” albo „[Claude…]” kieruje go do „Dla Claude'a”, a wszystko inne do „Sam”. Wpis można przestawić jednym kliknięciem (także „→ Potok”).
- Notatki zaimportowane wcześniej, które czekały w skrzynce, przeniosły się same przy otwarciu aplikacji. W historii mają dopisek „automatycznie”. Wpisów, o których już zdecydowałeś, to nie dotyczy.
- W przeglądzie jest nowy przycisk **„To zadanie, nie treść →”** dla linków, które są właściwie zadaniem (np. „wyciągnąć tezy z …”).
- Przy pomysłach dla Claude'a jest przycisk **Kopiuj**, żeby od razu wkleić pomysł w rozmowę.
- Zasada: przeglądać trzeba tylko skrzynkę. Pozostałe listy to półki, do których zaglądasz, kiedy chcesz.
- Wynik na Twoim dokumencie: w skrzynce zostaje 49 linków, a w Zadaniach jest 23 dla Claude'a i 18 „Sam”.
- Testy: 34 w przeglądarce + test „jak człowiek” (sprawdza m.in., że w skrzynce nie zostaje nic bez linku).

## 8.11.2026 (wieczór) – nowe etykiety i popychanie dalej
- Decyzje w przeglądzie: **Streścić / Obczaić / Zgłębić / Archiwum** (+ „Pomiń na razie”).
  - Streścić – niech streści AI (NotebookLM).
  - Obczaić – przejrzeć, poeksplorować samemu.
  - Zgłębić – poświęcić czas: przeczytać albo obejrzeć w całości. Zastępuje „Do przeczytania”, bo w Potoku są też filmy.
  - Archiwum – nic nie robię, wpis zostaje.
- Na listach każdy wpis ma przyciski „→ Obczaić / → Zgłębić / → Archiwum” itd. Typowe użycie: lista „Streścić”, przeczytane streszczenie, „→ Zgłębić”. Wpis pokazuje, skąd przyszedł (np. „Streścić → Zgłębić, 8 lis 2026”), pełna historia zmian jest zapisana.
- Wpisy zapisane wcześniej jako „Do przeczytania” same przechodzą do „Zgłębić” przy otwarciu aplikacji (nic nie ginie).
- Podpowiedź „Zgłębić” dają słowa: przeczytać, poczytać, zgłębić, obejrzeć.
- Zakładka „Import / eksport” nazywa się teraz „Pliki” (mieściła się źle na telefonie).
- Testy: 30 w przeglądarce + test „jak człowiek” sprawdzający popchnięcie Streścić → Zgłębić.

## Stan na 8.11.2026 – wersja 1 (lokalna, bez synchronizacji)

### Co działa
- **Import** dokumentu z Google Docs (.docx, także .txt). Ponowny import nie dubluje wpisów.
- **Przegląd jeden wpis naraz**: (od wieczora 8.11 – patrz wyżej) Streścić / Obczaić / Zgłębić / Archiwum, plus „Pomiń na razie” i „Cofnij”.
- **Data dodania** zapisuje się sama i jest zawsze widoczna.
- **Listy** wpisów wg statusu z wyszukiwarką; status można zmienić z listy.
- **Dodaj** ręcznie (np. w pracy, w przeglądarce).
- **Eksport kolejki „do streszczenia”** do jednego pliku .txt (same adresy, po jednym w linii – do wklejenia w NotebookLM: Dodaj źródło → Witryna) lub do schowka.
- **Eksport całości do .md** dla Obsidiana (sekcje wg statusu, data przy każdym wpisie, oryginalny tekst).
- **Kopia zapasowa .json** i przywracanie (przywrócenie tylko dokłada brakujące wpisy, nic nie nadpisuje).
- Przygotowane pod Androida: manifest z „Udostępnij → Potok” i praca offline (service worker). Zadziała, gdy aplikacja będzie pod adresem https (krok 2).

### Jak uruchomić
- Aplikacja: dwuklik `index.html` (Chrome / Edge / Firefox). Nic nie trzeba instalować.
- **Podgląd jak na telefonie**: dwuklik `podglad.html` (dwie ramki w rozmiarach telefonów). Dokładniej: w Chrome/Edge F12 → Ctrl+Shift+M i wybór modelu telefonu.
- **Testy**: dwuklik `testy/testy.html` – zielone „Wszystko OK” albo czerwona lista błędów. Testy używają osobnego miejsca w pamięci i nie ruszają Twoich wpisów.
- Test „jak człowiek” (`testy/e2e.js`): udaje telefon Pixel 7, importuje prawdziwy dokument, klika decyzje, eksportuje pliki. Wymaga Node + Playwright, więc uruchamia go Claude (później GitHub przy każdej zmianie).

### Pliki
| Plik | Co robi |
|---|---|
| `index.html`, `styl.css` | wygląd i układ |
| `js/magazyn.js` | zapis wpisów w przeglądarce (localStorage); celowo brak funkcji usuwania |
| `js/zip.js` | czytanie .docx bez bibliotek |
| `js/import.js` | dokument → wpisy (rozpoznawanie linków, tytułów, oznaczeń) |
| `js/eksport.js` | pliki .txt / .md / .json |
| `js/app.js` | ekrany i przyciski |
| `manifest.webmanifest`, `sw.js`, `ikona.svg` | instalacja jako aplikacja, offline, udostępnianie |
| `testy/` | testy (testy.html + testy.js, e2e.js, przykładowy .docx) |

### Decyzje
1. **Jeden akapit dokumentu = jeden wpis.** Akapit z kilkoma linkami („… oraz …”) dzielimy na osobne wpisy; każdy zachowuje pełny oryginalny tekst.
2. **Akapity bez linku** (zadania, pomysły typu „(Claude-dom) …”) też są importowane jako notatki – nic nie ginie. Pomijane są tylko puste akapity i takie bez liter (np. samotny cudzysłów).
3. **Oznaczenia** („Streścić”, „(Streścić)”, „[Streścić]”, „Obczaić”, „Poeksplorować”…) dają tylko **podpowiedź** (podświetlony przycisk). Decyzję podejmujesz sam. „Nie da się streścić” nie daje podpowiedzi.
4. **Data dodania przy imporcie** = moment importu, z dopiskiem „oryginalna data dodania nieznana” (dokument nie zawiera dat).
5. **Identyczne akapity** w dokumencie (ten sam tekst i link) importują się raz. W obecnym dokumencie są 2 takie powtórzenia.
6. **Linki do plików na dysku** (`file:///C:/…`) są importowane, ale nie trafiają do pliku dla NotebookLM (aplikacja pokazuje, ile trzeba dodać ręcznie).
7. **Dane w localStorage** (prosto i czytelnie; wystarczy na tysiące linków). Do czasu synchronizacji z Google Drive dane są tylko w tej jednej przeglądarce – rób kopię .json.
8. **Bez bibliotek zewnętrznych** – mniej rzeczy do utrzymania; .docx rozpakowuje wbudowany w przeglądarkę mechanizm.

### Wynik importu „Potok - od 10.2026.docx”
90 wpisów (2 powtórzenia pominięte): 49 linków i 41 notatek/zadań bez linku. Podpowiedź „do streszczenia” ma 24 wpisy, „obczaić” 11.

## Następne kroki (propozycja)
1. Wystawienie aplikacji pod darmowym adresem https (GitHub Pages) – wtedy działa na telefonie z linku, instalacja na Androidzie i „Udostępnij → Potok”. Testy będą się tam uruchamiać same przy każdej zmianie.
2. Synchronizacja z Google Drive.
3. Pobieranie prawdziwych tytułów (np. filmów YouTube) zamiast „YouTube · identyfikator”.
4. Proponowane tagi (do zatwierdzenia) i znacznik wiarygodności źródła.
