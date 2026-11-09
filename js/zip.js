/* =====================================================================
   zip.js – minimalny czytnik plików ZIP (plik .docx to ZIP z XML-ami).

   Bez zewnętrznych bibliotek: rozpakowanie robi wbudowany w przeglądarkę
   DecompressionStream('deflate-raw') (Chrome, Edge, Firefox, Safari 16.4+).

   Format ZIP w skrócie:
   - na końcu pliku jest „End of Central Directory” (EOCD) z adresem
     katalogu centralnego,
   - katalog centralny opisuje każdy plik: nazwa, metoda kompresji,
     rozmiar, położenie nagłówka lokalnego,
   - za nagłówkiem lokalnym leżą skompresowane dane.
   ===================================================================== */

const Zip = {
  /**
   * Zwraca tekst (UTF-8) jednego pliku z archiwum albo null, gdy go nie ma.
   * @param {ArrayBuffer} bufor  – zawartość pliku .docx
   * @param {string} nazwa       – np. "word/document.xml"
   */
  async czytajPlik(bufor, nazwa) {
    const v = new DataView(bufor);
    const bajty = new Uint8Array(bufor);

    // 1. Szukamy EOCD od końca (sygnatura 0x06054b50).
    let eocd = -1;
    for (let i = bufor.byteLength - 22; i >= 0; i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('To nie wygląda na plik .docx (brak struktury ZIP).');

    const liczbaPlikow = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true); // początek katalogu centralnego

    // 2. Przechodzimy po katalogu centralnym.
    const dekoder = new TextDecoder();
    for (let k = 0; k < liczbaPlikow; k++) {
      const metoda    = v.getUint16(p + 10, true);
      const rozmiarK  = v.getUint32(p + 20, true);
      const dlNazwy   = v.getUint16(p + 28, true);
      const dlExtra   = v.getUint16(p + 30, true);
      const dlKoment  = v.getUint16(p + 32, true);
      const offLokal  = v.getUint32(p + 42, true);
      const nazwaPl   = dekoder.decode(bajty.subarray(p + 46, p + 46 + dlNazwy));

      if (nazwaPl === nazwa) {
        // 3. Nagłówek lokalny ma własne długości nazwy i pola extra.
        const lNazwa = v.getUint16(offLokal + 26, true);
        const lExtra = v.getUint16(offLokal + 28, true);
        const start  = offLokal + 30 + lNazwa + lExtra;
        const dane   = bajty.subarray(start, start + rozmiarK);

        if (metoda === 0) return dekoder.decode(dane);          // bez kompresji
        if (metoda === 8) {                                      // deflate
          const strumien = new Blob([dane]).stream()
            .pipeThrough(new DecompressionStream('deflate-raw'));
          return await new Response(strumien).text();
        }
        throw new Error('Nieobsługiwana metoda kompresji: ' + metoda);
      }
      p += 46 + dlNazwy + dlExtra + dlKoment;
    }
    return null;
  },
};
