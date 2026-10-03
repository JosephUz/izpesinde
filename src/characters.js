import * as T from 'three';
import { CFG, PALETTE } from './config.js';
import { marksFor, revealedProsecutors } from './marks.js';
import { dist } from './physics.js';
import { active } from './roster.js';

/**
 * Karakter görünümü. Her karakter kutu parçalardan bir gruptur (gövde, baş, şapka/kukuleta/sırt çantası, taşınan kutu,
 * ayak halkası) ama doğrudan çizilmez: her karede görünür parçalar (geometri + renk) başına bir InstancedMesh'e
 * toplanır, 180 karakter birkaç düzine çizim çağrısıdır. Görüş alanı dışındakiler hiç toplanmaz.
 *
 * Ayak halkaları: tanıdığın kişiler yeşil, işaretliler altın (aklanmış işaret gri), suçlunun gözünde ele verilmiş
 * savcılar kırmızı. Ayrıca kendi halkan ve imlecin altındaki hedefin halkası (rol rengiyle).
 */
const LIMIT = 400;

export function createCharacterView(scene, kit) {
  const views = new Map(), batches = new Map();
  const playerRing = kit.ring(scene, 1.02, '#ffdfa0'); playerRing.position.y = 0.07;
  const hoverRing = kit.ring(scene, 1.15, '#ffffff'); hoverRing.position.y = 0.09;

  function build(a) {
    const root = new T.Group(), body = new T.Group(); root.add(body);
    const cloth = new T.MeshStandardMaterial({ color: PALETTE[a.appearance], roughness: 1 });
    kit.box(body, '#888888', 0, 1.03, 0, 0.68, 0.8, 0.42).material = cloth;
    kit.box(body, '#d9b58d', 0, 1.7, 0, 0.57, 0.57, 0.52);
    kit.box(body, '#544a39', 0, 1.98, -0.03, 0.61, 0.14, 0.56);
    for (const x of [-0.14, 0.14]) kit.box(body, '#303b30', x, 1.73, 0.268, 0.065, 0.07, 0.035);
    kit.box(body, '#66543c', 0, 0.81, 0.02, 0.71, 0.12, 0.46);
    kit.box(body, '#bca66d', 0, 0.81, 0.27, 0.13, 0.13, 0.05);
    const limbs = [];
    for (const s of [-1, 1]) {
      const leg = new T.Group(); leg.position.set(s * 0.19, 0.7, 0); body.add(leg);
      kit.box(leg, '#4b5549', 0, -0.28, 0, 0.24, 0.56, 0.29); kit.box(leg, '#493e30', 0, -0.59, 0.06, 0.27, 0.15, 0.4);
      limbs.push(leg);
      const arm = new T.Group(); arm.position.set(s * 0.46, 1.37, 0); body.add(arm);
      kit.box(arm, '#888888', 0, -0.25, 0, 0.22, 0.52, 0.28).material = cloth;
      kit.box(arm, '#d9b58d', 0, -0.52, 0, 0.21, 0.17, 0.24);
      limbs.push(arm);
    }
    const hat = new T.Group(); body.add(hat);
    kit.mesh(hat, kit.cylinderGeo, '#b9a574', 0, 2.06, 0, 0.48, 0.07, 0.48); kit.mesh(hat, kit.cylinderGeo, '#b9a574', 0, 2.18, 0, 0.3, 0.2, 0.3);
    const hood = kit.mesh(body, kit.ballGeo, '#555555', 0, 1.93, -0.08, 0.37, 0.3, 0.37); hood.material = cloth;
    const pack = kit.box(body, '#92764f', 0, 1.09, -0.37, 0.52, 0.5, 0.25);
    const cargo = kit.box(body, '#8f7450', 0, 0.9, 0.6, 0.7, 0.55, 0.55); cargo.visible = false;
    const marker = kit.ring(root, 0.85, '#dfb876'); marker.position.y = 0.07; marker.visible = false;
    return { root, body, cloth, limbs, hat, hood, pack, cargo, marker };
  }

  /** Görünür parçaları geometri + renk anahtarıyla instanced mesh'lere topla. */
  function batch() {
    for (const b of batches.values()) b.count = 0;
    for (const v of views.values()) {
      if (!v.root.visible) continue;
      v.root.updateMatrixWorld(true);
      v.root.traverseVisible(o => {
        if (!o.isMesh) return;
        const key = o.geometry.uuid + ':' + o.material.color.getHex();
        let b = batches.get(key);
        if (!b) {
          b = new T.InstancedMesh(o.geometry, o.material.clone(), LIMIT);
          b.count = 0; b.instanceMatrix.setUsage(T.DynamicDrawUsage); b.frustumCulled = false;
          b.castShadow = o.geometry.type !== 'RingGeometry'; b.receiveShadow = true;
          scene.add(b); batches.set(key, b);
        }
        if (b.count < LIMIT) b.setMatrixAt(b.count++, o.matrixWorld);
      });
    }
    for (const b of batches.values()) { b.visible = b.count > 0; b.instanceMatrix.needsUpdate = true; }
  }

  return {
    /** Bu karede çiziliyor mu (görüş alanında mı); testler için. */
    isDrawn: id => Boolean(views.get(id)?.root.visible),
    /** Yeni tur: karakter listesi baştan kurulur (kalabalık ve görünüşler yenilenir). */
    reset(world) {
      for (const b of batches.values()) { b.removeFromParent(); b.dispose(); b.material.dispose(); }
      batches.clear();
      for (const v of views.values()) { v.cloth.dispose(); v.marker.geometry.dispose(); v.marker.material.dispose(); }
      views.clear();
      for (const a of world.actors) views.set(a.id, build(a));
    },
    /** eyes: kimin gözünden bakılıyor (oyuncu ya da izlenen takım arkadaşı); menüde null. */
    sync(world, eyes, playing, time, hoverId, focus) {
      const marks = new Map(playing && eyes ? marksFor(world, eyes).map(m => [m.target.id, m]) : []);
      const exposed = new Set(playing && eyes?.role === 'criminal' ? revealedProsecutors(world).map(a => a.id) : []);
      for (const a of world.actors) {
        const v = views.get(a.id);
        if (!v) continue;
        v.root.visible = eyes ? dist(a, eyes) <= CFG.vision + 0.5 : dist(a, focus) < 90;
        if (!v.root.visible) continue;
        v.root.position.set(a.x, a.y, a.z); v.root.rotation.y = a.facing;
        v.cloth.color.set(PALETTE[a.appearance]);
        v.hat.visible = a.hat === 1; v.hood.visible = a.hat === 2; v.pack.visible = a.hat === 0 && !a.carry; v.cargo.visible = Boolean(a.carry);
        v.body.rotation.z = !a.alive ? Math.PI / 2 : a.caught ? 0.23 : 0;
        v.body.position.y = !a.alive ? -0.3 : Math.sin(time * 2 + a.id) * 0.025;
        const walk = Math.sin(time * (a.speed > 6 ? 15 : 10) + a.id) * Math.min(0.7, a.speed * 0.13);
        v.limbs.forEach((l, i) => {
          // Kollar (tek sıra) kutu taşırken öne uzanır, çalışırken sallanır; bacaklar yürüyüşle.
          l.rotation.x = a.carry && i % 2 ? -1.1 : a.action || a.wait > 0 ? (i % 2 ? Math.sin(time * 5) * 0.65 - 0.7 : 0) : walk * (i < 2 ? 1 : -1);
        });
        const mark = marks.get(a.id), known = eyes && eyes.known.has(a.id);
        const target = exposed.has(a.id);
        v.marker.visible = playing && active(a) && Boolean(known || mark || target);
        v.marker.material.color.set(target ? '#e2483a' : mark ? (mark.cleared ? '#9aa39a' : '#efc67d') : '#b4d5a1');
        v.marker.rotation.z = time * 0.6;
      }
      const p = world.player;
      playerRing.visible = playing && active(p);
      if (p) { playerRing.position.set(p.x, 0.07, p.z); playerRing.material.opacity = 0.7 + Math.sin(time * 3) * 0.2; }
      const hover = playing && hoverId != null ? world.actors[hoverId] : null;
      hoverRing.visible = Boolean(hover);
      if (hover) {
        hoverRing.position.set(hover.x, 0.09, hover.z);
        hoverRing.material.color.set(p.role === 'prosecutor' ? '#ff9d7a' : p.role === 'criminal' ? '#e2483a' : '#ffe7a8');
        hoverRing.scale.setScalar(1 + Math.sin(time * 6) * 0.06);
      }
      batch();
    },
  };
}
