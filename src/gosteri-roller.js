import { CFG } from './config.js';
import { REGIONS } from './environment.js';
import { blocked, dist, route, safe } from './physics.js';
import { emit } from './roster.js';
import { createWorld, startRound } from './world.js';

/**
 * **Üç rol gösterisi** (`?gosteri=roller`, yalnız tarayıcıda): içerik videosu için sahnelenmiş tek bir tur. Normal
 * oyun, çevrim içi oda ve testler bu dosyadan hiç etkilenmez; kip yalnız URL parametresiyle açılır ve simülasyonun
 * kurallarını değiştirmez — yalnızca turun başlangıç durumunu kurar, üç yarışmacının girdisini betikle üretir ve
 * kamerayı sırayla o üç rolün gözüne bağlar. İzler, kılık, işaret, yakalama, kafes ve puanlar oyunun kendi kodudur.
 *
 * Sahne, turun **son 45 saniyesinin** ilk 37'sidir: izler en sık aralıktadır (2 sn arayla, 1 sn geriden — bkz.
 * CFG.trace.schedule), yani suçlunun arkasında neredeyse hep taze bir iz durur. Kamera:
 *
 * | Sn | Göz | Ne olur |
 * | --- | --- | --- |
 * | 0 – 9,23 | **suçlu** | Kuzey korusunda kalabalığa karışır (F ile çalışır), bir kasabalının kılığına girer (Q), arkasında iz bırakır |
 * | 9,23 – 18,46 | **savcı** | Odunluktan düşen savcı izlerini sürer |
 * | 18,46 – 23,08 | **dedektif** | Suçluyu görür ve sol tıkla işaretler (21,45) |
 * | 23,08 – 32,31 | **savcı** | İşaretin peşinde koşar, aradaki açığı kapatır |
 * | 32,31 – 37,11 | suçlu (kafes) | Sol tık: yakalama; oyunun kendi elenme sahnesi — kafes iner, kamera uzaklaşır |
 *
 * Saniyeler müziğin işaretleridir (`calisma/icerik/muzik/short/short-iz-pesinde-suclu-savci-dedektif.mp3`,
 * liste.json `isaretler`). Sahnenin saati `saniye`dir: simülasyon adımının saatidir, kare hızından bağımsızdır,
 * kare kare çekimde de aynı saniyelere düşer.
 *
 * Suçlunun yeri **zamanın fonksiyonudur**: yol noktalarının her birinin varış saati bellidir (`YOL`), suçlu her
 * karede o saatin gerektirdiği noktaya yürür. Böylece sahne hızdan, çarpışmadan ve kalabalığın itmesinden bağımsız
 * olarak hep aynı saniyede aynı yerdedir. Savcı ise suçlunun **izinin** üstünden, açığı güdümlü kapanan bir
 * aralıkla gider (bkz. `araSn`): yakalama girdisi tam `yakalama` saniyesinde konur, kuralı oyunun `arrest`i işletir.
 */

/** Suçlunun yolu: nokta ve o noktaya varış saati (sn). Aynı nokta iki kez = orada bekler (kalabalığa karışır). */
const YOL = [
  // Kuzey korusu: ağaçların arasında odunluğa doğru (suçlu gözünden)
  { x: -58, z: -46, t: 0 },
  { x: -54.5, z: -41.5, t: 2.3 },
  { x: -50.5, z: -48.5, t: 4.5 },
  { x: -49.5, z: -50, t: 5.4 },
  { x: -49.5, z: -50, t: 7.8 }, // odun kesme noktasında çalışır (F)
  { x: -44, z: -42, t: 10.3 },
  // Koruyu bırakıp güneydoğuya, hana doğru (savcı gözünden)
  { x: -38, z: -33.5, t: 12.8 },
  { x: -33, z: -27, t: 14.7 },
  { x: -33, z: -27, t: 16.4 }, // bir an durup arkasına bakar
  { x: -27.5, z: -20, t: 18.5 },
  // Hanın önünden pazara (dedektif gözünden)
  { x: -27.5, z: -12.5, t: 20.3 },
  { x: -21, z: -9, t: 22.0 },
  { x: -14.5, z: -5.5, t: 23.6 },
  // Pazar meydanı: kalabalığın içine dalar (savcı gözünden, doruk)
  { x: -7, z: -1.5, t: 25.4 },
  { x: 0.5, z: 2, t: 27.2 },
  { x: 7, z: 4.5, t: 28.8 },
  { x: 10, z: -1, t: 30.6 },
  { x: 5, z: -6, t: 32.4 },
  { x: 0.5, z: -9, t: 33.8 },
];

