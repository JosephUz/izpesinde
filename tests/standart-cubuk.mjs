// STANDART üst araç çubuğu ve duraklatma (Esc) menüsü — bütün JosephUz oyunlarında aynı olmalı:
//   çubuk: `← josephuz.com` · `Ses: açık/kapalı` · `Müzik: açık/kapalı` · `Kontroller F1`
//   menü:  `DEVAM ET →` · `Kontroller F1` · `Ses: …` · `Müzik: …` · `Ana menü` · `josephuz.com'a dön`
// Sıranın ve yazıların doğruluğunu tests/muzik.test.mjs denetler; buradaki ölçü **yerleşim**: masaüstünde,
// dar yatay telefonda (667x375), geniş yatay telefonda (844x390) ve dikeyde (390x844) çubuk tek satırda kalıyor,
// ekrandan taşmıyor ve oyun adının üstüne binmiyor mu; Esc menüsünün son düğmesi kaydırmadan görünüyor mu.
// Ekran görüntüleri artifacts/standart-cubuk-*.png.
//
// `npm test` bunu kendi açtığı sunucuyla koşturur. Tek başına: GAME_URL ve PLAYWRIGHT_MODULE vererek
// `node tests/standart-cubuk.mjs`.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { MUZIK_VAR } from '../src/muzik.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5197';
// Şu an oyunda müzik yok (src/muzik.js SAHNELER boş): Müzik düğmesi çubukta da Esc menüsünde de gizlidir, sıra
// geri kalan düğmelerle denetlenir. Parçalar geri gelince düğme kendiliğinden döner, bu test de dörtlüyü bekler.
if (!MUZIK_VAR) console.log('müzik yok: Müzik düğmesi beklenmiyor (çubuk ve Esc menüsü üç düğmeyle denetlenir)');
const CUBUK_BEKLENEN = MUZIK_VAR ? ['homeLink', 'sound', 'muzik', 'helpBtn'] : ['homeLink', 'sound', 'helpBtn'];
const MENU_BEKLENEN = ['resume', 'pauseHelp', 'pauseSound', ...(MUZIK_VAR ? ['pauseMuzik'] : []), 'quit', "josephuz.com'a dön"];
await mkdir('artifacts', { recursive: true });

/** Masaüstü ve üç telefon tutuşu. Dar yatay (iPhone SE / 8) çubuğun en sıkıştığı ölçüdür. */
const EKRANLAR = [
  ['masaustu', { width: 1440, height: 900 }, false],
  ['dar', { width: 667, height: 375 }, true],
  ['genis', { width: 844, height: 390 }, true],
  ['dikey', { width: 390, height: 844 }, true],
];

const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });

/** İki kutu kesişiyor mu (üst üste binme)? */
const binisiyor = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** Sayfadan bir öğenin kutusu ve görünürlüğü. */
const OLC = `sec => { const n = document.querySelector(sec); if (!n) return null;
  const r = n.getBoundingClientRect(), s = getComputedStyle(n);
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
    gorunur: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 }; }`;
/** Çubuktaki görünür düğmelerin kimlikleri, soldan sağa. */
const CUBUK_SIRA = `() => [...document.querySelectorAll('#toptools > *')]
  .filter(n => getComputedStyle(n).display !== 'none' && !n.hidden && n.getBoundingClientRect().width > 0)
  .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(n => n.id)`;
/** Çubuk kaç satıra yayıldı (standart çubuk tek satır olmalı)? */
const CUBUK_SATIR = `() => new Set([...document.querySelectorAll('#toptools > *')]
  .filter(n => n.getBoundingClientRect().width > 0).map(n => Math.round(n.getBoundingClientRect().top))).size`;

