import { CFG } from './config.js';
import { active, contestants } from './roster.js';

/**
 * Tur sonu ve puanlar. Tur içindeki ödül ve cezalar world.tally'de (oyuncuya görünür) ve world.hidden'da (yanlış
 * işaret: tur sonuna kadar gizli) birikir; burada bir kez toplanıp skora eklenir.
 *  - capture (iki suçlu yakalandı): her dedektif ve savcı +1.
 *  - timeout / marks / prosecutors: suçlular kazanır, serbest kalan her suçlu +5.
 *  - Suçluya serbest geçen her tam dakika +1 (kazansa da kaybetse de).
 */
export function finish(world, kind) {
  if (world.result) return;
  const S = CFG.scores, points = Array(10).fill(0), law = kind === 'capture';
  for (const a of contestants(world)) {
    points[a.id] = world.tally[a.id] + world.hidden[a.id];
    if (a.role === 'criminal') {
      points[a.id] += Math.floor((a.caughtAt ?? world.time) / 60) * S.perMinute;
      if (!law && active(a)) points[a.id] += S.criminalWin;
    } else if (law) points[a.id] += S.lawWin;
    world.scores[a.id] += points[a.id];
    a.action = null;
  }
  world.result = { kind, points, roles: contestants(world).map(a => a.role), time: world.time };
  world.history.push(world.result);
}
