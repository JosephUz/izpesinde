import * as T from 'three';
import { CFG } from './config.js';
import { buildGrid, dist } from './physics.js';
import { rng } from './rng.js';
import { createMeshKit, mergeStatic } from './view/meshes.js';
import { createSeeThrough, seeThrough } from './view/seethrough.js';

/**
 * Karaağaç kasabası: beş bölge, yollar, binalar, korular, kaya ocağı, iş noktaları ve taşınabilir kutular.
 * computeEnvironment yalnızca veri üretir (simülasyon, testler); buildEnvironmentView aynı veriden 3B sahneyi kurar.
 * Yerleşim ilk haritanın koordinatlarıyla yazılıp CFG.scale ile büyütülür; boyutlar (bina, ağaç) büyütülmez.
 */
const S = CFG.scale;
export const REGIONS = [
  { name: 'Pazar meydanı', short: 'PAZAR', x: 0, z: 0, job: 'Alışveriş yapıyor' },
  { name: 'Altınbaş tarlaları', short: 'TARLA', x: -33 * S, z: 23 * S, job: 'Hasat yapıyor' },
  { name: 'Kuzey korusu', short: 'KORU', x: -33 * S, z: -30 * S, job: 'Odun kesiyor' },
  { name: 'Taş ocağı', short: 'MADEN', x: 36 * S, z: -25 * S, job: 'Cevher çıkarıyor' },
  { name: 'Eski değirmen', short: 'DEĞİRMEN', x: 31 * S, z: 27 * S, job: 'Çuval taşıyor' },
];

export function computeEnvironment() {
  const random = rng(718), buildings = [], trees = [], rocks = [], work = [];
  const add = (x, z, w, d, h, kind) => buildings.push({ x: x * S, z: z * S, w, d, h, kind });
  add(-14, -13, 8, 7, 7, 'han'); add(13, -15, 7, 8, 6, 'ev'); add(-16, 13, 7, 6, 5, 'ev'); add(17, 12, 6, 6, 5, 'ev');
  add(32, 34, 8, 8, 10, 'değirmen'); add(-44, 14, 8, 6, 5, 'depo'); add(44, -35, 8, 6, 5, 'depo'); add(-47, -18, 7, 6, 5, 'ev');
  add(1, -34, 8, 7, 7, 'ev'); add(4, 34, 7, 6, 5, 'ev');
  // Uzayan yollar boyunca ek evler: bölgeler arasında saklanacak yer.
  add(-24, -2, 6, 5, 5, 'ev'); add(23, -3, 6, 6, 5, 'ev'); add(-8, 24, 6, 5, 5, 'ev'); add(14, -28, 6, 5, 5, 'ev');
  add(-30, 40, 7, 5, 5, 'depo'); add(47, 10, 6, 6, 5, 'ev'); add(-55, -40, 6, 5, 5, 'ev'); add(52, -48, 7, 6, 5, 'depo');
  const clear = (x, z, m = 3) => !buildings.some(b => Math.abs(b.x - x) < b.w / 2 + m && Math.abs(b.z - z) < b.d / 2 + m);
  for (let i = 0; i < 110; i++) {
    const x = (-57 + random() * 47) * S, z = (-56 + random() * 35) * S;
    if (clear(x, z) && dist({ x, z }, REGIONS[2]) > 9) trees.push({ x, z, r: 1.1, h: 5 + random() * 5 });
  }
  // Açık tarlalardaki dağınık korular uzun görüş hatlarını keser.
  for (const [cx, cz] of [[-62, 10], [12, 52], [60, -5], [-12, -60], [40, 55], [-40, 62]]) {
    for (let i = 0; i < 9; i++) {
      const x = (cx + (random() - 0.5) * 14) * S, z = (cz + (random() - 0.5) * 12) * S;
      if (clear(x, z) && Math.abs(x) < CFG.half - 4 && Math.abs(z) < CFG.half - 4) trees.push({ x, z, r: 1.1, h: 5 + random() * 5 });
    }
  }
  for (let i = 0; i < 26; i++) rocks.push({ x: (29 + random() * 25) * S, z: (-49 + random() * 15) * S, r: 1 + random() * 1.6 });
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 9; j++) {
      const r = REGIONS[i];
      work.push({ x: r.x + (j % 3 - 1) * 5, z: r.z + (Math.floor(j / 3) - 1) * 5, region: i, job: r.job });
    }
  }
  // Kutular taşınabildiği için engel değildir: her bölgenin yanında bir yığın, her deponun önünde bir sıra.
  const crates = [];
  for (const r of REGIONS) for (let i = 0; i < 4; i++) crates.push({ x: r.x + 8 + (i % 2) * 1.2, z: r.z - 2 + Math.floor(i / 2) * 1.1 });
  for (const b of buildings.filter(b => b.kind === 'depo')) for (let i = 0; i < 3; i++) crates.push({ x: b.x - b.w / 2 + 1 + i * 1.2, z: b.z + b.d / 2 + 1.6 });
  const obstacles = [
    ...buildings.map(b => ({ ...b, w: b.w + 0.8, d: b.d + 0.8 })),
    ...trees.map(t => ({ x: t.x, z: t.z, w: 2, d: 2 })),
    ...rocks.map(r => ({ x: r.x, z: r.z, w: r.r * 2, d: r.r * 2 })),
  ];
  const env = { buildings, trees, rocks, work, crates, obstacles };
  env.grid = buildGrid(env);
  return env;
}

