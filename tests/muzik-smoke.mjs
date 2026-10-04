// Oyun içi müzik, gerçek tarayıcıda (`--mute-audio`): menüde ilk tıklamadan sonra sakin parça çalıyor mu, TEK BAŞINA
// ile tur başlayınca ana temaya geçiyor mu, "Müzik: kapalı" düğmesi gerçekten durduruyor ve sayfa yenilenince durum
// korunuyor mu, "Ses" düğmesi müziği etkiliyor mu. Ölçüm `<audio>` öğelerinin kendi `paused` / `currentTime`
// değerlerinden okunur — kapalı ses kartı sonucu değiştirmez.
//
// `npm test` bunu kendi açtığı sunucuyla koşturur. Tek başına: GAME_URL ve PLAYWRIGHT_MODULE vererek `node tests/muzik-smoke.mjs`.
// Not: otomatik tarayıcıda müzik varsayılan olarak **kapalıdır** (muzik.js `navigator.webdriver`); bu test `?muzik=1`
// ile bilerek açar, böylece öbür dumanı testleri 6 MB ses indirmez.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5197';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });

/** Sayfadaki `<audio>` öğelerinin özeti: hangi parça, duruyor mu, nereye geldi. */
const SESLER = () => [...document.querySelectorAll('audio')].map(a => ({
  parca: a.dataset.parca, paused: a.paused, currentTime: a.currentTime, volume: Number(a.volume.toFixed(3)), loop: a.loop,
}));

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const durum = () => page.evaluate(() => window.__iz.muzik.durum());
  const sesler = () => page.evaluate(SESLER);
  const calan = async () => (await sesler()).find(a => !a.paused) || null;

  await page.goto(url + '/?test=1&muzik=1');
  await page.waitForFunction(() => window.__iz);
  await page.waitForTimeout(600);

  // 1) Tarayıcının otomatik oynatma kuralı: ilk dokunuşa kadar hiç çalmaz.
  assert.equal((await durum()).caliyor, false, 'ilk dokunuştan önce müzik çalmamalı');
  assert.equal(await page.locator('#muzik').textContent(), 'Müzik: açık', 'üst çubuktaki düğme varsayılan olarak "Müzik: açık" demeli');

  // 2) İlk tıklamadan sonra menüde sakin parça (Pazar Meydanı) çalar.
  await page.click('#nick');
  await page.waitForFunction(() => window.__iz.muzik.durum().caliyor, null, { timeout: 15000 });
  await page.waitForTimeout(900);
  let d = await durum();
  console.log('menü:', JSON.stringify(d), JSON.stringify(await calan()));
  assert.equal(d.sahne, 'sakin', 'menüde sakin sahne');
  assert.equal(d.parca, 'iz-6-gece-nobeti', 'menüde Pazar Meydanı çalmalı');
  const menuSes = await calan();
  assert.ok(menuSes && menuSes.currentTime > 0, 'menü parçası gerçekten ilerlemeli');
  assert.ok(menuSes.loop, 'tek parçalı sakin sahne kendi kendine dönmeli');

  // 3) "Ses" (efekt) düğmesi müziği etkilemez: ikisi bağımsız.
  const oncekiParca = d.parca;
  await page.click('#sound');
  await page.waitForTimeout(400);
  d = await durum();
  assert.equal(d.caliyor, true, 'efekt sesi düğmesi müziği durdurmamalı');
  assert.equal(d.parca, oncekiParca, 'efekt sesi düğmesi çalan parçayı değiştirmemeli');
  assert.equal(await page.locator('#sound').textContent(), 'Ses: açık');
  await page.click('#sound'); // efekt sesi geri kapalı

  // 4) TEK BAŞINA → tur başlayınca ana temaya (Gizem) geçer. Ara pencereler (hazırlık, rol, tur girişi) sakin kalır.
  await page.click('#start');
  await page.waitForSelector('#setupGo');
  assert.equal((await durum()).sahne, 'sakin', 'hazırlık penceresinde sakin parça sürer');
  await page.click('#setupGo');
  await page.waitForSelector('[data-role="detective"]');
  assert.equal((await durum()).sahne, 'sakin', 'rol seçiminde sakin parça sürer');
  await page.click('[data-role="detective"]');
  await page.waitForSelector('#beginRound');
  await page.waitForTimeout(300);
  assert.equal((await durum()).sahne, 'sakin', 'tur girişinde sakin parça sürer');
  await page.click('#beginRound');
  await page.waitForFunction(() => window.__iz.muzik.durum().sahne === 'mac', null, { timeout: 10000 });
  await page.waitForTimeout(2600); // çapraz geçiş (1,8 sn) bitsin
  d = await durum();
  console.log('tur:', JSON.stringify(d), JSON.stringify(await sesler()));
  assert.equal(d.parca, 'iz-5-dosyalar', 'tur başlayınca ana tema çalmalı');
  const turSes = (await sesler()).find(a => a.parca === 'iz-5-dosyalar');
  assert.ok(!turSes.paused && turSes.currentTime > 0, 'tur parçası çalıyor ve ilerliyor');
  assert.ok((await sesler()).find(a => a.parca === 'iz-6-gece-nobeti').paused, 'sakin parça susmuş olmalı');
  assert.ok(d.ogeler === 2, `tur parçası ancak tur başlarken yüklenmeli (yüklenen: ${d.ogeler})`);

  // 4b) Turun son dakikasına girince gerilim parçası (Suçlu Aramızda) devralır; saat ileri alınarak ölçülür.
  await page.evaluate(() => { window.__iz.world.time = window.__iz.world.seconds - 30; });
  await page.waitForFunction(() => window.__iz.muzik.durum().sahne === 'gerilim', null, { timeout: 10000 });
  await page.waitForTimeout(2600);
  d = await durum();
  console.log('son dakika:', JSON.stringify(d));
  assert.equal(d.parca, 'iz-4-sessiz-kasaba', 'turun son dakikasında gerilim parçası çalmalı');
  assert.ok((await calan()).currentTime > 0, 'gerilim parçası ilerlemeli');
  // Saat geri alınır: testin kalanı normal tur müziğiyle sürsün, tur süre bitiminden kapanmasın.
  await page.evaluate(() => { window.__iz.world.time = 10; });
  await page.waitForFunction(() => window.__iz.muzik.durum().sahne === 'mac', null, { timeout: 10000 });

  // 5) Esc menüsündeki "Müzik" düğmesi üst çubuktakiyle aynı durumu gösterir ve müziği durdurur.
  await page.keyboard.press('Escape');
  await page.waitForSelector('#pauseMuzik');
  assert.equal(await page.locator('#pauseMuzik').textContent(), 'Müzik: açık', 'Esc menüsü aynı durumu göstermeli');
  await page.screenshot({ path: 'artifacts/muzik-esc-menu.png' });
  await page.click('#pauseMuzik');
  // Süzülerek susar (çapraz geçiş 1,8 sn; sahne değişimi üst üste geldiyse birkaç parça birden süzülüyor olabilir).
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(a => a.paused), null, { timeout: 10000 });
  d = await durum();
  const durduran = (await sesler()).find(a => a.parca === 'iz-6-gece-nobeti'); // mola → sakin sahne
  console.log('kapalı:', JSON.stringify(d), JSON.stringify(await sesler()));
  assert.equal(d.acik, false, 'müzik kapanmalı');
  assert.equal(d.caliyor, false, 'kapatınca hiçbir parça çalmamalı');
  assert.equal(await page.locator('#pauseMuzik').textContent(), 'Müzik: kapalı');
  assert.equal(await page.locator('#muzik').textContent(), 'Müzik: kapalı', 'üst çubuktaki düğme de kapalı demeli');
  assert.ok(durduran.currentTime > 0, 'kapatılan parça kaldığı yerde beklemeli (yeniden açılınca oradan sürer)');

  // 6) Yeniden açınca kaldığı yerden / aynı sahnenin parçasıyla sürer.
  await page.click('#pauseMuzik');
  await page.waitForFunction(() => window.__iz.muzik.durum().caliyor, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  const geri = await calan();
  console.log('yeniden açık:', JSON.stringify(await durum()), JSON.stringify(geri));
  assert.ok(geri, 'yeniden açınca müzik sürmeli');
  assert.ok(geri.currentTime >= durduran.currentTime, 'kaldığı yerden sürmeli (başa sarmamalı)');

  // 7) Durum sayfa yenilenince korunur: kapalı bırakılırsa kapalı açılır.
  await page.click('#pauseMuzik'); // kapat
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => localStorage.getItem('iz.muzik')), 'off');
  await page.goto(url + '/?test=1&muzik=1');
  await page.waitForFunction(() => window.__iz);
  await page.click('#nick');
  await page.waitForTimeout(1200);
  d = await durum();
  console.log('yenileme sonrası:', JSON.stringify(d));
  assert.equal(d.acik, false, 'kapalı durum yenilemede korunmalı');
  assert.equal(d.caliyor, false, 'yenilemeden sonra da çalmamalı');
  assert.equal(await page.locator('#muzik').textContent(), 'Müzik: kapalı', 'düğme yenilemeden sonra da kapalı demeli');
  await page.screenshot({ path: 'artifacts/muzik-kapali-yenileme.png' });
  // Yeniden açılıp saklanıyor mu (varsayılan duruma dönüş).
  await page.click('#muzik');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => localStorage.getItem('iz.muzik')), 'on');

  // 8) Otomatik tarayıcıda (`?muzik=1` olmadan) müzik hiç kurulmaz: dumanı testleri ses indirmez.
  const sessiz = await context.newPage();
  await sessiz.goto(url + '/?test=1');
  await sessiz.waitForFunction(() => window.__iz);
  await sessiz.click('#nick');
  await sessiz.waitForTimeout(800);
  const sessizDurum = await sessiz.evaluate(() => window.__iz.muzik.durum());
  console.log('otomatik tarayıcı:', JSON.stringify(sessizDurum));
  assert.equal(sessizDurum.kapali, true, 'navigator.webdriver altında müzik kapalı kurulmalı');
  assert.equal(sessizDurum.ogeler, 0, 'otomatik tarayıcıda hiç ses dosyası indirilmemeli');
  assert.ok(await sessiz.locator('#muzik').isHidden(), 'müzik kurulmadıysa çubuktaki düğme gizlenmeli');

  assert.deepEqual(errors, [], 'tarayıcı hataları: ' + errors.join(' | '));
  console.log('Müzik: menüde Pazar Meydanı, turda Gizem, düğme durduruyor ve yenilemede korunuyor; efekt sesi bağımsız.');
} finally {
  await browser.close();
}
