import { CFG } from './config.js';
import { dropCrate } from './crowd.js';
import { dist } from './physics.js';
import { active, canAct, contestants, criminals, emit, sees } from './roster.js';
import { finish } from './score.js';

/**
 * Dedektifin işareti ve savcının yakalaması (ikisi de sol tık).
 *
 * İşaret: sınırsızdır ama kasabada **aynı anda tek işaret** olur: her yeni işaret, işaretleyenin önceki işaretini ve diğer
 * bütün dedektiflerin işaretlerini kaldırır (kaldırılanların sahiplerine uyarı gider). İşaretleri herkes görür; haritaya kişinin kendisi değil,
 * ondan sabit rastgele uzaklıkta merkezli bir daire düşer. Suçlu olmayanı işaretlemek −1'dir (tur sonunda yazılır) ve
 * işaret kalkmaz. İşaretli suçlu kılık değiştirince işaret kalkar; işaretli suçlunun ekran kenarı kızarır.
 *
 * Yakalama: sınırsızdır ama yanlış kişi −1 ve işareti "aklandı" görünür. Her yakalama denemesi (doğru ya da yanlış)
 * savcıyı ele verir: kimliği CFG.reveal saniye suçlulara görünür ve hedef olur (world.revealed).
 *
 * world.marks: hedef id -> { owner, ox, oz, cleared, time }. world.revealed: savcı id -> görünür kalacağı tur saati.
 */

export function markBy(world, owner) {
  for (const [id, m] of world.marks) if (m.owner === owner) return id;
  return null;
}

/** Görünen işaretler: herkes bütün işaretleri görür (parametre, görünürlük kuralı değişirse diye durur). */
export function marksFor(world) {
  return [...world.marks].map(([id, m]) => ({ target: world.actors[id], ...m }));
}

/** Haritadaki dairenin merkezi: kesin konum değil, kişiden sabit bir kayma. */
export const circleOf = (m, target) => ({ x: target.x + m.ox, z: target.z + m.oz });

/** Kimliği şu an suçlulara açık olan savcılar. */
export function revealedProsecutors(world) {
  return [...world.revealed].filter(([id, until]) => until > world.time && active(world.actors[id])).map(([id]) => world.actors[id]);
}

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
    emit(world, 'İşaretin başka bir dedektifin yeni işaretiyle kaldırıldı. Takibe devam et.', 'info', m.owner);
    // Bot sahibi şüphesini kaybetmez: kendi işareti olmasa da o kişiyi izlemeyi sürdürür.
    const s = world.actors[m.owner].suspects.get(id);
    if (s) s.score = Math.max(s.score, world.level.markAt);
  }
}

export function mark(world, a, b) {
  if (!canAct(world, a) || a.role !== 'detective' || !active(b) || b === a || a.known.has(b.id)) return false;
  if (dist(a, b) > CFG.markRange || !sees(world, a, b, CFG.markRange)) return false;
  if (world.marks.get(b.id)?.owner === a.id) return false;
  // Kasabada tek işaret: kendi eskisi sessizce, başkalarınınki (aklanmış olanlar dahil) sahibine haber verilerek kalkar.
  for (const [id, m] of [...world.marks]) { if (m.owner === a.id) world.marks.delete(id); else dropMark(world, id, 'replaced'); }
  const angle = world.random() * Math.PI * 2, r = world.random() * CFG.mapOffset;
  world.marks.set(b.id, { owner: a.id, ox: Math.cos(angle) * r, oz: Math.sin(angle) * r, cleared: false, time: world.time });
  // Yanlış işaretin bedeli tur sonunda yazılır: anında düşseydi işaretin doğru olup olmadığı tur içinde sızardı.
  if (b.role !== 'criminal') world.hidden[a.id] += CFG.scores.wrongMark;
  emit(world, 'İşaret bırakıldı. Herkes bölgeyi görüyor; kasabadaki diğer işaretler kalktı.', 'clue', a.id);
  if (b.role === 'criminal') emit(world, 'Biri seni işaretledi! Gözden kaybolup kılık değiştir.', 'danger', b.id);
  checkRights(world);
  return true;
}

export function arrest(world, a, b) {
  if (!canAct(world, a) || a.role !== 'prosecutor' || !active(b) || b === a || a.known.has(b.id)) return false;
  if (dist(a, b) > CFG.catchRange || !sees(world, a, b, CFG.catchRange)) return false;
  world.effects.push({ type: 'arrest', x: b.x, z: b.z, t: 0.6 });
  // Her deneme savcıyı ele verir: suçlular onu bir süre görür.
  world.revealed.set(a.id, world.time + CFG.reveal);
  emit(world, `Yakalama yaptın: ${CFG.reveal} sn boyunca suçlular seni görüyor.`, 'danger', a.id);
  for (const c of criminals(world)) if (active(c)) emit(world, `Bir savcı kendini ele verdi! ${CFG.reveal} sn boyunca görünüyor.`, 'danger', c.id);
  const m = world.marks.get(b.id);
  if (b.role === 'criminal') {
    world.tally[a.id] += CFG.scores.catchBonus;
    if (m) world.tally[m.owner] += CFG.scores.markBonus;
    emit(world, 'Doğru kişi! Bir suçlu yakalandı.', 'good', a.id);
    for (const id of world.humans) if (id !== a.id) emit(world, 'Bir suçlu yakalandı.', 'good', id);
    caughtNow(world, b);
  } else {
    world.tally[a.id] += CFG.scores.wrongCatch;
    if (m) m.cleared = true;
    emit(world, 'Yanlış kişi (−1).', 'danger', a.id);
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
 * Kanunun gücü tükenirse serbest suçlular kazanır: iki savcı da öldüyse. İşaret ve yakalama sınırsızdır, o yüzden
 * hak tükenmesi bitişi yoktur.
 */
export function checkRights(world) {
  if (world.result || !criminals(world).some(active)) return;
  const all = contestants(world);
  if (!all.some(a => a.role === 'prosecutor' && a.alive)) finish(world, 'prosecutors');
}