const colors = { grass: '#66846b', path: '#b8a887', wood: '#62533d', roof: '#627a73', wall: '#d5c6a5' };

/**
 * Durağan kasabayı sahneye kurar ve birleştirir. Karakterleri saklayabilecek sabit nesneler (evler, ağaçlar, kayalar,
 * tezgâhlar, kuyu) ayrı bir malzeme takımıyla kurulur ve tek tek kaydedilir: arkalarına biri geçince saydamlaşırlar
 * (bkz. view/seethrough.js). Zemin, yol ve alçak çitler katı kalır. Döner: değirmen kanatları (döner), tabelalar
 * (sprite; görüş alanı dışında gizlenir) ve saydamlık denetleyicisi.
 */
export function buildEnvironmentView(scene, env, kit) {
  const H = CFG.half, windmills = [], signs = [], see = createMeshKit(kit), xray = createSeeThrough();
  // Saydamlaşabilir nesne: kendi grubunda kurulur, kaydedilir (birleştirmede numarası köşelere geçer).
  const object = build => { const g = new T.Group(); scene.add(g); build(g); xray.register(g); return g; };
  const ground = (x, z, w, d, c, y = 0.015) => { const p = kit.box(scene, c, x, y, z, w, 0.04, d); p.castShadow = false; return p; };
  const road = (a, b, width = 4) => {
    const dx = b.x - a.x, dz = b.z - a.z, p = ground((a.x + b.x) / 2, (a.z + b.z) / 2, width, Math.hypot(dx, dz), colors.path, 0.035);
    p.rotation.y = Math.atan2(dx, dz);
  };
  // Sprite gölgelendiricisinde `transformed` yok: tabelalar görüş sisinden çıkarılır, görüş dışında gizlenir.
  const sign = (x, z, text) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#172b22'; ctx.fillRect(0, 0, 512, 80);
    ctx.strokeStyle = '#b8a473'; ctx.strokeRect(5, 5, 502, 70);
    ctx.fillStyle = '#e0d5af'; ctx.font = '27px Georgia'; ctx.textAlign = 'center'; ctx.fillText(text.toLocaleUpperCase('tr'), 256, 50);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8, fog: false }));
    sprite.position.set(x, 4, z); sprite.scale.set(8, 1.25, 1);
    scene.add(sprite); signs.push(sprite);
  };

  ground(0, 0, H * 2 + 12, H * 2 + 12, colors.grass, -0.1);
  kit.mesh(scene, new T.CylinderGeometry(14, 14, 0.13, 12), colors.path, 0, 0, 0);
  for (const r of REGIONS.slice(1)) { road(REGIONS[0], r, 5); ground(r.x, r.z, 18, 18, r.name.includes('tarlaları') ? '#988b5b' : colors.path, 0.04); }
  for (const [a, b] of [[1, 2], [2, 3], [3, 4], [4, 1]]) road(REGIONS[a], REGIONS[b], 3);

  // Dere ve iki küçük köprü kasabayı çerçeveler, yolları kesmez.
  const sx = 56 * S;
  ground(sx, 7 * S, 7, 116 * S, '#568c8b', -0.02);
  for (const z of [-21 * S, 26 * S]) {
    ground(sx, z, 12, 5, '#8e7c58', 0.08);
    for (const x of [sx - 5, sx - 2, sx + 1, sx + 4]) for (const zz of [z - 2.2, z + 2.2]) kit.box(scene, colors.wood, x, 0.8, zz, 0.16, 1.6, 0.16);
    for (const zz of [z - 2.2, z + 2.2]) kit.box(scene, colors.wood, sx, 1.3, zz, 10, 0.14, 0.14);
  }
  for (let i = 0; i < 220; i++) {
    const x = Math.sin(i * 73.32) * 64 * S, z = Math.cos(i * 13.78) * 64 * S;
    if (Math.hypot(x, z) >= 18) kit.mesh(scene, kit.ballGeo, i % 3 ? '#738b69' : '#879b73', x, -0.05, z, 1.8, 0.2, 1.3);
  }
  for (const b of env.buildings) object(g => building(g, see, kit, b, windmills, sign));
  for (const t of env.trees) {
    object(g => {
      see.mesh(g, see.cylinderGeo, '#6b5940', t.x, t.h * 0.23, t.z, 0.35, t.h * 0.46, 0.35);
      see.mesh(g, see.coneGeo, '#3d6453', t.x, t.h * 0.6, t.z, 2.7, t.h * 0.65, 2.7);
      see.mesh(g, see.coneGeo, '#557861', t.x, t.h * 0.85, t.z, 2.1, t.h * 0.5, 2.1);
    });
  }
  for (const r of env.rocks) object(g => see.mesh(g, see.ballGeo, '#82908a', r.x, r.r * 0.6, r.z, r.r, r.r, r.r));

  // Buğday tek bir instanced mesh: tarla ayrıntılı ama çizim maliyeti düşük.
  const fx = REGIONS[1].x - 0.5, fz = REGIONS[1].z + 2;
  ground(fx, fz, 19, 16, '#796b47', 0.02);
  const wheat = new T.InstancedMesh(kit.boxGeo, kit.material('#d3b96b'), 320), matrix = new T.Matrix4();
  let wi = 0;
  for (let x = 0; x < 16; x++) for (let z = 0; z < 20; z++) { matrix.makeScale(0.16, 0.65 + (x % 3) * 0.15, 0.16); matrix.setPosition(fx - 8 + x * 1.08, 0.5, fz - 7 + z * 0.7); wheat.setMatrixAt(wi++, matrix); }
  wheat.castShadow = true; scene.add(wheat);
  for (const z of [fz - 8, fz + 8]) for (let x = fx - 10; x < fx + 11; x += 3) { kit.box(scene, '#8b8058', x, 0.7, z, 0.16, 1.4, 0.16); kit.box(scene, '#8b8058', x + 1.5, 0.95, z, 3, 0.14, 0.14); }

  for (let i = 0; i < 6; i++) object(g => stall(g, see, [-8, 0, 8][i % 3], i < 3 ? -7 : 8, i));
  // Pazarın ortasındaki kuyu.
  object(g => {
    see.mesh(g, new T.CylinderGeometry(1.5, 1.8, 1.2, 10), '#949c8c', 0, 0.6, 0);
    see.mesh(g, new T.CylinderGeometry(1.15, 1.15, 0.05, 12), '#496f6d', 0, 1.22, 0);
    for (const x of [-1.7, 1.7]) see.box(g, colors.wood, x, 2, 0, 0.2, 4, 0.2);
    see.box(g, colors.wood, 0, 4, 0, 4, 0.25, 0.3); see.box(g, '#a29670', 0, 2.6, 0, 0.05, 2.5, 0.05);
  });

  for (const r of REGIONS) sign(r.x - 6, r.z - 3, r.name);
  const grove = REGIONS[2];
  for (let i = 0; i < 8; i++) { const log = kit.mesh(scene, kit.cylinderGeo, '#806c47', grove.x - 3 + (i % 4) * 1.05, 0.6 + Math.floor(i / 4) * 0.7, grove.z + 2, 0.5, 4, 0.5); log.rotation.z = Math.PI / 2; }
  for (const [x, z] of [[-9, 3], [9, -2], [-24, 15], [26, 19], [-21, -21], [25, -22], [-45, 0], [0, -45], [45, 5], [0, 45]]) {
    kit.box(scene, '#4d5542', x * S, 2, z * S, 0.16, 4, 0.16); kit.box(scene, '#dbc58c', x * S, 3.8, z * S, 0.48, 0.65, 0.48); kit.box(scene, '#465548', x * S, 4.2, z * S, 0.7, 0.15, 0.7);
  }
  // Alçak taş sınır duvarı, ana yönlerde açık kapılar.
  const wall = H - 1.5;
  for (let i = -(H - 4); i <= H - 4; i += 5) {
    if (Math.abs(i) < 5) continue;
    for (const s of [-1, 1]) { kit.box(scene, '#89927b', i, 0.7, s * wall, 4.8, 1.4, 1); kit.box(scene, '#89927b', s * wall, 0.7, i, 1, 1.4, 4.8); }
  }
  for (const m of see.materials.values()) seeThrough(m);
  mergeStatic(scene, windmills);
  return { windmills, signs, xray };
}

