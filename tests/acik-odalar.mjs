// Açık odalar duman testi (tarayıcısız): oda listesi, Hızlı katıl ve özel oda.
// Sınananlar: herkese açık oda listede görünür, özel oda görünmez (kurarken de sonradan lobide seçilince de); Hızlı
// katıl ikinci oyuncuyu ilk oyuncunun odasına oturtur, uygun oda yoksa yeni herkese açık oda kurar; oyunu başlamış ve
// dolu odalar listede yoktur ve Hızlı katıl'a girmez; listede yalnızca lobideki odanın herkese açık bilgisi vardır
// (rol, skor, tur bilgisi yok); çevrim içi mesajı açık oda sayısını taşır.
// GAME_URL ile çalışan bir sunucuya bağlanır (npm test kendisi açar).
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = (process.env.GAME_URL || 'http://127.0.0.1:5197').replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = [];

function client(nick) {
  const ws = new WebSocket(url), c = { ws, nick, msgs: [] };
  all.push(c);
  ws.on('message', (data, binary) => { if (!binary) c.msgs.push(JSON.parse(data.toString())); });
  c.send = obj => ws.send(JSON.stringify(obj));
  c.wait = (pred, ms = 4000) => new Promise((resolve, reject) => {
    const t0 = Date.now(), from = c.mark ?? 0, poll = () => {
      const m = c.msgs.slice(from).find(pred);
      if (m) return resolve(m);
      if (Date.now() - t0 > ms) return reject(new Error(`${nick}: beklenen mesaj gelmedi`));
      setTimeout(poll, 20);
    };
    poll();
  });
  /** Bundan sonra gelen mesajları bekle. */
  c.next = (pred, ms) => { c.mark = c.msgs.length; const p = c.wait(pred, ms); c.mark = 0; return p; };
  c.ready = new Promise(r => ws.on('open', () => { c.send({ t: 'hello', nick }); r(); }))
    .then(() => c.wait(m => m.t === 'welcome')).then(w => { c.id = w.id; });
  return c;
}
/** İzleyicinin güncel listesi: isteyip yanıtı bekler. */
async function list(w) {
  w.mark = w.msgs.length;
  w.send({ t: 'rooms', watch: true });
  const m = await w.wait(x => x.t === 'rooms'); w.mark = 0;
  return m.rooms;
}
const codes = rooms => rooms.map(r => r.code);

