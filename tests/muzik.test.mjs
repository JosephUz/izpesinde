// Müziğin sahne seçimi: saf işlev, tarayıcı gerekmez (`node tests/muzik.test.mjs`). Hangi parçanın çalacağı
// yalnızca oyun akışından ve dünyanın durumundan okunur; burada o kural denetlenir. Çalmanın kendisini (çapraz
// geçiş, düğmeler, saklanan durum) tarayıcıda tests/muzik-smoke.mjs ölçer.
//
// Ayrıca STANDART üst araç çubuğunun ve Esc menüsünün **yazıları ve sırası** index.html / src üzerinden denetlenir:
// ← josephuz.com · Ses: açık/kapalı · Müzik: açık/kapalı · Kontroller F1. Yerleşimi (telefonda taşma) tests/standart-cubuk.mjs ölçer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GERILIM_SN, sahneSec } from '../src/muzik.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = f => readFileSync(path.join(root, f), 'utf8');
/** Tur süren dünya: `kalan` saniye kaldı. */
const tur = (kalan, result = null) => ({ seconds: 360, time: 360 - kalan, result });

test('menüde ve maç dışında sakin parça çalar', () => {
  assert.equal(sahneSec(false, null, null), 'sakin');
  assert.equal(sahneSec(false, 'hazirlik', tur(300)), 'sakin');
  assert.equal(sahneSec(false, 'lobi', tur(300)), 'sakin');
});

test('tur sürerken ana tema, ara pencerelerde sakin', () => {
  assert.equal(sahneSec(true, null, tur(300)), 'mac');
  for (const perde of ['rol', 'giris', 'mola', 'sonuc', 'lobi', 'hazirlik']) {
    assert.equal(sahneSec(true, perde, tur(300)), 'sakin', `${perde} penceresi sakin parçaya dönmeli`);
  }
});

test('yardım penceresi turun müziğini kesmez (tur üstünde açılır)', () => {
  assert.equal(sahneSec(true, 'yardim', tur(300)), 'mac');
  assert.equal(sahneSec(true, 'yardim', tur(20)), 'gerilim');
});

test('turun son 60 saniyesi gerilim', () => {
  assert.equal(sahneSec(true, null, tur(GERILIM_SN + 1)), 'mac');
  assert.equal(sahneSec(true, null, tur(GERILIM_SN)), 'gerilim');
  assert.equal(sahneSec(true, null, tur(3)), 'gerilim');
});

test('kovalamaca (savcının işaret okları) gerilim parçasını açar', () => {
  assert.equal(sahneSec(true, null, tur(300), true), 'gerilim');
  assert.equal(sahneSec(true, null, tur(300), false), 'mac');
  // Tur bitti: karne sakin parçayla gelir, kovalamaca bayrağı kalmış olsa bile.
  assert.equal(sahneSec(true, null, tur(3, { kind: 'capture' }), true), 'sakin');
});

