import { think } from './ai.js';
import { CFG, LEVELS, NAMES } from './config.js';
import { disguise, murder } from './criminal.js';
import { blend, carry, dash, fall, followPath, jump, move } from './crowd.js';
import { REGIONS, computeEnvironment } from './environment.js';
import { arrest, mark } from './marks.js';
import { safe } from './physics.js';
import { rng } from './rng.js';
import { active, contestants, emit } from './roster.js';
import { finish } from './score.js';
import { traceEvery, updateTraces } from './traces.js';

/**
 * Dünya: simülasyonun tamamı, çizimden ve DOM'dan bağımsız (testler başsız koşturur). Kurallar tek yetkili adımda
 * işler; ileride çok oyunculuya geçişte aynı kod sunucuda çalışabilir.
 *
 * Maç 5 turdur. Tek oyunculu oyunda insan her turun başında rolünü seçer (startRound'un role parametresi); botlar
 * kalan rolleri rastgele paylaşır ve her tur yine tam 2 suçlu, 6 dedektif, 2 savcı olur. Kişisel skor turlar boyunca
 * birikir.
 */
export function createWorld({ seed = Date.now(), level = 'normal' } = {}) {
  return {
    random: rng(seed), level: LEVELS[level] || LEVELS.normal, env: computeEnvironment(),
    scores: Array(10).fill(0), history: [], round: 0, events: [], serial: 0,
    time: 0, result: null, actors: [], crates: [], player: null,
    killsLeft: CFG.kills, effects: [], traces: [], marks: new Map(), ghosts: [], tally: Array(10).fill(0), hidden: Array(10).fill(0), traceSerial: 0,
  };
}

const ROLES = ['criminal', 'criminal', 'prosecutor', 'prosecutor', ...Array(6).fill('detective')];

/** Yeni tur. role verilirse oyuncu o rolü alır; verilmezse (testler, menü arka planı) oyuncu da rastgele dağıtıma girer. */
export function startRound(world, role = null) {
  if (world.round >= CFG.rounds) return false;
  world.round++;
  Object.assign(world, { time: 0, result: null, killsLeft: CFG.kills, effects: [], events: [], traces: [], marks: new Map(), ghosts: [], tally: Array(10).fill(0), hidden: Array(10).fill(0), traceSerial: 0 });
  const pool = [...ROLES];
  if (role) pool.splice(pool.indexOf(role), 1);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(world.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const roles = role ? [role, ...pool] : pool;
  // Yarışmacılar her tur haritanın farklı bölgelerine dağılır: pazar meydanı sabit bir açılış değildir.
  world.actors = Array.from({ length: 10 + CFG.crowd }, (_, id) => {
    const region = Math.floor(world.random() * REGIONS.length), spread = id < 10 ? 34 : 22, r = REGIONS[region];
    const p = safe(world.env, r.x + (world.random() - 0.5) * spread, r.z + (world.random() - 0.5) * spread);
    return {
      id, name: NAMES[id] || 'Kasabalı', role: roles[id] || 'civilian', ...p, y: 0, vy: 0, jumps: 0,
      appearance: Math.floor(world.random() * 10), hat: Math.floor(world.random() * 3),
      alive: true, caught: false, caughtAt: null, facing: 0, speed: 0, dashCd: 0, disguiseCd: 0, dash: 0,
      action: null, crate: null, carry: false, marks: 0, catches: 0,
      known: new Set(), suspects: new Map(), followers: new Map(), seenTraces: new Set(), trail: [], trailClock: 0, traceClock: 0,
      think: world.random() * 2, wait: 0, region, job: '', path: [], goal: null,
    };
  });
  let nth = 0;
  for (const a of contestants(world)) {
    // Suçlular birbirini, dedektif ve savcılar savcıları tanır.
    for (const b of contestants(world)) if (a.id !== b.id && ((a.role === 'criminal' && b.role === 'criminal') || (a.role !== 'criminal' && b.role === 'prosecutor'))) a.known.add(b.id);
    if (a.role === 'detective') a.marks = CFG.marks;
    if (a.role === 'prosecutor') a.catches = CFG.catches;
    if (a.role === 'criminal') a.traceClock = traceEvery(0) * (1 - (nth++) / 2);
  }
  world.crates = world.env.crates.map(c => ({ ...c, carrier: null }));
  world.player = world.actors[0];
  emit(world, 'Suç çoktan işlendi. Suçlular kalabalığın içinde.', 'crime');
  return true;
}

/** Sol tık: tıklanan kişiye rolün eylemi (dedektif işaretler, savcı yakalar, suçlu kılığına girer). */
export function use(world, a, b) {
  if (!b) return false;
  if (a.role === 'detective') return mark(world, a, b);
  if (a.role === 'prosecutor') return arrest(world, a, b);
  if (a.role === 'criminal') return disguise(world, a, b);
  return false;
}

/** Bir simülasyon adımı: oyuncu girdisi, hareket, bot kararları, izler, efektler, süre. */
export function step(world, dt, input = {}) {
  if (world.result) return;
  dt = Math.min(dt, 0.05);
  world.time += dt;
  const p = world.player;
  if (input.jump) jump(world, p);
  if (input.dash) dash(world, p);
  if (input.use !== undefined) use(world, p, world.actors[input.use]);
  if (input.kill) murder(world, p);
  if (input.carry) carry(world, p);
  if (input.blend) blend(world, p);
  if (world.result) return;
  move(world, p, input.dx || 0, input.dz || 0, dt, input.sprint);
  for (const a of world.actors) {
    for (const k of ['dashCd', 'disguiseCd', 'dash', 'wait']) a[k] = Math.max(0, a[k] - dt);
    if (!active(a)) continue;
    fall(world, a, dt);
    if (a.id === 0) continue;
    a.think -= dt;
    if (a.think <= 0) { a.think = world.level.reaction + (a.role === 'civilian' ? 1 : 0) + world.random() * 0.3; think(world, a); }
    if (world.result) return;
    followPath(world, a, dt);
  }
  for (const a of world.actors) {
    if (a.action && active(a)) { a.action.elapsed += dt; if (a.action.elapsed >= a.action.duration) a.action = null; }
  }
  updateTraces(world, dt);
  for (const fx of world.effects) fx.t -= dt;
  world.effects = world.effects.filter(f => f.t > 0);
  world.ghosts = world.ghosts.filter(g => g.until > world.time);
  if (world.time >= CFG.seconds) finish(world, 'timeout');
}

/** İzleyici kamera: elenen oyuncu hayattaki aynı roldekileri izler (Tab ile sıradakine geçer). */
export function spectate(world, current = 0, cycle = false) {
  if (active(world.player)) return world.player;
  const list = contestants(world).filter(a => active(a) && a.role === world.player.role);
  if (!list.length) return null;
  const i = list.findIndex(a => a.id === current);
  return list[(Math.max(0, i) + (cycle ? 1 : 0)) % list.length];
}
