// Açık odalar ve oda standardı duman testi (tarayıcısız): oda listesi, Hızlı katıl, özel oda, kod, kuranın taşıması.
// Sınananlar: herkese açık oda listede görünür, özel oda görünmez (kurarken de sonradan lobide seçilince de); liste
// odada olmayan bağlantıya istemeden gelir (karşılamada ve değişince); Hızlı katıl ikinci oyuncuyu ilk oyuncunun odasına
// oturtur, uygun oda yoksa yeni herkese açık oda kurar; oyunu başlamış oda listede yoktur, katılınmaz ("Maç başlamış");
// dolu oda listede n = 10 (DOLU) olarak kalır ama Hızlı katıl'a girmez; listede yalnızca lobideki odanın herkese açık
// bilgisi vardır (rol, skor, tur bilgisi yok); kod küçük harfle ve tiresiz de tutar (kprt4 → KPRT-4); kuran oyuncuyu boş
// koltuğa taşır, dolu koltukta yer değiştirir, kuran olmayanın taşıması yok sayılır; lobide kopan aynı token'la aynı
// koltuğa döner; çevrim içi mesajı açık oda sayısını taşır.
// GAME_URL ile çalışan bir sunucuya bağlanır (npm test kendisi açar).
import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = (process.env.GAME_URL || 'http://127.0.0.1:5197').replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = [];

