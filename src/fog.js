import * as T from 'three';
import { CAMERA, CFG } from './config.js';

/**
 * Görüş alanı: herkes yalnızca çevresindeki yuvarlak alanı görür. three.js'in sis parçaları (ShaderChunk) zemindeki
 * uzaklığa göre kararan bir çemberle değiştirilir: fogNear iç, fogFar dış yarıçaptır; merkez, kameranın konumundan
 * sabit izometrik kayma çıkarılarak bulunur (kamera izlenen karakterin üstündedir). Böylece sahnedeki her malzeme
 * (instanced olanlar dahil) ek uniform gerekmeden aynı sisi kullanır. Sprite gölgelendiricisinde `transformed`
 * olmadığı için sprite'lar `fog: false` ile çizilir ve görüş dışında gizlenir.
 *
 * Bu modül three'nin malzemeleri derlenmeden önce yüklenmelidir (main.js en başta içe aktarır).
 */
const [ox, , oz] = CAMERA.offset;
T.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\nvarying vec2 vFogWorld;\n#endif';
T.ShaderChunk.fog_vertex = [
  '#ifdef USE_FOG',
  'vec4 fogWorld = vec4(transformed, 1.0);',
  '#ifdef USE_INSTANCING',
  'fogWorld = instanceMatrix * fogWorld;',
  '#endif',
  'fogWorld = modelMatrix * fogWorld;',
  'vFogWorld = fogWorld.xz;',
  '#endif',
].join('\n');
T.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\nuniform vec3 fogColor;\nuniform float fogNear;\nuniform float fogFar;\nvarying vec2 vFogWorld;\n#endif';
T.ShaderChunk.fog_fragment = [
  '#ifdef USE_FOG',
  `float fogFactor = smoothstep(fogNear, fogFar, length(vFogWorld - (cameraPosition.xz - vec2(${ox.toFixed(1)}, ${oz.toFixed(1)}))));`,
  'gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.88);',
  '#endif',
].join('\n');

const DARK = '#0b1714', SKY = '#839d89', OFF = 1e4;

/** Sahneye görüş sisini kurar; menüde (göz yokken) sis uzağa itilir, gökyüzü açılır. */
export function createVisionFog(scene) {
  const sky = new T.Color(SKY), night = new T.Color(DARK);
  scene.background = sky.clone();
  scene.fog = new T.Fog(DARK, OFF, OFF + 1);
  return {
    update(eyes, dt) {
      scene.fog.near = eyes ? CFG.vision - 3 : OFF;
      scene.fog.far = eyes ? CFG.vision + 1 : OFF + 1;
      scene.background.lerp(eyes ? night : sky, Math.min(1, dt * 3));
    },
  };
}
