import * as T from 'three';
import { createVisionFog } from './fog.js';
import { createCharacterView } from './characters.js';
import { CAMERA, CFG } from './config.js';
import { followPath, routine } from './crowd.js';
import { buildEnvironmentView } from './environment.js';
import { createInput } from './input.js';
import { createMinimap } from './minimap.js';
import { dist } from './physics.js';
import { createScreens } from './screens.js';
import { createUI } from './ui.js';
import { createEffectsView } from './view/effects.js';
import { createCrateView } from './view/itemview.js';
import { createMeshKit } from './view/meshes.js';
import { finish } from './score.js';
import { createWorld, spectate, startRound, step } from './world.js';

/**
 * İstemci uygulaması: sahne, kamera, arayüz, ekranlar ve oyun akışı. Simülasyon (world.js) bu tarayıcıda koşar.
 * Akış: menü (arka planda kendi kendine dolaşan bir kasaba) → her tur rol seçimi → tur girişi → oyun → tur sonu →
 * … beşinci turun sonunda maç sonu. Her karede: (adım) → görünüm eşitleme → arayüz → kamera → çizim.
 * `?test` adresinde testler için window.__iz açılır; normal oyunda gizli durum pencereye çıkmaz.
 */
export async function start(root) {
  const $ = s => root.querySelector(s), canvas = $('#world');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  const scene = new T.Scene(), fog = createVisionFog(scene);
  const camera = new T.OrthographicCamera(-35, 35, 25, -25, 0.1, 400), offset = new T.Vector3(...CAMERA.offset), focus = new T.Vector3();
  scene.add(new T.HemisphereLight('#e5eed6', '#42544a', 2));
  const sun = new T.DirectionalLight('#ffe4ac', 3.1);
  sun.position.set(-30, 65, 25); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, far: 220 });
  sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.0002;
  scene.add(sun);

  const demo = () => { const w = createWorld({ seed: Date.now() }); startRound(w); return w; };
  const app = { world: demo(), match: null, level: 'normal', playing: false, paused: false, choosing: false, shownResult: false, spectator: 0, hover: null, zoom: 25, w: innerWidth, h: innerHeight };
  app.project = (x, y, z) => {
    const p = new T.Vector3(x, y, z).project(camera);
    return { x: (p.x * 0.5 + 0.5) * app.w, y: (-0.5 * p.y + 0.5) * app.h, inside: Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.88 };
  };

  const kit = createMeshKit(), town = buildEnvironmentView(scene, app.world.env, kit);
  const characters = createCharacterView(scene, kit), effects = createEffectsView(scene, kit);
  const crates = createCrateView(scene, kit, app.world.env.crates.length);
  characters.reset(app.world);

  const hooks = {
    clearInput: () => input.clear(), focus: () => canvas.focus(), command: (type, v) => input.command(type, v),
    /** Rol seçildi: maçın (ilk turda yeni maçın) sıradaki turu bu rolle başlar. */
    pick(role) {
      const world = app.match;
      startRound(world, role);
      app.world = world; app.playing = true; app.choosing = false; app.shownResult = false;
      characters.reset(world); ui.clear();
      focus.set(world.player.x, 0, world.player.z);
      screens.roundIntro();
    },
    newMatch() {
      app.match = createWorld({ seed: Date.now(), level: app.level });
      document.body.classList.add('playing');
      for (const id of ['#menu', '#scene-caption', '#menu-footer']) $(id).hidden = true;
      $('#hud').hidden = false; $('#scores').hidden = true;
      screens.roleChoice(1);
    },
    quit() {
      app.playing = false; app.paused = false; app.choosing = false; app.match = null;
      $('#hud').hidden = true; document.body.classList.remove('playing');
      for (const id of ['#menu', '#scene-caption', '#menu-footer']) $(id).hidden = false;
      ui.clear(); app.world = demo(); characters.reset(app.world);
    },
  };
  const screens = createScreens(root, app, hooks);
  const ui = createUI(root, app, hooks), minimap = createMinimap($('#minimap'), $('#mapcard'), app, $('#regionName'));
  const input = createInput(canvas, app, {
    busy: () => !app.playing || app.paused || !$('#scores').hidden,
    escape() {
      // Rol seçilmeden tur başlamaz: seçim ekranı (ilk turda maç henüz başlamamışken de) Esc ile kapanmaz.
      if (app.choosing) return;
      if (!app.playing) { $('#overlay').hidden = true; return; }
      if (app.world.result) return;
      if (app.paused) screens.close(); else screens.pauseMenu();
    },
    tab: down => (down ? screens.scoreToggle(true) : ($('#scores').hidden = true)),
    blur() { if (app.playing && !app.paused && !app.world.result) screens.pauseMenu(); },
    use() { if (app.playing && !app.paused) ui.toast('İmlecin altında kimse yok.'); },
    map() { if (app.playing) minimap.toggle(); },
    sound: type => ui.tone(type === 'use' ? 520 : 330, 0.08),
  });

  $('#start').onclick = () => hooks.newMatch();
  $('#helpBtn').onclick = () => screens.help();
  $('#pauseBtn').onclick = () => screens.pauseMenu();
  $('#sound').onclick = () => { app.soundOn = !app.soundOn; $('#sound').textContent = 'Ses: ' + (app.soundOn ? 'açık' : 'kapalı'); ui.tone(330, 0.3); };
  root.querySelectorAll('[data-level]').forEach(b => {
    b.onclick = () => { app.level = b.dataset.level; root.querySelectorAll('[data-level]').forEach(x => x.classList.toggle('selected', x.dataset.level === app.level)); };
  });

  function resize() {
    app.w = innerWidth; app.h = innerHeight;
    renderer.setSize(app.w, app.h, false);
  }
  window.addEventListener('resize', resize); resize();

  /** Menü arka planı: kasabalılar iş noktaları arasında yavaşça dolaşır, kurallar işlemez. */
  function menuStep(world, dt) {
    for (const a of world.actors) {
      a.think -= dt; a.wait = Math.max(0, a.wait - dt);
      if (a.think <= 0) { a.think = 1.5; if (!a.path.length) routine(world, a); }
      followPath(world, a, dt * 0.6);
    }
  }

  let last = performance.now(), uiClock = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000), time = now / 1000;
    last = now;
    try {
      const world = app.world;
      if (app.playing && !app.paused) { step(world, dt, input.take()); if (world.result) screens.showResult(); }
      else if (!app.playing) menuStep(world, dt);
      input.pickHover();
      const eyes = app.playing ? spectate(world, app.spectator) : null;
      // Kamera: oyunda izlenen karaktere yakın, menüde kasabanın üstünde geniş.
      if (eyes) focus.lerp(new T.Vector3(eyes.x, 0, eyes.z), 1 - Math.exp(-CAMERA.follow * dt));
      else if (!app.playing) focus.lerp(new T.Vector3(-7, 0, 1), 0.02);
      app.zoom += ((app.playing ? CAMERA.zoomPlay : CAMERA.zoomMenu) - app.zoom) * Math.min(1, dt * (app.playing ? 3 : 2));
      const aspect = app.w / app.h;
      Object.assign(camera, { left: -app.zoom * aspect, right: app.zoom * aspect, top: app.zoom, bottom: -app.zoom });
      camera.updateProjectionMatrix();
      camera.position.copy(focus).add(offset); camera.lookAt(focus); camera.updateMatrixWorld();

      fog.update(eyes, dt);
      for (const s of town.signs) s.visible = !eyes || dist(s.position, eyes) <= CFG.vision + 0.5;
      for (const m of town.windmills) m.rotation.z += dt * 0.24;
      characters.sync(world, eyes, app.playing, time, app.hover?.id ?? null, focus);
      effects.sync(world, eyes, app.playing, time);
      crates.sync(world);
      town.xray.update(world, eyes, dt);
      renderer.render(scene, camera);

      // Duraklatma ekranları bulanık bir arka planın üstündedir: altta değişen HUD titreme gibi görünür, o yüzden durur.
      uiClock += dt;
      const tick = uiClock > 0.09;
      if (tick) uiClock = 0;
      if (app.playing) {
        if (tick && !app.paused) { ui.update(); minimap.draw(); }
        ui.labels(tick);
      }
    } catch (e) {
      console.error(e);
      app.paused = true;
      ui.toast('Beklenmedik hata. Sayfayı yenileyebilirsin.');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (new URLSearchParams(location.search).has('test')) {
    window.__iz = {
      get world() { return app.world; }, get app() { return { ...app, fogNear: () => scene.fog.near }; }, renderer, characters, town,
      finish: (kind = 'timeout') => finish(app.world, kind),
      traceArrows: () => effects.arrowsShown(),
      newMatch: hooks.newMatch, pick: hooks.pick, close: screens.close, minimap,
      step(seconds) { for (let t = 0; t < seconds; t += 0.05) step(app.world, 0.05); ui.update(); },
      /** Testte oyuncunun rolünü tur içinde değiştirir (hakları da o role göre). */
      setRole(role) { const p = app.world.player; p.role = role; p.marks = role === 'detective' ? CFG.marks : 0; p.catches = role === 'prosecutor' ? CFG.catches : 0; ui.clear(); ui.update(); },
    };
  }
}