test('STANDART üst araç çubuğu: dört düğme, bu sırayla, bu yazılarla', () => {
  const html = oku('index.html');
  const cubuk = html.match(/<div id="toptools">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(cubuk, 'index.html içinde #toptools olmalı');
  const sira = [...cubuk.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sira, ['homeLink', 'sound', 'muzik', 'helpBtn'], 'standart sıra: ← josephuz.com · Ses · Müzik · Kontroller F1');
  assert.ok(cubuk.includes('← <span class="site-name">josephuz.com</span>'), 'bağlantı yazısı "← josephuz.com" olmalı');
  assert.ok(cubuk.includes('Kontroller <kbd>F1</kbd>'), 'yardım düğmesi "Kontroller F1" olmalı (eski "Kısayollar" değil)');
  // Eski adlar bu çubukta kullanılmaz.
  for (const eski of ['Kısayollar', 'Nasıl oynanır', 'Ses açık', 'Ses kapalı']) {
    assert.ok(!cubuk.includes(eski), `üst çubukta "${eski}" kullanılmaz`);
  }
});

test('ses ve müzik yazıları standart (iki nokta, küçük harf durum) ve iki menüde de aynı', () => {
  const main = oku('src/main.js');
  assert.ok(/'Ses: ' \+ \(app\.soundOn \? 'açık' : 'kapalı'\)/.test(main), 'Ses yazısı "Ses: açık/kapalı" olmalı');
  assert.ok(/'Müzik: ' \+ \(muzik\.acik \? 'açık' : 'kapalı'\)/.test(main), 'Müzik yazısı "Müzik: açık/kapalı" olmalı');
  // syncMenu üst çubuğu ve Esc menüsünü birlikte yazar: ikisi aynı durumu gösterir.
  for (const sec of ['#sound', '#pauseSound', '#muzik', '#pauseMuzik']) {
    assert.ok(main.includes(`'${sec}'`), `syncMenu ${sec} düğmesini de tazelemeli`);
  }
});

test('STANDART Esc menüsü: sıra DEVAM ET → · Kontroller F1 · Ses · Müzik (+sürgü) · Ana menü · josephuz.com', () => {
  const screens = oku('src/screens.js');
  const stack = screens.match(/<div class="menu-stack">([\s\S]*?)<\/div>`, 'mola'\)/)?.[1];
  assert.ok(stack, 'Esc menüsü .menu-stack ile kurulmalı');
  // Müzik düğmesi ve sürgüsü ayrı bir parçadan (`${muzik}`) gelir: gösteri / test kipinde hiç eklenmez.
  const muzikParca = screens.match(/\? `(<button class="secondary" id="pauseMuzik">[\s\S]*?)`\s*\n/)?.[1];
  assert.ok(muzikParca, 'müzik düğmesi + ses sürgüsü ayrı bir parça olmalı');
  const sira = [...stack.replace('${muzik}', muzikParca).matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sira, ['resume', 'pauseHelp', 'pauseSound', 'pauseMuzik', 'muzikRow', 'muzikSes', 'muzikYuzde', 'quit'],
    'Esc menüsünün standart sırası');
  assert.ok(stack.includes('DEVAM ET →'), 'ilk düğme "DEVAM ET →"');
  assert.ok(stack.includes('Kontroller <kbd>F1</kbd>'), 'ikinci düğme "Kontroller F1"');
  assert.ok(stack.includes("josephuz.com'a dön"), 'son satır josephuz.com bağlantısı');
});

test('ses ve müzik tarayıcıda ayrı anahtarlarda saklanır, varsayılan müzik açık', () => {
  const main = oku('src/main.js'), muzik = oku('src/muzik.js');
  assert.ok(main.includes("localStorage.setItem('iz.sound'"), 'efekt sesi iz.sound anahtarında saklanmalı');
  assert.ok(muzik.includes("sakla('iz.muzik'"), 'müzik iz.muzik anahtarında saklanmalı');
  assert.ok(muzik.includes("sakla('iz.muzik.ses'"), 'müzik sesi iz.muzik.ses anahtarında saklanmalı');
  // Varsayılan açık: yalnızca 'off' yazılıysa kapalı.
  assert.ok(muzik.includes("localStorage.getItem('iz.muzik') !== 'off'"), 'müzik varsayılan olarak açık olmalı');
});

test('her parça ve lisans dosyası yerinde', () => {
  for (const f of ['iz-1-gizem.mp3', 'iz-2-pazar-meydani.mp3', 'iz-3-sucu-aramizda.mp3', 'LISANS.txt']) {
    const boy = readFileSync(path.join(root, 'muzik', f)).length;
    assert.ok(boy > 0, `muzik/${f} olmalı`);
    if (f.endsWith('.mp3')) assert.ok(boy <= 3 * 1024 * 1024, `muzik/${f} 3 MB'ı aşmamalı (${boy})`);
  }
  assert.ok(oku('muzik/LISANS.txt').includes('VSCO 2 Community Edition'), 'lisans metni örneklerin kaynağını yazmalı');
  assert.ok(oku('scripts/build-web.mjs').includes("'muzik'"), 'yayın çıktısına muzik/ klasörü de girmeli');
});
