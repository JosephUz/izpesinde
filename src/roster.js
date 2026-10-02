import { CFG } from './config.js';
import { dist, visible } from './physics.js';

/**
 * Kadro yardımcıları: kim yarışmacı, kim oyunda, kim kimi görüyor. world.actors'ın ilk 10'u yarışmacıdır
 * (0 = insan oyuncu), gerisi sıradan kasabalı. Görüş her zaman görüş hattıyla sınanır; hiçbir kural gizli bilgiye
 * bakmaz.
 */
export const contestants = world => world.actors.slice(0, 10);
export const criminals = world => contestants(world).filter(a => a.role === 'criminal');
export const active = a => Boolean(a && a.alive && !a.caught);
export const canAct = (world, a) => !world.result && active(a);
export const sees = (world, a, b, range = CFG.vision) => visible(world.env, a, b, range);

/** a'ya en yakın, koşulu sağlayan ve görüş hattındaki karakter. */
export function nearest(world, a, predicate, range = CFG.reach) {
  return world.actors
    .filter(b => b !== a && active(b) && predicate(b) && dist(a, b) <= range && sees(world, a, b, range))
    .sort((b, c) => dist(a, b) - dist(a, c))[0];
}

/** Olay günlüğü yalnızca insanın ekranındadır: özel bildirim (to) yalnızca oyuncuya (0) yazılır. */
export function emit(world, text, kind = 'info', to = null) {
  if (to !== null && to !== 0) return;
  world.events.push({ id: ++world.serial, text, kind, time: world.time });
  if (world.events.length > 40) world.events.shift();
}