function client(nick, token = '') {
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
  c.ready = new Promise(r => ws.on('open', () => { c.send({ t: 'hello', nick, token }); r(); }))
    .then(() => c.wait(m => m.t === 'welcome')).then(w => { c.id = w.id; c.token = w.token; });
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
  const w = client('İzleyen'), a = client('Ayşe'), b = client('Bora'), p = client('Pelin'), s = client('Sessiz');
  await Promise.all([w.ready, a.ready, b.ready, p.ready, s.ready]);
  // Liste istemeden gelir: karşılamayla birlikte, sonra her değişince (istemci yoklamaz).
  await s.wait(m => m.t === 'rooms');
  const silentPush = s.next(m => m.t === 'rooms' && m.rooms.some(r => r.host === 'Ayşe'));
  const start = await list(w);

  // Herkese açık oda listelenir (değişince izleyene kendiliğinden gelir); listede yalnızca açık bilgiler var.
  const pushed = w.next(m => m.t === 'rooms' && m.rooms.some(r => r.host === 'Ayşe'));
  a.send({ t: 'create', level: 'hard' });
  const la = await a.wait(m => m.t === 'lobby');
  assert.equal(la.private, false, 'oda varsayılan olarak herkese açık');
  const ra = (await pushed).rooms.find(r => r.code === la.code);
  assert.deepEqual(ra, { code: la.code, host: 'Ayşe', n: 1, level: 'hard', state: 'lobby' }, 'liste satırı yalnızca kod, kuran, kişi, zorluk, durum');
  await silentPush; // hiç istemeyen boştaki bağlantıya da gelir

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
  // Maç sürerken katılınmaz (İz Peşinde'de maç ortası katılma yok); kod tiresiz ve küçük harfle de tanınır.
  const late = client('Geç'); await late.ready;
  late.send({ t: 'join', code: la.code.replace('-', '').toLowerCase() });
  assert.equal((await late.wait(m => m.t === 'error')).msg, 'Maç başlamış');
  late.mark = late.msgs.length;
  late.send({ t: 'join', code: lp.code.replace('-', '').toLowerCase() });
  await late.wait(m => m.t === 'lobby' && m.code === lp.code);
  late.mark = 0;
  late.send({ t: 'leave' });

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

  // Dolu oda listede DOLU (n = 10) olarak kalır ama Hızlı katıl'a girmez.
  const fill = [];
  for (let i = lc.seats.filter(Boolean).length; i < 10; i++) fill.push(client('Dolduran' + i));
  await Promise.all(fill.map(f => f.ready));
  for (const f of fill) { f.send({ t: 'join', code: lc.code }); await f.wait(m => m.t === 'lobby' && m.code === lc.code); }
  await sleep(400);
  assert.equal((await list(w)).find(r => r.code === lc.code)?.n, 10, 'dolu oda listede n = 10 (DOLU) olarak görünür');
  const d = client('Deniz'); await d.ready;
  d.send({ t: 'quick' });
  const ld = await d.wait(m => m.t === 'lobby');
  assert.notEqual(ld.code, lc.code, 'Hızlı katıl dolu odaya girmez');
  d.send({ t: 'join', code: lc.code });
  assert.equal((await d.wait(m => m.t === 'error')).msg, 'Oda dolu');

  // Çevrim içi mesajı açık oda sayısını taşır; boşalan oda listeden kalkar.
  const on = await w.wait(m => m.t === 'on' && typeof m.open === 'number', 5000);
  assert.ok(on.open >= 0);
  // Lobide kopan (sayfayı yenileyen) oyuncunun koltuğu kısa süre tutulur: aynı token'la aynı koltuğa, kuran olarak döner.
  const seatD = ld.seats.findIndex(x => x && x.id === d.id);
  d.ws.close();
  await sleep(500);
  assert.ok(codes(await list(w)).includes(ld.code), 'lobide kopanın odası hemen kapanmaz');
  const d2 = client('Deniz', d.token); await d2.ready;
  const back = await d2.wait(m => m.t === 'lobby' && m.code === ld.code);
  assert.equal(d2.id, d.id, 'aynı kimlik');
  assert.equal(back.seats[seatD]?.id, d.id, 'aynı koltuk');
  assert.equal(back.hostId, d.id, 'kuranlık kalır');
  assert.equal(back.seats[seatD].online, true);
  // Odadan çıkan son kişiyle oda kapanır, listeden kalkar.
  d2.send({ t: 'leave' });
  await sleep(500);
  assert.ok(!codes(await list(w)).includes(ld.code), 'boşalan oda kapanır, listeden kalkar');
  assert.equal(start.filter(r => [la.code, lc.code].includes(r.code)).length, 0);

  // Kuranın taşıması: boş koltuğa taşır, dolu koltukta ikisi yer değiştirir; kuran olmayanınki yok sayılır.
  const x = client('Kuran'), y = client('Yavuz'), z = client('Zehra');
  await Promise.all([x.ready, y.ready, z.ready]);
  x.send({ t: 'create', level: 'normal', private: true });
  const lx = await x.wait(m => m.t === 'lobby');
  for (const q of [y, z]) { q.send({ t: 'join', code: lx.code }); await q.wait(m => m.t === 'lobby' && m.code === lx.code); }
  await x.wait(m => m.t === 'lobby' && m.seats[1]?.id === y.id && m.seats[2]?.id === z.id);
  y.send({ t: 'move', id: z.id, seat: 6 });
  x.mark = x.msgs.length;
  x.send({ t: 'move', id: y.id, seat: 5 });
  const m1 = await x.wait(m => m.t === 'lobby' && m.seats[5]?.id === y.id); x.mark = 0;
  assert.equal(m1.seats[1], null, 'taşınanın eski koltuğu boşalır');
  assert.equal(m1.seats[2]?.id, z.id, 'kuran olmayanın taşıması yok sayılır');
  assert.equal(m1.seats[6], null);
  x.mark = x.msgs.length;
  x.send({ t: 'move', id: z.id, seat: 5 });
  const m2 = await x.wait(m => m.t === 'lobby' && m.seats[5]?.id === z.id); x.mark = 0;
  assert.equal(m2.seats[2]?.id, y.id, 'dolu koltuğa bırakılınca ikisi yer değiştirir');
  // Taşınan oyuncu yeni koltuğundan oynar.
  x.send({ t: 'start' });
  assert.equal((await y.wait(m => m.t === 'round')).you, 2);
  assert.equal((await z.wait(m => m.t === 'round')).you, 5);
  console.log('acik-odalar: tamam');
} finally {
  for (const c of all) try { c.ws.close(); } catch { /* yok */ }
}
