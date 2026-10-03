// Çevrim içi tarayıcı testi: iki ayrı tarayıcı bağlamı (iki oyuncu) gerçek menüden oda kurar ve linkle katılır, lobide
// koltuk değiştirir, kuran başlatır. Sınananlar: lobi ekranı, rol seçimi olmadan tur girişi ve geri sayımı, girişin
// kendiliğinden kapanması, kopya dünyanın çizilmesi, kendi karakterin yürümesi ve öbür oyuncunun ekranında da aynı
// yerde görünmesi, tur sonu tablosu ve sonraki turun kendiliğinden başlaması, çevrim içi menü (oyun durmaz) ve çıkış. Ekran görüntüleri artifacts/online-*.png.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5197';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const errors = [];
  async function player(path) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(url + path);
    await page.waitForFunction(() => window.__iz);
    return page;
  }
  const a = await player('/?test=1');
  await a.fill('#nick', 'Ayşe');
  await a.waitForFunction(() => !document.querySelector('#create').disabled, null, { timeout: 8000 });
  await a.click('#create');
  await a.click('#setupGo');
  await a.waitForSelector('.room-code');
  const code = (await a.textContent('.room-code')).trim();
  assert.match(code, /^[A-Z]{4}-\d$/);

  const b = await player('/?test=1&oda=' + code);
  assert.equal(await b.inputValue('#code'), code, 'link oda kodunu doldurur');
  await b.fill('#nick', 'Bora');
  await b.waitForFunction(() => !document.querySelector('#joinGo').closest('#join-row').hidden && window.__iz.net.connected, null, { timeout: 8000 });
  await b.click('#joinGo');
  await b.waitForSelector('.seat.me');
  await b.click('[data-seat="4"]');
  await a.waitForFunction(() => document.querySelectorAll('.seat')[4]?.textContent.includes('Bora'));
  assert.equal(await a.locator('#roomStart').count(), 1, 'kuran Başlat görür');
  assert.equal(await b.locator('#roomStart').count(), 0, 'katılan başlatamaz');
  await a.screenshot({ path: 'artifacts/online-lobby.png' });

  // Başlat: rol seçimi yok, iki oyuncu da tur girişini ve geri sayımı görür.
  await a.click('#roomStart');
  for (const p of [a, b]) {
    await p.waitForSelector('#introLeft');
    assert.match(await p.textContent('#introLeft'), /sn sonra başlıyor/);
    assert.equal(await p.locator('[data-role]').count(), 0, 'çevrim içi rol seçimi yok');
  }
  assert.equal(await b.evaluate(() => window.__iz.world.player.id), 4);
  await b.screenshot({ path: 'artifacts/online-intro.png' });
  // Giriş sunucunun saatiyle kendiliğinden kapanır.
  await a.waitForFunction(() => document.querySelector('#overlay').hidden, null, { timeout: 9000 });
  await b.waitForFunction(() => document.querySelector('#overlay').hidden, null, { timeout: 3000 });

  const before = await a.evaluate(() => { const p = window.__iz.world.player; return { x: p.x, z: p.z }; });
  await a.focus('#world');
  for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
    await a.keyboard.down(key); await a.waitForTimeout(700); await a.keyboard.up(key);
    const now = await a.evaluate(() => { const p = window.__iz.world.player; return { x: p.x, z: p.z }; });
    if (Math.hypot(now.x - before.x, now.z - before.z) > 1.5) break;
  }
  await a.waitForTimeout(500);
  const mine = await a.evaluate(() => { const p = window.__iz.world.player; return { x: p.x, z: p.z, remote: window.__iz.world.remote, drawn: window.__iz.characters.isDrawn(0) }; });
  assert.ok(mine.remote && mine.drawn, 'kopya dünya çizilir');
  assert.ok(Math.hypot(mine.x - before.x, mine.z - before.z) > 1.5, 'kendi karakterin yürür');
  const seen = await b.evaluate(() => { const p = window.__iz.world.actors[0]; return { x: p.x, z: p.z }; });
  assert.ok(Math.hypot(seen.x - mine.x, seen.z - mine.z) < 0.8, 'öbür oyuncunun ekranında aynı yerde');
  assert.ok(await a.evaluate(() => window.__iz.world.time > 0), 'tur saati akar');
  await a.screenshot({ path: 'artifacts/online-play.png' });

  // Tur sonu (testte tur IZ_TUR_SN ile kısa): tablo rolleri açar, sonraki tur sunucunun saatiyle kendiliğinden başlar.
  for (const p of [a, b]) await p.waitForSelector('#nextLeft', { timeout: 40000 });
  assert.match(await b.textContent('#overlay'), /Suçlu/, 'tur sonunda roller açılır');
  assert.match(await b.textContent('#nextLeft'), /Sonraki tur \d+ sn içinde/);
  await b.screenshot({ path: 'artifacts/online-result.png' });
  for (const p of [a, b]) await p.waitForSelector('#introLeft', { timeout: 20000 });
  assert.match(await a.textContent('#round'), /TUR 02/);
  await a.waitForFunction(() => document.querySelector('#overlay').hidden, null, { timeout: 9000 });

  // Çevrim içi menü oyunu durdurmaz (Çayır Muhafızı düzeni: alt alta düğmeler, josephuz.com'a dönüş); odadan çıkan ana menüye döner.
  await a.keyboard.press('Escape');
  await a.waitForSelector('text=Kasaba durmuyor.');
  assert.equal(await a.locator('.menu-stack a[href="https://www.josephuz.com/"]').count(), 1, "menüde josephuz.com'a dönüş");
  await a.screenshot({ path: 'artifacts/online-menu.png' });
  const t0 = await b.evaluate(() => window.__iz.world.time);
  await b.waitForTimeout(600);
  assert.ok(await b.evaluate(() => window.__iz.world.time) > t0 + 0.3, 'menü açıkken oyun sürer');
  await a.click('#quit');
  await a.waitForSelector('#menu:not([hidden])');
  assert.equal(await a.evaluate(() => window.__iz.app.online), false);
  assert.deepEqual(errors, []);
  console.log('Çevrim içi tarayıcı testi geçti: oda kur, linkle katıl, koltuk, başlat, tur girişi, hareket, tur sonu, ikinci tur, menü, çıkış.');
} finally {
  await browser.close();
}
