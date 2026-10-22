import { randomBytes } from 'node:crypto';
import { BOT_NAMES, CFG } from '../src/config.js';
import { C2S, LEVEL_KEYS, NET, S2C, SEATS, normalizeCode, roomCode } from '../src/net/protocol.js';
import { encodeSnapshot } from '../src/net/snapshot.js';
import { roundFor, stateFor } from '../src/net/visibility.js';
import { createWorld, spectate, startRound, step } from '../src/world.js';

/** Tur süresi: IZ_TUR_SN yalnızca testlerde verilir (tur sonu → sonraki tur akışı dakikalarca beklemeden sınansın). */
const ROUND_SECONDS = Number(process.env.IZ_TUR_SN) || CFG.seconds;
/** Lobide kopan oyuncunun koltuğu bu kadar tutulur (sayfa yenileme aynı koltuğa döner). */
const LOBBY_GRACE_MS = 8000;

/**
 * Odalar: kur / katıl / lobi / başlat / turlar / maç sonu. Taraf yoktur: lobide 10 koltuk vardır, her oyuncu boş bir
 * koltuğa oturur (tıklayıp başka boş koltuğa geçebilir), boş koltukları botlar doldurur. **Rol seçimi yoktur**: her tur
 * herkes (insan ve bot) rastgele rol alır, her tur yine 2 suçlu / 6 dedektif / 2 savcı.
 *
 * Sunucu otoriterdir: her oda kendi dünyasını (src/world.js) saniyede 20 adım koşturur, her 2 adımda bir ikili karakter
 * paketi (herkese aynı) ve kişiye özel durum (src/net/visibility.js) yollar. Tur akışı: giriş (NET.intro sn, rolünü
 * okursun, kimse kıpırdamaz) → oyun → tur sonu tablosu (NET.result sn) → sonraki tur; beşinci turun sonunda oda hemen
 * lobiye döner (oyuncular maç sonu tablosundan "Lobiye dön" ile geçer).
 *
 * Hesap yok: bağlantı `token` ile tanınır, kopan oyuncu aynı token'la koltuğuna geri döner. Koparken karakteri **bot
 * devralır** (duran bir karakter gizli kimlik oyununda kendini ele verirdi), dönünce yeniden insana geçer. Oyundan
 * çıkanın koltuğu tur sonuna kadar botta kalır. Oda ancak bağlı kimse kalmayınca kapanır.
 *
 * Açık odalar (josephuz deposunda docs/oda-standardi.md): oda **herkese açık** kurulur, kuran lobide **özel** yapabilir.
 * Herkese açık oda lobideyken listede görünür (doluysa DOLU satırıyla); boş koltuğu varsa Hızlı katıl'a girer. Özel oda
 * yalnızca kodla / linkle bulunur. Oyun başlamış odaya katılınmadığı için liste yalnızca lobideki odaları taşır (kuranın
 * adı, insan sayısı, zorluk); listeden tura dair hiçbir bilgi (rol, skor) çıkmaz. Sunucu listeyi odada olmayan her
 * bağlantıya kendisi yollar (değişince, ~250 ms birleştirerek); istemci yoklamaz.
 */
