// Açık odalar tarayıcı testi: iki ayrı tarayıcı bağlamı (iki oyuncu) gerçek ana ekrandan (oda standardı,
// josephuz deposunda docs/oda-standardi.md). Sınananlar: AÇIK ODALAR listesi ana ekranda durur (ayrı pencere yok) ve
// kendiliğinden yenilenir; A herkese açık oda kurar → B satırı ("Ayşe", "Normal botlar · 1/10 oyuncu", LOBİDE,
// KATIL →) görür ve satıra tıklayarak (kodsuz) katılır; özel oda listede görünmez; ODAYA KATIL kodu tiresiz ve küçük
// harfle de kabul eder, kısa kodda "Oda kodunu yaz" der; Hızlı katıl iki oyuncuyu aynı odada buluşturur.
// Ekran görüntüleri artifacts/odalar-*.png (masaüstü ve 390 px telefon).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5197';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const errors = [];
  async function player(nick, viewport = { width: 1280, height: 800 }, path = '/?test=1') {
    const ctx = await browser.newContext({ viewport }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(url + path);
    await page.waitForFunction(() => window.__iz);
    await page.fill('#nick', nick);
    await page.waitForFunction(() => !document.querySelector('#quick').disabled, null, { timeout: 8000 });
    return page;
  }
  const leave = async p => {
    assert.equal(await p.textContent('#roomLeave'), 'Odadan çık');
    await p.click('#roomLeave');
    await p.waitForSelector('#menu:not([hidden])');
  };

  // Ana ekran: ÇEVRİM İÇİ bölümü sırası ve yazıları; liste ana ekranda (pencere değil).
  const b = await player('Bora');
  assert.deepEqual(await b.$$eval('#online-row button', bs => bs.map(x => x.textContent.trim())), ['HIZLI KATIL →', 'ODA KUR', 'ODAYA KATIL']);
  await b.waitForSelector('#rooms-block:not([hidden]) #roomList .room-empty, #roomList .room-row');
  assert.equal(await b.locator('#overlay:not([hidden])').count(), 0, 'açık odalar ayrı pencere değil');
  const a = await player('Ayşe');
  await a.click('#create');
  await a.waitForSelector('.room-code');
  assert.equal(await a.locator('[data-lobby-private="0"].selected').count(), 1, 'oda herkese açık kurulur');
  const code = (await a.textContent('.room-code')).trim();
  const row = b.locator('.room-row:has-text("Ayşe")');
  await row.waitFor({ timeout: 5000 });
  const rowText = await row.textContent();
  for (const part of ['Normal botlar · 1/10 oyuncu', 'LOBİDE', 'KATIL →']) assert.ok(rowText.includes(part), `satırda "${part}"`);
  assert.match(await b.textContent('#roomsCount'), /^[1-9]\d*$/);
  await b.screenshot({ path: 'artifacts/odalar-liste.png' });

  // Satırın tamamı KATIL düğmesidir: kod yazmadan A'nın odasına.
  await row.click();
  await b.waitForSelector('.seat.me');
  assert.equal((await b.textContent('.room-code')).trim(), code, 'KATIL doğru odaya oturtur');
  await a.waitForFunction(() => document.querySelectorAll('.seat:not(.bot)').length === 2);
  await a.screenshot({ path: 'artifacts/odalar-lobi.png' });
  await leave(b);

  // Kuran lobide odayı özel yapar: listeden düşer.
  await a.click('[data-lobby-private="1"]');
  await a.waitForSelector('[data-lobby-private="1"].selected');
  assert.match(await a.textContent('.room-visibility'), /ÖZEL ODA · yalnız kodla/);
  await b.waitForTimeout(700);
  assert.equal(await b.locator('.room-row:has-text("Ayşe")').count(), 0, 'özel oda listede görünmez');

  // ODAYA KATIL: kısa kod uyarır; tiresiz küçük harfli kod tire eklenerek katılır (özel odaya kodla).
  await b.click('#join');
  await b.fill('#code', 'kp');
  await b.press('#code', 'Enter');
  assert.equal(await b.textContent('#online-status'), 'Oda kodunu yaz');
  await b.fill('#code', code.replace('-', '').toLowerCase());
  assert.equal(await b.inputValue('#code'), code.replace('-', ''), 'kod büyük harfe çevrilir');
  await b.click('#joinGo');
  await b.waitForSelector('.seat.me');
  assert.equal((await b.textContent('.room-code')).trim(), code);
  await leave(b); await leave(a);

  // Hızlı katıl: ilki (uygun oda yokken) yeni oda kurar, ikincisi aynı odaya oturur.
  await a.click('#quick');
  await a.waitForSelector('.room-code');
  const quickCode = (await a.textContent('.room-code')).trim();
  assert.equal(await a.locator('#roomStart').count(), 1, 'Hızlı katıl oda kurduysa kuran sensin');
  await b.click('#quick');
  await b.waitForSelector('.seat.me');
  assert.equal((await b.textContent('.room-code')).trim(), quickCode, 'Hızlı katıl aynı odada buluşturur');
  await leave(b); await leave(a);

  // Telefon genişliği (390 px): ana ekran ve satır içi liste.
  const m = await player('Mert', { width: 390, height: 844 });
  await a.click('#create'); await a.waitForSelector('.room-code');
  await m.waitForSelector('.room-row:has-text("Ayşe")', { timeout: 5000 });
  await m.locator('#rooms-block').scrollIntoViewIfNeeded();
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'telefonda yatay taşma yok');
  assert.ok(await m.evaluate(() => { const r = document.querySelector('.room-row').getBoundingClientRect(); return r.right <= innerWidth + 1; }), 'satır ekrana sığar');
  await m.screenshot({ path: 'artifacts/odalar-telefon-liste.png' });
  await leave(a);

  assert.deepEqual(errors, []);
  console.log('Açık odalar tarayıcı testi geçti: ana ekran listesi, satırdan KATIL, özel oda, kodla katıl, Hızlı katıl, telefon.');
} finally {
  await browser.close();
}
