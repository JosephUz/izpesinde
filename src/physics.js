import { CFG } from './config.js';

/**
 * Çarpışma, görüş hattı, güvenli iniş ve yol bulma. Hepsi aynı durağan engel listesini (env.obstacles: bina, ağaç,
 * kaya kutuları) kullanır; böylece botun yürüdüğü yol, oyuncunun çarptığı duvar ve görüşü kesen engel tutarlıdır.
 * Kutular engel değildir: taşınabilirler.
 */

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** (x, z) harita dışında ya da bir engelin içinde mi? */
export function blocked(env, x, z) {
  return Math.abs(x) > CFG.half - 1 || Math.abs(z) > CFG.half - 1 ||
    env.obstacles.some(b => Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2);
}

/**
 * Karakterler birbirinin içinden geçmez: yerdeki (zıplamayan) ve ölü olmayan her iki karakter CFG.body * 2'den yakınsa
 * aradaki örtüşme ikisine yarı yarıya itilerek açılır; itme bir engele sokacaksa o eksende yapılmaz. Üst üste binen
 * karakterler imleçle seçilemiyordu. 180 karakter için 2 birimlik ızgara: yalnızca komşu hücreler denetlenir.
 */
export function separate(world) {
  const min = CFG.body * 2, cells = new Map(), key = (x, z) => x * 4096 + z;
  const solid = world.actors.filter(a => a.alive && a.y < 0.4);
  for (const a of solid) {
    const k = key(Math.floor(a.x / 2), Math.floor(a.z / 2));
    (cells.get(k) || cells.set(k, []).get(k)).push(a);
  }
  const push = (a, dx, dz) => {
    if (!blocked(world.env, a.x + dx, a.z)) a.x += dx;
    if (!blocked(world.env, a.x, a.z + dz)) a.z += dz;
  };
  for (const a of solid) {
    const cx = Math.floor(a.x / 2), cz = Math.floor(a.z / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const b of cells.get(key(cx + i, cz + j)) || []) {
        if (b.id <= a.id) continue;
        let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= min) continue;
        if (d < 1e-4) { const t = (a.id * 2.399) % (Math.PI * 2); dx = Math.cos(t); dz = Math.sin(t); d = 1; } else { dx /= d; dz /= d; }
        const o = (min - Math.min(d, min)) / 2;
        push(a, -dx * o, -dz * o); push(b, dx * o, dz * o);
      }
    }
  }
  for (const a of solid) if (a.crate !== null) Object.assign(world.crates[a.crate], { x: a.x, z: a.z });
}

/** (x, z) yakınındaki ilk boş nokta: inişte binanın içinde kalmamak ve doğru yere doğmak için. */
export function safe(env, x, z) {
  x = Math.max(-CFG.half + 1, Math.min(CFG.half - 1, x));
  z = Math.max(-CFG.half + 1, Math.min(CFG.half - 1, z));
  if (!blocked(env, x, z)) return { x, z };
  for (let r = 0.6; r < 15; r += 0.6) {
    for (let a = 0; a < 24; a++) {
      const p = { x: x + Math.cos(a * Math.PI / 12) * r, z: z + Math.sin(a * Math.PI / 12) * r };
      if (!blocked(env, p.x, p.z)) return p;
    }
  }
  return { x: 0, z: 6 };
}

/** a, b'yi görüyor mu: menzil içinde ve aradaki çizgi hiçbir engelden geçmiyor (yarım birim aralıkla örneklenir). */
export function visible(env, a, b, range = CFG.vision) {
  const d = dist(a, b);
  if (d > range) return false;
  const n = Math.ceil(d * 2);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (env.obstacles.some(o => Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2)) return false;
  }
  return true;
}

// Yol bulma ızgarası: 3 birimlik hücreler. Hücre merkezleri ve aralarındaki yarım adım örnekleri bir kez hesaplanır;
// 180 karakter rota ararken her adımda engel listesini taramak yerine bu tablolara bakılır.
const STEP = 3, LIM = Math.floor((CFG.half - 1) / STEP), SIDE = LIM * 2 + 1;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const cell = (x, z) => (x + LIM) * SIDE + z + LIM;