/**
 * Dedektifin yolu: hanla pazar arasındaki açıklığa çıkar, durup yolu gözler, sonra korudan inen şüphelinin üstüne
 * birkaç adım atar (işaret o anda düşer). Yoldan 6-7 birim uzakta durur: suçlunun önünü kesmez, çarpışmaz.
 */
const DEDEKTIF_YOLU = [
  { x: -10, z: 6, t: 0 },
  { x: -15, z: 2, t: 11 },
  { x: -17, z: -1, t: 16.5 },
  { x: -17, z: -1, t: 18.9 },
  { x: -20, z: -4.5, t: 21.3 },
  { x: -20, z: -4.5, t: 40 },
];

export const ROLLER = {
  seed: 20261007,
  /** Sahne turun son 45 saniyesinde geçer: izler en sık aralıkta, tur sahne bitmeden dolmaz. */
  kalan: 45,
  /** Sabit rol dağıtımı: 0 savcı (oyuncu), 1 suçlu, 2 dedektif, 3 ikinci suçlu (uzakta, bot). */
  roller: ['prosecutor', 'criminal', 'detective', 'criminal', 'prosecutor', 'detective', 'detective', 'detective', 'detective', 'detective'],
  savci: 0, suclu: 1, dedektif: 2, ikinci: 3,
  /**
   * Sahnenin dışındaki yarışmacılar (ikinci suçlu, ikinci savcı, beş dedektif) kasabanın öbür ucuna, kendi
   * bölgelerine konur: biri korudan pazara giden hattın üstünde kalırsa suçluyu sahneden önce işaretleyebilir
   * (dedektifin işareti sahnenin doruğudur) ve ikinci suçlu da yakalanırsa tur yakalama anında biterdi.
   * Bu yedisinin karar saati durdurulur: kendi bölgelerinde beklerler, hiçbiri kadraja girmez — kasabanın görünen
   * hayatını zaten 170 kişilik kalabalık sürdürür.
   * `[yarışmacı, bölge]` — bölge numarası REGIONS'tır (1 tarla, 3 maden, 4 değirmen).
   */
  uzaktakiler: [[3, 4], [4, 3], [5, 1], [6, 3], [7, 4], [8, 1], [9, 3]],
  yol: YOL, dedektifYolu: DEDEKTIF_YOLU,
  /** Müzik işaretleri (sahne saniyesi): rol geçişleri ve yakalama. */
  isaret: { suclu: 0, savci: 9.23, dedektif: 18.46, kovalama: 23.08, yakalama: 32.31, son: 37.11 },
  /** Suçlunun kılık değiştirdiği (Q) ve dedektifin işaretlediği (sol tık) saniyeler. */
  kilik: 4.6, isaretleme: 21.45,
  /** Savcının takip arası: `kapanis` saniye kala `ara`dan `sonAra`ya iner (savcı koşmaya başlar). */
  ara: 12, sonAra: 1.8, kapanis: 5.5,
  /**
   * Kafesin ağır çekimi. Oyunun elenme sahnesi 0,7 sn'de iner (bkz. main.js FATE, view/effects.js); burada yakalama
   * müziğin son büyük vuruşudur ve kapanış 4,8 sn sürer, o yüzden kafesin saati bu çarpanla yavaşlatılır.
   */
  kafesAgir: 0.42,
  /**
   * Yakınlaştırma (ortografik yarı yükseklik; dikey kadrajda yatay yarı genişlik bunun 0,5625 katıdır). Suçlunun
   * gözünde en yakın (kalabalığın içindeyiz), dedektifte en geniş (uzaktan gelen şüpheli kadraja girsin),
   * yakalamadan sonra sahne `genisleme` saniyede `kapanisZoom`a açılır.
   */
  zoom: { suclu: 19, savci: 21.5, dedektif: 24.5, kovalama: 21.5 },
  kapanisZoom: 24, genisleme: 2.6,
};

/**
 * Ekrandaki direktif yazıları: `[başlangıç, bitiş, metin]` (sahne saniyesi). Aynı anda tek yazı görünür ve her yazı
 * en az 1,5 sn kalır. Tuşlar oyunun kendi kontrol listesinden alınmıştır (bkz. src/screens.js KEYS ve yardım ekranı):
 * suçlu Q ile kılık değiştirir ve sol tıkla öldürür, dedektif sol tıkla işaretler, savcı sol tıkla yakalar, Shift koşar.
 */
