// Kural testleri: simülasyon başsız koşar (tarayıcı ve sunucu gerekmez). Tek başına: `node tests/rules-smoke.mjs`.
// Rol dağıtımı ve seçimi, izler, işaret, yakalama, kılık, cinayet, bitiş koşulları, puanlar, kutu, hareket ve beş
// turluk otomatik maç.
import test from 'node:test';
import assert from 'node:assert/strict';
import { think } from '../src/ai.js';
import { CFG } from '../src/config.js';
import { disguise, murder } from '../src/criminal.js';
import { carry, dash, followPath, jump, move } from '../src/crowd.js';
import { REGIONS } from '../src/environment.js';
import { arrest, caughtNow, mark, marksFor } from '../src/marks.js';
import { blocked, dist } from '../src/physics.js';
import { contestants } from '../src/roster.js';
import { finish } from '../src/score.js';
import { traceEvery, traceLag } from '../src/traces.js';
import { createWorld, spectate, startRound, step } from '../src/world.js';

const S = CFG.scores;
const setup = (role = null) => {
  const w = createWorld({ seed: 15 });
  startRound(w, role);
  for (const a of w.actors) { a.x = 0; a.z = 5; a.think = 9999; a.path = []; }
  return w;
};
const role = (w, r) => contestants(w).filter(a => a.role === r);
const civilian = w => w.actors[20];
const counts = w => ['criminal', 'detective', 'prosecutor'].map(r => role(w, r).length).join('/');

test('Beş tur skoru korur, her tur tam 2/6/2 rol ve taze haklar', () => {
  const w = setup();
  for (let round = 1; round <= 5; round++) {
    assert.equal(w.round, round); assert.equal(counts(w), '2/6/2');
    for (const d of role(w, 'detective')) assert.equal(d.marks, CFG.marks);
    for (const p of role(w, 'prosecutor')) assert.equal(p.catches, CFG.catches);
    finish(w, 'timeout');
    if (round < 5) assert.ok(startRound(w));
  }
  assert.equal(startRound(w), false); assert.equal(w.history.length, 5);
});

test('Oyuncu her tur rolünü seçer, botlar kalanı 2/6/2 olacak şekilde paylaşır', () => {
  const w = createWorld({ seed: 9 });
  for (const r of ['criminal', 'prosecutor', 'detective', 'criminal', 'prosecutor']) {
    startRound(w, r);
    assert.equal(w.player.role, r); assert.equal(counts(w), '2/6/2');
    finish(w, 'timeout');
  }
});

test('Yarışmacılar pazarda toplu başlamaz, kalabalık büyüktür, suç zaten işlenmiştir', () => {
  const w = createWorld({ seed: 3 }); startRound(w);
  assert.equal(w.actors.length, 10 + CFG.crowd);
  assert.ok(contestants(w).filter(a => dist(a, REGIONS[0]) < 20).length < 10);
  assert.ok(w.events.some(e => e.text.includes('Suç çoktan işlendi')));
});

test('İz aralığı ve gecikmesi 5 sn başlar, kısalır, son dakikada 2 sn olur', () => {
  const at = [0, 59, 60, 119, 120, 239, 299, 300, 359];
  assert.deepEqual(at.map(traceEvery), [5, 5, 4, 4, 3, 3, 3, 2, 2]);
  assert.deepEqual(at.map(traceLag), [5, 5, 4, 4, 3, 3, 3, 2, 2]);
});

