/**
 * Ağ sözlüğü: istemci ile sunucunun ortak mesaj adları. Metin çerçeveler JSON ({ t: <ad>, ... }), karakter konumları
 * ikili paket (bkz. snapshot.js). Sunucu otoriterdir: istemci yalnızca girdi yollar, durum ve olay alır.
 *
 * Gizli kimlik oyunu olduğu için sunucu her istemciye **yalnızca onun bilebileceğini** yollar: konum ve görünüş herkese
 * açıktır (haritada da görünür), roller yalnızca tanıdıkların için gelir, izler yalnızca kendi rolünün izleridir ve
 * görüş alanındadır, ele verilen savcılar yalnızca suçlulara gider, özel bildirimler yalnızca sahibine.
 */
export const C2S = {
  HELLO: 'hello',       // { nick, token } — bağlantı kimliği; token varsa eski koltuğa geri bağlanır
  CREATE: 'create',     // { level, private } — oda kur (kuran odanın sahibidir; private: listede görünmez, yalnız kodla)
  JOIN: 'join',         // { code }
  QUICK: 'quick',       // { level } — hızlı katıl: en dolu açık odaya otur, yoksa yeni herkese açık oda kur
  ROOMS: 'rooms',       // açık oda listesini hemen iste (odada olmayan bağlantıya liste değişince zaten kendiliğinden gelir)
  SEAT: 'seat',         // { seat } — lobide boş koltuğa geç
  MOVE: 'move',         // { id, seat } — yalnızca kuran, lobide: oyuncuyu koltuğa taşı (dolu koltukta ikisi yer değiştirir)
  SETTINGS: 'settings', // { level?, private? } — yalnızca kuran, lobide
  START: 'start',       // yalnızca kuran
  LEAVE: 'leave',
  INPUT: 'in',          // { dx, dz, sp, a: { use, swap, jump, dash, carry, blend, cycle } } — hareket ve tek seferlik eylemler
  PING: 'ping',
};
export const S2C = {
  WELCOME: 'welcome',   // { id, token, nick }
  LOBBY: 'lobby',       // { code, hostId, level, state, private, seats: [{ seat, id, nick, online } | null] }
  ROOMS: 'rooms',       // { rooms: [{ code, host, n, level, state }] } — lobideki herkese açık odalar (n = 10: DOLU), en çok 20
  ERROR: 'error',       // { kod, msg } — kod dil bağımsızdır (istemci t('sunucu.' + kod)), msg Türkçe yedek
  ROUND: 'round',       // yeni tur: { round, you, role, known: [[id, rol]], names, scores, history, intro }
  STATE: 'st',          // her pakette, istemciye özel: süre, evre, işaretler, izler, efektler, kendi sayaçların, olaylar
  RESULT: 'result',     // tur sonu: { result, scores, history, final, next }
  PONG: 'pong',
  ONLINE: 'on',         // { n, open } — sitede açık sekme sayısı ve katılınabilen herkese açık oda sayısı
};
export const NET = {
  /** Simülasyon adımı ve durum paketi sıklığı (sn): 20 adım/sn, 10 paket/sn. */
  tick: 0.05, snapshotEvery: 2,
  /** İstemci hareket girdisi gönderim aralığı (sn; eylemler beklemeden gider) ve geriden ara değerle izleme (sn). */
  inputEvery: 0.05, interpDelay: 0.1,
  /** Cloudflare boşta bağlantıyı kesmesin: bu aralıkta ping (sn). */
  keepAlive: 20,
  /** Tur girişi (rolünü oku, kimse kıpırdamaz) ve tur sonu tablosu (sonraki tura kadar) süreleri (sn). */
  intro: 6, result: 16,
  /** Sunucu saatinin yumuşatması ve doğrudan kurulduğu sapma (sn). */
  clockSmooth: 0.12, clockJump: 0.5,
  /**
   * Kendi karakterin beklemez: başkaları interpDelay geriden çizilir, seninkine yalnızca yerel girdiden üretilen bir
   * ileri kayma eklenir (yumuşatma süresi ve en çok kaç birim). Paketle konuşmadığı için zonklama yapmaz.
   */
  leadSmooth: 0.09, leadMax: 1.4,
};
export const LEVEL_KEYS = ['easy', 'normal', 'hard'];
export const SEATS = 10;
export const roomCode = () => {
  const A = 'ABCDEFGHJKLMNPRSTUVYZ', D = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return `${s}-${D[Math.floor(Math.random() * D.length)]}`;
};
/** Kod girişi: büyük harf, harf ve rakam dışı atılır; tiresiz yazılan `KPRT4` → `KPRT-4`. */
export const normalizeCode = v => {
  const s = String(v ?? '').toLocaleUpperCase('tr').replace(/\u0130/g, 'I').replace(/[^A-Z0-9]/g, '');
  return s.length === 5 ? `${s.slice(0, 4)}-${s[4]}` : s;
};
