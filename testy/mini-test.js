/* mini-test.js – najprostszy możliwy zestaw do testów, bez instalowania
   czegokolwiek. Otwierasz testy.html w przeglądarce i widzisz wynik.

   Użycie:  test('opis', async () => { rowne(a, b); prawda(warunek); });
   Wynik trafia na stronę i do window.WYNIK_TESTOW (dla automatu). */
const _testy = [];
function test(opis, fn) { _testy.push({ opis, fn }); }

function rowne(faktyczne, oczekiwane, opis = '') {
  const a = JSON.stringify(faktyczne), b = JSON.stringify(oczekiwane);
  if (a !== b) throw new Error(`${opis} oczekiwano ${b}, jest ${a}`);
}
function prawda(warunek, opis = 'warunek nie jest spełniony') {
  if (!warunek) throw new Error(opis);
}

async function uruchomTesty() {
  const ul = document.getElementById('wyniki');
  let ok = 0, zle = 0;
  for (const t of _testy) {
    const li = document.createElement('li');
    try { await t.fn(); ok++; li.className = 'ok'; li.textContent = '✔ ' + t.opis; }
    catch (e) { zle++; li.className = 'zle'; li.textContent = '✘ ' + t.opis + ' — ' + e.message; console.error(t.opis, e); }
    ul.appendChild(li);
  }
  const pod = document.getElementById('podsumowanie');
  pod.textContent = zle ? `BŁĘDY: ${zle} z ${ok + zle}` : `Wszystko OK: ${ok} testów`;
  pod.className = zle ? 'zle' : 'ok';
  window.WYNIK_TESTOW = { ok, zle };
}
