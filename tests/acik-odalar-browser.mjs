// Açık odalar tarayıcı testi: iki ayrı tarayıcı bağlamı (iki oyuncu) gerçek menüden.
// Sınananlar: A herkese açık oda kurar → B "Açık odalar" penceresinde görür ve KATIL ile (kodsuz) katılır; liste
// açıkken kendiliğinden yenilenir; özel oda listede görünmez; Hızlı katıl iki oyuncuyu aynı odada buluşturur.
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
    await page.waitForFunction(() => !document.querySelector('#rooms').disabled, null, { timeout: 8000 });
    return page;
  }
  const leave = async p => { await p.click('#roomLeave'); await p.waitForSelector('#menu:not([hidden])'); };

  // B açık odalar penceresini açar; A oda kurunca liste kendiliğinden yenilenir.
  const b = await player('Bora');
  await b.click('#rooms');
  await b.waitForSelector('#roomList .room-empty, #roomList .room-row');
  const a = await player('Ayşe');
  await a.click('#create');
  assert.equal(await a.locator('[data-setup-private="0"].selected').count(), 1, 'oda varsayılan olarak herkese açık');
  await a.click('#setupGo');
  await a.waitForSelector('.room-code');
  const code = (await a.textContent('.room-code')).trim();
  await b.waitForSelector('.room-row:has-text("Ayşe")', { timeout: 5000 });
  assert.match(await b.textContent('.room-row:has-text("Ayşe")'), /1\/10/);
  await b.screenshot({ path: 'artifacts/odalar-liste.png' });

  // KATIL: kod yazmadan A'nın odasına.
  await b.click('.room-row:has-text("Ayşe") [data-room]');
  await b.waitForSelector('.seat.me');
  assert.equal((await b.textContent('.room-code')).trim(), code, 'KATIL doğru odaya oturtur');
  await a.waitForFunction(() => document.querySelectorAll('.seat:not(.bot)').length === 2);
  await a.screenshot({ path: 'artifacts/odalar-lobi.png' });
  await leave(b);

  // Kuran lobide odayı özel yapar: listeden düşer.
  await a.click('[data-lobby-private="1"]');
  await a.waitForSelector('[data-lobby-private="1"].selected');
  await b.click('#rooms');
  await b.waitForSelector('#roomList .room-empty, #roomList .room-row');
  await b.waitForTimeout(500);
  assert.equal(await b.locator('.room-row:has-text("Ayşe")').count(), 0, 'özel oda listede görünmez');
  await b.click('#roomsBack');
  await leave(a);

  // Hızlı katıl: ilki (uygun oda yokken) yeni oda kurar, ikincisi aynı odaya oturur.
  await a.click('#quick');
  await a.waitForSelector('.room-code');
  const quickCode = (await a.textContent('.room-code')).trim();
  assert.equal(await a.locator('#roomStart').count(), 1, 'Hızlı katıl oda kurduysa kuran sensin');
  await b.click('#quick');
  await b.waitForSelector('.seat.me');
  assert.equal((await b.textContent('.room-code')).trim(), quickCode, 'Hızlı katıl aynı odada buluşturur');
  await leave(b); await leave(a);

  // Telefon genişliği (390 px): ana menü ve liste.
  const m = await player('Mert', { width: 390, height: 844 });
  await a.click('#create'); await a.click('#setupGo'); await a.waitForSelector('.room-code');
  await m.screenshot({ path: 'artifacts/odalar-telefon-menu.png' });
  await m.click('#rooms');
  await m.waitForSelector('.room-row:has-text("Ayşe")', { timeout: 5000 });
  assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'telefonda yatay taşma yok');
  await m.screenshot({ path: 'artifacts/odalar-telefon-liste.png' });
  await m.keyboard.press('Escape');
  await m.waitForFunction(() => document.querySelector('#overlay').hidden);
  await leave(a);

  assert.deepEqual(errors, []);
  console.log('Açık odalar tarayıcı testi geçti: liste, KATIL, özel oda, Hızlı katıl, telefon.');
} finally {
  await browser.close();
}
