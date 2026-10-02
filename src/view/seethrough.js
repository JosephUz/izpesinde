import * as T from 'three';
import { CAMERA, CFG, SEE_THROUGH } from '../config.js';
import { dist } from '../physics.js';

/**
 * Sabit nesnelerin (ev, pazar tezgâhı, ağaç, kaya, kuyu) saydamlığı: görüş alanındaki herhangi bir karakter (oyuncu,
 * bot ya da kasabalı) bir nesnenin arkasına geçince — başından kameraya giden ışın nesnenin kutusundan geçince — o
 * nesne saydamlaşır; arkadaki görünür ve fareyle seçilebilir.
 *
 * Nesneler toplu çizim için birleştirilmiş mesh'lerde durur; her köşe kendi nesnesinin numarasını (`seeId`) taşır.
 * Her nesnenin saydamlığı (0 katı … 1 saydam, yumuşak geçişli) küçük bir dokuya yazılır, gölgelendirici o nesnenin
 * değerine göre ekran uzayında 4×4 Bayer deseniyle piksel atlar (titreşimli saydamlık): nesne opak çizim yolunda
 * kalır, derinlik yazar, sıralama hatası olmaz, gölgesi düşmeye devam eder.
 */
const MAX = 512;
const data = new Uint8Array(MAX * 4), texture = new T.DataTexture(data, MAX, 1, T.RGBAFormat);
texture.needsUpdate = true;
const uniforms = { seeTex: { value: texture }, seeKeep: { value: SEE_THROUGH.keep } };
const dir = new T.Vector3(...CAMERA.offset).normalize();

const VERTEX = ['attribute float seeId;', 'varying float vSeeId;'].join('\n');
const FRAGMENT = `
{
  float seeFade = texelFetch(seeTex, ivec2(int(vSeeId + 0.5), 0), 0).r;
  if (seeFade > 0.0) {
    const float bayer[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
    ivec2 cell = ivec2(mod(gl_FragCoord.xy, 4.0));
    if ((bayer[cell.x + cell.y * 4] + 0.5) / 16.0 > mix(1.0, seeKeep, seeFade)) discard;
  }
}
`;

/** Malzemeyi nesne başına saydamlaşabilir yapar; bu malzemeyi kullanan her mesh `seeId` özniteliği taşımalıdır. */
export function seeThrough(material) {
  if (material.userData.seeThrough) return material;
  material.userData.seeThrough = true;
  material.customProgramCacheKey = () => 'see-through';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX + '\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeeId = seeId;');
    shader.fragmentShader = 'uniform sampler2D seeTex;\nuniform float seeKeep;\nvarying float vSeeId;\n' +
      shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAGMENT);
  };
  return material;
}

/** Işın (p + t·dir, t > 0) eksen hizalı kutuya çarpıyor mu (slab yöntemi). */
function hits(p, box) {
  let t0 = 0, t1 = Infinity;
  for (const [o, d, lo, hi] of [[p.x, dir.x, box.min.x, box.max.x], [p.y, dir.y, box.min.y, box.max.y], [p.z, dir.z, box.min.z, box.max.z]]) {
    if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) return false; continue; }
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Kayıt: environment.js her saydamlaşabilir nesneyi `register(root)` ile verir (birleştirmeden önce); kökün altındaki
 * mesh'ler numarayı userData.seeId olarak alır, mergeStatic onu köşe özniteliğine çevirir.
 */
export function createSeeThrough() {
  const objects = [], p = new T.Vector3();
  return {
    objects,
    register(root) {
      if (objects.length >= MAX) return;
      const id = objects.length;
      root.updateMatrixWorld(true);
      root.traverse(o => { if (o.isMesh) o.userData.seeId = id; });
      const box = new T.Box3().setFromObject(root), center = box.getCenter(new T.Vector3());
      objects.push({ id, box, center: { x: center.x, z: center.z }, radius: Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2, fade: 0 });
    },
    /** Her kare: görüş alanındaki karakterlerin arkasında kaldığı nesneler saydamlaşır; menüde (göz yokken) hepsi katı. */
    update(world, eyes, dt) {
      const k = Math.min(1, dt * SEE_THROUGH.speed);
      const near = eyes ? world.actors.filter(a => a.alive && dist(a, eyes) <= CFG.vision) : [];
      let changed = false;
      for (const o of objects) {
        let behind = false;
        if (eyes && dist(o.center, eyes) < CFG.vision + o.radius) {
          for (const a of near) {
            if (dist(a, o.center) > o.radius + 14) continue;
            p.set(a.x, a.y + SEE_THROUGH.head, a.z);
            if (hits(p, o.box)) { behind = true; break; }
          }
        }
        const target = behind ? 1 : 0;
        if (o.fade === target) continue;
        o.fade += (target - o.fade) * k;
        if (Math.abs(o.fade - target) < 0.02) o.fade = target;
        data[o.id * 4] = Math.round(o.fade * 255);
        changed = true;
      }
      if (changed) texture.needsUpdate = true;
    },
  };
}
