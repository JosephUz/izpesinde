import * as T from 'three';
import { CFG } from '../config.js';
import { dist } from '../physics.js';

/**
 * Yerdeki efektler: suçlu izleri (bastığı noktada, yürüyüş yönüne bakan bir çift ayak izi) ve olay halkaları (yakalama, kılık değişimi, cinayet). İkisi de havuzdan gelir:
 * her karede yeni geometri yaratmak yerine birim halkalar ölçeklenir, fazlası gizlenir.
 * İzler yalnızca kendi rolündeki göze (dedektif / savcı), onun görüş alanında görünür; ikisi de kan kırmızısı tondadır. İz
 * düşünce üstünde aşağıyı gösteren bir ok zıplar (kalabalıkta kıvılcım gözden kaçmasın), iz söndükçe o da söner.
 */
const TRACE_COLOR = { detective: ['#e2483a', '#b3261e'], prosecutor: ['#e2483a', '#b3261e'] };
const FX_COLOR = { arrest: '#ffe4a1', disguise: '#b9e1de', murder: '#e9955a' };

export function createEffectsView(scene, kit) {
  const traces = [], rings = [];
  function traceView(i) {
    if (!traces[i]) {
      const g = new T.Group(); scene.add(g);
      // Ayak izi: yürüyüş yönüne dönen bir çift taban (biri yarım adım önde); büyüyen bir çevre değil, tam basılan nokta.
      const feet = new T.Group(), footMat = new T.MeshBasicMaterial({ color: '#b3261e', transparent: true, depthWrite: false });
      for (const [x, z] of [[-0.17, -0.2], [0.17, 0.2]]) { const f = new T.Mesh(kit.boxGeo, footMat); f.position.set(x, 0.05, z); f.scale.set(0.2, 0.04, 0.42); feet.add(f); }
      g.add(feet);
      // Ok: aşağıyı gösteren koni + sap; ışıktan etkilenmez, gölge düşürmez.
      const arrow = new T.Group(), arrowMat = new T.MeshBasicMaterial({ color: '#ffcf7a', transparent: true });
      const head = new T.Mesh(kit.coneGeo, arrowMat); head.rotation.x = Math.PI; head.scale.set(0.62, 0.8, 0.62);
      const shaft = new T.Mesh(kit.boxGeo, arrowMat); shaft.position.y = 0.8; shaft.scale.set(0.24, 0.85, 0.24);
      arrow.add(head, shaft); g.add(arrow);
      g.userData = { feet, footMat, arrow, arrowMat };
      traces.push(g);
    }
    return traces[i];
  }
  let arrowsShown = 0;
  return {
    /** Bu karede kaç izin oku görünüyor (testler için). */
    arrowsShown: () => arrowsShown,
    sync(world, eyes, playing, time = 0) {
      const inSight = p => !eyes || dist(p, eyes) <= CFG.vision + 0.5;
      const shown = playing && eyes ? world.traces.filter(t => t.role === eyes.role && inSight(t)) : [];
      shown.forEach((t, i) => {
        const g = traceView(i), k = (world.time - t.born) / CFG.trace.life, [core, halo] = TRACE_COLOR[t.role];
        g.visible = true; g.position.set(t.x, 0, t.z);
        g.userData.feet.rotation.y = t.dir ?? 0;
        g.userData.footMat.color.set(halo); g.userData.footMat.opacity = 0.95 * Math.min(1, (1 - k) * 2);
        // Zıplayan ok: düşerken yukarıdan iner, sonra izin üstünde sekip durur.
        const drop = Math.max(0, 1 - k * 6) * 2.5, bounce = Math.abs(Math.sin((world.time - t.born) * 7)) * 0.7;
        g.userData.arrow.position.y = 2.1 + drop + bounce; g.userData.arrow.rotation.y = time * 2.5;
        g.userData.arrowMat.color.set(core); g.userData.arrowMat.opacity = Math.min(1, (1 - k) * 2.5);
      });
      for (let i = shown.length; i < traces.length; i++) traces[i].visible = false;
      arrowsShown = shown.length;

      const fx = world.effects.filter(inSight);
      fx.forEach((f, i) => {
        const ring = rings[i] ??= kit.ring(scene, 1, '#ffffff');
        const r = f.type === 'arrest' ? 2.4 * (1 - f.t / 0.6) + 0.4 : 1.8 * (1 - f.t / 1.3);
        ring.visible = true; ring.scale.setScalar(Math.max(0.1, r)); ring.position.set(f.x, 0.18, f.z);
        ring.material.color.set(FX_COLOR[f.type] || '#ffffff'); ring.material.opacity = Math.min(1, f.t * 2);
      });
      for (let i = fx.length; i < rings.length; i++) rings[i].visible = false;
    },
  };
}
