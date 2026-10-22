import { CFG } from './config.js';
import { setGoal } from './crowd.js';
import { dist, safe } from './physics.js';
import { emit } from './roster.js';
import { createWorld, startRound } from './world.js';

/**
 * **Son Takip gösterisi** (`?gosteri=son-takip`, yalnız tarayıcıda): içerik videosu için sahnelenmiş tek bir sahne.
 * Normal oyun, çevrim içi oda ve testler bu dosyadan hiç etkilenmez; kip yalnız URL parametresiyle açılır ve
 * simülasyonun kurallarını değiştirmez — yalnızca turun başlangıç durumunu kurar ve iki karakteri (savcı ile ikinci
 * suçluyu) betikle sürer. İzler, yakalama, puanlar, kafes animasyonu ve tur sonu ekranı oyunun kendi kodudur.
 *
 * Sahne: turun **son 30 saniyesi** (izler en sık: 2 sn arayla, 1 sn geriden — bkz. CFG.trace.schedule). Birinci suçlu
 * çoktan yakalanmış, bir savcı ve dört dedektif öldürülmüştür (HUD'daki suçlu / savcı / dedektif kutuları bunu
 * gösterir). Hayatta kalan savcı oyuncunun karakteridir: ikinci suçlunun **Kuzey korusundaki odunluktan** bıraktığı
 * izleri **pazar meydanına** kadar sürer ve `yakalama` saniyesinde yakalar. Yakalamanın hemen ardından kafes iner
 * (oyunun elenme sahnesi, bkz. main.js FATE ve view/effects.js), `cozulme` saniyesinde tur sonu ekranı açılır.
 *
 * Zamanlama müzikle eşleşir (`calisma/icerik/muzik/short/short-iz-pesinde-son-takip.mp3`): 16,0 sn yakalama,
 * 16,5 sn parmaklıkların inişi, 18 sn çözülme. Sahnenin saati `world.time`dır, yani simülasyon adımının kendi
 * saatidir: kare hızından bağımsızdır ve kare kare çekimde de aynı saniyelere düşer.
 */
export const SON_TAKIP = {
  seed: 20261005,
  /** Sahne turun son 30 saniyesinde geçer. */
  kalan: 30,
  /** Sabit rol dağıtımı: 0 oyuncu savcı, 1 yakalanmış suçlu, 2 takip edilen suçlu, 3 ölü savcı, 4-7 ölü dedektif. */
  roller: ['prosecutor', 'criminal', 'criminal', 'prosecutor', 'detective', 'detective', 'detective', 'detective', 'detective', 'detective'],
  suclu: 2, yakalanan: 1, oluler: [3, 4, 5, 6, 7],
  /** Odunluk (Kuzey korusu) ile pazar meydanı: suçlunun kaçış hattı. */
  kacis: { x: -56, z: -50 },
  hedef: { x: 3, z: 4 },
  /** Yol üstünde ve iki uçta duran ölüler: turun geri kalanının hikâyesi kadrajda görünür. */
  cesetler: [[-58, -43], [-48, -38], [-34, -33], [-17, -14], [5, -9]],
  /** Hayatta kalan iki dedektif pazarın çevresinde. */
  dedektifler: [[-21, 3], [13, -13]],
  /** Yakalanmış birinci suçlu pazarda, elleri havada bekler. */
  tutuklu: { x: -7, z: 7 },
  /** Müzik işaretleri (sahne saniyesi): yakalama · parmaklıkların inişi · tur sonu ekranı. */
  yakalama: 16, parmaklik: 16.5, cozulme: 18,
  /**
   * Kafesin ağır çekimi. Oyunun elenme sahnesi 0,7 sn'de iner (bkz. main.js FATE, view/effects.js); müzikte
   * parmaklıkların inişi üç alçak darbeye (16,5 · 17 · 17,5 sn) yayılmıştır. Sahne kafesin saatini bu çarpanla
   * yavaşlatır: yakalamadan 0,7/0,48 ≈ 1,45 sn sonra, yani ~17,5'te kafes yere oturur. Oyunun kendi hızı değişmez.
   */
  kafesAgir: 0.48,
  /** Takip arası: `kapanis` saniye kala `ara`dan `sonAra`ya kapanır (savcı koşmaya başlar). */
  ara: 9.5, sonAra: 2, kapanis: 4,
  /** Dikey kadrajda (9:16) kaçış hattı ekranın dikeyine düşer; yakınlaştırma oyundakinden biraz daha yakın. */
  zoom: 21,
};

/** Açık gösteri sahnesi (yoksa null). Şimdilik tek sahne var: `?gosteri=son-takip`. */
export const gosteriKipi = () => new URLSearchParams(location.search).get('gosteri');

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

/**
 * Sahneyi kurar ve sürücüsünü döndürür. `world` oyunun normal dünyasıdır (createWorld + startRound); sahne yalnızca
 * rolleri, konumları ve tur saatini yazar.
 *  - `girdi(dt)` her adımdan **önce**: suçlunun rotasını korur, savcının o karedeki girdisini üretir (yakalama da
 *    girdiyle, oyunun kendi `arrest` kuralından geçerek olur).
 *  - `sahne(app, time)` her adımdan **sonra**: yakalamanın ardından kafesi başlatır ve çözülmede tur sonu ekranını
 *    serbest bırakır (`app.fate`, bkz. main.js fateUpdate).
 */
