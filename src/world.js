import { think } from './ai.js';
import { CFG, LEVELS, NAMES } from './config.js';
import { disguise, murder } from './criminal.js';
import { blend, carry, dash, fall, followPath, jump, move } from './crowd.js';
import { REGIONS, computeEnvironment } from './environment.js';
import { arrest, mark } from './marks.js';
import { safe, separate } from './physics.js';
import { rng } from './rng.js';
import { active, contestants, emit } from './roster.js';
import { finish } from './score.js';
import { traceEvery, updateTraces } from './traces.js';

/**
 * Dünya: simülasyonun tamamı, çizimden ve DOM'dan bağımsız (testler başsız koşturur). Kurallar tek yetkili adımda
 * işler: tek başına oyunda tarayıcıda, çevrim içi odada sunucuda (server/rooms.mjs) aynı kod koşar.
 *
 * Maç 5 turdur. Tek başına oyunda insan her turun başında rolünü seçer (startRound'un role parametresi); botlar
 * kalan rolleri rastgele paylaşır ve her tur yine tam 2 suçlu, 6 dedektif, 2 savcı olur. Çevrim içi odada rol seçimi
 * yoktur: herkes (insan ve bot) her tur rastgele rol alır. Kişisel skor turlar boyunca birikir.
 *
 * humans: insanların yarışmacı numaraları (0–9; tek başına oyunda [0]). Bu karakterleri bot yönetmez, girdileri
 * step'e gelir. names: yarışmacı adları (koltuk sırasıyla). seconds: tur süresi (yalnızca testler kısaltır).
 */
export function createWorld({ seed = Date.now(), level = 'normal', humans = [0], names = NAMES, seconds = CFG.seconds } = {}) {
  return {
    random: rng(seed), level: LEVELS[level] || LEVELS.normal, env: computeEnvironment(), humans: new Set(humans), names: [...names], seconds,
    scores: Array(10).fill(0), history: [], round: 0, events: [], serial: 0,
    time: 0, result: null, actors: [], crates: [], player: null,
    effects: [], traces: [], marks: new Map(), revealed: new Map(), ghosts: [], tally: Array(10).fill(0), hidden: Array(10).fill(0), traceSerial: 0,
  };
}

const ROLES = ['criminal', 'criminal', 'prosecutor', 'prosecutor', ...Array(6).fill('detective')];