try {
  const w = client('İzleyen'), a = client('Ayşe'), b = client('Bora'), p = client('Pelin');
  await Promise.all([w.ready, a.ready, b.ready, p.ready]);
  const start = await list(w);

  // Herkese açık oda listelenir (değişince izleyene kendiliğinden gelir); listede yalnızca açık bilgiler var.
  const pushed = w.next(m => m.t === 'rooms' && m.rooms.some(r => r.host === 'Ayşe'));
  a.send({ t: 'create', level: 'hard' });
  const la = await a.wait(m => m.t === 'lobby');
  assert.equal(la.private, false, 'oda varsayılan olarak herkese açık');
  const ra = (await pushed).rooms.find(r => r.code === la.code);
  assert.deepEqual(ra, { code: la.code, host: 'Ayşe', n: 1, level: 'hard', state: 'lobby' }, 'liste satırı yalnızca kod, kuran, kişi, zorluk, durum');

  // Özel oda listede yok.
  p.send({ t: 'create', level: 'easy', private: true });
  const lp = await p.wait(m => m.t === 'lobby');
  assert.equal(lp.private, true);
  await sleep(400);
  assert.ok(!codes(await list(w)).includes(lp.code), 'özel oda listede görünmez');
  // Özel odaya kodla yine katılınır.
  const k = client('Kenan'); await k.ready;
  k.send({ t: 'join', code: lp.code });
  await k.wait(m => m.t === 'lobby' && m.code === lp.code);
  k.send({ t: 'leave' });

  // Hızlı katıl: ikinci oyuncu ilk oyuncunun odasına oturur (özel odaya değil).
  b.send({ t: 'quick', level: 'easy' });
  const lb = await b.wait(m => m.t === 'lobby');
  assert.equal(lb.code, la.code, 'Hızlı katıl açık odaya oturtur');
  assert.equal(lb.seats.filter(Boolean).length, 2);
  await w.wait(m => m.t === 'rooms' && m.rooms.some(r => r.code === la.code && r.n === 2));

  // Kuran lobide özel yapınca listeden düşer, açınca geri gelir.
  a.send({ t: 'settings', private: true });
  await a.wait(m => m.t === 'lobby' && m.private === true);
  await sleep(400);
  assert.ok(!codes(await list(w)).includes(la.code), 'sonradan özel yapılan oda listeden düşer');
  a.send({ t: 'settings', private: false });
  await a.next(m => m.t === 'lobby' && m.private === false, 4000);
  await sleep(400);
  assert.ok(codes(await list(w)).includes(la.code), 'yeniden herkese açılan oda listeye döner');

  // Oyun başlayan oda listeden düşer; listede tur bilgisi yok.
  a.send({ t: 'start' });
  const round = await a.wait(m => m.t === 'round');
  await sleep(400);
  const during = await list(w);
  assert.ok(!codes(during).includes(la.code), 'oyunu başlamış oda listede yok');
  const text = JSON.stringify(during);
  for (const word of ['role', 'criminal', 'prosecutor', 'detective', 'score', 'known', round.names[3]]) assert.ok(!text.includes(word), `listede "${word}" yok`);

  // Uygun oda yokken Hızlı katıl yeni herkese açık oda kurar; oyundaki odaya da özel odaya da girmez.
  const c = client('Cemre'); await c.ready;
  for (const r of await list(w)) assert.ok(r.code !== la.code && r.code !== lp.code);
  const before = codes(await list(w));
  c.send({ t: 'quick', level: 'normal' });
  const lc = await c.wait(m => m.t === 'lobby');
  if (!before.length) {
    assert.ok(![la.code, lp.code].includes(lc.code), 'yeni oda kurulur');
    assert.equal(lc.hostId, c.id, 'Hızlı katıl kuranı odanın sahibidir');
    assert.equal(lc.private, false, 'Hızlı katıl odası herkese açık');
  }
  await sleep(400);
  assert.ok(codes(await list(w)).includes(lc.code));

  // Dolu oda listede yok ve Hızlı katıl'a girmez.
  const fill = [];
  for (let i = lc.seats.filter(Boolean).length; i < 10; i++) fill.push(client('Dolduran' + i));
  await Promise.all(fill.map(f => f.ready));
  for (const f of fill) { f.send({ t: 'join', code: lc.code }); await f.wait(m => m.t === 'lobby' && m.code === lc.code); }
  await sleep(400);
  assert.ok(!codes(await list(w)).includes(lc.code), 'dolu oda listede yok');
  const d = client('Deniz'); await d.ready;
  d.send({ t: 'quick' });
  const ld = await d.wait(m => m.t === 'lobby');
  assert.notEqual(ld.code, lc.code, 'Hızlı katıl dolu odaya girmez');
  d.send({ t: 'join', code: lc.code });
  assert.equal((await d.wait(m => m.t === 'error')).msg, 'Oda dolu');

  // Çevrim içi mesajı açık oda sayısını taşır; boşalan oda listeden kalkar.
  const on = await w.wait(m => m.t === 'on' && typeof m.open === 'number', 5000);
  assert.ok(on.open >= 0);
  d.ws.close();
  await sleep(500);
  assert.ok(!codes(await list(w)).includes(ld.code), 'boşalan oda kapanır, listeden kalkar');
  assert.equal(start.filter(r => [la.code, lc.code].includes(r.code)).length, 0);
  console.log('acik-odalar: tamam');
} finally {
  for (const c of all) try { c.ws.close(); } catch { /* yok */ }
}
