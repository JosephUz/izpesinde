import { CFG } from './config.js';
import { dist, visible } from './physics.js';

/**
 * Kadro yardımcıları: kim yarışmacı, kim oyunda, kim kimi görüyor. world.actors'ın ilk 10'u yarışmacıdır
 * (insanlar world.humans'ta; tek başına oyunda 0), gerisi sıradan kasabalı. Görüş her zaman görüş hattıyla sınanır; hiçbir kural gizli bilgiye
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

/**
 * Olay günlüğü yalnızca insanların ekranındadır: özel bildirim (to) yalnızca o insana yazılır (bota gidenler atılır),
 * to'suz olay herkesindir. Arayüz kendi numarasına ait olanları süzer.
 * Olay metin değil **kod** taşır (dil standardı): istemci `t('olay.' + kod, v)` ile kendi dilinde yazar; çevrim içinde
 * sunucu da yalnızca kodu ve değişkenleri yollar (bkz. src/diller/tr.js `olay.*`).
 */
export function emit(world, kod, kind = 'info', to = null, v = null) {
  if (to !== null && !world.humans.has(to)) return;
  world.events.push({ id: ++world.serial, kod, v, kind, time: world.time, to });
  if (world.events.length > 60) world.events.shift();
}
