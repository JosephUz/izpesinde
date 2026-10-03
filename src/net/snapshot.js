/**
 * Karakter durum paketi (ikili): bütün karakterlerin konumu, yüksekliği, yönü, hızı, görünüşü ve bayrakları. Rol yoktur;
 * herkese aynı paket gider (konumlar haritada zaten herkese açık). Karakter başına 9 bayt: 180 karakter ~1,6 KB.
 *
 * Başlık: u8 sürüm, u8 tur, f32 oda saati (evreler boyunca hiç durmayan saat: ara değer bunu kullanır), f32 tur saati,
 * u16 karakter sayısı. Karakter: i16 x·100, i16 z·100, u8 y·20, u8 yön (256 adım), u8 hız·10, u8 kıyafet|şapka<<4,
 * u8 bayraklar.
 */
const VERSION = 1, HEAD = 12, PER = 9;
const F = { alive: 1, caught: 2, carry: 4, work: 8, wait: 16 };

export function encodeSnapshot(world, clock) {
  const n = world.actors.length, buf = new ArrayBuffer(HEAD + n * PER), v = new DataView(buf);
  v.setUint8(0, VERSION); v.setUint8(1, world.round); v.setFloat32(2, clock, true); v.setFloat32(6, world.time, true); v.setUint16(10, n, true);
  let o = HEAD;
  for (const a of world.actors) {
    v.setInt16(o, Math.round(a.x * 100), true); v.setInt16(o + 2, Math.round(a.z * 100), true);
    v.setUint8(o + 4, Math.min(255, Math.round(Math.max(0, a.y) * 20)));
    v.setUint8(o + 5, Math.round(((a.facing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 256) & 255);
    v.setUint8(o + 6, Math.min(255, Math.round(a.speed * 10)));
    v.setUint8(o + 7, (a.appearance & 15) | ((a.hat & 3) << 4));
    v.setUint8(o + 8, (a.alive ? F.alive : 0) | (a.caught ? F.caught : 0) | (a.carry ? F.carry : 0) | (a.action ? F.work : 0) | (a.wait > 0 ? F.wait : 0));
    o += PER;
  }
  return new Uint8Array(buf);
}

/** Paketi düz dizilere açar (ara değer için iki paket yan yana tutulur). */
export function decodeSnapshot(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint8(0) !== VERSION) return null;
  const n = v.getUint16(10, true), s = {
    round: v.getUint8(1), clock: v.getFloat32(2, true), time: v.getFloat32(6, true), n,
    x: new Float32Array(n), z: new Float32Array(n), y: new Float32Array(n), facing: new Float32Array(n), speed: new Float32Array(n),
    look: new Uint8Array(n), flags: new Uint8Array(n),
  };
  let o = HEAD;
  for (let i = 0; i < n; i++) {
    s.x[i] = v.getInt16(o, true) / 100; s.z[i] = v.getInt16(o + 2, true) / 100; s.y[i] = v.getUint8(o + 4) / 20;
    s.facing[i] = v.getUint8(o + 5) / 256 * 2 * Math.PI; s.speed[i] = v.getUint8(o + 6) / 10;
    s.look[i] = v.getUint8(o + 7); s.flags[i] = v.getUint8(o + 8);
    o += PER;
  }
  return s;
}

/** Paketin ayrık alanlarını (görünüş ve bayraklar) karaktere yazar. */
export function applyLook(a, look, flags) {
  a.appearance = look & 15; a.hat = (look >> 4) & 3;
  a.alive = Boolean(flags & F.alive); a.caught = Boolean(flags & F.caught); a.carry = Boolean(flags & F.carry);
  a.action = flags & F.work ? (a.action || { type: 'work' }) : null; a.wait = flags & F.wait ? 1 : 0;
}