test('Her iz anında iki iz düşer: dedektif ve savcı türü, gecikme kadar önceki yere, 2 sn yaşar; suçlular kaydırılmıştır', () => {
  const w = setup(), [a, b] = role(w, 'criminal');
  for (let i = 0; i < 51; i++) { a.x += 0.04; step(w, 0.05); }
  assert.equal(w.traces.filter(t => t.by === a.id).length, 0, 'ilk suçlu ilk izini 5. saniyede bırakır');
  assert.deepEqual(w.traces.filter(t => t.by === b.id).map(t => t.role).sort(), ['detective', 'prosecutor'], 'ikinci suçlu yarım aralık önce');
  // İlk dakikada gecikme 5 sn: iz suçlunun 5 sn önceki yerine düşer.
  a.traceClock = 0.05; const x = a.x;
  for (let i = 0; i < 3; i++) { a.x += 0.5; step(w, 0.05); }
  const mine = w.traces.filter(t => t.by === a.id);
  assert.equal(mine.length, 2);
  for (const t of mine) { assert.ok(t.x < x - 1.5, 'iz suçlunun birkaç saniye gerisinde'); assert.equal(t.lag, 5); }
  for (let i = 0; i < 20; i++) step(w, 0.05);
  assert.equal(w.traces.filter(t => mine.includes(t)).length, 2, 'iz 1 sn sonra hâlâ yerde');
  for (let i = 0; i < 22; i++) step(w, 0.05);
  assert.equal(w.traces.filter(t => mine.includes(t)).length, 0, '2 sn sonra kaybolur');
});

test('İşaret hak harcar, dedektif başına tek aktif işaret; suçlu işareti herkese, diğerleri yalnızca sahibine ve savcılara görünür', () => {
  const w = setup(), [d, e] = role(w, 'detective'), [c] = role(w, 'criminal'), n = civilian(w), p = role(w, 'prosecutor')[0];
  assert.equal(mark(w, d, p), false, 'tanınan savcı işaretlenemez');
  assert.ok(mark(w, d, c)); assert.equal(d.marks, 2);
  assert.equal(marksFor(w, e).length, 1, 'suçlunun işaretini diğer dedektif de görür');
  assert.equal(mark(w, d, c), false, 'kendi hedefini yeniden işaretlemek reddedilir');
  assert.ok(mark(w, d, n)); assert.equal(w.marks.has(c.id), false, 'yeni işaret eskisini kaldırır');
  assert.equal(marksFor(w, d).length, 1); assert.equal(marksFor(w, e).length, 0); assert.equal(marksFor(w, p).length, 1);
});

test('Başka dedektif aynı kişiyi işaretlerse eski sahibine uyarı gider', () => {
  const w = setup('detective'), c = role(w, 'criminal')[0], other = role(w, 'detective').find(d => d !== w.player);
  assert.ok(mark(w, w.player, c)); assert.ok(mark(w, other, c));
  assert.equal(w.marks.get(c.id).owner, other.id);
  assert.ok(w.events.some(e => e.text.includes('başka bir dedektif tarafından kaldırıldı')));
});

test('Yanlış işaret tur sonunda −1 yazılır ve haritada kalır', () => {
  const w = setup(), d = role(w, 'detective')[0], n = civilian(w);
  assert.ok(mark(w, d, n)); assert.equal(w.tally[d.id], 0, 'bedel tur içinde görünmez'); assert.ok(w.marks.has(n.id));
  finish(w, 'timeout'); assert.equal(w.result.points[d.id], S.wrongMark);
});

test('Doğru yakalama savcıyı ve işaretleyeni ödüllendirir; yanlış yakalama −1 ve işaret aklanır', () => {
  const w = setup(), d = role(w, 'detective')[0], [p, q] = role(w, 'prosecutor'), [c] = role(w, 'criminal'), n = civilian(w);
  mark(w, d, n); assert.ok(arrest(w, p, n));
  assert.equal(n.caught, false); assert.equal(w.tally[p.id], S.wrongCatch); assert.ok(w.marks.get(n.id).cleared);
  mark(w, d, c); assert.ok(arrest(w, q, c));
  assert.ok(c.caught); assert.equal(w.tally[q.id], S.catchBonus); assert.equal(w.tally[d.id], S.markBonus); assert.equal(q.catches, 2);
});

