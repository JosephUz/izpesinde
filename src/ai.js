import { CFG, LEVELS } from './config.js';
import { disguise, murder } from './criminal.js';
import { routine, setGoal } from './crowd.js';
import { REGIONS } from './environment.js';
import { arrest, circleOf, mark, marksFor, revealedProsecutors } from './marks.js';
import { dist, safe } from './physics.js';
import { active, canAct, sees } from './roster.js';

/**
 * Bot kararları. Botlar yalnızca kendi görüş alanını, aldıkları bildirimleri ve kendi rollerinin arayüzde gösterdiği
 * bilgiyi kullanır (herkes işaretleri görür, suçlular ele verilen savcıyı görür); gerçek rolleri asla okumazlar.
 * Algı (iz görme) traces.js'te her karede, karar burada her botun tepki süresinde.
 */
export function think(world, a) {
  if (!canAct(world, a) || a.action) return;
  if (a.role === 'civilian') { if (!a.path.length) routine(world, a); return; }
  if (a.role === 'detective') thinkDetective(world, a);
  else if (a.role === 'prosecutor') thinkProsecutor(world, a);
  else thinkCriminal(world, a);
}

/** Bölgelerden birinin çevresinde rastgele bir nokta: kimseyi izlemeyen botun devriyesi. */
function patrol(world, a, spread) {
  if (a.path.length) return;
  const r = REGIONS[Math.floor(world.random() * REGIONS.length)];
  setGoal(world, a, safe(world.env, r.x + (world.random() - 0.5) * spread, r.z + (world.random() - 0.5) * spread));
}

/**
 * Dedektif: şüphe puanları izlerden birikir (traces.js) ve görülen kılık değişiminde kesinleşir. Başka bir dedektifin
 * işareti herkese açık ama yanlış olabilir: ilk görüşte o kişiye biraz şüphe eklenir, takip yine izlerle sürer.
 * En şüpheliyi birkaç adım geriden izler; puan eşiği aşınca işaretler, ama zaten işaretli birine hak harcamaz.
 * Son hakkı için daha emin olmak ister.
 */
function thinkDetective(world, a) {
  for (const m of marksFor(world, a)) {
    if (m.owner === a.id || !active(m.target) || a.seenMarks.has(m.target.id + ':' + m.time)) continue;
    a.seenMarks.add(m.target.id + ':' + m.time);
    const b = m.target, s = a.suspects.get(b.id), at = sees(world, a, b) ? b : circleOf(m, b);
    a.suspects.set(b.id, { score: (s?.score || 0) + 0.6, time: world.time, x: at.x, z: at.z });
  }
  for (const [id, s] of a.suspects) {
    const b = world.actors[id];
    if (!active(b) || world.time - s.time > world.level.memory) { a.suspects.delete(id); continue; }
    if (sees(world, a, b)) { s.x = b.x; s.z = b.z; s.time = world.time; }
  }
  const top = [...a.suspects].sort((p, q) => q[1].score - p[1].score)[0];
  if (!top) { patrol(world, a, 30); return; }
  const [id, s] = top, b = world.actors[id], need = world.level.markAt + (a.marks === 1 ? 0.6 : 0);
  if (s.score >= need && a.marks > 0 && !world.marks.has(id) && sees(world, a, b, CFG.markRange) && mark(world, a, b)) return;
  const d = dist(a, s);
  if (d > 5) setGoal(world, a, { x: s.x + (a.x - s.x) / d * 4, z: s.z + (a.z - s.z) / d * 4 });
}

/**
 * Savcı: görünen işaretli kişiye gidip yakalar; yoksa en yakın işaret dairesine (uzaksa koşarak). İşaret yokken kendi
 * izlerinden biriken şüpheyle en şüpheliye yaklaşır. Yakalama sınırsızdır ama her deneme kimliğini suçlulara açar ve
 * yanlışı −1'dir: işaretsiz birini ancak çok emin olunca yakalar. Hiçbiri yoksa devriye.
 */
function thinkProsecutor(world, a) {
  const marks = marksFor(world, a).filter(m => !m.cleared && active(m.target));
  a.hurry = false;
  const seen = marks.filter(m => sees(world, a, m.target)).sort((p, q) => dist(a, p.target) - dist(a, q.target))[0];
  if (seen) {
    if (dist(a, seen.target) <= CFG.catchRange - 0.4 && arrest(world, a, seen.target)) return;
    setGoal(world, a, seen.target);
    return;
  }
  const area = marks.map(m => circleOf(m, m.target)).sort((p, q) => dist(a, p) - dist(a, q))[0];
  if (area) { setGoal(world, a, safe(world.env, area.x, area.z)); a.hurry = dist(a, area) > 15; return; }
  for (const [id, s] of a.suspects) if (!active(world.actors[id]) || world.time - s.time > world.level.memory) a.suspects.delete(id);
  const top = [...a.suspects].sort((p, q) => q[1].score - p[1].score)[0];
  if (top) {
    const b = world.actors[top[0]];
    if (top[1].score >= world.level.markAt + 0.8 && sees(world, a, b) && dist(a, b) <= CFG.catchRange - 0.4 && arrest(world, a, b)) { a.suspects.delete(b.id); return; }
    setGoal(world, a, sees(world, a, b) ? b : top[1]);
    return;
  }
  patrol(world, a, 20);
}

/**
 * Suçlu: kalabalık iş noktalarını seçer. Ele verilen bir savcı yakındaysa (zorluğa göre) onu avlar: savcı öldürmek
 * kazandırır, iki savcı ölürse tur kazanılır. İşaretlendiğini bilir; zorluğun tereddüt süresi geçince az kişinin
 * gördüğü bir anda yakındaki birinin kılığına girer. Uzun süre peşine düşeni tenhada öldürmeyi deneyebilir.
 */
function thinkCriminal(world, a) {
  const hunted = world.level.killChance > 0 && revealedProsecutors(world).filter(p => dist(a, p) < 35).sort((p, q) => dist(a, p) - dist(a, q))[0];
  if (hunted) {
    a.hurry = dist(a, hunted) > 6;
    if (dist(a, hunted) <= CFG.reach && murder(world, a, hunted)) return;
    setGoal(world, a, hunted);
    return;
  }
  a.hurry = false;
  const near = world.actors.filter(b => b !== a && active(b) && !a.known.has(b.id) && dist(a, b) < 7 && sees(world, a, b, 7));
  for (const b of near) if (!a.followers.has(b.id)) a.followers.set(b.id, world.time);
  for (const id of a.followers.keys()) if (!near.some(b => b.id === id)) a.followers.delete(id);
  const shadow = [...a.followers].find(([, since]) => world.time - since > 12);
  if (shadow && near.length <= 2 && world.random() < world.level.killChance * 0.2) {
    const b = world.actors[shadow[0]];
    if (dist(a, b) <= CFG.reach) { murder(world, a, b); return; }
    setGoal(world, a, b);
    return;
  }
  const m = world.marks.get(a.id);
  if (m && world.time - m.time >= world.level.hesitate) {
    const watchers = world.actors.filter(b => b !== a && active(b) && !a.known.has(b.id) && sees(world, a, b)).length;
    const copy = near.find(b => dist(a, b) <= CFG.disguiseRange && (b.appearance !== a.appearance || b.hat !== a.hat));
    if (copy && watchers <= (world.level === LEVELS.hard ? 2 : 4) && disguise(world, a, copy)) return;
    if (!a.path.length || world.random() < 0.3) routine(world, a, true);
    return;
  }
  if (!a.path.length) routine(world, a, true);
}