export const YAZILAR = [
  [0.35, 3.40, 'SEN SUÇLUSUN · kalabalığa karış'],
  [3.60, 6.30, 'Q: imleçteki kişinin kılığına gir'],
  [6.60, 9.05, 'Dikkat: arkanda iz bırakıyorsun'],
  [9.45, 12.55, 'SEN SAVCISIN · izleri takip et'],
  [12.80, 15.75, 'Savcı izlerini yalnız savcılar görür'],
  [16.00, 18.30, 'İzler odunluktan pazara gidiyor'],
  [18.70, 21.15, 'SEN DEDEKTİFSİN · şüpheliyi bul'],
  [21.30, 22.95, 'Sol tık: İŞARETLE — savcı yakalasın'],
  [23.25, 26.20, 'İşaret düştü: suçluya koş'],
  [26.40, 29.35, 'SHIFT: koş — aradaki açık kapanıyor'],
  [29.60, 32.25, 'Sol tık: YAKALA'],
  [32.45, 35.05, 'YAKALANDI'],
];

/** İki nokta arasındaki düz çizgi engelden geçiyor mu (yarım birim aralıkla örneklenir). */
function duzGider(env, a, b) {
  const n = Math.ceil(dist(a, b) * 2);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (blocked(env, a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false;
  }
  return true;
}

/**
 * Zaman çizelgeli yol: her bölüm için (iki nokta arası) engelsizse düz çizgi, değilse oyunun kendi A* rotası
 * (physics.route) alınır ve bölümün süresi yay uzunluğuna bölüştürülür. Dönen nesnenin `nerede(t)`si, sahnenin
 * t saniyesinde yürüyen kişinin olması gereken noktayı verir; `hiz(t)` o anki gereken hızdır (birim/sn).
 */
function zamanliYol(env, noktalar) {
  const bolumler = [];
  for (let i = 1; i < noktalar.length; i++) {
    const a = noktalar[i - 1], b = noktalar[i];
    const ara = duzGider(env, a, b) ? [a, b] : [a, ...route(env, a, b), b];
    // Üst üste binen noktalar atılır: yay uzunluğu hesabı sıfıra bölmesin.
    const p = ara.filter((q, j) => j === 0 || dist(q, ara[j - 1]) > 0.05);
    if (p.length < 2) p.push({ ...a });
    const uzunluk = p.slice(1).reduce((s, q, j) => s + dist(p[j], q), 0);
    bolumler.push({ t0: a.t, t1: b.t, p, uzunluk, hiz: b.t > a.t ? uzunluk / (b.t - a.t) : 0 });
  }
  const son = noktalar.at(-1);
  const bolumde = t => bolumler.find(b => t < b.t1) || bolumler.at(-1);
  return {
    bolumler,
    /** En hızlı bölümün gereken hızı: kurulumda oyunun yürüme hızını aşmadığı denetlenir. */
    enHizli: Math.max(...bolumler.map(b => b.hiz)),
    hiz: t => (t >= son.t ? 0 : bolumde(t).hiz),
    nerede(t) {
      if (t >= son.t) return { x: son.x, z: son.z };
      const b = bolumde(t);
      let kalan = Math.max(0, Math.min(1, (t - b.t0) / (b.t1 - b.t0 || 1))) * b.uzunluk;
      for (let i = 1; i < b.p.length; i++) {
        const d = dist(b.p[i - 1], b.p[i]);
        if (kalan <= d || i === b.p.length - 1) {
          const k = d > 0 ? Math.max(0, Math.min(1, kalan / d)) : 1;
          return { x: b.p[i - 1].x + (b.p[i].x - b.p[i - 1].x) * k, z: b.p[i - 1].z + (b.p[i].z - b.p[i - 1].z) * k };
        }
        kalan -= d;
      }
      return { x: son.x, z: son.z };
    },
  };
}

/** Suçlunun izinde, ondan `geri` birim arkadaki nokta: savcı tam bastığı yerlere basarak takip eder. */
function izNoktasi(a, geri) {
  let kalan = geri, x = a.x, z = a.z;
  for (let i = a.trail.length - 1; i >= 0; i--) {
    const p = a.trail[i], d = Math.hypot(p.x - x, p.z - z);
    if (d >= kalan) return { x: x + (p.x - x) * (kalan / d), z: z + (p.z - z) * (kalan / d) };
    kalan -= d; x = p.x; z = p.z;
  }
  // İz daha kısa (sahnenin ilk saniyeleri): kalanı suçlunun baktığı yönün tersine uzatılır.
  return { x: x - Math.sin(a.facing) * kalan, z: z - Math.cos(a.facing) * kalan };
}

/** Yürüyen kişinin bu karedeki girdisi: hedef noktaya, oyunun kendi hız sınırları içinde. */
function yuru(a, hedef, dt, kosu = false) {
  const d = dist(a, hedef);
  if (d < 1e-3) return { dx: 0, dz: 0 };
  const tavan = (kosu ? CFG.run : CFG.walk) * Math.max(dt, 1e-3);
  const m = Math.min(1, d / tavan);
  return { dx: (hedef.x - a.x) / d * m, dz: (hedef.z - a.z) / d * m, sprint: kosu };
}

/**
 * Sahneyi kurar ve sürücüsünü döndürür. `world` oyunun normal dünyasıdır (createWorld + startRound); sahne yalnızca
 * rolleri, konumları ve tur saatini yazar. Üç yarışmacı (savcı, suçlu, dedektif) `humans`tır: girdileri her karede
 * `girdi(dt)`den bir Map olarak gelir, yani kılık, işaret ve yakalama oyunun kendi kurallarından geçer.
 *  - `girdi(dt)` her adımdan **önce**: sahnenin saatini ilerletir, üç girdiyi üretir.
 *  - `sahne(app, time)` her adımdan **sonra**: kameranın gözünü ve yakınlığını, ekrandaki yazıyı ve yakalamadan
 *    sonra kafesin saatini yürütür (`app.fate`, bkz. main.js fateUpdate).
 */
export function createRoller(root, K = ROLLER) {
  const world = createWorld({ seed: K.seed, level: 'normal', humans: [K.savci, K.suclu, K.dedektif] });
  startRound(world, 'prosecutor');
  const savci = world.actors[K.savci], suclu = world.actors[K.suclu], dedektif = world.actors[K.dedektif];
  const koru = REGIONS[2];

  // Roller sahnenin istediği gibi sabitlenir; tanıdıklar (suçlular birbirini, kanun savcıları tanır) yeniden kurulur.
  world.actors.slice(0, 10).forEach((a, i) => { a.role = K.roller[i]; a.known = new Set(); a.suspects = new Map(); a.path = []; a.goal = null; });
  for (const a of world.actors.slice(0, 10)) {
    for (const b of world.actors.slice(0, 10)) {
      if (a.id !== b.id && ((a.role === 'criminal' && b.role === 'criminal') || (a.role !== 'criminal' && b.role === 'prosecutor'))) a.known.add(b.id);
    }
  }

  // Turun son 45 saniyesi: saat ileri alınır (izler 2 sn arayla, 1 sn geriden düşer) ve ilk iz hemen gelir.
  world.time = CFG.seconds - K.kalan;
  const sucluYolu = zamanliYol(world.env, K.yol), dedektifYolu = zamanliYol(world.env, K.dedektifYolu);
  Object.assign(suclu, safe(world.env, K.yol[0].x, K.yol[0].z));
  suclu.facing = Math.atan2(K.yol[1].x - suclu.x, K.yol[1].z - suclu.z);
  suclu.traceClock = 0.4;
  // Savcı, suçlunun tam `ara` kadar gerisinde: aradaki izler ikisinin arasında kalır.
  Object.assign(savci, safe(world.env, suclu.x - Math.sin(suclu.facing) * K.ara, suclu.z - Math.cos(suclu.facing) * K.ara));
  savci.facing = suclu.facing;
  Object.assign(dedektif, safe(world.env, K.dedektifYolu[0].x, K.dedektifYolu[0].z));
  // Sahnenin dışındaki yarışmacılar kasabanın öbür ucunda kendi işlerinde (bkz. ROLLER.uzaktakiler).
  for (const [id, bolge] of K.uzaktakiler) {
    const a = world.actors[id], r = REGIONS[bolge], yan = (id % 3 - 1) * 7;
    Object.assign(a, safe(world.env, r.x + yan, r.z + (id % 2 ? 6 : -6)), { region: bolge, think: Infinity, wait: 0, path: [], goal: null });
  }

  // Sahne suçlunun gözünden açılır: HUD ilk kareden itibaren onun rol kartını göstersin (bkz. sahne(), `world.player`).
  world.player = suclu;
  world.events = [];
  emit(world, `Son dakikalar: izler sıklaştı. Bir suçlu ${koru.name.toLocaleLowerCase('tr')}nda.`, 'clue');

  // Sahnenin saati ayrı tutulur: oyunun tur saati yakalamadan sonra da akar, sahne ise kendi çizelgesini izler.
  let saniye = 0, kilikTamam = false, isaretTamam = false, yakalandiAt = 0, sonGoz = null;
  let isaretAt = 0, yakalamaAt = 0, yazi = '', yaziEl = null;
  const saat = () => saniye;
  /** Takip arası: yakalamaya `kapanis` saniye kala `ara`dan `sonAra`ya iner. */
  const araSn = t => {
    const k = (t - (K.isaret.yakalama - K.kapanis)) / K.kapanis;
    return K.ara + (K.sonAra - K.ara) * Math.max(0, Math.min(1, k));
  };
  /** Kameranın o saniyedeki gözü: sırayla suçlu → savcı → dedektif → savcı, yakalamadan sonra suçlu (kafes). */
  const gozSec = t => {
    const I = K.isaret;
    if (t >= I.yakalama + 0.9) return suclu;
    if (t >= I.kovalama) return savci;
    if (t >= I.dedektif) return dedektif;
    if (t >= I.savci) return savci;
    return suclu;
  };

  return {
    world, zoom: K.zoom.suclu, yazilar: YAZILAR,
    /** Sahnenin saati (sn): simülasyon adımının saatidir, kare hızından bağımsızdır. */
    get saniye() { return saat(); },
    get yakalandi() { return suclu.caught; },
    get isaretlendi() { return isaretTamam; },
    get kilikDegisti() { return kilikTamam; },
    /** Çekimin kabul ölçütü bunlara bakar: olaylar müziğin saniyesine düştü mü (bkz. ajanlar/icerik/short-uret.mjs). */
    get isaretAt() { return isaretAt; },
    get yakalamaAt() { return yakalamaAt; },
    get rol() { return gozSec(saat()).role; },
    get yazi() { return yazi; },
    /** Yolun gereken en yüksek hızı: oyunun yürüme hızını aşmamalı (aşarsa sahne saatten geri kalır). */
    get enHizli() { return Math.max(sucluYolu.enHizli, dedektifYolu.enHizli); },
    /** Kameranın baktığı karakter (main.js `eyes`). */
    gozler: () => gozSec(saat()),
    /** Ekranda izleri hangi rolün gözüyle göstereceğimiz: suçlu kendi izini görmez, sahnede görünsün diye savcınınki. */
    izRol: () => (saat() < K.isaret.savci ? 'prosecutor' : null),
    /** Kamera yakınlığı: her rolün kendi yakınlığı, yakalamadan sonra sahne genişler (main.js `zoomTo`). */
    yakinlik() {
      const t = saat(), I = K.isaret;
      const simdi = t >= I.kovalama ? K.zoom.kovalama : t >= I.dedektif ? K.zoom.dedektif : t >= I.savci ? K.zoom.savci : K.zoom.suclu;
      if (t <= I.yakalama) return simdi;
      const k = Math.max(0, Math.min(1, (t - I.yakalama) / K.genisleme));
      return simdi + (K.kapanisZoom - simdi) * k * k * (3 - 2 * k);
    },
    girdi(dt) {
      // Simülasyon adımıyla aynı üst sınır (bkz. world.js step): sekmeler arası duraklamada sahne ileri kaçmaz.
      // Alt sınır da var: ilk karede `requestAnimationFrame`in damgası kurulum anından **önce** olabiliyor, yani
      // dt eksi geliyor; sahnenin saati bir salise bile geri gitmemeli (müzikle kare kare eşleşiyor).
      saniye += Math.max(0, Math.min(dt, 0.05));
      const t = saat(), girdiler = new Map();
      if (world.result) return girdiler;

      // --- Suçlu: zaman çizelgeli yolu yürür; beklediği yerde çalışır (F), bir kez kılık değiştirir (Q).
      const sucluHedef = sucluYolu.nerede(t);
      const s = suclu.caught ? { dx: 0, dz: 0 } : yuru(suclu, sucluHedef, dt);
      if (!suclu.caught) {
        // Durduğu saniyelerde iş noktasındaysa çalışır: kalabalığa karışmanın oyundaki karşılığı.
        if (!suclu.action && sucluYolu.hiz(t) < 0.2 && Math.hypot(s.dx, s.dz) < 0.05) s.blend = true;
        // Kılık: imleç yerine, menzildeki en yakın kasabalı (oyunun kendi `disguise` kuralı işler).
        if (!kilikTamam && t >= K.kilik) {
          const hedef = world.actors.slice(10)
            .filter(b => b.alive && dist(b, suclu) <= CFG.disguiseRange && (b.appearance !== suclu.appearance || b.hat !== suclu.hat))
            .sort((a, b) => dist(suclu, a) - dist(suclu, b))[0];
          if (hedef) { s.swap = hedef.id; kilikTamam = true; }
        }
      }
      girdiler.set(suclu.id, s);

      // --- Dedektif: kavşağa çıkar, durur ve işaretleme saniyesinde sol tıklar (menzil ve görüş kuralı oyunun).
      const d = yuru(dedektif, dedektifYolu.nerede(t), dt);
      if (!isaretTamam && t >= K.isaretleme && dist(dedektif, suclu) <= CFG.markRange) { d.use = suclu.id; }
      girdiler.set(dedektif.id, d);

      // --- Savcı: suçlunun izinin üstünden, güdümlü kapanan bir aralıkla; yakalama tam `yakalama` saniyesinde.
      const hedef = izNoktasi(suclu, araSn(t));
      const uzak = dist(savci, hedef);
      const hiz = Math.max(0, Math.min(CFG.run, suclu.speed + (uzak - 0.2) * 2));
      const sprint = hiz > CFG.walk;
      const m = uzak < 1e-3 ? 0 : Math.min(1, hiz / (sprint ? CFG.run : CFG.walk));
      const p = { dx: (hedef.x - savci.x) / (uzak || 1) * m, dz: (hedef.z - savci.z) / (uzak || 1) * m, sprint };
      if (t >= K.isaret.yakalama && !suclu.caught && dist(savci, suclu) <= CFG.catchRange) p.use = suclu.id;
      girdiler.set(savci.id, p);
      return girdiler;
    },
    sahne(app, time) {
      const t = saat();
      // İşaret sahnenin dedektifinindir: kasabadaki başka bir işaret (başka bir bot) sahneyi tamamlamış saymaz.
      if (!isaretTamam && world.marks.get(suclu.id)?.owner === dedektif.id) { isaretTamam = true; isaretAt = t; }
      if (!yakalamaAt && suclu.caught) yakalamaAt = t;

      // Kamera: gözün değiştiği karede odak zıplar (yumuşak kayma 60 birimlik bir savruluş olurdu).
      const goz = gozSec(t);
      if (goz !== sonGoz) { app.odakSicra = true; sonGoz = goz; }
      // HUD de rolün gözünden okunur (rol kartı, hedef, ölçüler): yakalamadan sonra savcıda kalır, kafes sahnesinde
      // "izleniyor" çubuğu çıkmasın ve oyunun kendi elenme kartı açılmasın diye.
      world.player = t >= K.isaret.kovalama ? savci : goz;

      // Ekrandaki direktif yazısı (aynı anda tek yazı; yeri ve biçimi için bkz. style.css `#iz-gosteri-yazi`).
      // Kutu yalnız burada kurulur: normal oyunun HTML'inde bu öğe yoktur. Kök verilmezse (kural testleri başsız
      // koşar) yalnız `yazi` alanı yürür.
      yazi = YAZILAR.find(([a, b]) => t >= a && t < b)?.[2] || '';
      if (root) {
        yaziEl ??= root.querySelector('#iz-gosteri-yazi') || root.appendChild(Object.assign(document.createElement('div'), { id: 'iz-gosteri-yazi' }));
        if (yaziEl.textContent !== yazi) yaziEl.textContent = yazi;
        yaziEl.hidden = !yazi;
      }

      if (!suclu.caught) return;
      if (!yakalandiAt) yakalandiAt = t;
      // Parmaklıklar yakalanan suçlunun üstüne iner: oyunun kendi elenme sahnesi (main.js fateUpdate `t`yi
      // `time - fate.at`ten hesaplar), yalnız saati `kafesAgir` çarpanıyla müziğin kapanışına yayılmış.
      app.fate ??= { kind: 'caught', t: 0, id: suclu.id };
      app.fate.at = time - (t - yakalandiAt) * K.kafesAgir;
    },
  };
}
