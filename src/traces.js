import { CFG } from './config.js';
import { dist } from './physics.js';
import { active, contestants, criminals, sees } from './roster.js';

/**
 * Suçluların izleri. Her serbest suçlu onda bir saniyede bir konumunu kaydeder (trail); tur saatine göre kısalan
 * aralıklarla iki iz (dedektif ve savcı türü) düşer, yine tur saatine göre kısalan gecikmeyle suçlunun tam o kadar saniye
 * önceki konumuna (iki kayıt arasında ara değerle: iz bir çevreye değil, suçlunun bastığı noktaya düşer ve o anki
 * yürüyüş yönüne bakar) (CFG.trace.schedule: başta 5 sn aralık / 5 sn gecikme, son dakikada 2 / 2). İz `life` saniye
 * sonra kaybolur ve yalnızca kendi rolündekilere, onların görüş alanındaysa görünür (iki tür ayrı renktedir).
 * Kalabalıkta iz kimseyi kesin göstermez; tenhada dolaşan suçlu kendini ele verir.
 *
 * Bot dedektif ve savcılar izi her karede algılar (iz bir saniye yaşar, düşünme aralığını beklerse kaçar); karar ise
 * kendi tepki sürelerinde verilir (ai.js). Algı: izin çevresinde görünen herkese, sayılarıyla bölünmüş bir şüphe puanı.
 * Bakılan çevre, iz gecikmesince yürünebilecek mesafedir.
 */
/** Tur saatinde geçerli iz aralığı ve gecikmesi. */
const stepAt = time => CFG.trace.schedule.find(s => time < s.until);
export const traceEvery = time => stepAt(time).every;
export const traceLag = time => stepAt(time).lag;

const TRAIL_EVERY = 0.1, TRAIL_KEEP = 70; // 7 sn: en uzun gecikmeden fazlası

/** Suçlunun t anındaki konumu (iki kayıt arasında doğrusal ara değer) ve o anki yürüyüş yönü. */
export function pastAt(a, t) {
  const trail = a.trail, i = trail.findIndex(p => p.t >= t);
  if (i < 0) return { x: a.x, z: a.z, dir: a.facing };
  const q = trail[i], p = trail[Math.max(0, i - 1)], k = q.t > p.t ? Math.max(0, Math.min(1, (t - p.t) / (q.t - p.t))) : 1;
  const n = trail[Math.min(trail.length - 1, i + 1)], from = p === q ? q : p, to = n === q ? q : n;
  const moved = Math.hypot(to.x - from.x, to.z - from.z) > 0.05;
  return { x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k, dir: moved ? Math.atan2(to.x - from.x, to.z - from.z) : a.facing };
}

export function updateTraces(world, dt) {
  for (const a of criminals(world)) {
    if (!active(a)) continue;
    a.trailClock -= dt;
    if (a.trailClock <= 0) {
      a.trailClock = TRAIL_EVERY;
      a.trail.push({ x: a.x, z: a.z, t: world.time });
      if (a.trail.length > TRAIL_KEEP) a.trail.shift();
    }
    a.traceClock -= dt;
    if (a.traceClock <= 0) {
      a.traceClock += traceEvery(world.time);
      const lag = traceLag(world.time), past = pastAt(a, world.time - lag);
      for (const role of CFG.trace.roles) world.traces.push({ id: ++world.traceSerial, role, lag, x: past.x, z: past.z, dir: past.dir, born: world.time, by: a.id });
    }
  }
  world.traces = world.traces.filter(t => world.time - t.born < CFG.trace.life);

  for (const d of contestants(world)) {
    if (world.humans.has(d.id) || !active(d) || !CFG.trace.roles.includes(d.role)) continue;
    for (const t of world.traces) {
      if (t.role !== d.role || d.seenTraces.has(t.id) || !sees(world, d, t)) continue;
      d.seenTraces.add(t.id);
      // İz gecikmesince yürünebilecek mesafe: suçlu artık izin bu kadar uzağında olabilir.
      const reach = Math.min(CFG.vision, 3 + CFG.walk * t.lag);
      const near = world.actors.filter(b => b !== d && active(b) && !d.known.has(b.id) && dist(b, t) < reach && sees(world, d, b));
      for (const b of near) {
        const s = d.suspects.get(b.id) || { score: 0 };
        d.suspects.set(b.id, { score: s.score + 1 / near.length, time: world.time, x: b.x, z: b.z });
      }
    }
  }
}
