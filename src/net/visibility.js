import { CFG } from '../config.js';
import { revealedProsecutors } from '../marks.js';
import { dist } from '../physics.js';
import { active, contestants, criminals } from '../roster.js';

/**
 * Sunucunun her insana yolladığı **kişiye özel** bilgi. Gizli kimlik oyununda paketin kendisi de sızmamalı: konsoldan
 * bakan oyuncu, ekranında göremeyeceği hiçbir şeyi paketlerde de bulamaz.
 *  - Roller: yalnızca kendin ve tanıdıkların (suçlular birbirini, kanun savcıları); herkesinki tur sonunda.
 *  - İzler: yalnızca kendi rolünün izleri ve gözünün (ya da izlediğin kişinin) görüş alanındakiler.
 *  - Efektler (yakalama, kılık, cinayet halkası): yalnızca görüş alanındakiler.
 *  - Ele verilen savcılar: yalnızca suçlulara (ve savcının kendisine, geri sayımı için).
 *  - İşaretler, sönen daireler, serbest suçlu sayısı ve kanunun kalan işaret hakkı herkese açıktır (arayüzde de öyle).
 *  - Olaylar: herkese açık olanlar ve yalnızca sana yazılanlar.
 */

/** Tur başında: rolün, tanıdıkların, adlar ve skorlar. */
export function roundFor(world, seat) {
  const me = world.actors[seat];
  return {
    round: world.round, seconds: world.seconds, you: seat, role: me.role, known: [...me.known].map(id => [id, world.actors[id].role]),
    names: contestants(world).map(a => a.name), scores: world.scores, history: world.history,
  };
}

const r2 = n => Math.round(n * 100) / 100;

/** Her pakette: istemcinin dünya kopyasını güncelleyen her şey (karakter konumları ayrı, ikili pakette). */
export function stateFor(world, seat, eyes, since) {
  const me = world.actors[seat], seen = p => eyes && dist(p, eyes) <= CFG.vision + 2;
  const rev = me.role === 'criminal' ? revealedProsecutors(world).map(a => [a.id, r2(world.revealed.get(a.id))]) : [];
  if (me.role === 'prosecutor' && world.revealed.get(seat) > world.time) rev.push([seat, r2(world.revealed.get(seat))]);
  const events = world.events.filter(e => e.id > since && (e.to == null || e.to === seat));
  return {
    time: r2(world.time), eyes: eyes ? eyes.id : null,
    me: { marks: me.marks, dashCd: r2(me.dashCd), killCd: r2(me.killCd), disguiseCd: r2(me.disguiseCd), crate: me.crate, tally: world.tally[seat] },
    marks: [...world.marks].map(([id, m]) => [id, m.owner, r2(m.ox), r2(m.oz), m.cleared ? 1 : 0, r2(m.time)]),
    ghosts: world.ghosts.map(g => [r2(g.x), r2(g.z), r2(g.until)]),
    fx: world.effects.filter(seen).map(f => [f.type, r2(f.x), r2(f.z), r2(f.t)]),
    tr: world.traces.filter(t => t.role === me.role && seen(t)).map(t => [t.id, r2(t.x), r2(t.z), r2(t.dir ?? 0), r2(t.born)]),
    rev,
    crates: world.crates.map(c => [r2(c.x), r2(c.z), c.carrier ?? -1]),
    crim: criminals(world).map(c => (active(c) ? 1 : 0)),
    law: contestants(world).filter(a => a.role !== 'criminal' && a.alive).reduce((n, a) => n + a.marks, 0),
    ev: events.map(e => [e.id, e.text, e.kind, r2(e.time)]),
  };
}
