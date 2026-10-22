// Tarayıcı dumanı testi: çalışan sunucuya (GAME_URL, varsayılan http://127.0.0.1:5197) başsız Chromium ile bağlanır.
// Menü, rol seçimi, yürüme, çift zıplama, görüş sisi, duraklatma, gerçek sol tıkla işaret / yakalama / kılık, kenar
// uyarısı, E ile kutu, suçlunun Q ile kılığı ve sol tıkla öldürmesi, görüş alanındaki sabit nesnelerin saydamlığı, iz oku, skor tablosu, küçük ekran, beş turun ekran geçişleri ve gösteri kipleri (?gosteri=son-takip, ?gosteri=roller) denetlenir.
// Ekran görüntüleri artifacts/ altına. Playwright yolu: PLAYWRIGHT_MODULE (npm test bunu kendisi bulur).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5197';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1440, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
  const game = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(url + '/?test=1');
  await page.waitForFunction(() => window.__iz);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'artifacts/menu.png' });

  // Rol seçimi: her turun başında üç kart; seçilen rol oyuncuya verilir.
  // Tek başına: önce hazırlık penceresi (botların zorluğu), sonra rol seçimi.
  await page.click('#start');
  await page.waitForSelector('#setupGo');
  await page.click('[data-setup-level="easy"]');
  await page.screenshot({ path: 'artifacts/setup.png' });
  await page.click('#setupGo');
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
    // Sis iç yarıçapı görüşün 3 birim içidir; görüşün 1 birim dışındaki kimse çizilmemeli.
    const w = window.__iz.world, p = w.player, near = window.__iz.app.fogNear(), edge = near + 4; let far = 0, drawn = 0;
    for (const a of w.actors) if (Math.hypot(a.x - p.x, a.z - p.z) > edge) { far++; if (window.__iz.characters.isDrawn(a.id)) drawn++; }
    return { near, far, drawn };
  });
  assert.ok(vision.near < 100, 'oyunda sis karakterin çevresine kapanır'); assert.ok(vision.far > 0); assert.equal(vision.drawn, 0);
  await page.screenshot({ path: 'artifacts/game.png' });

  await page.keyboard.press('Escape');
  const time = await game(() => window.__iz.world.time);
  await page.waitForTimeout(250);
  assert.equal(await game(() => window.__iz.world.time), time, 'duraklatınca zaman durur');
  await page.click('#resume');

  // Fare tekerleği yaklaştırır / uzaklaştırır (sınırlar içinde), tercih saklanır.
  {
    const z0 = await game(() => window.__iz.app.zoomPlay);
    await page.mouse.move(640, 400);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(30); }
    const zin = await game(() => window.__iz.app.zoomPlay);
    assert.ok(zin < z0 - 3, `tekerlek yaklaştırır (${z0} → ${zin.toFixed(1)})`);
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
    assert.equal(await game(() => window.__iz.app.zoomPlay), 34, 'uzaklaştırma sınırı');
    assert.equal(await game(() => localStorage.getItem('iz.zoom')), '34.00');
    await game(z => { window.__iz.app.zoomPlay = z; }, z0);
    await page.waitForTimeout(800);
  }

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
  // Uzağa yığılan bot dedektifler birbirini işaretlerse bizimki kalkar (kasabada tek işaret): oyuncunun işaret olayına da bakılır.
  assert.ok(await game(() => window.__iz.world.marks.get(30)?.owner === 0 || window.__iz.world.events.some(e => e.to === 0 && e.kod === 'isaretBirakildi')), 'dedektif sol tıkla işaretler');
  assert.equal(await game(() => window.__iz.reachRing()), null, 'dedektifin menzil halkası yok (menzil görüş)');
  await game(() => window.__iz.setRole('prosecutor')); await page.waitForTimeout(100);
  assert.deepEqual(await game(() => window.__iz.reachRing()), { role: 'prosecutor', radius: 4 }, 'savcının yakalama halkası');
  await page.screenshot({ path: 'artifacts/reach-prosecutor.png' });
  await clickOn(30);
  assert.ok(await game(() => window.__iz.world.marks.get(30)?.cleared || window.__iz.world.events.some(e => e.to === 0 && e.kod === 'yanlisKisi')), 'savcı sol tıkla yakalar (yanlış kişi: aklanır)');
  // Suçlu: imleçteki kişinin kılığına Q ile girer.
  await game(() => window.__iz.setRole('criminal')); await page.waitForTimeout(100);
  assert.deepEqual(await game(() => window.__iz.reachRing()), { role: 'criminal', radius: 2.8 }, 'suçlunun öldürme halkası');
  { const q = await game(() => { const a = window.__iz.world.actors[30]; return window.__iz.app.project(a.x, 1.1, a.z); }); await page.mouse.move(q.x, q.y); await page.waitForTimeout(150); }
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  assert.ok(await game(() => window.__iz.world.player.appearance === window.__iz.world.actors[30].appearance), 'suçlu Q ile kılığa girer');
  await game(() => { const w = window.__iz.world; w.marks.set(0, { owner: 1, ox: 0, oz: 0, cleared: false, time: w.time }); });
  await page.waitForTimeout(250);
  assert.ok(await game(() => document.getElementById('alert').classList.contains('on')), 'işaretli suçlunun ekran kenarı kızarır');
  await page.screenshot({ path: 'artifacts/alert.png' });

  // Kanun kutucukları: 2 savcı, 6 küçük dedektif kutucuğu; ölen ✗ olur (önce yaşayanlar).
  assert.deepEqual(await game(() => [document.querySelectorAll('#pros span').length, document.querySelectorAll('#dets span').length]), [2, 6]);
  const deadBefore = await game(() => ['#pros', '#dets'].map(s => document.querySelectorAll(s + ' .dead').length));
  const fallen = await game(() => {
    const w = window.__iz.world, c = w.actors.slice(0, 10), p = c.find(a => a.role === 'prosecutor' && a.alive && a !== w.player), d = c.find(a => a.role === 'detective' && a.alive && a !== w.player);
    p.alive = false; d.alive = false; return [p.id, d.id];
  });
  await page.waitForTimeout(250);
  const boxes = () => game(() => ['#pros', '#dets'].map(s => [...document.querySelectorAll(s + ' span')].map(e => e.textContent).join('')));
  const [pb, db] = await boxes();
  assert.match(pb + db, /^◇+✗*◇+✗*$/, 'önce yaşayanlar, sonra ölenler');
  assert.deepEqual([pb.split('✗').length - 1, db.split('✗').length - 1], deadBefore.map(n => n + 1), 'ölen savcı / dedektif ✗');
  await page.locator('#cluebar').screenshot({ path: 'artifacts/cluebar.png' });
  await game(ids => { for (const id of ids) window.__iz.world.actors[id].alive = true; }, fallen);

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

  // Suçlu imleçteki yakın kişiyi sol tıkla öldürür.
  await game(() => { window.__iz.setRole('criminal'); const w = window.__iz.world, p = w.player, n = w.actors[31]; n.x = p.x + 1.5; n.z = p.z; n.think = 9999; n.path = []; });
  await clickOn(31);
  assert.equal(await game(() => window.__iz.world.actors[31].alive), false, 'suçlu sol tıkla öldürür');
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

  // Öldürülme sahnesi: kart açılır, kamera oyuncuya yaklaşır, kan göleti yayılır; tur sonu sahne bitene kadar bekler.
  await game(() => { window.__iz.setRole('detective'); const p = window.__iz.world.player; p.alive = false; });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#fate').isVisible(), true, 'öldürülünce kart açılır');
  assert.equal(await page.locator('#fate h2').textContent(), 'Öldürüldün');
  assert.equal(await game(() => window.__iz.fateParts().pool), true, 'kan göleti');
  assert.equal(await page.locator('#spectator').isVisible(), false, 'sahne sürerken izleyici yazısı yok');
  await page.waitForTimeout(900);
  assert.ok(await game(() => window.__iz.app.zoom < 16), 'kamera oyuncuya yaklaşır');
  await page.screenshot({ path: 'artifacts/fate-murder.png' });
  await page.click('#fateClose');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#fate').isVisible(), false, 'İzlemeye geç kartı kapatır');
  assert.equal(await page.locator('#spectator').isVisible(), true, 'sonra izleyici');

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

  // Yakalanma sahnesi: kafes iner, kart açılır.
  await game(() => { const p = window.__iz.world.player; p.caught = true; });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#fate h2').textContent(), 'Yakalandın');
  assert.equal(await game(() => window.__iz.fateParts().cage), true, 'kafes');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/fate-caught.png' });
  // Başkasının öldürülmesi de animasyonludur: görüş alanındaki her ölüye bıçak izi ve kan göleti.
  const pools0 = await game(() => window.__iz.fateParts().pools);
  await game(() => { const w = window.__iz.world, p = w.player, n = w.actors[40]; n.x = p.x + 3; n.z = p.z + 2; n.alive = false; });
  await page.waitForTimeout(300);
  assert.equal(await game(() => window.__iz.fateParts().pools), pools0 + 1, 'görülen her cinayet animasyonlu');
  // Tur sonu sahnesi: tablo hemen açılmaz, herkes bitişi izler (başlık + kamera).
  await game(() => window.__iz.finish('capture'));
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#ending').isVisible(), true, 'tur sonu başlığı');
  assert.equal(await page.locator('#ending h2').textContent(), 'KANUN KAZANDI');
  await page.screenshot({ path: 'artifacts/ending.png' });
  assert.equal(await page.locator('#next').count(), 0, 'tur sonu ekranı sahne bitene kadar bekler');
  await page.waitForSelector('#next', { timeout: 6000 });
  assert.equal(await page.locator('#fate').isVisible(), false);
  assert.equal(await page.locator('#ending').isVisible(), false, 'tablo açılınca başlık gider');
  assert.deepEqual(errors, []);

  // Gösteri kipi (`?gosteri=son-takip`, içerik videosu için; bkz. src/gosteri.js). Sahnenin zamanlaması kural
  // testinde ölçülür (tests/rules-smoke.mjs); burada yalnızca tarayıcıda açıldığı denetlenir: menü atlanır, HUD
  // sahnenin durumunu gösterir, girdiye bakan parçalar gizlenir ve savcı izin peşinde yürümeye başlar.
  const gp = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1080, height: 1920 } }), gErrors = [];
  gp.on('pageerror', e => gErrors.push(e.message));
  gp.on('console', e => { if (e.type() === 'error') gErrors.push(e.text()); });
  await gp.goto(url + '/?gosteri=son-takip&muzik=0');
  await gp.waitForFunction(() => window.__gosteri);
  const basla = await gp.evaluate(() => {
    const w = window.__gosteri.world, y = w.actors.slice(0, 10);
    return {
      rol: w.player.role, savci: { x: w.player.x, z: w.player.z },
      yakalanan: y.filter(a => a.caught).length, oluSavci: y.filter(a => !a.alive && a.role === 'prosecutor').length,
      oluDedektif: y.filter(a => !a.alive && a.role === 'detective').length, kalan: w.seconds - w.time,
    };
  });
  assert.equal(basla.rol, 'prosecutor', 'gösteride kamera savcıda');
  assert.deepEqual([basla.yakalanan, basla.oluSavci, basla.oluDedektif], [1, 1, 4], 'bir suçlu yakalanmış, bir savcı ve dört dedektif ölü');
  assert.ok(Math.abs(basla.kalan - 30) < 1.5, `tur sonuna 30 sn kala (${basla.kalan})`);
  assert.equal(await gp.locator('#roundbar').isVisible(), true, 'HUD açık');
  assert.equal(await gp.locator('#cluebar').isVisible(), true, 'suçlu / savcı / dedektif kutuları açık');
  assert.equal(await gp.locator('#menu').isVisible(), false, 'menü atlanır');
  assert.equal(await gp.locator('#actionbar').isVisible(), false, 'girdi çubuğu gizli');
  // İzler iki saniyede bir düşüp iki saniye yaşar: tek bir ana bakmak yerine düşmeleri beklenir.
  await gp.waitForFunction(() => window.__gosteri.world.traces.some(t => t.role === 'prosecutor'), null, { timeout: 8000 });
  await gp.waitForTimeout(2500);
  const sonra = await gp.evaluate(() => ({ saniye: window.__gosteri.saniye, uzaklik: Math.hypot(window.__gosteri.world.player.x, window.__gosteri.world.player.z) }));
  assert.ok(sonra.saniye > 1.5, 'sahnenin saati işler');
  assert.ok(sonra.uzaklik < Math.hypot(basla.savci.x, basla.savci.z), 'savcı pazara doğru ilerler');
  await gp.screenshot({ path: 'artifacts/gosteri-son-takip.png' });
  assert.deepEqual(gErrors, []);
  await gp.close();

  // Üç rol gösterisi (`?gosteri=roller`, bkz. src/gosteri-roller.js). Zamanlaması kural testinde ölçülür; burada
  // tarayıcıya ait olan denetlenir: direktif yazısı kutusu doğar, HUD rolün gözünden okunur ve kamera role göre
  // kendi karakterine bağlanır.
  const rp = await browser.newPage({ locale: 'tr-TR', viewport: { width: 1080, height: 1920 } }), rErrors = [];
  rp.on('pageerror', e => rErrors.push(e.message));
  rp.on('console', e => { if (e.type() === 'error') rErrors.push(e.text()); });
  await rp.goto(url + '/?gosteri=roller&muzik=0');
  await rp.waitForFunction(() => window.__gosteri);
  assert.equal(await rp.locator('#menu').isVisible(), false, 'menü atlanır');
  assert.equal(await rp.locator('#actionbar').isVisible(), false, 'girdi çubuğu gizli');
  // Açılışta suçlunun gözündeyiz: rol kartı Suçlu yazar ve ilk direktif yazısı kutusu gelir.
  await rp.waitForSelector('#iz-gosteri-yazi', { timeout: 6000 });
  assert.equal(await rp.locator('#role').textContent(), 'Suçlu', 'HUD rolün gözünden okunur');
  assert.match(await rp.locator('#iz-gosteri-yazi').textContent(), /SEN SUÇLUSUN/, 'ilk direktif yazısı ekranda');
  const kutu = await rp.locator('#iz-gosteri-yazi').evaluate(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return { yuvarlak: s.borderRadius, kalin: s.fontWeight, ortada: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2, ust: r.top / innerHeight };
  });
  assert.ok(kutu.ortada && kutu.ust > 0.18 && kutu.ust < 0.42, 'yazı kutusu ekranın ortasına yakın ve yatayda ortalı');
  assert.equal(kutu.kalin, '900'); assert.equal(kutu.yuvarlak, '999px');
  await rp.screenshot({ path: 'artifacts/gosteri-roller.png' });
  // Savcının gözüne geçiş: rol kartı da kamera da savcıya döner (sahnenin 9,23. saniyesi).
  await rp.waitForFunction(() => window.__gosteri.rol === 'prosecutor', null, { timeout: 20000, polling: 100 });
  await rp.waitForTimeout(600);
  assert.equal(await rp.locator('#role').textContent(), 'Savcı', 'rol değişince HUD da döner');
  assert.deepEqual(rErrors, []);
  await rp.close();

  console.log('Tarayıcı dumanı testi geçti: menü, rol seçimi, hareket, sis, sol tık eylemleri, kutu, saydamlık, iz oku, elenme sahneleri, beş tur, iki gösteri kipi.');
} finally {
  await browser.close();
}