test('Yakalama menzili ve hakkı uygulanır; haklar biterse suçlular kazanır', () => {
  const w = setup(), [p, q] = role(w, 'prosecutor'), n = civilian(w);
  n.x = 30; assert.equal(arrest(w, p, n), false); n.x = 0;
  for (const x of [p, q]) for (let i = 0; i < 3; i++) arrest(w, x, n);
  assert.equal(w.result.kind, 'rights');
  for (const c of role(w, 'criminal')) assert.equal(w.result.points[c.id], S.criminalWin);
});

test('İşaret hakları biterse tur biter; ama aktif bir işaret serbest suçluyu gösteriyorsa bitmez', () => {
  let w = setup();
  for (const d of role(w, 'detective')) for (let i = 0; i < 3; i++) mark(w, d, i % 2 ? w.actors[30] : civilian(w));
  assert.equal(w.result.kind, 'marks');
  w = setup();
  const dets = role(w, 'detective'), c = role(w, 'criminal')[0];
  for (const d of dets) d.marks = 0;
  dets[0].marks = 1; assert.ok(mark(w, dets[0], c)); assert.equal(w.result, null);
});

test('Yalnızca suçlu kılık değiştirir; her değişim −1, işaret kalkar, haritada sönen daire kalır', () => {
  const w = setup(), [c] = role(w, 'criminal'), d = role(w, 'detective')[0], n = civilian(w);
  n.appearance = (c.appearance + 1) % 10;
  assert.equal(disguise(w, d, n), false);
  mark(w, d, c); assert.ok(disguise(w, c, n));
  assert.equal(c.appearance, n.appearance); assert.equal(w.tally[c.id], S.disguise); assert.equal(w.marks.has(c.id), false); assert.equal(w.ghosts.length, 1);
  c.disguiseCd = 0; w.actors[21].appearance = (n.appearance + 1) % 10;
  assert.ok(disguise(w, c, w.actors[21])); assert.equal(w.tally[c.id], 2 * S.disguise);
});

test('Görülen kılık değişimi takibi korur, görülmeyen koparır', () => {
  const w = setup(), [c] = role(w, 'criminal'), [d, far] = role(w, 'detective'), n = civilian(w);
  far.x = 80; far.z = 80; n.appearance = (c.appearance + 1) % 10;
  for (const x of [d, far]) x.suspects.set(c.id, { score: 0.5, time: 0, x: c.x, z: c.z });
  disguise(w, c, n);
  assert.ok(d.suspects.get(c.id).score > 2); assert.equal(far.suspects.has(c.id), false);
});

test('Ortak cinayet hakkı: NPC −1, dedektif +1, savcı +2; haklar biter', () => {
  const w = setup(), [a, b] = role(w, 'criminal'), d = role(w, 'detective')[0], p = role(w, 'prosecutor')[0];
  assert.equal(murder(w, a, b), false, 'ortak hedeflenemez');
  assert.ok(murder(w, a, d)); assert.equal(d.alive, false); assert.equal(d.marks, 0); assert.equal(w.tally[a.id], S.killDetective);
  assert.ok(murder(w, b, p)); assert.equal(p.alive, false); assert.equal(p.catches, 0); assert.equal(w.tally[b.id], S.killProsecutor);
  assert.equal(w.killsLeft, 0); assert.equal(murder(w, a, civilian(w)), false);
  const v = setup(), [x] = role(v, 'criminal');
  assert.ok(murder(v, x, civilian(v))); assert.equal(v.tally[x.id], S.killCivilian);
});

test('İki savcı da ölürse suçlular kazanır', () => {
  const w = setup(), [a, b] = role(w, 'criminal'), [p, q] = role(w, 'prosecutor');
  murder(w, a, p); assert.equal(w.result, null);
  murder(w, b, q); assert.equal(w.result.kind, 'prosecutors');
  for (const c of [a, b]) assert.equal(w.result.points[c.id], S.killProsecutor + S.criminalWin);
});

