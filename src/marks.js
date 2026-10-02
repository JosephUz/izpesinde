import { CFG } from './config.js';
import { dropCrate } from './crowd.js';
import { dist } from './physics.js';
import { active, canAct, contestants, criminals, emit, sees } from './roster.js';
import { finish } from './score.js';

/**
 * Dedektifin işareti ve savcının yakalaması (ikisi de sol tık).
 *
 * İşaret: dedektif başına tur başına CFG.marks hak, aynı anda tek aktif işaret; bir kişide tek işaret. Başka bir
 * dedektif aynı kişiyi işaretlerse eski sahibine uyarı gider. Suçlunun üstündeki işaret herkese görünür (diğer
 * dedektifler de o suçluya odaklanabilsin); başka birinin üstündeki işareti yalnızca sahibi ve savcılar görür. Haritaya
 * kişinin kendisi değil, ondan sabit rastgele uzaklıkta merkezli bir daire düşer. Suçlu olmayanı işaretlemek
 * −1'dir (tur sonunda yazılır) ve işaret kalkmaz. İşaretli suçlu kılık değiştirince işaret kalkar.
 *
 * Yakalama: savcı başına CFG.catches hak; her deneme bir hak. Yanlış kişi −1 ve işareti savcılara "aklandı" görünür.
 *
 * world.marks: hedef id -> { owner, ox, oz, cleared, time }.
 */

export function markBy(world, owner) {
  for (const [id, m] of world.marks) if (m.owner === owner) return id;
  return null;
}

/** viewer'ın görebildiği işaretler: savcı hepsini, herkes suçluların üstündekileri, dedektif ayrıca kendisininkini. */
export function marksFor(world, viewer) {
  return [...world.marks]
    .filter(([id, m]) => viewer.role === 'prosecutor' || m.owner === viewer.id || world.actors[id].role === 'criminal')
    .map(([id, m]) => ({ target: world.actors[id], ...m }));
}

/** Haritadaki dairenin merkezi: kesin konum değil, kişiden sabit bir kayma. */
export const circleOf = (m, target) => ({ x: target.x + m.ox, z: target.z + m.oz });

/** İşareti kaldır. Kılık değişiminde haritada son bilinen yerde sönen bir daire kalır. */
export function dropMark(world, id, reason) {
  const m = world.marks.get(id);
  if (!m) return;
  world.marks.delete(id);
  if (reason === 'disguise') {
    world.ghosts.push({ ...circleOf(m, world.actors[id]), owner: m.owner, until: world.time + CFG.mapFade });
    emit(world, 'İşaretlediğin kişi gözden kayboldu.', 'info', m.owner);
  }
  if (reason === 'replaced') {
    emit(world, 'İşaretin başka bir dedektif tarafından kaldırıldı. Takibe devam et.', 'info', m.owner);
    // Bot sahibi şüphesini kaybetmez: kendi işareti olmasa da o kişiyi izlemeyi sürdürür.
    const s = world.actors[m.owner].suspects.get(id);
    if (s) s.score = Math.max(s.score, world.level.markAt);
  }
}

export function mark(world, a, b) {
  if (!canAct(world, a) || a.role !== 'detective' || a.marks <= 0 || !active(b) || b === a || a.known.has(b.id)) return false;
  if (dist(a, b) > CFG.markRange || !sees(world, a, b, CFG.markRange)) return false;
  if (world.marks.get(b.id)?.owner === a.id) return false;
  a.marks--;
  const own = markBy(world, a.id);
  if (own !== null) world.marks.delete(own);
  if (world.marks.has(b.id)) dropMark(world, b.id, 'replaced');
  const angle = world.random() * Math.PI * 2, r = world.random() * CFG.mapOffset;
  world.marks.set(b.id, { owner: a.id, ox: Math.cos(angle) * r, oz: Math.sin(angle) * r, cleared: false, time: world.time });
  // Yanlış işaretin bedeli tur sonunda yazılır: anında düşseydi işaretin doğru olup olmadığı tur içinde sızardı.
  if (b.role !== 'criminal') world.hidden[a.id] += CFG.scores.wrongMark;
  emit(world, 'İşaret bırakıldı. Savcılar bölgeyi görüyor.', 'clue', a.id);
  if (b.role === 'criminal') emit(world, 'Biri seni işaretledi! Gözden kaybolup kılık değiştir.', 'danger', b.id);
  checkRights(world);
  return true;
}

export function arrest(world, a, b) {
  if (!canAct(world, a) || a.role !== 'prosecutor' || a.catches <= 0 || !active(b) || b === a || a.known.has(b.id)) return false;
  if (dist(a, b) > CFG.catchRange || !sees(world, a, b, CFG.catchRange)) return false;
  a.catches--;
  world.effects.push({ type: 'arrest', x: b.x, z: b.z, t: 0.6 });
  const m = world.marks.get(b.id);
  if (b.role === 'criminal') {
    world.tally[a.id] += CFG.scores.catchBonus;
    if (m) world.tally[m.owner] += CFG.scores.markBonus;
    emit(world, a.id === 0 ? 'Doğru kişi! Bir suçlu yakalandı.' : 'Bir suçlu yakalandı.', 'good');
    caughtNow(world, b);
  } else {
    world.tally[a.id] += CFG.scores.wrongCatch;
    if (m) m.cleared = true;
    emit(world, 'Yanlış kişi. Bu yakalama boşa gitti.', 'danger', a.id);
  }
  checkRights(world);
  return true;
}

/** Suçlu yakalandı: eylem yapamaz, işareti ve kutusu düşer; ikisi de yakalandıysa kanun kazanır. */
export function caughtNow(world, b) {
  b.caught = true; b.caughtAt = world.time; b.action = null;
  dropCrate(world, b);
  world.marks.delete(b.id);
  if (criminals(world).every(c => c.caught)) finish(world, 'capture');
}

/**
 * Kanunun gücü tükenirse serbest suçlular kazanır: iki savcı da öldüyse, hayattaki savcıların yakalama hakları
 * bittiyse ya da hayattaki dedektiflerin işaret hakları bitip hiçbir aktif işaret serbest bir suçluyu göstermiyorsa. (Son hak doğru kişiye kullanıldıysa savcılara o
 * işareti değerlendirme şansı kalır.)
 */
export function checkRights(world) {
  if (world.result || !criminals(world).some(active)) return;
  const all = contestants(world);
  const pros = all.filter(a => a.role === 'prosecutor' && a.alive);
  if (!pros.length) { finish(world, 'prosecutors'); return; }
  if (pros.every(p => p.catches <= 0)) { finish(world, 'rights'); return; }
  const live = [...world.marks].some(([id, m]) => !m.cleared && world.actors[id].role === 'criminal' && active(world.actors[id]));
  if (all.filter(a => a.role === 'detective' && a.alive).every(d => d.marks <= 0) && !live) finish(world, 'marks');
}
