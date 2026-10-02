import { CFG } from './config.js';
import { blocked, dist, route, safe } from './physics.js';
import { canAct } from './roster.js';

/**
 * Hareket ve kalabalık rutinleri: yürüme, koşu, zıplama, atılma, kutu taşıma (E), iş noktasında çalışma (F) ve
 * kasabalıların gündelik iş döngüsü. Yarışmacı botlar da kalabalığa karışmak için aynı rutinleri kullanır.
 */

/** Bir adım yürüt: havadayken engellerin üstünden geçilir, yerdeyken her eksen ayrı çarpışır (duvar boyunca kayma). */
export function move(world, a, dx, dz, dt, sprint = false) {
  if (!canAct(world, a)) return;
  a.speed = 0;
  const l = Math.hypot(dx, dz);
  if (l > 0.01) { dx /= Math.max(1, l); dz /= Math.max(1, l); a.facing = Math.atan2(dx, dz); a.action = null; }
  if (a.dash > 0) { dx = Math.sin(a.facing); dz = Math.cos(a.facing); }
  const speed = a.dash > 0 ? CFG.dash : sprint ? CFG.run : CFG.walk, edge = CFG.half - 1;
  const x = a.x + dx * speed * dt, z = a.z + dz * speed * dt;
  if (a.y > 0.4) { a.x = Math.max(-edge, Math.min(edge, x)); a.z = Math.max(-edge, Math.min(edge, z)); }
  else { if (!blocked(world.env, x, a.z)) a.x = x; if (!blocked(world.env, a.x, z)) a.z = z; }
  a.speed = Math.hypot(dx, dz) * speed;
  if (a.crate !== null) Object.assign(world.crates[a.crate], { x: a.x, z: a.z });
}

/** Zıplama; havadayken bir kez daha (çift zıplama). Hak yere inince yenilenir. */
export function jump(world, a) {
  if (!canAct(world, a) || a.jumps >= 2) return;
  a.action = null; a.vy = CFG.jump * (a.jumps ? 0.9 : 1); a.jumps++;
}

export function dash(world, a) {
  if (!canAct(world, a) || a.dashCd > 0) return;
  a.action = null; a.dash = CFG.dashTime; a.dashCd = CFG.dashCooldown;
}

/** Yerçekimi ve iniş: inen karakter bina ya da ağacın içindeyse en yakın boş zemine konur. */
export function fall(world, a, dt) {
  if (a.y <= 0 && a.vy <= 0) return;
  a.vy -= CFG.gravity * dt; a.y += a.vy * dt;
  if (a.y <= 0) { a.y = 0; a.vy = 0; a.jumps = 0; Object.assign(a, safe(world.env, a.x, a.z)); }
}

export function crateNear(world, a) {
  return world.crates.filter(c => c.carrier === null && dist(a, c) < 2.2).sort((b, c) => dist(a, b) - dist(a, c))[0];
}

/** E: yanındaki kutuyu al; kutu taşıyorsan önüne bırak. Kutu taşıyan herkes iş taşıyan kasabalı gibi görünür. */
export function carry(world, a) {
  if (!canAct(world, a) || a.y > 0.1) return false;
  if (a.crate !== null) { dropCrate(world, a); return true; }
  const c = crateNear(world, a);
  if (!c) return false;
  a.action = null; c.carrier = a.id; a.crate = world.crates.indexOf(c); a.carry = true;
  return true;
}

export function dropCrate(world, a) {
  if (a.crate === null) return;
  const c = world.crates[a.crate], p = safe(world.env, a.x + Math.sin(a.facing) * 1.1, a.z + Math.cos(a.facing) * 1.1);
  Object.assign(c, p, { carrier: null });
  a.crate = null; a.carry = false;
}

/** F: yakın iş noktasında birkaç saniye çalış (hareket edince biter). */
export function blend(world, a) {
  if (!canAct(world, a)) return;
  const w = world.env.work.find(w => dist(a, w) < 4);
  if (w) { a.action = { type: 'work', duration: 3, elapsed: 0 }; a.job = w.job; }
}

/** Hedefe rota kur; aynı hedefe giden geçerli bir rota varsa yeniden hesaplama. */
export function setGoal(world, a, p) {
  if (!p) return;
  if (a.goal && dist(a.goal, p) < 3 && a.path.length) return;
  a.goal = { x: p.x, z: p.z };
  a.path = route(world.env, a, p);
}

/** Bir noktanın çevresindeki kalabalık (8 birim içindeki canlılar). */
export function crowdAt(world, p) {
  let n = 0;
  for (const b of world.actors) if (b.alive && dist(b, p) < 8) n++;
  return n;
}

/**
 * Sıradaki iş noktası: çoğunlukla kendi bölgesinden, ara sıra başka bölgeden. crowded ile (suçlular) birkaç aday
 * arasından en kalabalığı seçilir: kalabalıkta bırakılan iz kimseyi göstermez.
 */
export function routine(world, a, crowded = false) {
  if (a.wait > 0) return;
  const work = world.env.work, pick = () => work[Math.floor(world.random() * work.length)];
  let w;
  if (crowded) w = Array.from({ length: 6 }, pick).sort((p, q) => crowdAt(world, q) - crowdAt(world, p))[0];
  else {
    const choices = work.filter(w => w.region === a.region);
    w = world.random() < 0.22 ? pick() : choices[Math.floor(world.random() * choices.length)];
  }
  a.workTarget = w;
  setGoal(world, a, w);
}

/** Rotadaki bir sonraki noktaya yürü; iş noktasına varınca bekle, çalış ve eşya taşı/bırak. */
export function followPath(world, a, dt) {
  if (a.action || !a.path.length) { a.speed = 0; return; }
  const t = a.path[0], d = dist(a, t);
  if (d >= 0.7) { move(world, a, (t.x - a.x) / d, (t.z - a.z) / d, dt * world.level.speed, Boolean(a.hurry)); return; }
  a.path.shift();
  if (!a.path.length && a.workTarget && dist(a, a.workTarget) < 3) {
    a.wait = 2 + world.random() * 4; a.job = a.workTarget.job;
    if (a.crate === null) a.carry = !a.carry;
    a.workTarget = null;
  }
}