try {
  // 1) Ana ekran, dört ekran ölçüsü: standart dörtlü bu sırayla, tek satır, ekranın içinde, oyun adına binmiyor.
  for (const [ad, ekran, mobil] of EKRANLAR) {
    const context = await browser.newContext({ viewport: ekran, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: mobil ? 2 : 1 });
    const page = await context.newPage(), hatalar = [];
    page.on('pageerror', e => hatalar.push(e.message));
    page.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
    // `?muzik=1`: otomatik tarayıcıda müzik kapalı kurulur ve düğme gizlenirdi; çubuğu tam haliyle ölçmek için açılır.
    await page.goto(url + '/?test=1&muzik=1');
    await page.waitForFunction(() => window.__iz);
    await page.waitForTimeout(900);
    // Dikey tutuşta oyun "Telefonu yan çevir" perdesini gösterir; çubuk arkasında durur, ölçülebilsin diye perde
    // yalnız bu testte gizlenir (oyun kuralları değişmez).
    if (ad === 'dikey') await page.addStyleTag({ content: '#rotate{display:none!important}' });
    const olc = sec => page.evaluate(`(${OLC})(${JSON.stringify(sec)})`);
    const cubuk = await olc('#toptools'), marka = await olc('#brand');
    const sira = await page.evaluate(`(${CUBUK_SIRA})()`), satir = await page.evaluate(`(${CUBUK_SATIR})()`);
    await page.screenshot({ path: `artifacts/standart-cubuk-${ad}-giris.png` });
    console.log(JSON.stringify({ ekran: `${ekran.width}x${ekran.height}`, ad, cubuk, marka, sira, satir, hatalar }));

    assert.deepEqual(sira, CUBUK_BEKLENEN,
      `${ad}: standart dörtlü bu sırayla olmalı (okunan: ${sira.join(', ')})`);
    assert.ok(cubuk.left >= 0 && cubuk.right <= ekran.width, `${ad}: üst çubuk ekrandan taşıyor (${cubuk.left}..${cubuk.right})`);
    assert.ok(cubuk.top >= 0 && cubuk.bottom <= ekran.height, `${ad}: üst çubuk ekranın dışında (${cubuk.top}..${cubuk.bottom})`);
    assert.equal(satir, 1, `${ad}: standart araç çubuğu tek satırda kalmalı (düğmeler alt satıra kaydı)`);
    assert.ok(!binisiyor(cubuk, marka), `${ad}: üst çubuk oyun adının üstüne biniyor (çubuk ${cubuk.left}, marka ${marka.right})`);
    assert.deepEqual(hatalar, [], `${ad}: tarayıcı hataları: ` + hatalar.join(' | '));
    await context.close();
  }

  // 2) Standart Esc menüsü dar yatay telefonda bütünüyle görünmeli: en alttaki "josephuz.com'a dön" kaydırmasız
  //    okunsun (menü bu görevde Müzik düğmesiyle uzadı) ve pencere düğme sütunu kadar dar kalsın.
  const [, DAR] = EKRANLAR[1];
  const context = await browser.newContext({ viewport: DAR, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage(), hatalar = [];
  page.on('pageerror', e => hatalar.push(e.message));
  page.on('console', e => { if (e.type() === 'error') hatalar.push(e.text()); });
  await page.goto(url + '/?test=1&muzik=1');
  await page.waitForFunction(() => window.__iz);
  await page.waitForTimeout(800);
  const olc = sec => page.evaluate(`(${OLC})(${JSON.stringify(sec)})`);

  await page.tap('#start');
  await page.waitForSelector('#setupGo');
  await page.tap('#setupGo');
  await page.waitForSelector('[data-role="detective"]');
  await page.tap('[data-role="detective"]');
  await page.waitForSelector('#beginRound');
  await page.tap('#beginRound');
  await page.waitForFunction(() => window.__iz.app.playing && document.querySelector('#overlay').hidden, null, { timeout: 15000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#resume');
  await page.waitForTimeout(400);

  const kart = await olc('#overlay .dialog'), son = await olc('.menu-stack a.secondary');
  const dugmeler = await page.evaluate(() => [...document.querySelectorAll('.menu-stack > *')]
    .filter(n => getComputedStyle(n).display !== 'none' && !n.hidden).map(n => n.id || n.textContent.trim()));
  await page.screenshot({ path: 'artifacts/standart-cubuk-dar-duraklatma.png' });
  console.log(JSON.stringify({ kart, son, dugmeler }));

  assert.deepEqual(dugmeler, MENU_BEKLENEN,
    'Esc menüsünün sırası standart olmalı');
  assert.ok(son.bottom <= DAR.height, `Esc menüsünün son düğmesi ekrandan taşıyor (${son.bottom} > ${DAR.height})`);
  assert.ok(kart.bottom <= DAR.height && kart.top >= 0, 'Esc penceresi ekrandan taşıyor');
  assert.ok(kart.right - kart.left <= 436, `Esc penceresi düğme sütunu kadar dar olmalı (${kart.right - kart.left}px)`);
  assert.deepEqual(hatalar, [], 'tarayıcı hataları: ' + hatalar.join(' | '));

  // 3) Masaüstünde Esc menüsü de aynı: pencere dar, sağ yarısı boş kalmıyor.
  const mUst = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mPage = await mUst.newPage();
  await mPage.goto(url + '/?test=1&muzik=1');
  await mPage.waitForFunction(() => window.__iz);
  await mPage.click('#start'); await mPage.waitForSelector('#setupGo'); await mPage.click('#setupGo');
  await mPage.waitForSelector('[data-role="prosecutor"]'); await mPage.click('[data-role="prosecutor"]');
  await mPage.waitForSelector('#beginRound'); await mPage.click('#beginRound');
  await mPage.waitForFunction(() => window.__iz.app.playing && document.querySelector('#overlay').hidden, null, { timeout: 15000 });
  await mPage.keyboard.press('Escape');
  await mPage.waitForSelector(MUZIK_VAR ? '#pauseMuzik' : '#resume');
  await mPage.waitForTimeout(300);
  await mPage.screenshot({ path: 'artifacts/standart-cubuk-masaustu-duraklatma.png' });
  const mKart = await mPage.evaluate(`(${OLC})('#overlay .dialog')`);
  console.log(JSON.stringify({ masaustuKart: mKart }));
  assert.ok(mKart.right - mKart.left <= 436, `masaüstünde Esc penceresi düğme sütunu kadar dar olmalı (${mKart.right - mKart.left}px)`);
  await mUst.close();
  await context.close();

  console.log('Standart üst araç çubuğu (← josephuz.com · Ses · Müzik · Kontroller F1) dört ekran ölçüsünde de tek satır, taşma yok.');
  console.log('Standart Esc menüsü dar yatay telefonda bütünüyle görünüyor. Görüntüler: artifacts/standart-cubuk-*.png');
} finally {
  await browser.close();
}
