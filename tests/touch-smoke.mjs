// Dokunmatik duman testi: telefon taklidi (yatay 844x390, dokunmatik, ?touch). Menüden tek başına oyuna girer;
// sınananlar: dokunmatik düğmeler yalnızca oyunda görünür, joystick karakteri yürütür, dünyaya dokunmak hedef seçer
// (eylem yapmaz), büyük düğme seçili hedefe rolün eylemini yapar, düğme adı ve Kılık role göre değişir, ☰ menüyü açar,
// dikey tutunca "yan çevir" uyarısı. Ekran görüntüleri artifacts/touch-*.png.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5197';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = (fn, arg) => page.evaluate(fn, arg);
  /** Ekran noktasına dokunmatik pointer olayı yollar (altındaki öğeye; pointer capture gerekmez, pad olayları kendisi dinler). */
  const touchAt = (type, x, y, id = 7) => game(([type, x, y, id]) => {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch', isPrimary: true }));
  }, [type, x, y, id]);
  const tap = async (x, y) => { await touchAt('pointerdown', x, y); await page.waitForTimeout(40); await touchAt('pointerup', x, y); };
  const button = id => game(id => { const r = document.querySelector(`[data-t="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);

  await page.goto(url + '/?test=1&touch');
  await page.waitForFunction(() => window.__iz);
  await page.waitForTimeout(800);
  assert.ok(await game(() => document.getElementById('iz-game').classList.contains('touch')));
  assert.equal(await game(() => document.querySelector('#touch').hidden), true, 'menüde dokunmatik düğme yok');
  await page.screenshot({ path: 'artifacts/touch-menu.png' });
  await page.tap('#start'); await page.tap('#setupGo');
  await page.tap('[data-role="detective"]'); await page.tap('#beginRound');
  await page.waitForTimeout(300);
  assert.equal(await game(() => document.querySelector('#touch').hidden), false, 'oyunda dokunmatik düğmeler');
  assert.equal(await game(() => document.querySelector('[data-t="use"] b').textContent), 'İŞARETLE');
  assert.equal(await game(() => document.querySelector('[data-t="swap"]').hidden), true, 'Kılık yalnızca suçluda');

  // Joystick: sol yarıda parmağı yukarı kaydırıp tut.
  const p0 = await game(() => ({ x: window.__iz.world.player.x, z: window.__iz.world.player.z }));
  let moved = 0;
  for (const [dx, dy] of [[0, -60], [0, 60], [-60, 0], [60, 0]]) {
    const start = await game(() => ({ x: window.__iz.world.player.x, z: window.__iz.world.player.z }));
    await touchAt('pointerdown', 160, 240, 3);
    for (let i = 1; i <= 6; i++) { await touchAt('pointermove', 160 + dx * i / 6, 240 + dy * i / 6, 3); await page.waitForTimeout(20); }
    await page.waitForTimeout(600);
    await touchAt('pointerup', 160 + dx, 240 + dy, 3);
    const end = await game(() => ({ x: window.__iz.world.player.x, z: window.__iz.world.player.z }));
    moved = Math.max(moved, Math.hypot(end.x - start.x, end.z - start.z));
    if (moved > 1.5) break;
  }
  assert.ok(moved > 1.5, `joystick yürütür (${moved.toFixed(2)}, başlangıç ${p0.x.toFixed(1)})`);
  await page.screenshot({ path: 'artifacts/touch-play.png' });

  // İki parmak: açınca yaklaştırır, kapatınca uzaklaştırır; yakınlaştırma sırasında karakter yürümez.
  {
    const z0 = await game(() => window.__iz.app.zoomPlay), at = await game(() => ({ x: window.__iz.world.player.x, z: window.__iz.world.player.z }));
    const pinch = async (from, to) => {
      await touchAt('pointerdown', 300 - from, 200, 11); await touchAt('pointerdown', 300 + from, 200, 12);
      for (let i = 1; i <= 5; i++) {
        const g = from + (to - from) * i / 5;
        await touchAt('pointermove', 300 - g, 200, 11); await touchAt('pointermove', 300 + g, 200, 12); await page.waitForTimeout(20);
      }
      await touchAt('pointerup', 300 - to, 200, 11); await touchAt('pointerup', 300 + to, 200, 12);
      await page.waitForTimeout(100);
      return game(() => window.__iz.app.zoomPlay);
    };
    const zin = await pinch(40, 100);
    assert.ok(Math.abs(zin - z0 / 2.5) < 0.5 || zin === 10, `açmak yaklaştırır (${z0} → ${zin.toFixed(1)})`);
    const zout = await pinch(100, 50);
    assert.ok(Math.abs(zout - zin * 2) < 0.5, `kapatmak uzaklaştırır (${zin.toFixed(1)} → ${zout.toFixed(1)})`);
    const end = await game(() => ({ x: window.__iz.world.player.x, z: window.__iz.world.player.z }));
    assert.ok(Math.hypot(end.x - at.x, end.z - at.z) < 0.3, 'yakınlaştırma joystick sayılmaz');
    assert.equal(await game(() => window.__iz.app.target), null, 'yakınlaştırma hedef seçmez');
    await game(z => { window.__iz.app.zoomPlay = z; window.__iz.app.zoom = z; }, z0);
    await page.waitForTimeout(300);
  }

  // Dokunarak hedef seç: eylem yapmaz; büyük düğme seçili hedefi işaretler.
  // Botlar uzağa alınıp dondurulur: araya bir botun işareti ya da cinayeti girmesin.
  await game(() => { const w = window.__iz.world, p = w.player, n = w.actors[30]; for (const a of w.actors.slice(1)) { a.think = 9999; a.path = []; a.x = p.x + 80; a.z = p.z + 80; } n.x = p.x + 3; n.z = p.z + 1; n.y = 0; });
  await page.waitForTimeout(200);
  const q = await game(() => { const a = window.__iz.world.actors[30]; return window.__iz.app.project(a.x, 1.1, a.z); });
  await tap(q.x, q.y);
  await page.waitForTimeout(150);
  assert.equal(await game(() => window.__iz.app.target), 30, 'dokunuş hedef seçer');
  assert.equal(await game(() => window.__iz.world.marks.size), 0, 'dokunuş tek başına eylem yapmaz');
  const use = await button('use');
  await tap(use.x, use.y);
  await page.waitForTimeout(150);
  // Bot dedektif hemen ardından işaretlerse bizimki kalkar (kasabada tek işaret): oyuncunun işaret olayına bakılır.
  const durum = await game(() => { const w = window.__iz.world, p = w.player, n = w.actors[30]; return { ok: w.marks.get(30)?.owner === 0 || w.events.some(e => e.to === 0 && e.text.startsWith('İşaret bırakıldı')), marks: [...w.marks].map(([k, m]) => [k, m.owner]), alive: [p.alive, p.caught, n.alive], d: Math.hypot(p.x - n.x, p.z - n.z), target: window.__iz.app.target, ev: w.events.slice(-4).map(e => e.text), toast: document.querySelector('#toast')?.textContent, overlay: document.querySelector('#overlay').hidden, fate: document.querySelector('#fate')?.hidden, res: !!w.result }; });
  assert.ok(durum.ok, 'büyük düğme seçili hedefi işaretler ' + JSON.stringify(durum));

  // Rol değişince düğme adı ve Kılık.
  await game(() => window.__iz.setRole('criminal'));
  await page.waitForTimeout(150);
  assert.equal(await game(() => document.querySelector('[data-t="use"] b').textContent), 'ÖLDÜR');
  assert.equal(await game(() => document.querySelector('[data-t="swap"]').hidden), false);

  // ☰ menüyü açar (tek başına oyunda duraklatır), düğmeler gizlenir.
  const menu = await button('menu');
  await tap(menu.x, menu.y);
  await page.waitForSelector('#resume');
  assert.equal(await game(() => document.querySelector('#touch').hidden), true, 'menü açıkken düğmeler gizli');
  await page.tap('#resume');

  // Dikey: yan çevir uyarısı.
  // Oyuna girerken tam ekrana geçilmişti (dokunuşla): pencere boyutu ancak çıkınca değişir.
  await game(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.ok(await game(() => getComputedStyle(document.getElementById('rotate')).display !== 'none'), 'dikeyde yan çevir uyarısı');
  assert.deepEqual(errors, []);
  console.log('Dokunmatik testi geçti: düğmeler, joystick, dokunarak seçim, eylem düğmesi, rol düğmeleri, menü, yan çevir.');
} finally {
  await browser.close();
}
