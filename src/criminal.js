import { CFG } from './config.js';
import { dropCrate } from './crowd.js';
import { checkRights, dropMark } from './marks.js';
import { dist } from './physics.js';
import { active, canAct, contestants, emit, nearest, sees } from './roster.js';

/**
 * Yalnızca suçluların eylemleri: kılık değiştirme (sol tık) ve ortak cinayet hakkı (Q).
 *
 * Kılık: tıklanan yakın karakterin kıyafetini ve şapkasını kopyalar; sınırsızdır ama her değişim −1. İşaret kalkar.
 * Değişimi gören dedektif takibi sürdürür (ve yalnızca suçlular kılık değiştirdiği için kesinleşir); görmeyenler kaybeder.
 *
 * Cinayet: iki suçlunun turda ortak CFG.kills hakkı. NPC −1, dedektif +1, savcı +2. Ölen dedektifin işaret, ölen
 * savcının yakalama hakları yanar; iki savcı da ölürse suçlular kazanır. Cinayet suçluları açığa çıkarmaz.
 */
export function disguise(world, a, b) {
  if (!canAct(world, a) || a.role !== 'criminal' || a.disguiseCd > 0 || !active(b) || b === a) return false;
  if (dist(a, b) > CFG.disguiseRange || !sees(world, a, b, CFG.disguiseRange)) return false;
  if (b.appearance === a.appearance && b.hat === a.hat) return false;
  a.action = null; a.appearance = b.appearance; a.hat = b.hat; a.disguiseCd = CFG.disguiseCooldown;
  world.tally[a.id] += CFG.scores.disguise;
  world.effects.push({ type: 'disguise', x: a.x, z: a.z, t: 0.7 });
  if (world.marks.has(a.id)) dropMark(world, a.id, 'disguise');
  for (const obs of contestants(world)) {
    if (obs.role !== 'detective' || obs === a) continue;
    const s = obs.suspects.get(a.id);
    if (sees(world, obs, a)) obs.suspects.set(a.id, { score: (s?.score || 0) + 2, time: world.time, x: a.x, z: a.z });
    else if (s) obs.suspects.delete(a.id);
  }
  if (a.id === 0) emit(world, 'Kılık değişti (−1). Seni görenler takibi sürdürebilir.');
  checkRights(world);
  return true;
}

export function murder(world, a, b = nearest(world, a, b => b.role !== 'criminal')) {
  if (!canAct(world, a) || a.role !== 'criminal' || world.killsLeft <= 0 || !active(b) || b.role === 'criminal') return false;
  if (dist(a, b) > CFG.reach || !sees(world, a, b, CFG.reach)) return false;
  // Ortak hak tek yetkili adımda, herhangi bir animasyondan önce tüketilir: eşzamanlı denemeler haktan fazla ölüm üretmez.
  world.killsLeft--;
  b.alive = false; b.action = null; b.path = [];
  dropCrate(world, b);
  const S = CFG.scores;
  world.tally[a.id] += b.role === 'detective' ? S.killDetective : b.role === 'prosecutor' ? S.killProsecutor : S.killCivilian;
  if (b.role === 'detective') b.marks = 0;
  if (b.role === 'prosecutor') b.catches = 0;
  emit(world, 'Kasabada biri öldürüldü.', 'danger');
  world.effects.push({ type: 'murder', x: b.x, z: b.z, t: 1 });
  checkRights(world);
  return true;
}