test('Tur puanları: kanun kazanırsa her kanuncu +1; serbest suçlu +5 ve serbest dakika başına +1', () => {
  let w = setup();
  const [a, b] = role(w, 'criminal');
  w.time = 150; caughtNow(w, a); w.time = 200; caughtNow(w, b);
  assert.equal(w.result.kind, 'capture');
  for (const x of contestants(w).filter(x => x.role !== 'criminal')) assert.equal(w.result.points[x.id], S.lawWin);
  assert.equal(w.result.points[a.id], 2); assert.equal(w.result.points[b.id], 3);
  w = setup();
  const [c, e] = role(w, 'criminal');
  w.time = 130; caughtNow(w, c); w.time = CFG.seconds - 0.01; step(w, 0.05);
  assert.equal(w.result.kind, 'timeout');
  assert.equal(w.result.points[e.id], S.criminalWin + 6); assert.equal(w.result.points[c.id], 2);
  assert.equal(w.result.points[role(w, 'detective')[0].id], 0);
});

test('E ile kutu alınır, taşıyanla gider, önüne bırakılır', () => {
  const w = setup(), a = w.player;
  a.x = w.crates[0].x; a.z = w.crates[0].z + 1;
  assert.ok(carry(w, a));
  const c = w.crates[a.crate];
  assert.equal(c.carrier, a.id); assert.ok(a.carry);
  move(w, a, 1, 0, 0.5); assert.equal(c.x, a.x);
  assert.ok(carry(w, a)); assert.equal(c.carrier, null); assert.equal(a.carry, false);
});

test('Zıplama ve atılma sınırlı, havadan inişte binaya sıkışılmaz, harita sınırı geçilmez', () => {
  const w = setup(), a = w.player;
  jump(w, a); jump(w, a); jump(w, a); assert.equal(a.jumps, 2);
  const b = w.env.buildings[0];
  a.x = b.x; a.z = b.z; a.y = 0.1; a.vy = -10; step(w, 0.05);
  assert.equal(blocked(w.env, a.x, a.z), false); assert.equal(a.jumps, 0);
  dash(w, a); const cd = a.dashCd; dash(w, a); assert.equal(a.dashCd, cd);
  a.y = 2; a.x = CFG.half - 1.1; move(w, a, 1, 0, 1); assert.ok(a.x <= CFG.half - 1);
});

test('İzleyici aynı roldeki hayattakileri izler; yeni tur işaretleri, izleri ve cinayet haklarını sıfırlar', () => {
  const w = setup();
  w.player.alive = false;
  const t = spectate(w); assert.ok(t); assert.equal(t.role, w.player.role);
  w.killsLeft = 0; w.marks.set(5, { owner: 1 }); finish(w, 'timeout'); startRound(w);
  assert.ok(w.player.alive); assert.equal(w.killsLeft, CFG.kills); assert.equal(w.marks.size, 0); assert.equal(w.traces.length, 0);
});

test('Tohumlu otomatik maç beş turu bitirir ve kanun en az bir tur kazanabilir', () => {
  const w = createWorld({ seed: 812 }), outcomes = [];
  for (let r = 0; r < 5; r++) {
    startRound(w, ['detective', 'prosecutor', 'criminal', 'detective', 'detective'][r]);
    for (let i = 0; i < 7300 && !w.result; i++) {
      const p = w.player; p.think -= 0.05;
      if (p.think <= 0) { think(w, p); p.think = 1; }
      followPath(w, p, 0.05);
      step(w, 0.05);
      for (const c of w.crates) if (c.carrier !== null) assert.equal(w.actors[c.carrier].crate, w.crates.indexOf(c));
    }
    assert.ok(w.result); outcomes.push(w.result.kind);
  }
  assert.equal(w.history.length, 5);
  assert.ok(outcomes.includes('capture'), 'botlar iki suçluyu da yakalayabilmeli');
  console.log('Otomatik turlar:', outcomes.join(', '));
});