/** Bina: parçalar `kit` (saydamlaşabilir) ile; dönen değirmen kanatları birleştirilmediği için katı `solidKit` ile kurulur. */
function building(parent, kit, solidKit, b, windmills, sign) {
  const g = new T.Group(); g.position.set(b.x, 0, b.z); parent.add(g);
  const { w, d, h } = b;
  kit.box(g, '#7c8370', 0, 0.35, 0, w + 0.3, 0.7, d + 0.3);
  kit.box(g, colors.wall, 0, h * 0.44, 0, w, h * 0.8, d);
  for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) { kit.box(g, colors.wood, x, h * 0.42, d / 2 + 0.03, 0.22, h * 0.83, 0.16); kit.box(g, colors.wood, x, h * 0.42, -d / 2 - 0.03, 0.22, h * 0.83, 0.16); }
  for (const y of [0.9, h * 0.48, h * 0.8]) kit.box(g, colors.wood, 0, y, d / 2 + 0.08, w, 0.2, 0.14);
  kit.box(g, '#4b5040', 0, 1.35, d / 2 + 0.1, 1.5, 2.4, 0.16); kit.box(g, '#a7a37f', 0.5, 1.3, d / 2 + 0.2, 0.12, 0.12, 0.06);
  for (const x of [-w * 0.3, w * 0.3]) { kit.box(g, '#515f50', x, h * 0.6, d / 2 + 0.1, 1.2, 1.25, 0.14); kit.box(g, '#d9b776', x, h * 0.6, d / 2 + 0.2, 0.85, 0.95, 0.1); kit.box(g, colors.wood, x, h * 0.6, d / 2 + 0.3, 0.09, 1, 0.1); }
  const rw = w / 2 + 0.65, rd = d / 2 + 0.65, base = h * 0.8, peak = base + h * 0.36;
  // Üçgenler dışa bakacak sırayla (saat yönünün tersi): çatı tek yüzlü çizilir.
  const vertices = [
    -rw, base, -rd, 0, peak, -rd, rw, base, -rd, -rw, base, rd, rw, base, rd, 0, peak, rd,
    -rw, base, -rd, 0, peak, rd, 0, peak, -rd, -rw, base, -rd, -rw, base, rd, 0, peak, rd,
    rw, base, -rd, 0, peak, rd, rw, base, rd, rw, base, -rd, 0, peak, -rd, 0, peak, rd,
  ];
  const roofGeo = new T.BufferGeometry();
  roofGeo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); roofGeo.computeVertexNormals();
  const roofMat = kit.material(b.kind === 'han' ? '#985e48' : b.kind === 'değirmen' ? '#b39665' : colors.roof);
  const roof = new T.Mesh(roofGeo, roofMat); roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  kit.box(g, '#8d8771', w * 0.28, h, 0, 0.9, h * 0.7, 1);
  if (b.kind === 'han') { kit.box(g, '#314e43', -w * 0.38, 2.2, d / 2 + 0.4, 1.3, 1.2, 0.2); sign(b.x, b.z + d / 2 + 1, 'GEYİKLİ HAN'); }
  if (b.kind === 'değirmen') {
    const blades = new T.Group(); blades.position.set(0, h * 0.78, d / 2 + 1.1); g.add(blades);
    for (let i = 0; i < 4; i++) {
      const arm = new T.Group(); arm.rotation.z = i * Math.PI / 2;
      solidKit.box(arm, '#c9bd91', 0, 2.5, 0, 0.8, 4.7, 0.15); solidKit.box(arm, colors.wood, 0, 2.5, 0.13, 0.13, 5.2, 0.18);
      blades.add(arm);
    }
    windmills.push(blades);
  }
}

function stall(parent, kit, x, z, i) {
  const g = new T.Group(); g.position.set(x, 0, z); parent.add(g);
  for (const dx of [-1.8, 1.8]) for (const dz of [-1, 1]) kit.box(g, colors.wood, dx, 1.4, dz, 0.13, 2.8, 0.13);
  kit.box(g, '#8e7651', 0, 0.9, 0, 3.8, 0.18, 2.3);
  const c = i % 2 ? '#b79964' : '#577b72';
  for (let n = 0; n < 6; n++) {
    const a = kit.box(g, n % 2 ? '#d9cdaa' : c, -1.65 + n * 0.65, 2.65, 0, 0.66, 0.12, 2.8); a.rotation.x = 0.08;
    kit.box(g, n % 2 ? '#d9cdaa' : c, -1.65 + n * 0.65, 2.45, 1.4, 0.66, 0.45, 0.08);
  }
  for (let n = 0; n < 12; n++) kit.mesh(g, kit.ballGeo, ['#a56749', '#bba354', '#819553'][i % 3], -1.4 + (n % 6) * 0.54, 1.2, -0.4 + Math.floor(n / 6) * 0.7, 0.22, 0.2, 0.22);
}
