// Tüm ayar sayıları tek yerde. Hız birimi: birim/sn, süreler saniye, mesafeler dünya birimi.

/**
 * Maç ve dünya. Harita kenardan kenara 2 × half birimdir; scale, kasaba yerleşiminin ilk haritaya göre büyütme oranıdır.
 * Kalabalık (crowd) 10 yarışmacının dışındaki sıradan kasabalılardır.
 */
export const CFG = {
  rounds: 5, seconds: 360, crowd: 170, scale: 1.5, half: 102,
  walk: 5.3, run: 8.6, jump: 10, gravity: 23, dash: 22, dashTime: 0.23, dashCooldown: 2.8,
  reach: 2.8,
  /** Herkesin (insan ve bot) görüş yarıçapı: dışı kararır, oradaki karakterler çizilmez ve botlarca bilinmez. */
  vision: 30,
  /**
   * İz: her serbest suçlu `every` saniyede bir iki iz bırakır (dedektif ve savcı türü), `lag` saniye önce durduğu yere.
   * İzi yalnızca o roldekiler, kendi görüş alanında görür; `life` saniye yaşar. Aralık da gecikme de tur ilerledikçe
   * kısalır (`schedule`: tur saati `until` saniyeye kadar): aralık 5 → 4 → 3 → 2 sn, gecikme 5 → 4 → 3 → 2 → 1 sn (son
   * dakika). İkinci suçlunun ilk izi aralığın yarısı kadar kaydırılır.
   */
  trace: {
    roles: ['detective', 'prosecutor'], life: 2,
    schedule: [{ until: 60, every: 5, lag: 5 }, { until: 120, every: 4, lag: 4 }, { until: 180, every: 3, lag: 3 }, { until: 300, every: 3, lag: 2 }, { until: Infinity, every: 2, lag: 1 }],
  },
  /**
   * Hak ve menziller: dedektifin işaret hakkı ve menzili; savcının yakalaması sınırsız, menzili catchRange, her denemede
   * kimliği `reveal` saniye suçlulara görünür; suçlunun kılığı (Q) ve öldürmesi (sol tık, menzil `reach`) sınırsız,
   * yanlışlıkla çift basmaya karşı kısa beklemeli.
   */
  marks: 3, markRange: 12, catchRange: 4, reveal: 10, disguiseRange: 6, disguiseCooldown: 0.6, killCooldown: 1,
  /** Savcı haritasındaki işaret dairesi: yarıçap, merkezin kişiden en fazla uzaklığı, kılık değişince sönme süresi. */
  mapCircle: 12, mapOffset: 7, mapFade: 8,
  /** Puanlar tur boyunca birikir, tur sonunda tek kez skora eklenir (bkz. DEDEKTIF_OYUNU_TASARIM.md §11). */
  scores: {
    lawWin: 1, criminalWin: 5, perMinute: 1, catchBonus: 1, markBonus: 1,
    wrongCatch: -1, wrongMark: -1, disguise: -1, killCivilian: -1, killDetective: 1, killProsecutor: 2,
  },
};

/**
 * Zorluk yalnızca botların davranışını değiştirir: tepki süresi, takip hafızası, yürüme temposu, dedektifin işaret
 * eşiği (izlerden biriken şüphe puanı), işaretlenen suçlunun kılık değiştirmeden önceki tereddüdü ve peşine düşeni
 * öldürme eğilimi.
 */
export const LEVELS = {
  easy: { label: 'Kolay', reaction: 1.6, memory: 9, speed: 0.85, markAt: 0.7, killChance: 0, hesitate: 7 },
  normal: { label: 'Normal', reaction: 0.8, memory: 14, speed: 1, markAt: 0.9, killChance: 0.25, hesitate: 4 },
  hard: { label: 'Zor', reaction: 0.4, memory: 20, speed: 1.08, markAt: 1.1, killChance: 0.5, hesitate: 2 },
};

/**
 * İzometrik kamera: odak noktasından sabit kaymayla bakar (görüş sisi de bu kaymadan odağı geri bulur, bkz. fog.js).
 * zoom ortografik yarı yükseklik: oyunda yakın, menüde kasabanın tamamına yakın.
 */
export const CAMERA = { offset: [35, 46, 38], zoomPlay: 26, zoomMenu: 30, follow: 7 };

/**
 * Sabit nesne saydamlığı: arkasına biri geçen nesnenin piksellerinin `keep` kadarı çizilir; geçiş hızı `speed`,
 * ışın karakterin ayağından `head` kadar yukarıdan çıkar (bkz. view/seethrough.js).
 */
export const SEE_THROUGH = { keep: 0.3, speed: 8, head: 1.2 };

export const ROLE = { detective: 'Dedektif', prosecutor: 'Savcı', criminal: 'Suçlu' };
/** Kıyafet renkleri: herkes bunlardan birini giyer; suçlu kılık değiştirince başkasınınkini alır. */
export const PALETTE = ['#466c76', '#9b5549', '#bd964e', '#697858', '#746483', '#b8764d', '#56877b', '#535e83', '#957463', '#888c68'];
export const NAMES = ['Sen', 'Ada', 'Boran', 'Cemre', 'Demir', 'Ekin', 'Feraye', 'Ilgaz', 'Mira', 'Yaman'];
/** Çevrim içi odada boş koltuğa oturan botların adları (koltuk sırasıyla; insan oturunca onun adı geçer). */
export const BOT_NAMES = ['Kaya', 'Ada', 'Boran', 'Cemre', 'Demir', 'Ekin', 'Feraye', 'Ilgaz', 'Mira', 'Yaman'];

/**
 * Çevrim içi: istemci dosyaları Cloudflare Worker'da (izpesinde.josephuz.com), oyun sunucusu evdeki PC'de Docker +
 * Cloudflare Tunnel ile SERVER adresinde. Sunucuya bağlanılamadıkça oda düğmeleri "Yakında" yazar.
 */
export const SERVER = 'izpesinde-sunucu.josephuz.com';
export const ONLINE = Object.freeze({ web: true });