/** Yürünebilirlik ızgarası: cells[i] hücre dolu mu, mid[i*4+k] hücreden +x, +z ve iki çapraz yöndeki yarım adım dolu mu. */
export function buildGrid(env) {
  const cells = new Uint8Array(SIDE * SIDE), mid = new Uint8Array(SIDE * SIDE * 4);
  for (let x = -LIM; x <= LIM; x++) {
    for (let z = -LIM; z <= LIM; z++) {
      const i = cell(x, z);
      cells[i] = blocked(env, x * STEP, z * STEP) ? 1 : 0;
      [[1, 0], [0, 1], [1, 1], [1, -1]].forEach(([dx, dz], k) => {
        mid[i * 4 + k] = blocked(env, (x + dx / 2) * STEP, (z + dz / 2) * STEP) ? 1 : 0;
      });
    }
  }
  return { cells, mid };
}

/** İki hücre arasındaki yarım adım örneği: geri yönlü hareketler komşu hücrenin ileri yönlü örneğine eşlenir. */
function between(grid, x, z, dx, dz) {
  if (dx === -1 && dz === 0) return grid.mid[cell(x - 1, z) * 4];
  if (dx === 0 && dz === -1) return grid.mid[cell(x, z - 1) * 4 + 1];
  if (dx === -1 && dz === -1) return grid.mid[cell(x - 1, z - 1) * 4 + 2];
  if (dx === -1 && dz === 1) return grid.mid[cell(x - 1, z + 1) * 4 + 3];
  const k = dx === 1 && dz === 0 ? 0 : dx === 0 && dz === 1 ? 1 : dx === 1 && dz === 1 ? 2 : 3;
  return grid.mid[cell(x, z) * 4 + k];
}

/** a'dan b'ye A* rotası (ikili yığınla). Hedefe varılamazsa en son genişletilen hücreye kadar gider. */
export function route(env, a, b) {
  const grid = env.grid, clamp = v => Math.max(-LIM, Math.min(LIM, Math.round(v / STEP)));
  const ex = clamp(b.x), ez = clamp(b.z);
  const g = new Float32Array(SIDE * SIDE).fill(Infinity), parent = new Int32Array(SIDE * SIDE).fill(-1), closed = new Uint8Array(SIDE * SIDE);
  const heap = [];
  const push = (f, i) => {
    heap.push([f, i]);
    for (let n = heap.length - 1; n > 0;) {
      const p = (n - 1) >> 1;
      if (heap[p][0] <= heap[n][0]) break;
      [heap[p], heap[n]] = [heap[n], heap[p]]; n = p;
    }
  };
  const pop = () => {
    const top = heap[0], end = heap.pop();
    if (heap.length) {
      heap[0] = end;
      for (let n = 0; ;) {
        const l = n * 2 + 1, r = l + 1; let m = n;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === n) break;
        [heap[m], heap[n]] = [heap[n], heap[m]]; n = m;
      }
    }
    return top;
  };
  const start = cell(clamp(a.x), clamp(a.z));
  g[start] = 0; push(0, start);
  let last = start;
  for (let k = 0; heap.length && k < 6000; k++) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1; last = i;
    const x = Math.floor(i / SIDE) - LIM, z = i % SIDE - LIM;
    if (Math.hypot(x - ex, z - ez) < 1.5) break;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (Math.abs(nx) > LIM || Math.abs(nz) > LIM) continue;
      const j = cell(nx, nz);
      if (closed[j] || grid.cells[j] || between(grid, x, z, dx, dz)) continue;
      const cost = g[i] + Math.hypot(dx, dz);
      if (cost < g[j]) { g[j] = cost; parent[j] = i; push(cost + Math.hypot(nx - ex, nz - ez), j); }
    }
  }
  const points = [];
  for (let i = last; parent[i] !== -1; i = parent[i]) points.unshift({ x: (Math.floor(i / SIDE) - LIM) * STEP, z: (i % SIDE - LIM) * STEP });
  points.push(safe(env, b.x, b.z));
  return points;
}
