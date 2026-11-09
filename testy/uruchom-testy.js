/* uruchom-testy.js – uruchamia testy.html w przeglądarce bez okna (dla GitHuba
   i dla Claude). Na co dzień wystarczy otworzyć testy.html dwuklikiem.
   Użycie: node testy/uruchom-testy.js */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const przegladarka = await chromium.launch();
  const s = await przegladarka.newPage();
  await s.goto('file://' + path.join(__dirname, 'testy.html'));
  await s.waitForFunction(() => window.WYNIK_TESTOW, null, { timeout: 30000 });
  const wynik = await s.evaluate(() => window.WYNIK_TESTOW);
  const bledy = await s.$$eval('li.zle', l => l.map(x => x.textContent));
  await przegladarka.close();
  console.log(`Testy: ${wynik.ok} OK, ${wynik.zle} błędów`);
  bledy.forEach(b => console.log(b));
  process.exit(wynik.zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
