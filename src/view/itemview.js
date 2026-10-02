import * as T from 'three';

/**
 * Taşınabilir kutular: iki instanced mesh (gövde + bant). Taşınan kutu burada çizilmez; taşıyanın kucağındaki kutu
 * karakter görünümünün parçasıdır (characters.js), böylece kutu taşıyan herkes iş taşıyan kasabalı gibi görünür.
 */
export function createCrateView(scene, kit, count) {
  const body = new T.InstancedMesh(kit.boxGeo, kit.material('#8f7450'), count);
  const band = new T.InstancedMesh(kit.boxGeo, kit.material('#504c37'), count);
  for (const m of [body, band]) {
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(m);
  }
  const matrix = new T.Matrix4();
  return {
    sync(world) {
      let n = 0;
      for (const c of world.crates) {
        if (c.carrier !== null) continue;
        matrix.makeScale(0.9, 1, 0.9); matrix.setPosition(c.x, 0.5, c.z); body.setMatrixAt(n, matrix);
        matrix.makeScale(0.94, 0.12, 0.94); matrix.setPosition(c.x, 0.6, c.z); band.setMatrixAt(n, matrix);
        n++;
      }
      for (const m of [body, band]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
    },
  };
}
