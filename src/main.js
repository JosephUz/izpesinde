import * as T from 'three';
import { createVisionFog } from './fog.js';
import { createSonTakip, gosteriKipi } from './gosteri.js';
import { createRoller } from './gosteri-roller.js';
import { createCharacterView } from './characters.js';
import { CAMERA, CFG } from './config.js';
import { followPath, routine } from './crowd.js';
import { buildEnvironmentView } from './environment.js';
import { createInput } from './input.js';
import { gorunurAlanaKilitle } from './gorunur-alan.js';
import { enterFullscreen, touchDevice } from './touch.js';
import { createMinimap } from './minimap.js';
import { createMuzik, sahneSec } from './muzik.js';
import { createNetClient } from './net/client.js';
import { onlineEnabled } from './platform.js';
import { dist, separate } from './physics.js';
import { createScreens } from './screens.js';
import { createUI } from './ui.js';
import { active } from './roster.js';
import { createEffectsView } from './view/effects.js';
import { createCrateView } from './view/itemview.js';
import { createMeshKit } from './view/meshes.js';
import { finish } from './score.js';
import { createWorld, spectate, startRound, step } from './world.js';

/**
 * İstemci uygulaması: sahne, kamera, arayüz, ekranlar ve oyun akışı.
 *  - **Tek başına**: simülasyon (world.js) bu tarayıcıda koşar. Menü (arka planda kendi kendine dolaşan bir kasaba) →
 *    her tur rol seçimi → tur girişi → oyun → tur sonu → … beşinci turun sonunda maç sonu.
 *  - **Çevrim içi**: oda kur / katıl → lobi (10 koltuk, taraf yok) → kuran başlatır. Simülasyon sunucuda koşar, istemci
 *    (net/client.js) dünyanın kopyasını çizer. Rol seçimi yoktur, her tur rastgele; turlar sunucunun saatiyle akar.
 *    Sunucuya bağlanılamadıkça oda düğmeleri "Yakında" yazar; tek başına oyun aynen oynanır. Her karede: (adım) → görünüm eşitleme → arayüz → kamera → çizim.
 * `?test` adresinde testler için window.__iz açılır; normal oyunda gizli durum pencereye çıkmaz.
 */
