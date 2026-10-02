// Tarayıcı dumanı testi: çalışan sunucuya (GAME_URL, varsayılan http://127.0.0.1:5197) başsız Chromium ile bağlanır.
// Menü, rol seçimi, yürüme, çift zıplama, görüş sisi, duraklatma, gerçek sol tıkla işaret / yakalama / kılık, kenar
// uyarısı, E ile kutu, görüş alanındaki sabit nesnelerin saydamlığı, iz oku, skor tablosu, küçük ekran ve beş turun ekran geçişleri denetlenir.
// Ekran görüntüleri artifacts/ altına. Playwright yolu: PLAYWRIGHT_MODULE (npm test bunu kendisi bulur).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5197';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(url + '/?test=1');
  await page.waitForFunction(() => window.__iz);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'artifacts/menu.png' });

  // Rol seçimi: her turun başında üç kart; seçilen rol oyuncuya verilir.
  await page.click('#start');
  await page.waitForSelector('[data-role="detective"]');
  await page.screenshot({ path: 'artifacts/role.png' });
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('[data-role]').first().isVisible(), 'Esc rol seçimini kapatmaz');
  await page.click('[data-role="detective"]');
  assert.equal(await game(() => window.__iz.world.player.role), 'detective');
  await page.click('#beginRound');

  await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
  assert.ok(Number.isFinite(await game(() => window.__iz.world.player.x)));
  await page.keyboard.press('Space'); await page.waitForTimeout(80); await page.keyboard.press('Space');
  assert.ok(await game(() => window.__iz.world.player.y > 0));
  await page.waitForTimeout(1200);

  // Görüş alanı: sis oyuncunun çevresine kapanır, dairenin dışındaki karakterler çizilmez.
  const vision = await game(() => {
    const w = window.__iz.world, p = w.player; let far = 0, drawn = 0;
    for (const a of w.actors) if (Math.hypot(a.x - p.x, a.z - p.z) > 20) { far++; if (window.__iz.characters.isDrawn(a.id)) drawn++; }
    return { near: window.__iz.app.fogNear(), far, drawn };
  });
  assert.ok(vision.near < 20); assert.equal(vision.drawn, 0);
  await page.screenshot({ path: 'artifacts/game.png' });

  await page.keyboard.press('Escape');
  const time = await game(() => window.__iz.world.time);
  await page.waitForTimeout(250);
  assert.equal(await game(() => window.__iz.world.time), time, 'duraklatınca zaman durur');
  await page.click('#resume');

  // Botları dondur, bir kasabalıyı oyuncunun yanına koy ve dünyada üstüne tıkla.
  const clickOn = async id => {
    await page.waitForTimeout(250);
    const q = await game(id => { const a = window.__iz.world.actors[id]; return window.__iz.app.project(a.x, 1.1, a.z); }, id);
    await page.mouse.move(q.x, q.y); await page.waitForTimeout(120); await page.mouse.click(q.x, q.y); await page.waitForTimeout(200);
  };
  await game(() => {
    const w = window.__iz.world, p = w.player;
    for (const a of w.actors.slice(1)) { a.think = 9999; a.path = []; a.x = p.x + 80; a.z = p.z + 80; }
    const n = w.actors[30]; n.x = p.x + 2; n.z = p.z; n.appearance = (p.appearance + 3) % 10;
  });
  await clickOn(30);
  assert.equal(await game(() => window.__iz.world.marks.get(30)?.owner), 0, 'dedektif sol tıkla işaretler');
  assert.equal(await game(() => window.__iz.world.player.marks), 2);
  await game(() => window.__iz.setRole('prosecutor')); await clickOn(30);
  assert.ok(await game(() => window.__iz.world.marks.get(30)?.cleared), 'savcı sol tıkla yakalar (yanlış kişi: aklanır)');
  await game(() => window.__iz.setRole('criminal')); await clickOn(30);
  assert.ok(await game(() => window.__iz.world.player.appearance === window.__iz.world.actors[30].appearance), 'suçlu sol tıkla kılığa girer');
  await game(() => { const w = window.__iz.world; w.marks.set(0, { owner: 1, ox: 0, oz: 0, cleared: false, time: w.time }); });
  await page.waitForTimeout(250);
  assert.ok(await game(() => document.getElementById('alert').classList.contains('on')), 'işaretli suçlunun ekran kenarı kızarır');
  await page.screenshot({ path: 'artifacts/alert.png' });

  await game(() => { const w = window.__iz.world, p = w.player, c = w.crates[0]; p.x = c.x; p.z = c.z + 1; });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(150);
  assert.ok(await game(() => window.__iz.world.player.crate !== null), 'E kutuyu alır');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(150);
  assert.ok(await game(() => window.__iz.world.player.crate === null), 'E kutuyu bırakır');

  // İz düşünce üstünde ok zıplar; arkasına biri (burada bir kasabalı) geçen bina saydamlaşır, diğer nesneler katı kalır.
  await game(() => window.__iz.setRole('detective'));
  await game(() => { const w = window.__iz.world, p = w.player; w.traces.push({ id: 9999, role: 'detective', x: p.x + 2, z: p.z + 1, born: w.time, by: 1 }); });
  await page.waitForTimeout(300);
  assert.ok(await game(() => window.__iz.traceArrows() > 0), 'iz üstünde ok görünür');
  await page.screenshot({ path: 'artifacts/trace.png' });
  const fades = await game(async () => {
    // Kamera +x/+z yönünde: binanın -z yüzünün önündeki karakter, kamerayla arasında binayı bırakır.
    const iz = window.__iz, w = iz.world, b = w.env.buildings[0], p = w.player, n = w.actors[30], objs = iz.town.xray.objects;
    p.x = b.x + b.w / 2 + 3; p.z = b.z + b.d / 2 + 2; n.x = b.x - 1; n.z = b.z - b.d / 2 - 1.4;
    await new Promise(r => setTimeout(r, 900));
    return { building: objs[0].fade, others: objs.slice(1).filter(o => o.fade > 0).length };
  });
  assert.equal(fades.building, 1, 'arkasında kasabalı olan bina saydamlaşır');
  assert.ok(fades.others <= 3, 'diğer nesneler katı kalır (' + fades.others + ')');
  await page.screenshot({ path: 'artifacts/seethrough.png' });

  // M küçük haritayı büyütür, tekrar M küçültür.
  const mapWidth = async () => (await page.locator('#mapcard').boundingBox()).width;
  const small = await mapWidth();
  await page.keyboard.press('KeyM'); await page.waitForTimeout(150);
  assert.ok(await mapWidth() > small * 1.6, 'M haritayı büyütür');
  await page.screenshot({ path: 'artifacts/map-large.png' });
  await page.keyboard.press('KeyM'); await page.waitForTimeout(150);
  assert.equal(await mapWidth(), small, 'M tekrar küçültür');
  await page.keyboard.down('Tab'); assert.equal(await page.locator('#scores').isVisible(), true);
  await page.keyboard.up('Tab'); assert.equal(await page.locator('#scores').isVisible(), false);
  await page.setViewportSize({ width: 960, height: 640 }); await page.waitForTimeout(250);
  await page.screenshot({ path: 'artifacts/compact.png' });
  const fps = await game(() => new Promise(resolve => { let n = 0; const t = performance.now(); const tick = () => { n++; if (performance.now() - t > 1500) resolve(n * 1000 / (performance.now() - t)); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
  const render = await game(() => ({ calls: window.__iz.renderer.info.render.calls, triangles: window.__iz.renderer.info.render.triangles }));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ fps: Math.round(fps), render }));

  // Her tur sonu → rol seçimi → tur girişi; beşinci turdan sonra yeni maç yine rol seçimiyle başlar.
  for (let round = 1; round <= 5; round++) {
    await game(() => window.__iz.finish());
    await page.waitForSelector('#next');
    if (round === 5) { await page.screenshot({ path: 'artifacts/final.png' }); assert.equal(await game(() => window.__iz.world.history.length), 5); }
    await page.click('#next');
    await page.click(`[data-role="${['prosecutor', 'criminal', 'detective', 'prosecutor', 'criminal'][round - 1]}"]`);
    assert.equal(await page.locator('#beginRound').isVisible(), true);
    await page.click('#beginRound');
  }
  assert.equal(await game(() => window.__iz.world.round), 1);
  assert.equal(await game(() => window.__iz.world.player.role), 'criminal');
  assert.equal(await game(() => window.__iz.world.history.length), 0);
  assert.deepEqual(errors, []);
  console.log('Tarayıcı dumanı testi geçti: menü, rol seçimi, hareket, sis, sol tık eylemleri, kutu, saydamlık, iz oku, beş tur.');
} finally {
  await browser.close();
}
