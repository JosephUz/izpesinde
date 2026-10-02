import * as T from 'three';

/**
 * Kutu parçalardan dünya kurmak için ortak geometri ve malzeme takımı. Aynı renk aynı malzemeyi paylaşır; böylece
 * durağan dünya mergeStatic ile renk başına tek çizim çağrısına indirilebilir. createMeshKit(base) geometrileri
 * paylaşan ama kendi malzemeleri olan bir takım verir (saydamlaşabilen binalar için); `materials` o malzemelerdir.
 */
export function createMeshKit(base = null) {
  const materials = new Map();
  const kit = {
    materials,
    boxGeo: base?.boxGeo || new T.BoxGeometry(1, 1, 1),
    cylinderGeo: base?.cylinderGeo || new T.CylinderGeometry(1, 1, 1, 8),
    coneGeo: base?.coneGeo || new T.ConeGeometry(1, 1, 7),
    ballGeo: base?.ballGeo || new T.IcosahedronGeometry(1, 0),
    material(color) {
      if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.94 }));
      return materials.get(color);
    },
    mesh(parent, geo, color, x, y, z, sx = 1, sy = 1, sz = 1) {
      const m = new T.Mesh(geo, kit.material(color));
      m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    },
    box(parent, color, x, y, z, w, h, d) { return kit.mesh(parent, kit.boxGeo, color, x, y, z, w, h, d); },
    /** Yere yatık halka: seçim, işaret, iz ve efekt halkalarının hepsi bu. */
    ring(parent, r, color) {
      const m = new T.Mesh(new T.RingGeometry(r * 0.87, r, 40), new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      parent.add(m);
      return m;
    },
  };
  return kit;
}

/**
 * root altındaki durağan mesh'leri malzemelerine göre birleştirir (renk başına tek geometri) ve root'a ekler; root bir
 * grupsa geometri onun yerel uzayında kalır. `keep` içindeki grupların (dönen değirmen kanatları, kendi başına
 * birleştirilen binalar) altındakiler birleştirilmez. Mesh userData.seeId taşıyorsa (saydamlaşabilir nesne, bkz.
 * view/seethrough.js) numara birleşik geometriye `seeId` köşe özniteliği olarak geçer.
 */
export function mergeStatic(root, keep = []) {
  root.updateMatrixWorld(true);
  const inverse = new T.Matrix4().copy(root.matrixWorld).invert(), local = new T.Matrix4();
  const groups = new Map(), originals = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    for (let p = o; p; p = p.parent) if (keep.includes(p)) return;
    const key = o.material.uuid;
    if (!groups.has(key)) groups.set(key, { material: o.material, positions: [], normals: [], ids: [], tagged: false });
    const group = groups.get(key), geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(local.multiplyMatrices(inverse, o.matrixWorld));
    group.positions.push(geo.attributes.position.array);
    group.normals.push(geo.attributes.normal.array);
    group.ids.push(new Float32Array(geo.attributes.position.count).fill(o.userData.seeId ?? -1));
    if (o.userData.seeId !== undefined) group.tagged = true;
    geo.dispose();
    originals.push(o);
  });
  for (const o of originals) o.removeFromParent();
  const concat = arrays => {
    const result = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let offset = 0;
    for (const a of arrays) { result.set(a, offset); offset += a.length; }
    return result;
  };
  for (const group of groups.values()) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(concat(group.positions), 3));
    geo.setAttribute('normal', new T.BufferAttribute(concat(group.normals), 3));
    if (group.tagged) geo.setAttribute('seeId', new T.BufferAttribute(concat(group.ids), 1));
    const mesh = new T.Mesh(geo, group.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  }
}
