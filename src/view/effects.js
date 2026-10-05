import * as T from 'three';
import { CFG } from '../config.js';
import { dist } from '../physics.js';
import { active } from '../roster.js';

/**
 * Yerdeki efektler: suçlu izleri (bastığı noktada, yürüyüş yönüne bakan bir çift ayak izi) ve olay halkaları (yakalama, kılık değişimi, cinayet). İkisi de havuzdan gelir:
 * her karede yeni geometri yaratmak yerine birim halkalar ölçeklenir, fazlası gizlenir.
 * İzler yalnızca kendi rolündeki göze (dedektif / savcı), onun görüş alanında görünür; ikisi de kan kırmızısı tondadır. İz
 * düşünce üstünde aşağıyı gösteren bir ok zıplar (kalabalıkta kıvılcım gözden kaçmasın), iz söndükçe o da söner.
 * Menzil halkası: oyuncu savcıysa yakalama (catchRange), suçluysa öldürme (reach) menzili ayağının altında ince bir
 * halkadır; imleçteki / seçili kişi menzildeyse parlar. Dedektifin menzili görüşün kendisidir, halkası yok.
 * Yakalanma / öldürülme (downs, bkz. main.js): görüş alanındaki **her** yakalananın üstüne tepeden demir bir kafes sekerek
 * iner; **her** öldürülene çapraz kırmızı bir bıçak izi çakar ve altında kan göleti yayılır. Olay görülmeden olmuşsa
 * (downs'ta yok) kafes / gölet oturmuş hâliyle çizilir.
 */
const REACH = { prosecutor: ['catchRange', '#f0a92e'], criminal: ['reach', '#e2483a'] };
const TRACE_COLOR = { detective: ['#e2483a', '#b3261e'], prosecutor: ['#e2483a', '#b3261e'] };
const FX_COLOR = { arrest: '#ffe4a1', disguise: '#b9e1de', murder: '#e9955a' };

export function createEffectsView(scene, kit) {
  const traces = [], rings = [];
  const reach = {};
  // Kafes: çember üstünde demir çubuklar, üstte ve altta birer halka, tepede külah. Havuzdan gelir (yakalanan başına bir).
  const iron = new T.MeshStandardMaterial({ color: '#3b3f3c', roughness: 0.55, metalness: 0.6 }), hoopGeo = new T.TorusGeometry(0.95, 0.07, 6, 28);
  const poolGeo = new T.CircleGeometry(1, 28), poolMat = new T.MeshBasicMaterial({ color: '#7a1410', transparent: true, opacity: 0.85, depthWrite: false });
  const cages = [], pools = [], slashes = [];
  function cageAt(i) {
    if (cages[i]) return cages[i];
    const cage = new T.Group();
    for (let j = 0; j < 12; j++) {
      const r = j / 12 * Math.PI * 2, bar = new T.Mesh(kit.boxGeo, iron);
      bar.scale.set(0.09, 2.7, 0.09); bar.position.set(Math.cos(r) * 0.95, 1.35, Math.sin(r) * 0.95); bar.castShadow = true; cage.add(bar);
    }
    for (const y of [0.06, 2.7]) { const hoop = new T.Mesh(hoopGeo, iron); hoop.rotation.x = Math.PI / 2; hoop.position.y = y; cage.add(hoop); }
    const cap = new T.Mesh(kit.coneGeo, iron); cap.scale.set(1.12, 0.55, 1.12); cap.position.y = 2.98; cage.add(cap);
    scene.add(cage);
    return (cages[i] = cage);
  }
  function poolAt(i) {
    if (pools[i]) return pools[i];
    const pool = new T.Mesh(poolGeo, poolMat); pool.rotation.x = -Math.PI / 2; pool.renderOrder = 3; scene.add(pool);
    const slash = new T.Mesh(kit.boxGeo, new T.MeshBasicMaterial({ color: '#ff3b2b', transparent: true, depthWrite: false })); scene.add(slash);
    slashes[i] = slash;
    return (pools[i] = pool);
  }
  let cagesShown = 0, poolsShown = 0;
  for (const [role, [key, color]] of Object.entries(REACH)) {
    const r = CFG[key], m = new T.Mesh(new T.RingGeometry(r - 0.13, r, 72), new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; scene.add(m);
    reach[role] = m;
  }
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
    /** Bu karede görünen menzil halkası: { role, radius } ya da null (testler için). */
    /** Elenme sahnesi parçaları görünüyor mu (testler için). */
    fateShown: () => ({ cage: cagesShown > 0, pool: poolsShown > 0, cages: cagesShown, pools: poolsShown }),
    reachShown: () => { const e = Object.entries(reach).find(([, m]) => m.visible); return e ? { role: e[0], radius: CFG[REACH[e[0]][0]] } : null; },
    sync(world, eyes, playing, time = 0, hover = null, downs = null) {
      const seen = p => !eyes || dist(p, eyes) <= CFG.vision + 0.5;
      let nc = 0, np = 0;
      if (playing) for (const a of world.actors) {
        if (active(a) || !seen(a)) continue;
        const d = downs?.get(a.id), t = d ? time - d.at : 99;
        if (a.caught && a.alive) {
          // Tepeden düşer, iki kez seker.
          const k = Math.min(1, t / 0.7), h = k < 0.6 ? 1 - (k / 0.6) ** 2 : Math.abs(Math.sin((k - 0.6) / 0.4 * Math.PI * 2)) * 0.12 * (1 - k);
          const cage = cageAt(nc++); cage.visible = true; cage.position.set(a.x, h * 8, a.z);
        } else if (!a.alive) {
          // Göğüs hizası: gövde yerel -x yönüne yatar (bkz. characters.js), yönüyle döndürülür.
          const i = np++, pool = poolAt(i), slash = slashes[i];
          pool.visible = true;
          pool.position.set(a.x - 0.9 * Math.cos(a.facing), 0.12, a.z + 0.9 * Math.sin(a.facing));
          pool.scale.setScalar(0.25 + 1.45 * (1 - (1 - Math.min(1, Math.max(0, t - 0.6) / 2)) ** 2));
          slash.visible = t < 0.55;
          if (slash.visible) {
            const k = t / 0.55;
            slash.position.set(a.x, 1.3, a.z); slash.rotation.set(0, Math.PI / 4, -0.7);
            slash.scale.set(0.08, 3.2 * Math.min(1, k * 3), 0.08); slash.material.opacity = 1 - k;
          }
        }
      }
      for (let i = nc; i < cages.length; i++) cages[i].visible = false;
      for (let i = np; i < pools.length; i++) { pools[i].visible = false; slashes[i].visible = false; }
      cagesShown = nc; poolsShown = np;
      const me = playing && eyes && world.player && eyes.id === world.player.id && active(eyes) ? eyes : null;
      for (const [role, m] of Object.entries(reach)) {
        m.visible = !!me && me.role === role;
        if (!m.visible) continue;
        const inside = hover && dist(hover, me) <= CFG[REACH[role][0]];
        m.position.set(me.x, 0.12, me.z);
        m.material.opacity = inside ? 0.95 : 0.42 + Math.sin(time * 3) * 0.08;
      }
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
