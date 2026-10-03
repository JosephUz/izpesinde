// Çevrim içi duman testi (tarayıcısız): iki WebSocket istemcisi oda kurar / katılır, koltuk değiştirir, kuran başlatır.
// Sınananlar: lobi koltukları, roller rastgele ve yalnızca tanıdıklar için gelir, ikili karakter paketi açılır, giriş
// evresinde kimse kıpırdamaz, oyunda girdi karakteri yürütür, kopan oyuncunun koltuğu tutulur ve token'la geri dönülür.
// GAME_URL ile çalışan bir sunucuya bağlanır (npm test kendisi açar).
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { decodeSnapshot } from '../src/net/snapshot.js';

const url = (process.env.GAME_URL || 'http://127.0.0.1:5197').replace(/^http/, 'ws');

function client(nick, token = '') {
  const ws = new WebSocket(url), c = { ws, msgs: [], snaps: [] };
  ws.on('message', (data, binary) => { if (binary) c.snaps.push(decodeSnapshot(new Uint8Array(data))); else c.msgs.push(JSON.parse(data.toString())); });
  c.send = obj => ws.send(JSON.stringify(obj));
  /** İlk uyan mesajı bekle (since: bu sıradan sonrakiler). */
  c.wait = (pred, ms = 4000, since = 0) => new Promise((resolve, reject) => {
    const t0 = Date.now(), poll = () => {
      const m = c.msgs.slice(since).find(pred);
      if (m) return resolve(m);
      if (Date.now() - t0 > ms) return reject(new Error(`${nick}: beklenen mesaj gelmedi`));
      setTimeout(poll, 20);
    };
    poll();
  });
  c.ready = new Promise(r => ws.on('open', () => { c.send({ t: 'hello', nick, token }); r(); }));
  return c;
}

const a = client('Ayşe'), b = client('Bora');
await a.ready; await b.ready;
const wa = await a.wait(m => m.t === 'welcome'), wb = await b.wait(m => m.t === 'welcome');
a.send({ t: 'create', level: 'easy' });
const l1 = await a.wait(m => m.t === 'lobby');
assert.equal(l1.seats.length, 10); assert.equal(l1.seats[0].id, wa.id); assert.equal(l1.level, 'easy');
b.send({ t: 'join', code: l1.code });
await b.wait(m => m.t === 'lobby' && m.seats.filter(Boolean).length === 2);
b.send({ t: 'seat', seat: 7 });
const l2 = await a.wait(m => m.t === 'lobby' && m.seats[7]?.id === wb.id);
assert.equal(l2.seats[1], null, 'eski koltuk boşalır');
b.send({ t: 'start' }); // kuran değil: yok sayılır
a.send({ t: 'start' });

const ra = await a.wait(m => m.t === 'round'), rb = await b.wait(m => m.t === 'round');
assert.equal(ra.you, 0); assert.equal(rb.you, 7); assert.equal(ra.names[7], 'Bora'); assert.equal(ra.names[3], 'Cemre', 'boş koltukta bot');
assert.ok(['detective', 'prosecutor', 'criminal'].includes(ra.role));
for (const r of [ra, rb]) {
  // Suçlular birbirini, kanun savcıları tanır; başka rol bilgisi gelmez.
  const expect = r.role === 'criminal' ? ['criminal'] : ['prosecutor'];
  for (const [, role] of r.known) assert.ok(expect.includes(role), 'yalnızca tanıdıkların rolü gelir');
  assert.equal(r.known.length, r.role === 'prosecutor' ? 1 : r.role === 'criminal' ? 1 : 2);
}
assert.equal(ra.phase, 'intro');

// Giriş evresinde kimse kıpırdamaz; ikili paket bütün karakterleri taşır.
await new Promise(r => setTimeout(r, 400));
const s0 = a.snaps.at(-1);
assert.equal(s0.n, 180);
a.send({ t: 'in', dx: 1, dz: 0 });
await new Promise(r => setTimeout(r, 400));
assert.equal(a.snaps.at(-1).x[0], s0.x[0], 'giriş evresinde girdi işlemez');
const st = a.msgs.filter(m => m.t === 'st').at(-1);
assert.equal(st.phase, 'intro'); assert.equal(st.eyes, 0);
if (ra.role !== 'criminal') assert.ok(st.rev.every(([id]) => id === 0), 'ele verilen savcılar yalnızca suçlulara gider');
assert.ok(!JSON.stringify(st).includes('"role"'), 'durum paketinde rol yok');

// Oyun evresi: girdi karakteri yürütür (dört yönden biri mutlaka açıktır).
await a.wait(m => m.t === 'st' && m.phase === 'play', 8000);
let moved = 0;
for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
  const start = a.snaps.at(-1);
  for (let i = 0; i < 12; i++) { a.send({ t: 'in', dx, dz }); await new Promise(r => setTimeout(r, 50)); }
  await new Promise(r => setTimeout(r, 200));
  const end = a.snaps.at(-1);
  moved = Math.max(moved, Math.hypot(end.x[0] - start.x[0], end.z[0] - start.z[0]));
  if (moved > 1.5) break;
}
a.send({ t: 'in', dx: 0, dz: 0 });
assert.ok(moved > 1.5, `girdi karakteri yürütür (${moved.toFixed(2)})`);

// Kopma: koltuk tutulur (bağlantı yok görünür), aynı token'la dönen aynı koltuğa ve tura geri gelir.
b.ws.close();
await a.wait(m => m.t === 'lobby' && m.seats[7] && !m.seats[7].online, 4000);
const b2 = client('Bora', wb.token);
await b2.ready;
const rb2 = await b2.wait(m => m.t === 'round');
assert.equal(rb2.you, 7); assert.equal(rb2.role, rb.role, 'aynı tur, aynı rol');
await a.wait(m => m.t === 'lobby' && m.seats[7]?.online, 4000);

// Odadan çıkan: koltuk boşalır, oda kalan oyuncuyla sürer.
b2.send({ t: 'leave' });
await a.wait(m => m.t === 'lobby' && m.seats[7] === null, 4000);
a.ws.close(); b2.ws.close();
console.log('online-smoke: tamam');