export function createRooms({ log = console.log } = {}) {
  const rooms = new Map();   // code -> room
  const conns = new Set();   // canlı bağlantılar
  const byToken = new Map(); // token -> conn (kopmuş olsa da)

  const send = (conn, obj) => { if (conn.ws && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(obj)); };
  const sendBin = (conn, bytes) => { if (conn.ws && conn.ws.readyState === 1) conn.ws.send(bytes, { binary: true }); };
  /** Hata: dil bağımsız kod (istemci kendi dilinde yazar, bkz. src/diller/*.js `sunucu.*`) + Türkçe yedek metin. */
  const error = (conn, kod, msg) => send(conn, { t: S2C.ERROR, kod, msg });

  /**
   * Çevrim içi sayısı ve açık oda sayısı: siteyi açan her sekme boşta bir bağlantı tutar; ikisinden biri değişince en
   * çok 2 sn'de bir yayılır.
   */
  let onlineSent = '', onlineTimer = null;
  const onlineMsg = () => ({ t: S2C.ONLINE, n: conns.size, open: openRooms().length });
  function onlineChanged() {
    if (onlineTimer) return;
    onlineTimer = setTimeout(() => {
      onlineTimer = null;
      const m = onlineMsg(), key = `${m.n}/${m.open}`;
      if (key === onlineSent) return;
      onlineSent = key;
      for (const c of conns) send(c, m);
    }, 2000);
  }

  /** Lobideki herkese açık odalar (dolular dahil). Önce insanı çok olan, eşitse eski olan. */
  function listedRooms() {
    return [...rooms.values()].filter(r => !r.private && r.state === 'lobby')
      .sort((a, b) => seated(b).length - seated(a).length || a.created - b.created);
  }
  /** Şu an katılınabilen herkese açık odalar (Hızlı katıl, açık oda sayısı): listedekilerden boş koltuğu olanlar. */
  const openRooms = () => listedRooms().filter(r => r.seats.includes(null));
  /** Oda listesi: yalnızca lobideki odaların herkese açık bilgisi (rol, skor ya da tur bilgisi yok). En çok 20 oda. */
  function roomsMsg() {
    return { t: S2C.ROOMS, rooms: listedRooms().slice(0, 20).map(r => {
      const host = r.seats.find(c => c && c.id === r.hostId);
      return { code: r.code, host: host ? host.nick : '', n: seated(r).length, level: r.level, state: r.state };
    }) };
  }
  /** Odalar değişti: odada olmayan (ana ekrandaki) bağlantılara en çok 250 ms'de bir yolla. */
  let roomsTimer = null;
  function roomsChanged() {
    onlineChanged();
    if (roomsTimer) return;
    roomsTimer = setTimeout(() => {
      roomsTimer = null;
      let m = null;
      for (const c of conns) if (c.token && !c.room) send(c, m ??= roomsMsg());
    }, 250);
  }

  const seated = room => room.seats.filter(Boolean);
  function lobbyMsg(room) {
    return { t: S2C.LOBBY, code: room.code, hostId: room.hostId, level: room.level, state: room.state, private: room.private,
      seats: room.seats.map((c, seat) => (c ? { seat, id: c.id, nick: c.nick, online: Boolean(c.ws) } : null)) };
  }
  const broadcastLobby = room => { for (const c of seated(room)) send(c, lobbyMsg(room)); roomsChanged(); };

  function stopRoom(room) { if (room.timer) { clearInterval(room.timer); room.timer = null; } }
  function closeRoom(room, why) {
    stopRoom(room); rooms.delete(room.code); log(`oda kapandı ${room.code} (${why})`);
    for (const c of seated(room)) { c.room = null; c.seat = -1; }
    room.seats.fill(null);
    roomsChanged();
  }
  /** Bağlı kimse kalmadıysa oda kapanır. */
  function closeIfEmpty(room) {
    if (seated(room).some(c => c.ws)) return false;
    closeRoom(room, 'bağlı kimse kalmadı');
    return true;
  }

  /** Koltuğu bırak (Odadan çık, başka odaya geçiş). Oyun sürerken karakteri bot devralır. */
  function leaveRoom(conn) {
    const room = conn.room; if (!room) return;
    const seat = conn.seat;
    room.seats[seat] = null; conn.room = null; conn.seat = -1;
    if (room.world) handOver(room, seat, false);
    if (!seated(room).length) { closeRoom(room, 'herkes ayrıldı'); return; }
    if (room.hostId === conn.id) room.hostId = seated(room)[0].id;
    broadcastLobby(room);
    closeIfEmpty(room);
  }

  /** Koltuktaki karakteri insana (human=true) ya da bota ver. Bot devralırken yarım kalan girdisi silinir. */
  function handOver(room, seat, human) {
    const world = room.world, a = world.actors[seat];
    if (human) { world.humans.add(seat); a.path = []; a.goal = null; }
    else { world.humans.delete(seat); a.think = 0; }
  }

  function startGame(room) {
    const humans = room.seats.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
    const names = room.seats.map((c, i) => (c ? c.nick : BOT_NAMES[i]));
    room.world = createWorld({ seed: 1000 + Math.floor(Math.random() * 900000), level: room.level, humans, names, seconds: ROUND_SECONDS });
    for (const c of seated(room)) { c.input = {}; c.actions = {}; c.spectator = c.seat; c.since = 0; }
    room.state = 'playing'; room.clock = 0; room.tickNo = 0; room.acc = 0; room.last = performance.now();
    for (const c of seated(room)) if (!c.ws) handOver(room, c.seat, false);
    broadcastLobby(room);
    nextRound(room);
    room.timer = setInterval(() => tick(room), NET.tick * 1000);
    log(`başladı ${room.code}: ${humans.length} insan, ${SEATS - humans.length} bot, ${room.level}`);
  }

  function nextRound(room) {
    startRound(room.world);
    room.phase = 'intro'; room.left = NET.intro;
    for (const c of seated(room)) { c.spectator = c.seat; c.since = room.world.serial; c.actions = {}; sendRound(room, c); }
    flush(room);
  }
  function sendRound(room, conn) {
    send(conn, { t: S2C.ROUND, ...roundFor(room.world, conn.seat), phase: room.phase, left: room.left });
    if (room.phase === 'result') sendResult(room, conn);
  }
  function sendResult(room, conn) {
    const w = room.world;
    send(conn, { t: S2C.RESULT, result: w.result, scores: w.scores, history: w.history, final: w.round >= CFG.rounds, next: room.left });
  }

  function tick(room) {
    const now = performance.now();
    room.acc += Math.min(0.5, (now - room.last) / 1000); room.last = now;
    let steps = 0;
    while (room.acc >= NET.tick && steps < 5) {
      room.acc -= NET.tick; steps++; room.tickNo++; room.clock += NET.tick;
      advance(room);
      if (room.state !== 'playing') return;
      if (room.tickNo % NET.snapshotEvery === 0) flush(room);
    }
    if (room.acc >= NET.tick) room.acc = 0; // geride kaldıysa (makine takıldı) sürükleme yok
  }

  function advance(room) {
    const world = room.world;
    if (room.phase === 'intro') { room.left -= NET.tick; if (room.left <= 0) room.phase = 'play'; return; }
    if (room.phase === 'result') {
      room.left -= NET.tick;
      if (room.left <= 0) nextRound(room);
      return;
    }
    const inputs = new Map();
    for (const c of seated(room)) {
      if (!world.humans.has(c.seat)) continue;
      inputs.set(c.seat, { ...c.input, ...c.actions });
      if (c.actions.cycle) { const t = spectate(world, c.spectator, true, world.actors[c.seat]); c.spectator = t ? t.id : c.seat; }
      c.actions = {};
    }
    step(world, NET.tick, inputs);
    if (world.result) {
      room.phase = 'result'; room.left = NET.result;
      flush(room);
      for (const c of seated(room)) sendResult(room, c);
      log(`tur ${world.round} bitti ${room.code}: ${world.result.kind}`);
      // Maç sonu: oda hemen lobiye döner; oyuncular tabloyu okuyup "Lobiye dön" ile geçer.
      if (world.round >= CFG.rounds) endMatch(room);
    }
  }

  /** Maç bitti: oda lobiye döner, koltuklar kalır; kopuk olanlar düşer. */
  function endMatch(room) {
    stopRoom(room);
    room.world = null; room.state = 'lobby';
    for (const c of seated(room)) if (!c.ws) { room.seats[c.seat] = null; c.room = null; c.seat = -1; }
    if (!seated(room).length) { closeRoom(room, 'maç bitti'); return; }
    if (!seated(room).some(c => c.id === room.hostId)) room.hostId = seated(room)[0].id;
    broadcastLobby(room);
    log(`maç bitti ${room.code}`);
  }

  function flush(room) {
    const world = room.world, snap = encodeSnapshot(world, room.clock);
    for (const c of seated(room)) {
      if (!c.ws) continue;
      const eyes = spectate(world, c.spectator, false, world.actors[c.seat]);
      const st = stateFor(world, c.seat, eyes, c.since);
      if (st.ev.length) c.since = st.ev.at(-1)[0];
      sendBin(c, snap);
      send(c, { t: S2C.STATE, phase: room.phase, left: Math.max(0, Math.round(room.left * 10) / 10), ...st });
    }
  }

  /** Girdi denetimi: hareket -1..1, hedefler geçerli karakter numarası, eylemler bayrak. Eylemler adıma kadar birikir. */
  function takeInput(room, conn, msg) {
    const clamp = v => Math.max(-1, Math.min(1, Number(v) || 0));
    conn.input = { dx: clamp(msg.dx), dz: clamp(msg.dz), sprint: Boolean(msg.sp) };
    const a = msg.a; if (!a || typeof a !== 'object') return;
    const id = v => (Number.isInteger(v) && v >= 0 && v < room.world.actors.length ? v : undefined);
    if (id(a.use) !== undefined) conn.actions.use = a.use;
    if (id(a.swap) !== undefined) conn.actions.swap = a.swap;
    for (const k of ['jump', 'dash', 'carry', 'blend', 'cycle']) if (a[k]) conn.actions[k] = true;
  }

  function onMessage(conn, data, isBinary) {
    if (isBinary) return;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = conn.room;
    switch (msg.t) {
      case C2S.HELLO: {
        conn.nick = String(msg.nick || '').trim().slice(0, 16) || `İzci-${Math.floor(1000 + Math.random() * 9000)}`;
        const old = msg.token && byToken.get(msg.token);
        if (old && old !== conn && old.room) {
          // Geri bağlanma: eski bağlantının kimliği ve koltuğu devralınır; karakter bottan insana geri geçer.
          Object.assign(conn, { id: old.id, token: old.token, room: old.room, seat: old.seat, spectator: old.spectator, since: 0, input: {}, actions: {} });
          const r = conn.room; r.seats[conn.seat] = conn;
          if (r.world) handOver(r, conn.seat, true);
          byToken.set(conn.token, conn); conns.delete(old); old.room = null; onlineChanged();
          send(conn, { t: S2C.WELCOME, id: conn.id, token: conn.token, nick: conn.nick });
          broadcastLobby(r);
          if (r.state === 'playing') sendRound(r, conn);
          log(`geri bağlandı ${conn.nick} (${r.code})`);
          return;
        }
        conn.token = conn.token || randomBytes(12).toString('base64url');
        byToken.set(conn.token, conn);
        send(conn, { t: S2C.WELCOME, id: conn.id, token: conn.token, nick: conn.nick });
        send(conn, onlineMsg());
        if (!conn.room) send(conn, roomsMsg());
        return;
      }
      case C2S.CREATE: { createRoom(conn, msg.level, msg.private === true); return; }
      case C2S.JOIN: {
        const r = rooms.get(normalizeCode(msg.code));
        if (!r) return error(conn, 'oda.yok', 'Böyle bir oda yok');
        if (r === room) { broadcastLobby(r); if (r.state === 'playing') sendRound(r, conn); return; }
        if (r.state !== 'lobby') return error(conn, 'oda.basladi', 'Maç başlamış');
        if (!r.seats.includes(null)) return error(conn, 'oda.dolu', 'Oda dolu');
        joinRoom(conn, r);
        return;
      }
      case C2S.QUICK: {
        // Hızlı katıl: katılınabilen en dolu herkese açık oda; yoksa yeni bir herkese açık oda kurar.
        if (room && room.state === 'playing') return;
        const r = openRooms().find(x => x !== room);
        if (r) joinRoom(conn, r); else createRoom(conn, msg.level, false);
        return;
      }
      case C2S.ROOMS: {
        // Liste zaten kendiliğinden gelir; bu istek yalnızca güncelini hemen ister.
        if (!room) send(conn, roomsMsg());
        return;
      }
      case C2S.SEAT: {
        if (!room || room.state !== 'lobby') return;
        const seat = Math.round(Number(msg.seat));
        if (!(seat >= 0 && seat < SEATS) || room.seats[seat]) return;
        room.seats[conn.seat] = null; room.seats[seat] = conn; conn.seat = seat;
        broadcastLobby(room); return;
      }
      case C2S.MOVE: {
        // Kuran bir oyuncuyu başka koltuğa taşır; hedef doluysa ikisi yer değiştirir.
        if (!room || room.hostId !== conn.id || room.state !== 'lobby') return;
        const seat = Math.round(Number(msg.seat)), who = room.seats.find(c => c && c.id === msg.id);
        if (!who || !(seat >= 0 && seat < SEATS) || who.seat === seat) return;
        const other = room.seats[seat], from = who.seat;
        room.seats[from] = other; room.seats[seat] = who; who.seat = seat;
        if (other) other.seat = from;
        broadcastLobby(room); return;
      }
      case C2S.SETTINGS: {
        if (!room || room.hostId !== conn.id || room.state !== 'lobby') return;
        if (msg.level !== undefined) room.level = level(msg.level);
        if (typeof msg.private === 'boolean') room.private = msg.private;
        broadcastLobby(room); return;
      }
      case C2S.START: {
        if (!room || room.hostId !== conn.id || room.state !== 'lobby') return;
        startGame(room); return;
      }
      case C2S.LEAVE: { if (room) leaveRoom(conn); return; }
      case C2S.INPUT: { if (room && room.state === 'playing' && room.world && room.world.humans.has(conn.seat)) takeInput(room, conn, msg); return; }
      case C2S.PING: { send(conn, { t: S2C.PONG, at: msg.at }); return; }
      default: return;
    }
  }

  const level = v => (LEVEL_KEYS.includes(v) ? v : 'normal');

  /** Yeni oda: kuran ilk koltuğa oturur. `priv` özel odadır (listede ve Hızlı katıl'da görünmez, yalnız kodla). */
  function createRoom(conn, lvl, priv) {
    if (conn.room) leaveRoom(conn);
    let code = roomCode(); while (rooms.has(code)) code = roomCode();
    const r = { code, hostId: conn.id, seats: Array(SEATS).fill(null), state: 'lobby', level: level(lvl), private: Boolean(priv), world: null, timer: null, created: Date.now() };
    r.seats[0] = conn; conn.room = r; conn.seat = 0;
    rooms.set(code, r);
    broadcastLobby(r); log(`oda kuruldu ${code} (${conn.nick}${r.private ? ', özel' : ''})`);
  }
  /** Lobideki odanın ilk boş koltuğuna otur (boş koltuk olduğunu çağıran denetler). */
  function joinRoom(conn, r) {
    if (conn.room) leaveRoom(conn);
    const seat = r.seats.indexOf(null);
    r.seats[seat] = conn; conn.room = r; conn.seat = seat;
    broadcastLobby(r); log(`katıldı ${conn.nick} -> ${r.code}`);
  }

  let nextId = 1;
  return {
    attach(ws) {
      const conn = { id: nextId++, token: null, nick: '', ws, room: null, seat: -1, input: {}, actions: {}, spectator: 0, since: 0 };
      conns.add(conn); onlineChanged();
      ws.on('message', (data, isBinary) => { try { onMessage(conn, data, isBinary); } catch (err) { log('mesaj hatası', err); } });
      ws.on('close', () => {
        conns.delete(conn); conn.ws = null; onlineChanged();
        const r = conn.room;
        if (!r) return;
        if (r.state === 'playing') {
          // Kopma: koltuk tutulur, karakteri bot yönetir; aynı token'la dönünce geri alır.
          if (r.world) handOver(r, conn.seat, false);
          conn.input = {}; conn.actions = {};
          log(`koptu ${conn.nick} (${r.code})`);
          if (!closeIfEmpty(r)) broadcastLobby(r);
        } else {
          // Lobide kopma: sayfa yenilenince aynı koltuğa dönülsün diye koltuk LOBBY_GRACE_MS boyunca tutulur
          // (`koptu`); aynı token'la dönülmezse bırakılır. Bu arada maç başlarsa koltuk oyundaki kopma gibi tutulur.
          log(`koptu ${conn.nick} (${r.code}, lobi)`);
          broadcastLobby(r);
          setTimeout(() => { if (!conn.ws && conn.room === r && r.state === 'lobby') leaveRoom(conn); }, LOBBY_GRACE_MS);
        }
      });
      ws.on('error', () => {});
    },
    rooms,
    /** online: açık sekme (bağlı soket), inRoom: bir odada oturan bağlı sekme. */
    stats() { let inRoom = 0; for (const c of conns) if (c.room) inRoom++; return { rooms: rooms.size, online: conns.size, inRoom }; },
  };
}