export async function start(root) {
  const $ = s => root.querySelector(s), canvas = $('#world');
  // Telefon / tablet (Çayır Muhafızı'ndaki gibi): dokunmatik kontroller, kök tarayıcı çubuklarının bıraktığı görünür alana
  // kilitlenir (src/gorunur-alan.js, style.css → html.vv), kenar yumuşatma kapalı, piksel oranı 1, gölge haritası küçük.
  const touch = touchDevice();
  root.classList.toggle('touch', touch);
  const gorunurAlan = gorunurAlanaKilitle(window);
  const renderer = new T.WebGLRenderer({ canvas, antialias: !touch, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1 : 1.65));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  const scene = new T.Scene(), fog = createVisionFog(scene);
  const camera = new T.OrthographicCamera(-35, 35, 25, -25, 0.1, 400), offset = new T.Vector3(...CAMERA.offset), focus = new T.Vector3();
  scene.add(new T.HemisphereLight('#e5eed6', '#42544a', 2));
  const sun = new T.DirectionalLight('#ffe4ac', 3.1);
  sun.position.set(-30, 65, 25); sun.castShadow = true; sun.shadow.mapSize.setScalar(touch ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, far: 220 });
  sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.0002;
  scene.add(sun);

  const demo = () => { const w = createWorld({ seed: Date.now() }); startRound(w); return w; };
  /**
   * Gösteri kipi (yalnız tarayıcı; bkz. gosteri.js ve gosteri-roller.js): içerik videosu için sahnelenmiş turlar.
   * Menü atlanır, sahnenin yarışmacılarını betik sürer, girdi okunmaz ve sunucuya bağlanılmaz. Normal oyun ve
   * çevrim içi oda bu kipten hiç etkilenmez.
   *  - `?gosteri=son-takip` — turun son 30 saniyesi, tek savcının gözünden.
   *  - `?gosteri=roller` — kamera sırayla suçlu, savcı ve dedektifin gözünden bakar; ekranda direktif yazıları.
   */
  const kip = gosteriKipi();
  const gosteri = kip === 'son-takip' ? createSonTakip() : kip === 'roller' ? createRoller(root) : null;
  /**
   * Otopilot (`?otopilot=1`, yalnız tarayıcı, tek başına): müzik videoları için kesintisiz **gerçek** maç (gösteri
   * değil). Oyuncunun karakterini bir bot oynar (dünyada insan yok), menü, hazırlık, rol seçimi ve tur girişi
   * atlanır. Tur bitince bitiş sahnesi ve tur sonu tablosu OTO_SONUC saniye görünür, sonra sıradaki tur kendiliğinden
   * başlar; beşinci turdan sonra yeni maç. Kamera oyunun normal kamerasıdır (karakter elenince takım arkadaşı).
   *  - `&rol=detective|prosecutor|criminal`: oyuncunun her turdaki rolü (yoksa her tur rastgele)
   *  - `&ileri=200`: ilk tur ekrana gelmeden bu kadar saniye ileri sarılır (turun ortasından / sonundan çekmek için)
   *  - `&tohum=7`: maçın tohumu (aynı tohum aynı kasaba, kalabalık ve rol dağılımı)
   * Paperclip'in müzik videosu betiği bu kipi kullanır (paperclip/ajanlar/icerik/muzik-videosu.mjs, `window.__iz`).
   */
  const otoSorgu = new URLSearchParams(location.search);
  const OTO_SONUC = 6;
  const otopilot = otoSorgu.has('otopilot') && !gosteri ? {
    rol: ['detective', 'prosecutor', 'criminal'].includes(otoSorgu.get('rol')) ? otoSorgu.get('rol') : null,
    ileri: Math.max(0, Number(otoSorgu.get('ileri')) || 0), tohum: Number(otoSorgu.get('tohum')) || Date.now(), sonucAt: 0,
  } : null;
  const app = { world: demo(), match: null, level: 'normal', playing: false, paused: false, choosing: false, shownResult: false, online: false, inLobby: false, spectator: 0, hover: null, target: null, touch, zoom: 25, w: innerWidth, h: innerHeight, left: 0, top: 0 };
  app.project = (x, y, z) => {
    const p = new T.Vector3(x, y, z).project(camera);
    return { x: app.left + (p.x * 0.5 + 0.5) * app.w, y: app.top + (-0.5 * p.y + 0.5) * app.h, inside: Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.88 };
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
      if (touch) enterFullscreen();
      app.match = createWorld({ seed: Date.now(), level: app.level });
      document.body.classList.add('playing');
      for (const id of ['#menu', '#scene-caption', '#menu-footer']) $(id).hidden = true;
      $('#hud').hidden = false; $('#scores').hidden = true;
      screens.roleChoice(1);
    },
    quit() {
      if (app.online || app.inLobby) { net.leave(); app.online = false; app.inLobby = false; }
      app.playing = false; app.paused = false; app.choosing = false; app.match = null;
      $('#hud').hidden = true; document.body.classList.remove('playing');
      for (const id of ['#menu', '#scene-caption', '#menu-footer']) $(id).hidden = false;
      ui.clear(); app.world = demo(); characters.reset(app.world);
    },
    // Çevrim içi lobi ve tur akışı (sunucuya gider).
    seat: seat => net.seat(seat),
    level: level => net.settings(level),
    startRoom: () => net.start(),
    leaveRoom() { net.leave(); app.inLobby = false; $('#overlay').hidden = true; showMenu(true); },
    /** Maç sonu tablosundan lobiye: kopya dünya bırakılır, arkada yine menünün kasabası dolaşır. */
    lobbyBack() { leaveOnlineGame(); if (net.lobby) openLobby(net.lobby); else hooks.quit(); },
  };
  const screens = createScreens(root, app, hooks);
  const ui = createUI(root, app, hooks), minimap = createMinimap($('#minimap'), $('#mapcard'), app, $('#regionName'));
  // Oyunda yaklaştırma: fare tekerleği (masaüstü), iki parmak (dokunmatik). Küçük ekranda seçimi kolaylaştırır; tercih saklanır.
  let pinchFrom = CAMERA.zoomPlay;
  try { app.zoomPlay = Math.min(CAMERA.zoomMax, Math.max(CAMERA.zoomMin, Number(localStorage.getItem('iz.zoom')) || CAMERA.zoomPlay)); } catch { app.zoomPlay = CAMERA.zoomPlay; }
  function setZoom(z, now = false) {
    app.zoomPlay = Math.min(CAMERA.zoomMax, Math.max(CAMERA.zoomMin, z));
    if (now && app.playing) app.zoom = app.zoomPlay;
    try { localStorage.setItem('iz.zoom', app.zoomPlay.toFixed(2)); } catch { /* yok */ }
  }
  root.addEventListener('wheel', e => {
    if (!app.playing || app.paused || !$('#overlay').hidden || e.target.closest('#overlay, #scores')) return;
    e.preventDefault();
    setZoom(app.zoomPlay * Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0015));
  }, { passive: false });
  const input = createInput(canvas, app, {
    busy: () => !app.playing || app.paused || !$('#scores').hidden,
    escape() {
      // Rol seçilmeden tur başlamaz: seçim ekranı (ilk turda maç henüz başlamamışken de) Esc ile kapanmaz. Lobi de kapanmaz.
      if (app.choosing || app.inLobby) return;
      if (!app.playing) { $('#overlay').hidden = true; return; }
      if (app.world.result) return;
      if (app.paused) screens.close(); else screens.pauseMenu();
    },
    tab: down => (down ? screens.scoreToggle(true) : ($('#scores').hidden = true)),
    blur() { if (app.playing && !app.online && !app.paused && !app.world.result && !otopilot) screens.pauseMenu(); },
    use() { if (app.playing && !app.paused) ui.toast(touch ? 'Önce dünyada birine dokunarak seç.' : 'İmlecin altında kimse yok.'); },
    map() { if (app.playing) minimap.toggle(); },
    pinch(scale, start) { if (start) pinchFrom = app.zoomPlay; else setZoom(pinchFrom / scale, true); },
    sound: type => ui.tone(type === 'use' ? 520 : 330, 0.08),
  }, touch ? root : null);

  // Tek başına / Oda kur: önce hazırlık penceresi (botların zorluğu), sonra maç ya da oda.
  $('#start').onclick = () => screens.setup('solo', level => { app.level = level; hooks.newMatch(); });

  // ---------- Çevrim içi ----------
  const networked = onlineEnabled();
  let pendingRoom = null;
  const nick = () => { const v = $('#nick').value.trim().slice(0, 16); try { localStorage.setItem('iz.nick', v); } catch { /* yok */ } return v; };
  // Ad hatırlanır; ilk girişte hazır bir adla gelir (boş adla odaya girilmez).
  try { $('#nick').value = localStorage.getItem('iz.nick') || ''; } catch { /* yok */ }
  if (!$('#nick').value) $('#nick').value = `İzci-${Math.floor(1000 + Math.random() * 9000)}`;
  function showMenu(on) {
    for (const id of ['#menu', '#scene-caption', '#menu-footer']) $(id).hidden = !on;
    document.body.classList.toggle('playing', !on && app.playing);
  }
  function openLobby(l, error = '') { app.inLobby = true; showMenu(false); screens.lobby(l, net.id, error); }
  function setServer(on) {
    for (const id of ['#create', '#join']) { const b = $(id); b.disabled = !on; b.textContent = on ? b.dataset.label : 'YAKINDA'; }
    if (!on) $('#join-row').hidden = true;
  }
  const net = createNetClient({
    onWelcome() {
      const r = pendingRoom; pendingRoom = null;
      if (r?.create) net.create(app.level);
      else if (r?.code) net.join(r.code);
      // Sayfa yenilendi: sunucu oyundaki koltuğu token'la kendisi geri verir; lobideyse koda yeniden katılınır.
      else if (net.rememberedRoom()) { const code = net.rememberedRoom(); setTimeout(() => { if (!net.lobby && !net.world) net.join(code); }, 400); }
    },
    onLobby(l) {
      if (app.online && app.world.remote && !(app.world.result && app.world.final)) return; // oyun sürerken lobi görünmez
      if (app.online) return; // maç sonu tablosu açık: "Lobiye dön" ile açılır
      if (l.state === 'lobby') openLobby(l);
    },
    onRound(world) { enterOnline(world); },
    onError(msg) {
      if (app.inLobby && net.lobby) openLobby(net.lobby, msg);
      else { ui.toast(msg); net.forgetRoom(); }
    },
    onOnline(n) { $('#online').textContent = n > 0 ? `● ${n} çevrim içi` : ''; },
    onConnect() { setServer(true); },
    onDisconnect() { setServer(false); $('#online').textContent = ''; },
  });
  /** Çevrim içi tur başladı (ya da geri bağlanınca sürüyor): kopya dünya çizilir, rol girişi açılır. */
  function enterOnline(world) {
    if (touch && !app.online) enterFullscreen();
    app.world = world; app.online = true; app.inLobby = false; app.playing = true; app.paused = false; app.shownResult = false; app.spectator = 0;
    characters.reset(world); ui.clear();
    focus.set(world.player.x, 0, world.player.z);
    showMenu(false); document.body.classList.add('playing');
    $('#hud').hidden = false; $('#scores').hidden = true;
    ui.update();
    screens.roundIntro();
  }
  function leaveOnlineGame() {
    net.dropWorld(); app.online = false; app.playing = false; app.paused = false;
    $('#hud').hidden = true; document.body.classList.remove('playing'); ui.clear();
    app.world = demo(); characters.reset(app.world);
  }
  const goOnline = room => {
    const name = nick();
    if (!name) { ui.toast('Önce adını yaz.'); $('#nick').focus(); return; }
    pendingRoom = room;
    if (net.connected) net.hello(name); else net.connect(name);
  };
  for (const id of ['#create', '#join']) $(id).dataset.label = $(id).textContent;
  $('#create').onclick = () => { if (!nick()) { goOnline({}); return; } screens.setup('room', level => { app.level = level; goOnline({ create: true }); }); };
  $('#join').onclick = () => { $('#join-row').hidden = false; $('#code').focus(); };
  const joinCode = () => { const code = $('#code').value.trim().toUpperCase(); if (code) goOnline({ code }); };
  $('#joinGo').onclick = joinCode;
  $('#code').onkeydown = e => { if (e.key === 'Enter') joinCode(); e.stopPropagation(); };
  $('#nick').onkeydown = e => e.stopPropagation();
  setServer(false);
  if (networked && !gosteri) {
    const linked = new URLSearchParams(location.search).get('oda');
    if (linked) { $('#join-row').hidden = false; $('#code').value = linked.toUpperCase(); }
    net.connect(nick() || 'İzci');
  } else for (const id of ['#create', '#join']) $(id).hidden = true;
  $('#helpBtn').onclick = () => screens.help();
  $('#pauseBtn').onclick = () => screens.pauseMenu();
  $('#sound').onclick = () => hooks.toggleSound();
  $('#muzik').onclick = () => hooks.toggleMuzik();
  // F1: kontroller (Çayır Muhafızı'ndaki gibi her ekranda).
  window.addEventListener('keydown', e => { if (e.code === 'F1') { e.preventDefault(); if (!app.inLobby) screens.help(); } });

  // ---------- STANDART üst çubuk: Ses ve Müzik ----------
  // İkisi bağımsızdır: `Ses` yalnız efektleri (ui.tone), `Müzik` yalnız oyun içi parçaları açıp kapatır. Her iki
  // düğme de hem üst çubukta hem Esc menüsünde aynı durumu gösterir; durumlar tarayıcıda saklanır (iz.sound, iz.muzik).
  const muzik = createMuzik(root);
  try { app.soundOn = localStorage.getItem('iz.sound') === 'on'; } catch { /* yok */ }
  const soundLabel = () => 'Ses: ' + (app.soundOn ? 'açık' : 'kapalı');
  const muzikLabel = () => 'Müzik: ' + (muzik.acik ? 'açık' : 'kapalı');

  /** Ses / müzik yazılarını iki yerde birden tazeler: üst çubuk ve (açıksa) Esc menüsü. */
  function syncMenu() {
    for (const [sec, yazi, acik] of [['#sound', soundLabel(), app.soundOn], ['#pauseSound', soundLabel(), app.soundOn],
      ['#muzik', muzikLabel(), muzik.acik], ['#pauseMuzik', muzikLabel(), muzik.acik]]) {
      const b = $(sec);
      if (!b) continue;
      b.textContent = yazi; b.classList.toggle('muted', !acik);
    }
  }
  hooks.soundLabel = soundLabel;
  hooks.muzikLabel = muzikLabel;
  // Parça yoksa (SAHNELER boş, bkz. src/muzik.js) Müzik düğmesi ne üst çubukta ne Esc menüsünde görünür.
  hooks.muzikVar = () => !muzik.kapali && muzik.parcaVar;
  hooks.syncMenu = syncMenu;
  hooks.toggleSound = () => {
    app.soundOn = !app.soundOn;
    try { localStorage.setItem('iz.sound', app.soundOn ? 'on' : 'off'); } catch { /* yok */ }
    syncMenu(); ui.tone(330, 0.3);
    return soundLabel();
  };
  hooks.toggleMuzik = () => { muzik.ac(); syncMenu(); return muzikLabel(); };
  $('#muzik').hidden = muzik.kapali || !muzik.parcaVar;
  syncMenu();

  // Gösteri: menü atlanır, sahnenin dünyası doğrudan oyuna girer. Oyunun kendi HUD'ı açık kalır (sahnenin anlattığı
  // durum — yakalanmış suçlu, ölü savcı ve dedektifler — oradan okunur); yalnız girdiye bakan bölümler gizlenir
  // (bkz. style.css `.gosteri`).
  if (gosteri) {
    root.classList.add('gosteri');
    app.world = app.match = gosteri.world;
    app.playing = true; app.paused = false; app.shownResult = false;
    app.zoom = app.zoomPlay = gosteri.zoom;
    document.body.classList.add('playing');
    for (const id of ['#menu', '#scene-caption', '#menu-footer']) $(id).hidden = true;
    $('#hud').hidden = false; $('#scores').hidden = true;
    characters.reset(app.world); ui.clear();
    focus.set(app.world.player.x, 0, app.world.player.z);
    // HUD ilk kareden itibaren dolu olsun: kare kare çekimde ilk tik gelene kadar rol kartı boş kalıyordu.
    ui.update();
  }

  // Otopilot: maç doğrudan başlar, oyuncunun karakterini bot oynar (bkz. yukarıdaki `otopilot`).
  function otoTur() {
    if (!app.match || app.match.round >= CFG.rounds) app.match = createWorld({ seed: app.match ? Date.now() : otopilot.tohum, level: 'normal', humans: [] });
    hooks.pick(otopilot.rol);
    screens.close();
  }
  if (otopilot) {
    root.classList.add('otopilot');
    document.body.classList.add('playing');
    for (const id of ['#menu', '#scene-caption', '#menu-footer']) $(id).hidden = true;
    $('#hud').hidden = false; $('#scores').hidden = true;
    otoTur();
    for (let t = 0; t < otopilot.ileri && !app.world.result; t += 0.05) step(app.world, 0.05);
    focus.set(app.world.player.x, 0, app.world.player.z);
    ui.update();
  }

  // Çizim alanı pencereyi değil kökü doldurur: telefonda kök görünür alana kilitlidir (adres çubuğu, klavye).
  function resize() {
    const r = root.getBoundingClientRect();
    app.w = Math.round(r.width) || innerWidth; app.h = Math.round(r.height) || innerHeight; app.left = r.left; app.top = r.top;
    renderer.setSize(app.w, app.h, false);
  }
  window.addEventListener('resize', resize); resize();
  new ResizeObserver(resize).observe(root);
  document.addEventListener('fullscreenchange', () => setTimeout(() => { gorunurAlan.guncelle(); resize(); }, 120));

  /** Menü arka planı: kasabalılar iş noktaları arasında yavaşça dolaşır, kurallar işlemez. */
  function menuStep(world, dt) {
    for (const a of world.actors) {
      a.think -= dt; a.wait = Math.max(0, a.wait - dt);
      if (a.think <= 0) { a.think = 1.5; if (!a.path.length) routine(world, a); }
      followPath(world, a, dt * 0.6);
    }
    separate(world);
  }

  /** Dokunmatik düğmeler yalnızca oyunda ve pencere kapalıyken görünür; büyük düğmenin adı role göre. */
  let touchShown = null, touchRole = '';
  function syncTouch(world) {
    const on = app.playing && !app.paused && $('#overlay').hidden; // skor tablosu açıkken de kalır: SKOR bırakılınca kapanır
    if (on !== touchShown) { touchShown = on; input.touch.show(on); }
    if (world.player && world.player.role !== touchRole) { touchRole = world.player.role; input.touchRole(touchRole); }
  }

  /**
   * Yakalanma / öldürülme sahnesi: oyuncu bu turda elenince kamera FATE.hold saniye kendi karakterine yaklaşır, 3B
   * animasyon oynar (yakalanınca tepeden demir kafes iner, öldürülünce karakter yere yığılır ve kan göleti yayılır) ve
   * ekranda bir açılır kart (#fate) belirir. Sonra izleyici kamerasına geçilir. Tur sonu ekranı sahne bitene kadar bekler.
   */
  const FATE = { hold: 3.4, card: 5.5, zoom: 11 };
  const FATE_TEXT = {
    caught: ['BU TUR SENİN İÇİN BİTTİ', 'Yakalandın', 'Bir savcı seni kalabalığın içinden çekip aldı. Turun sonuna kadar takım arkadaşını izleyebilirsin.'],
    murder: ['BU TUR SENİN İÇİN BİTTİ', 'Öldürüldün', 'Kalabalıktaki suçlulardan biri seni buldu. Turun sonuna kadar takım arkadaşlarını izleyebilirsin.'],
  };
  let fateWorld = null, fateRound = 0, wasActive = null, fateHide = 0;
  app.fate = null;

  /**
   * Yakalanma / öldürülme anları (downs: actorId → { kind, at }, istemci saatiyle): her karede durum değişimi aranır,
   * böylece tek başına da çevrim içinde de (sunucu yalnızca bayrak yollar) herkes her olayı animasyonla görür. Tur
   * başında zaten düşmüş olanlar (izlenmemiş) kayda girmez, oturmuş hâliyle çizilir.
   */
  const downs = new Map(), downState = new Map();
  let downsWorld = null, downsRound = 0;
  function trackDowns(world, time) {
    if (world !== downsWorld || world.round !== downsRound) { downsWorld = world; downsRound = world.round; downs.clear(); downState.clear(); endingClear(); }
    if (!app.playing) return;
    for (const a of world.actors) {
      const now = !a.alive ? 'murder' : a.caught ? 'caught' : null, was = downState.get(a.id);
      if (now && was === null) downs.set(a.id, { kind: now, at: time, id: a.id, x: a.x, z: a.z });
      downState.set(a.id, now);
    }
  }

  /**
   * Tur sonu sahnesi: tur biter bitmez tablo açılmaz. Herkes END.hold saniye bitişi izler: kamera turu bitiren olaya
   * (son yakalanan suçlu / son düşen savcı; süre dolduysa izlediği yere) yaklaşır, animasyon oynar, üstte büyük bir
   * başlık (#ending) belirir. Sonra tur sonu tablosu açılır. Oyuncunun kendi elenme sahnesi de beklenir.
   */
  const END = { hold: 4.2, zoom: 13 };
  const END_TEXT = {
    capture: ['law', 'KANUN KAZANDI', 'Son suçlu da yakalandı.'],
    prosecutors: ['crime', 'SUÇLULAR KAZANDI', 'Son savcı da düştü.'],
    timeout: ['crime', 'SUÇLULAR KAZANDI', 'Süre doldu, suçlular kalabalıkta kayboldu.'],
  };
  app.ending = null;
  function endingClear() { app.ending = null; app.endHold = false; const e = $('#ending'); if (e) { e.hidden = true; e.className = ''; } }
  /** Tur bittiyse sahneyi başlatır / sürdürür; tur sonu tablosu açılabilecekse true. */
  function endingUpdate(world, time) {
    if (!world.result) { app.endHold = false; return false; }
    if (!app.ending) {
      const last = [...downs.values()].filter(d => time - d.at < 3).sort((a, b) => b.at - a.at)[0];
      const [tone, title, text] = END_TEXT[world.result.kind] || ['crime', 'TUR BİTTİ', ''];
      app.ending = { at: time, kind: world.result.kind, id: world.result.kind === 'timeout' ? null : last?.id ?? null };
      const e = $('#ending');
      e.className = tone; e.hidden = false;
      e.querySelector('.eyebrow').textContent = `TUR ${world.round} BİTTİ`;
      e.querySelector('h2').textContent = title; e.querySelector('p').textContent = text;
      ui.tone(tone === 'law' ? 660 : 150, 0.7);
    }
    app.ending.t = time - app.ending.at;
    app.endHold = app.ending.t < END.hold;
    return !app.endHold && !app.fateHold;
  }
  function fateCard(kind) {
    const card = $('#fate'), flash = $('#fateFlash'), [eyebrow, title, text] = FATE_TEXT[kind];
    card.className = kind; card.hidden = false;
    card.querySelector('.eyebrow').textContent = eyebrow; card.querySelector('h2').textContent = title; card.querySelector('p').textContent = text;
    card.querySelector('.fate-art').innerHTML = kind === 'caught' ? '<i></i>'.repeat(7) + '<b></b>' : '<i></i><b></b><b></b><b></b>';
    flash.className = kind; void flash.offsetWidth; flash.classList.add('on');
    clearTimeout(fateHide); fateHide = setTimeout(() => { card.hidden = true; }, FATE.card * 1000);
    ui.tone(kind === 'caught' ? 180 : 120, 0.5);
  }
  function fateClear() { app.fate = null; app.fateHold = false; clearTimeout(fateHide); $('#fate').hidden = true; $('#fateFlash').className = ''; }
  $('#fateClose').onclick = () => { if (app.fate) app.fate.at = -1e9; $('#fate').hidden = true; };
  function fateUpdate(world, time) {
    if (world !== fateWorld || world.round !== fateRound || !app.playing) { fateWorld = world; fateRound = world.round; wasActive = null; if (app.fate) fateClear(); }
    const p = world.player;
    if (!app.playing || !p) return;
    const on = active(p);
    if (wasActive && !on && !app.fate) {
      app.fate = { kind: p.caught ? 'caught' : 'murder', at: time, id: p.id };
      fateCard(app.fate.kind);
    }
    wasActive = on;
    if (app.fate) app.fate.t = time - app.fate.at;
    app.fateHold = Boolean(app.fate && app.fate.t < FATE.hold);
  }

  let last = performance.now(), uiClock = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000), time = now / 1000;
    last = now;
    try {
      const world = app.world;
      if (app.online) {
        // Çevrim içi: simülasyon sunucuda; burada yalnızca ara değer, kendi karakterinin ileri kayması ve girdi gönderimi.
        net.update(dt, input.take(), app.paused || !$('#scores').hidden);
        trackDowns(world, time); fateUpdate(world, time);
        if (endingUpdate(world, time)) { $('#fate').hidden = true; $('#ending').hidden = true; screens.showResult(); }
        screens.tickOnline();
      } else if (app.playing && !app.paused) {
        step(world, dt, gosteri ? gosteri.girdi(dt) : input.take());
        gosteri?.sahne(app, time);
        trackDowns(world, time); fateUpdate(world, time);
        if (endingUpdate(world, time)) { $('#fate').hidden = true; $('#ending').hidden = true; screens.showResult(); }
      }
      else if (!app.playing) menuStep(world, dt);
      // Otopilot: tur sonu tablosu biraz görünür, sonra sıradaki tur kendiliğinden başlar.
      if (otopilot && app.shownResult) {
        otopilot.sonucAt ||= time;
        if (time - otopilot.sonucAt > OTO_SONUC) { otopilot.sonucAt = 0; otoTur(); }
      }
      input.pickHover();
      if (touch) syncTouch(world);
      if (!app.online && (!app.playing || app.paused)) { trackDowns(world, time); fateUpdate(world, time); }
      // Tur sonu sahnesinde kamera turu bitiren olayda, elenme sahnesinde oyuncunun kendi (yakalanmış / ölü) karakterindedir.
      // Gösteri sahnesi gözü de yakınlığı da kendi zaman çizelgesinden verebilir (`?gosteri=roller`: üç rolün gözü).
      const endEyes = app.endHold && app.ending.id != null ? world.actors[app.ending.id] : null;
      const eyes = app.playing ? (gosteri?.gozler?.() || endEyes || (app.fateHold ? world.actors[app.fate.id] : spectate(world, app.spectator))) : null;
      // Kamera: oyunda izlenen karaktere yakın, menüde kasabanın üstünde geniş. Gösteride göz değişen karede odak
      // zıplar (`app.odakSicra`): iki rol arası yumuşak kayma kasabanın yarısını süpüren bir savruluş olurdu.
      if (eyes) focus.lerp(new T.Vector3(eyes.x, 0, eyes.z), app.odakSicra ? 1 : 1 - Math.exp(-CAMERA.follow * dt));
      else if (!app.playing) focus.lerp(new T.Vector3(-7, 0, 1), 0.02);
      app.odakSicra = false;
      const zoomTo = gosteri?.yakinlik?.() ?? (app.playing ? (app.fateHold ? Math.min(app.zoomPlay, FATE.zoom) : app.endHold ? Math.min(app.zoomPlay, END.zoom) : app.zoomPlay) : CAMERA.zoomMenu);
      app.zoom += (zoomTo - app.zoom) * Math.min(1, dt * (app.fateHold || app.endHold ? 4 : app.playing ? 3 : 2));
      const aspect = app.w / app.h;
      Object.assign(camera, { left: -app.zoom * aspect, right: app.zoom * aspect, top: app.zoom, bottom: -app.zoom });
      camera.updateProjectionMatrix();
      camera.position.copy(focus).add(offset); camera.lookAt(focus); camera.updateMatrixWorld();

      fog.update(eyes, dt);
      for (const s of town.signs) s.visible = !eyes || dist(s.position, eyes) <= CFG.vision + 0.5;
      for (const m of town.windmills) m.rotation.z += dt * 0.24;
      characters.sync(world, eyes, app.playing, time, app.hover?.id ?? null, focus, downs);
      effects.sync(world, eyes, app.playing, time, app.hover, downs, gosteri?.izRol?.());
      crates.sync(world);
      town.xray.update(world, eyes, dt);
      renderer.render(scene, camera);

      // Duraklatma ekranları bulanık bir arka planın üstündedir: altta değişen HUD titreme gibi görünür, o yüzden durur.
      uiClock += dt;
      const tick = uiClock > 0.09;
      if (tick) uiClock = 0;
      // Müziğin sahnesi: menü / ara pencereler sakin, tur ana tema, turun son dakikası ya da kovalamaca gerilim.
      // `sahne()` aynı adı yeniden alınca hiçbir şey yapmaz, her tikte sorulması bedavadır (bkz. src/muzik.js).
      if (tick) muzik.sahne(sahneSec(app.playing, screens.perde, app.world, ui.kovalamaca));
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

  // Gösteri çekimi sahnenin saatini ve yakalamanın olup olmadığını buradan okur (kare kare çekim betiği).
  if (gosteri) window.__gosteri = gosteri;

  if (new URLSearchParams(location.search).has('test') || otopilot) {
    window.__iz = {
      get world() { return app.world; }, get app() { return { ...app, fogNear: () => scene.fog.near }; }, renderer, characters, town,
      finish: (kind = 'timeout') => finish(app.world, kind),
      traceArrows: () => effects.arrowsShown(),
      reachRing: () => effects.reachShown(),
      fateParts: () => effects.fateShown(),
      newMatch: hooks.newMatch, pick: hooks.pick, close: screens.close, minimap, net,
      /** Müziği ölçen test için: hangi sahne / parça çalıyor, düğmeler ne diyor (tests/muzik-smoke.mjs). */
      muzik: { durum: () => muzik.durum(), ac: v => { muzik.ac(v); syncMenu(); }, perde: () => screens.perde },
      step(seconds) { for (let t = 0; t < seconds; t += 0.05) step(app.world, 0.05); ui.update(); },
      /** Testte oyuncunun rolünü tur içinde değiştirir (hakları da o role göre). */
      setRole(role) { app.world.player.role = role; ui.clear(); ui.update(); },
    };
  }
}