export function createSonTakip(K = SON_TAKIP) {
  const world = createWorld({ seed: K.seed, level: 'normal', humans: [0] });
  startRound(world, 'prosecutor');
  const savci = world.actors[0], suclu = world.actors[K.suclu];

  // Roller sahnenin istediği gibi sabitlenir; tanıdıklar (suçlular birbirini, kanun savcıları tanır) yeniden kurulur.
  world.actors.slice(0, 10).forEach((a, i) => { a.role = K.roller[i]; a.known = new Set(); a.suspects = new Map(); a.path = []; a.goal = null; });
  for (const a of world.actors.slice(0, 10)) {
    for (const b of world.actors.slice(0, 10)) {
      if (a.id !== b.id && ((a.role === 'criminal' && b.role === 'criminal') || (a.role !== 'criminal' && b.role === 'prosecutor'))) a.known.add(b.id);
    }
  }

  // Turun son 30 saniyesi: saat ileri alınır, izler en sık aralığa düşer ve ilk iz hemen gelir.
  world.time = CFG.seconds - K.kalan;
  suclu.traceClock = 0.6;
  Object.assign(suclu, safe(world.env, K.kacis.x, K.kacis.z));
  suclu.facing = Math.atan2(K.hedef.x - suclu.x, K.hedef.z - suclu.z);
  // Savcı, suçlunun tam `ara` kadar gerisinde: aradaki izler ikisinin arasında kalır.
  Object.assign(savci, safe(world.env, suclu.x - Math.sin(suclu.facing) * K.ara, suclu.z - Math.cos(suclu.facing) * K.ara));
  savci.facing = suclu.facing;

  // Birinci suçlu yakalanmış; bir savcı ve dört dedektif öldürülmüş.
  const tutuklu = world.actors[K.yakalanan];
  Object.assign(tutuklu, safe(world.env, K.tutuklu.x, K.tutuklu.z), { caught: true, caughtAt: world.time - 90, action: null });
  K.oluler.forEach((id, i) => {
    const a = world.actors[id], [x, z] = K.cesetler[i];
    Object.assign(a, safe(world.env, x, z), { alive: false, action: null, path: [], facing: suclu.facing });
  });
  world.actors.slice(0, 10).filter(a => a.alive && !a.caught && a.role === 'detective')
    .forEach((a, i) => Object.assign(a, safe(world.env, ...(K.dedektifler[i] || [0, 0]))));

  world.events = [];
  emit(world, 'gosteriSon30', 'clue');
  emit(world, 'gosteriDurum', 'danger');

  // Sahnenin saati ayrı tutulur: yakalamayla tur biter, `world.time` donar ama kafes ile tur sonu ekranı sonra gelir.
  let saniye = 0, yakalandiAt = 0, cozuldu = false;
  const saat = () => saniye;
  /** Takip arası: yakalamaya `kapanis` saniye kala `ara`dan `sonAra`ya iner. */
  const araSn = t => {
    const k = (t - (K.yakalama - K.kapanis)) / K.kapanis;
    return K.ara + (K.sonAra - K.ara) * Math.max(0, Math.min(1, k));
  };

  return {
    world, zoom: K.zoom,
    /** Sahnenin saati (sn): simülasyon adımının saatidir, kare hızından bağımsızdır. */
    get saniye() { return saat(); },
    get yakalandi() { return suclu.caught; },
    girdi(dt) {
      // Simülasyon adımıyla aynı üst sınır (bkz. world.js step): sekmeler arası duraklamada sahne ileri kaçmaz.
      // Alt sınır da var: ilk karede `requestAnimationFrame`in damgası kurulum anından **önce** olabiliyor, yani
      // dt eksi geliyor; sahnenin saati bir salise bile geri gitmemeli (müzikle kare kare eşleşiyor).
      saniye += Math.max(0, Math.min(dt, 0.05));
      const t = saat();
      // Suçlu pazara yürür: kendi yapay zekâsı (iş noktası seçmek, kılık değiştirmek) bu sahnede çalışmaz.
      suclu.think = 99; suclu.wait = 0; suclu.hurry = false;
      if (!suclu.path.length && !suclu.caught) setGoal(world, suclu, K.hedef);
      if (!suclu.caught && !suclu.path.length) suclu.goal = null;
      if (suclu.caught || world.result) return {};
      // Savcı izin üstünden gider; hızı aradaki açığa göre, oyunun kendi yürüme / koşma sınırları içinde.
      const hedef = izNoktasi(suclu, araSn(t));
      const d = dist(savci, hedef);
      const hiz = Math.max(0, Math.min(CFG.run, suclu.speed + (d - 0.2) * 2));
      const sprint = hiz > CFG.walk;
      const m = d < 1e-3 ? 0 : Math.min(1, hiz / (sprint ? CFG.run : CFG.walk));
      // Yakalama anı: girdiye sol tık konur, kuralı oyunun kendi `arrest`i işletir (menzil, görüş, puan, kafes).
      const use = t >= K.yakalama && dist(savci, suclu) <= CFG.catchRange ? suclu.id : null;
      return { dx: (hedef.x - savci.x) / (d || 1) * m, dz: (hedef.z - savci.z) / (d || 1) * m, sprint, use };
    },
    sahne(app, time) {
      const t = saat();
      if (!suclu.caught || cozuldu) return;
      if (!yakalandiAt) yakalandiAt = t;
      // Parmaklıklar yakalanan suçlunun üstüne iner: oyunun kendi elenme sahnesi (main.js fateUpdate `t`yi
      // `time - fate.at`ten hesaplar), yalnız saati `kafesAgir` çarpanıyla müziğin üç darbesine yayılmış.
      app.fate ??= { kind: 'caught', t: 0, id: suclu.id };
      app.fate.at = time - (t - yakalandiAt) * K.kafesAgir;
      // Çözülme: kafes oturdu, elenme sahnesi biter — kamera savcıya döner, oyunun tur sonu ekranı açılır.
      if (t >= K.cozulme) { app.fate.at = time - 99; cozuldu = true; }
    },
  };
}
