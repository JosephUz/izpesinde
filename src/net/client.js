import { CFG } from '../config.js';
import { computeEnvironment } from '../environment.js';
import { blocked } from '../physics.js';
import { active } from '../roster.js';
import { serverUrl } from '../platform.js';
import { C2S, NET, S2C } from './protocol.js';
import { applyLook, decodeSnapshot } from './snapshot.js';

/**
 * Çevrim içi istemci: sunucuya bağlanır, lobiyi yürütür, tur başlayınca dünyanın **kopyasını** kurar (world.remote) ve
 * sunucudan gelen karakter paketleri (ikili) ve kişiye özel durumla (JSON) günceller. Simülasyon koşturmaz: kopya,
 * tek başına oyunun dünyasıyla aynı alanları taşır, böylece sahne, arayüz ve harita kodu değişmeden çizer.
 *
 * Karakterler iki paket arasında ara değerle (NET.interpDelay geriden) çizilir. Kendi karakterine yalnızca yerel
 * girdiden üretilen bir ileri kayma eklenir: tuşa basınca anında yürür, paketlere bağlı zonklama olmaz (Çayır
 * Muhafızı'ndaki yöntem). Yetki yine sunucudadır.
 */
export function createNetClient(hooks) {
  let ws = null, wantReconnect = false, curNick = '', env = null;
  let snaps = [], clockOffset = 0, clockReady = false, stateAt = 0, rtt = 0, pingClock = 0;
  let sendClock = 0, lastSent = '', resendClock = 0;
  const lead = { x: 0, z: 0 };
  const client = { id: 0, nick: '', lobby: null, online: 0, connected: false, world: null, rtt: 0 };

  // Kimlik ve oda **sekmeye** özeldir (sessionStorage): iki sekme iki ayrı oyuncudur, sayfa yenilemesi aynı koltuğa
  // geri döner. Ad kalıcıdır (localStorage, bkz. screens.js).
  const token = () => { try { return sessionStorage.getItem('iz.token') || ''; } catch { return ''; } };
  const saveToken = t => { try { sessionStorage.setItem('iz.token', t); } catch { /* yok */ } };
  const remember = code => { try { if (code) sessionStorage.setItem('iz.room', code); else sessionStorage.removeItem('iz.room'); } catch { /* yok */ } };
  const send = obj => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  function connect(nick) {
    curNick = nick;
    if (ws) { try { ws.onclose = null; ws.close(); } catch { /* yok */ } }
    ws = new WebSocket(serverUrl());
    ws.binaryType = 'arraybuffer';
    wantReconnect = true;
    ws.onopen = () => { client.connected = true; send({ t: C2S.HELLO, nick: curNick, token: token() }); hooks.onConnect?.(); };
    ws.onclose = () => {
      client.connected = false; hooks.onDisconnect?.();
      // Odadayken hızlı, boştayken (yalnızca çevrim içi sayısı için) seyrek yeniden dene.
      if (wantReconnect) setTimeout(() => { if (wantReconnect) connect(curNick); }, client.lobby || client.world ? 1500 : 15000);
    };
    ws.onerror = () => {};
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') { let msg; try { msg = JSON.parse(ev.data); } catch { return; } onText(msg); }
      else onSnapshot(new Uint8Array(ev.data));
    };
  }

  function onText(msg) {
    switch (msg.t) {
      case S2C.WELCOME: saveToken(msg.token); client.id = msg.id; client.nick = msg.nick; hooks.onWelcome?.(msg); break;
      case S2C.LOBBY: client.lobby = msg; remember(msg.code); hooks.onLobby?.(msg); break;
      case S2C.ERROR: hooks.onError?.(msg.msg); break;
      case S2C.ROUND: buildWorld(msg); hooks.onRound?.(client.world, msg); break;
      case S2C.STATE: applyState(msg); break;
      case S2C.RESULT: applyResult(msg); break;
      case S2C.PONG: rtt = performance.now() - msg.at; client.rtt = rtt; break;
      case S2C.ONLINE: client.online = msg.n; hooks.onOnline?.(msg.n); break;
      default: break;
    }
  }

  /** Yeni tur: dünya kopyası baştan kurulur. Rol yalnızca kendin ve tanıdıkların için bilinir. */
  function buildWorld(msg) {
    env ??= computeEnvironment();
    const n = 10 + CFG.crowd, w = {
      remote: true, env, humans: new Set([msg.you]), names: msg.names, round: msg.round, seconds: msg.seconds, scores: msg.scores, history: msg.history,
      result: null, final: false, nextAt: 0, time: 0, events: [], serial: 0, effects: [], traces: [], marks: new Map(), revealed: new Map(),
      ghosts: [], tally: Array(10).fill(0), crates: env.crates.map(c => ({ ...c, carrier: null })), eyesId: msg.you,
      crim: [1, 1], phase: msg.phase, left: msg.left, leftAt: performance.now(),
      actors: Array.from({ length: n }, (_, id) => ({
        id, name: id < 10 ? msg.names[id] : 'Kasabalı', role: undefined, x: 0, z: 0, y: 0, facing: 0, speed: 0, appearance: 0, hat: 0,
        alive: true, caught: false, carry: false, action: null, wait: 0, known: new Set(), dashCd: 0, killCd: 0, disguiseCd: 0, crate: null,
      })),
    };
    const me = w.actors[msg.you];
    me.role = msg.role; me.known = new Set(msg.known.map(([id]) => id));
    for (const [id, role] of msg.known) w.actors[id].role = role;
    w.player = me;
    client.world = w; snaps = []; lead.x = lead.z = 0;
  }

  function onSnapshot(bytes) {
    const s = decodeSnapshot(bytes), w = client.world;
    if (!s || !w || s.round !== w.round) return;
    const sample = s.clock - performance.now() / 1000;
    if (!clockReady || Math.abs(sample - clockOffset) > NET.clockJump) { clockOffset = sample; clockReady = true; }
    else clockOffset += (sample - clockOffset) * NET.clockSmooth;
    snaps.push(s);
    if (snaps.length > 20) snaps.shift();
    if (snaps.length === 1) place(w, s, s, 0);
  }

  function applyState(st) {
    const w = client.world; if (!w) return;
    const me = w.player;
    w.time = st.time; stateAt = performance.now(); w.phase = st.phase; w.left = st.left; w.leftAt = stateAt;
    w.eyesId = st.eyes;
    if (st.eyes != null && st.eyes !== me.id) w.actors[st.eyes].role ??= me.role; // izlediğin kişi seninle aynı roldedir
    Object.assign(me, { dashCd: st.me.dashCd, killCd: st.me.killCd, disguiseCd: st.me.disguiseCd, crate: st.me.crate });
    w.tally[me.id] = st.me.tally;
    w.marks = new Map(st.marks.map(([id, owner, ox, oz, cleared, time]) => [id, { owner, ox, oz, cleared: Boolean(cleared), time }]));
    w.ghosts = st.ghosts.map(([x, z, until]) => ({ x, z, until }));
    w.effects = st.fx.map(([type, x, z, t]) => ({ type, x, z, t }));
    w.traces = st.tr.map(([id, x, z, dir, born]) => ({ id, x, z, dir, born, role: me.role }));
    w.revealed = new Map(st.rev);
    st.crates.forEach(([x, z, carrier], i) => { if (w.crates[i]) Object.assign(w.crates[i], { x, z, carrier: carrier < 0 ? null : carrier }); });
    w.crim = st.crim;
    for (const [id, text, kind, time] of st.ev) if (!w.events.some(e => e.id === id)) w.events.push({ id, text, kind, time, to: null });
    if (w.events.length > 60) w.events.splice(0, w.events.length - 60);
  }

  function applyResult(msg) {
    const w = client.world; if (!w) return;
    w.result = msg.result; w.scores = msg.scores; w.history = msg.history; w.final = msg.final;
    w.nextAt = performance.now() + msg.next * 1000;
    msg.result.roles.forEach((role, id) => { w.actors[id].role = role; });
    if (msg.final) remember(client.lobby?.code || null);
    hooks.onResult?.(w, msg);
  }

  /** İki paket arasında ara değer: konum, yükseklik, yön (kısa yoldan), hız; görünüş ve bayraklar yeni paketten. */
  function place(w, a, b, k) {
    for (let i = 0; i < Math.min(b.n, w.actors.length); i++) {
      const x = w.actors[i];
      x.x = a.x[i] + (b.x[i] - a.x[i]) * k; x.z = a.z[i] + (b.z[i] - a.z[i]) * k; x.y = a.y[i] + (b.y[i] - a.y[i]) * k;
      let d = b.facing[i] - a.facing[i];
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      x.facing = a.facing[i] + d * k; x.speed = b.speed[i];
      applyLook(x, b.look[i], b.flags[i]);
    }
  }

  /** Her kare: karakterleri ara değerle yerleştir, kendi karakterine ileri kayma ekle, girdiyi yolla. */
  function update(dt, input, busy) {
    const w = client.world;
    if (!w) return;
    const now = performance.now();
    if (w.phase === 'play' && !w.result) w.time += Math.min(dt, Math.max(0, 0.25 - (now - stateAt) / 1000));
    if (snaps.length) {
      const t = now / 1000 + clockOffset - NET.interpDelay;
      let i = snaps.findIndex(s => s.clock >= t);
      if (i < 0) place(w, snaps.at(-1), snaps.at(-1), 0);
      else if (i === 0) place(w, snaps[0], snaps[0], 0);
      else { const a = snaps[i - 1], b = snaps[i]; place(w, a, b, Math.max(0, Math.min(1, (t - a.clock) / (b.clock - a.clock || 1)))); }
    }
    const me = w.player, moving = w.phase === 'play' && !w.result && active(me) && !busy;
    const dx = moving ? input.dx || 0 : 0, dz = moving ? input.dz || 0 : 0, l = Math.hypot(dx, dz);
    const speed = input.sprint ? CFG.run : CFG.walk, ahead = NET.interpDelay + rtt / 2000 + 0.05;
    let tx = l > 0.01 ? (dx / Math.max(1, l)) * speed * ahead : 0, tz = l > 0.01 ? (dz / Math.max(1, l)) * speed * ahead : 0;
    const tl = Math.hypot(tx, tz);
    if (tl > NET.leadMax) { tx *= NET.leadMax / tl; tz *= NET.leadMax / tl; }
    const k = 1 - Math.exp(-dt / NET.leadSmooth);
    lead.x += (tx - lead.x) * k; lead.z += (tz - lead.z) * k;
    // Duvara dayanınca kayma içeri taşmasın: çizilen konum engeldeyse kayma o eksende bırakılır.
    if (me.y < 0.4) { if (blocked(w.env, me.x + lead.x, me.z)) lead.x = 0; if (blocked(w.env, me.x, me.z + lead.z)) lead.z = 0; }
    me.x += lead.x; me.z += lead.z;
    if (l > 0.01 && moving) me.facing = Math.atan2(dx, dz);
    if (me.crate !== null && w.crates[me.crate]) Object.assign(w.crates[me.crate], { x: me.x, z: me.z });
    sendInput(dt, { dx, dz, sprint: moving && Boolean(input.sprint) }, input);
    pingClock -= dt;
    if (pingClock <= 0) { pingClock = client.world ? 3 : NET.keepAlive; send({ t: C2S.PING, at: now }); }
  }

  /** Hareket saniyede 20 kez (değişince ya da sürerken), tek seferlik eylemler beklemeden. */
  function sendInput(dt, move, input) {
    const a = {};
    for (const k of ['use', 'swap']) if (input[k] != null) a[k] = input[k];
    for (const k of ['jump', 'dash', 'carry', 'blend', 'cycle']) if (input[k]) a[k] = true;
    const key = `${move.dx.toFixed(2)},${move.dz.toFixed(2)},${move.sprint}`, hasAction = Object.keys(a).length > 0;
    sendClock -= dt; resendClock -= dt;
    if (!hasAction && (sendClock > 0 || (key === lastSent && resendClock > 0))) return;
    sendClock = NET.inputEvery; resendClock = 1; lastSent = key;
    send({ t: C2S.INPUT, dx: move.dx, dz: move.dz, sp: move.sprint, ...(hasAction ? { a } : {}) });
  }

  /** Boştayken de bağlantıyı canlı tut (çevrim içi sayısı, Cloudflare'ın sessiz soketi kesmesi). */
  setInterval(() => { if (!client.world) send({ t: C2S.PING, at: performance.now() }); }, NET.keepAlive * 1000);

  return Object.assign(client, {
    connect,
    hello(nick) { curNick = nick; send({ t: C2S.HELLO, nick, token: token() }); },
    create(level) { send({ t: C2S.CREATE, level }); },
    join(code) { send({ t: C2S.JOIN, code }); },
    seat(seat) { send({ t: C2S.SEAT, seat }); },
    settings(level) { send({ t: C2S.SETTINGS, level }); },
    start() { send({ t: C2S.START }); },
    leave() { send({ t: C2S.LEAVE }); client.lobby = null; client.world = null; snaps = []; remember(null); },
    /** Maç bitince ya da odadan çıkınca kopya dünya bırakılır (lobi kalır). */
    dropWorld() { client.world = null; snaps = []; },
    update,
    rememberedRoom() { try { return sessionStorage.getItem('iz.room') || ''; } catch { return ''; } },
    forgetRoom() { remember(null); },
  });
}