/** Yeni tur. role verilirse oyuncu o rolü alır; verilmezse (testler, menü arka planı) oyuncu da rastgele dağıtıma girer. */
export function startRound(world, role = null) {
  if (world.round >= CFG.rounds) return false;
  world.round++;
  Object.assign(world, { time: 0, result: null, effects: [], events: [], traces: [], marks: new Map(), revealed: new Map(), ghosts: [], tally: Array(10).fill(0), hidden: Array(10).fill(0), traceSerial: 0 });
  const pool = [...ROLES];
  if (role) pool.splice(pool.indexOf(role), 1);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(world.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const roles = role ? [role, ...pool] : pool;
  // Yarışmacılar her tur haritanın farklı bölgelerine dağılır: pazar meydanı sabit bir açılış değildir.
  world.actors = Array.from({ length: 10 + CFG.crowd }, (_, id) => {
    const region = Math.floor(world.random() * REGIONS.length), spread = id < 10 ? 34 : 22, r = REGIONS[region];
    const p = safe(world.env, r.x + (world.random() - 0.5) * spread, r.z + (world.random() - 0.5) * spread);
    return {
      id, name: (id < 10 && world.names[id]) || '', role: roles[id] || 'civilian', ...p, y: 0, vy: 0, jumps: 0,
      appearance: Math.floor(world.random() * 10), hat: Math.floor(world.random() * 3),
      alive: true, caught: false, caughtAt: null, facing: 0, speed: 0, dashCd: 0, disguiseCd: 0, killCd: 0, dash: 0,
      action: null, crate: null, carry: false, seenMarks: new Set(),
      known: new Set(), suspects: new Map(), followers: new Map(), seenTraces: new Set(), trail: [], trailClock: 0, traceClock: 0,
      think: world.random() * 2, wait: 0, region, job: '', path: [], goal: null,
    };
  });
  let nth = 0;
  for (const a of contestants(world)) {
    // Suçlular birbirini, dedektif ve savcılar savcıları tanır.
    for (const b of contestants(world)) if (a.id !== b.id && ((a.role === 'criminal' && b.role === 'criminal') || (a.role !== 'criminal' && b.role === 'prosecutor'))) a.known.add(b.id);
    if (a.role === 'criminal') a.traceClock = traceEvery(0) * (1 - (nth++) / 2);
  }
  world.crates = world.env.crates.map(c => ({ ...c, carrier: null }));
  world.player = world.actors[0];
  emit(world, 'basla', 'crime');
  return true;
}

/** Sol tık: tıklanan kişiye rolün eylemi (dedektif işaretler, savcı yakalar, suçlu öldürür). Suçlunun kılığı Q'dadır. */
export function use(world, a, b) {
  if (!b) return false;
  if (a.role === 'detective') return mark(world, a, b);
  if (a.role === 'prosecutor') return arrest(world, a, b);
  if (a.role === 'criminal') return murder(world, a, b);
  return false;
}

/** Bir insanın bu adımdaki tek seferlik eylemleri (zıpla, atıl, sol tık, Q, kutu, çalış). */
function act(world, p, input) {
  if (input.jump) jump(world, p);
  if (input.dash) dash(world, p);
  if (input.use != null) use(world, p, world.actors[input.use]);
  if (input.swap != null) disguise(world, p, world.actors[input.swap]);
  if (input.carry) carry(world, p);
  if (input.blend) blend(world, p);
}

/**
 * Bir simülasyon adımı: insan girdileri, hareket, bot kararları, izler, efektler, süre. input tek başına oyunda
 * oyuncunun girdisidir; çevrim içi odada yarışmacı numarası → girdi eşlemesi (Map). Girdisi gelmeyen insan durur.
 */
export function step(world, dt, input = {}) {
  if (world.result) return;
  dt = Math.min(dt, 0.05);
  world.time += dt;
  const inputs = input instanceof Map ? input : new Map([[world.player.id, input]]);
  for (const [id, inp] of inputs) if (world.humans.has(id)) act(world, world.actors[id], inp);
  if (world.result) return;
  for (const id of world.humans) { const inp = inputs.get(id) || {}; move(world, world.actors[id], inp.dx || 0, inp.dz || 0, dt, inp.sprint); }
  for (const a of world.actors) {
    for (const k of ['dashCd', 'disguiseCd', 'killCd', 'dash', 'wait']) a[k] = Math.max(0, a[k] - dt);
    if (!active(a)) continue;
    fall(world, a, dt);
    if (world.humans.has(a.id)) continue;
    a.think -= dt;
    if (a.think <= 0) { a.think = world.level.reaction + (a.role === 'civilian' ? 1 : 0) + world.random() * 0.3; think(world, a); }
    if (world.result) return;
    followPath(world, a, dt);
  }
  for (const a of world.actors) {
    if (a.action && active(a)) { a.action.elapsed += dt; if (a.action.elapsed >= a.action.duration) a.action = null; }
  }
  separate(world);
  updateTraces(world, dt);
  for (const fx of world.effects) fx.t -= dt;
  world.effects = world.effects.filter(f => f.t > 0);
  world.ghosts = world.ghosts.filter(g => g.until > world.time);
  if (world.time >= world.seconds) finish(world, 'timeout');
}

/**
 * İzleyici kamera: elenen oyuncu hayattaki aynı roldekileri izler (Tab ile sıradakine geçer). who: kimin gözünden
 * (sunucuda her insan için ayrı). Çevrim içi istemcide roller gizli olduğu için gözü sunucu seçer (world.eyesId).
 */
export function spectate(world, current = 0, cycle = false, who = world.player) {
  if (world.remote) return world.eyesId == null ? null : world.actors[world.eyesId];
  if (active(who)) return who;
  const list = contestants(world).filter(a => active(a) && a.role === who.role);
  if (!list.length) return null;
  const i = list.findIndex(a => a.id === current);
  return list[(Math.max(0, i) + (cycle ? 1 : 0)) % list.length];
}
