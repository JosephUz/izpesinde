import { CFG } from './config.js';
import { dist } from './physics.js';
import { active, contestants, criminals, sees } from './roster.js';

/**
 * Suçluların izleri. Her serbest suçlu dörtte bir saniyede bir konumunu kaydeder (trail); tur saatine göre kısalan
 * aralıklarla iki iz (dedektif ve savcı türü) düşer, yine tur saatine göre kısalan gecikmeyle suçlunun o kadar saniye
 * önceki konumuna (CFG.trace.schedule: başta 5 sn aralık / 5 sn gecikme, son dakikada 2 / 2). İz `life` saniye
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

export function updateTraces(world, dt) {
  for (const a of criminals(world)) {
    if (!active(a)) continue;
    a.trailClock -= dt;
    if (a.trailClock <= 0) {
      a.trailClock = 0.25;
      a.trail.push({ x: a.x, z: a.z, t: world.time });
      if (a.trail.length > 28) a.trail.shift(); // 7 sn: en uzun gecikmeden fazlası
    }
    a.traceClock -= dt;
    if (a.traceClock <= 0) {
      a.traceClock += traceEvery(world.time);
      const lag = traceLag(world.time), past = a.trail.find(p => p.t >= world.time - lag) || a;
      for (const role of CFG.trace.roles) world.traces.push({ id: ++world.traceSerial, role, lag, x: past.x, z: past.z, born: world.time, by: a.id });
    }
  }
  world.traces = world.traces.filter(t => world.time - t.born < CFG.trace.life);

  for (const d of contestants(world)) {
    if (d.id === 0 || !active(d) || !CFG.trace.roles.includes(d.role)) continue;
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
