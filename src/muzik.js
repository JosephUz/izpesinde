/**
 * Oyun içi müzik: üç sahne, çapraz geçiş (Yusuf 8 Ekim 2026: Pazar Meydanı, Dosyalar, Suçlu Aramızda).
 *  - **sakin** (`Pazar Meydanı`): ana menü, hazırlık, çevrim içi oda / koltuk bekleme, rol seçimi, tur girişi, mola,
 *    tur ve maç sonu — tek parça, kendi kendine döner.
 *  - **mac** (`Dosyalar`): tur sürerken ana tema.
 *  - **gerilim** (`Suçlu Aramızda` ↔ `Dosyalar`): turun son 60 saniyesi ya da savcının kovalamacası (ekran kenarında
 *    işaret okları görünürken). Parça bitince ana temaya, o da bitince yeniden gerilime döner; araya sessizlik girmez.
 *
 * Çalma `<audio>` öğeleriyledir (Web Audio gerekmez): dosya akarak iner, sahne değişince ses düzeyi karşılıklı
 * süzülür. Dosyalar **gerektiğinde** yüklenir: menüde yalnız sakin parça iner, tur parçası tur başlarken.
 *
 * Ses düzeyi efektlerin (ui.js tone) altında, sabit %35 (menüde sürgü yok; oyuncu cihazın sesinden ayarlar).
 * Açık / kapalı tarayıcıda saklanır (`iz.muzik`); düğme hem üst çubukta hem Esc menüsündedir (bkz. main.js setMuzik). Efekt sesi düğmesi (`iz.sound`) müziği etkilemez: ikisi bağımsızdır.
 *
 * Tarayıcının otomatik oynatma kuralı: ilk kullanıcı dokunuşuna / tuşuna kadar hiç `play()` çağrılmaz, engellenirse
 * sonraki dokunuşta yeniden denenir. Sekme gizlenince durur, dönünce kaldığı yerden sürer.
 *
 * Dosya yolları **görelidir** (`muzik/...`): aynı dosyalar Capacitor'ın `https://localhost/` kökünde de çalışır
 * (bkz. scripts/build-web.mjs).
 */
// Yusuf 8 Ekim 2026: oyunun müziği bu üç parça (josephuz.com Müzik sekmesinde de bunlar). Öbür parçalar
// muzik/archive/ altında (bkz. NOT.txt), yayına girmez. Listeler boş kalırsa hiçbir dosya istenmez, hiçbir şey
// çalmaz ve Müzik düğmesi (üst çubuk + Esc menüsü) gizlenir (main.js `parcaVar`).
const SAHNELER = {
  sakin: ['iz-2-pazar-meydani'],
  mac: ['iz-5-dosyalar'],
  gerilim: ['iz-3-sucu-aramizda', 'iz-5-dosyalar'],
};
/** Çalınacak en az bir parça var mı? Yoksa müzik hiç kurulmaz, düğmesi de gösterilmez. */
export const MUZIK_VAR = Object.values(SAHNELER).some(liste => liste.length > 0);
/** Turun son bu kadar saniyesinde gerilim parçasına geçilir. */
export const GERILIM_SN = 60;
/** Çapraz geçiş süresi (sn): sahne değişiminde ve parça bitmeden önce. */
const GECIS = 1.8;
const VARSAYILAN_SES = 0.35;
/** Süzülme saatinin adımı (sn). */
const ADIM = 0.05;

const kis = v => Math.max(0, Math.min(1, v));

/**
 * Hangi sahne çalmalı? Saf işlev: oyun akışından ve dünyanın durumundan okur, her kareden sorulabilir (aynı sahne
 * yeniden verilince hiçbir şey olmaz).
 *  - `playing`: tur sürüyor mu (main.js `app.playing`)
 *  - `perde`: açık pencere ('yardim' | 'mola' | 'rol' | 'giris' | 'sonuc' | 'lobi' | 'hazirlik' | null). Yardım
 *    penceresi turun üstünde açılır, müzik turun müziğidir; öbür pencereler bir aradır, sakin parçaya döner.
 *  - `w`: dünya (time, seconds, result)
 *  - `kovalamaca`: savcının ekran kenarındaki işaret okları görünüyor mu (ui.js `#chase`)
 */
export function sahneSec(playing, perde, w, kovalamaca = false) {
  if (!playing || !w || w.result) return 'sakin';
  if (perde && perde !== 'yardim') return 'sakin';
  if (kovalamaca) return 'gerilim';
  return (w.seconds ?? 0) - (w.time ?? 0) <= GERILIM_SN ? 'gerilim' : 'mac';
}

/**
 * Müzik hiç yüklenmesin mi? Otomatik tarayıcılar (Playwright: `navigator.webdriver`) sessizdir — dumanı testleri
 * 6 MB ses indirmesin. `?muzik=0` elle kapatır, `?muzik=1` ikisine de bakmadan açar (müziği ölçen test bunu kullanır).
 */
export function muzikKapali() {
  const p = new URLSearchParams(location.search).get('muzik');
  if (p === '0') return true;
  if (p === '1') return false;
  return Boolean(navigator.webdriver);
}

export function createMuzik(root) {
  const kapali = muzikKapali();
  let acik = true, ses = VARSAYILAN_SES;
  try { acik = localStorage.getItem('iz.muzik') !== 'off'; } catch { /* yok */ }
  // Müzik düzeyi sabit (VARSAYILAN_SES): menüde ses sürgüsü yok, oyuncu bilgisayarın / telefonun sesinden ayarlar.
  // Yusuf 4 Ekim: "menülerde müzik sesi olmasın, pc sesinden ayarlasınlar, standart bir ses yüksekliği belirle".
  // Eski sürümden kalmış saklı düzey (`<oyun>.muzik.ses`) okunmaz.
  const sakla = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } };

  const parcalar = new Map();
  /** Süren süzülmeler: öğe -> { bas, hedef, t, sure, bitince }. Tek bir sayaç hepsini yürütür. */
  const suzulme = new Map();
  let saat = null, sahneAdi = null, sira = 0, aktif = null, dokunuldu = false, gizli = false;

  const hedefSes = () => (acik ? ses : 0);

  function tik() {
    for (const [a, f] of suzulme) {
      f.t += ADIM;
      const k = Math.min(1, f.t / f.sure);
      a.volume = kis(f.bas + (f.hedef - f.bas) * k);
      if (k >= 1) { suzulme.delete(a); f.bitince?.(); }
    }
    if (!suzulme.size && saat !== null) { clearInterval(saat); saat = null; }
  }
  /** Öğenin sesini `sure` saniyede `hedef`e süzer; `sure` 0 ise anında. */
  function suz(a, hedef, sure, bitince) {
    if (sure <= 0) { suzulme.delete(a); a.volume = kis(hedef); bitince?.(); return; }
    suzulme.set(a, { bas: a.volume, hedef, t: 0, sure, bitince });
    saat = saat ?? setInterval(tik, ADIM * 1000);
  }

  /** Parçanın `<audio>` öğesi; ilk istendiğinde kurulur (dosya o an inmeye başlar). */
  function parca(ad) {
    let a = parcalar.get(ad);
    if (a) return a;
    a = new Audio();
    a.preload = 'auto';
    a.volume = 0;
    a.hidden = true;
    a.dataset.parca = ad;
    // Göreli yol: hem web sunucusunda hem Capacitor'da (https://localhost/) aynı dosyayı bulur.
    a.src = `muzik/${ad}.mp3`;
    // Parça bitmeden önce öbürü üstüne açılsın: araya sessizlik girmez. `ended` yalnız yedektir (süre bilinmiyorsa).
    a.addEventListener('timeupdate', () => {
      if (a !== aktif || a.loop || !Number.isFinite(a.duration)) return;
      if (a.duration - a.currentTime <= GECIS + ADIM) sonraki();
    });
    a.addEventListener('ended', () => { if (a === aktif) sonraki(); });
    root.appendChild(a);
    parcalar.set(ad, a);
    return a;
  }

  /** Şu an çalması gereken parçanın adı (hiçbiri değilse null). */
  function istenen() {
    if (kapali || !acik || !dokunuldu || !sahneAdi) return null;
    const liste = SAHNELER[sahneAdi];
    return liste?.length ? liste[sira % liste.length] : null;
  }

  function calistir(a) {
    const s = a.play();
    // Otomatik oynatma engellendiyse ilk dokunuş sayılmaz: bir sonraki dokunuşta yeniden denenir.
    if (s?.catch) s.catch(() => { dokunuldu = false; });
  }

  /**
   * Durumu istenene getirir: gereken parça çalar, gereksiz olan süzülerek susar. `koru`: susan parça kaldığı yerde
   * beklesin (müzik düğmesiyle kapatınca; yeniden açılınca aynı yerden sürer). Sahne değişiminde ve parça devrinde
   * başa sarılır — sarılmazsa bitişine gelmiş bir parça yeniden seçilince anında "bitti" sayılır ve devir döngüye girer.
   */
  function uygula(sure = GECIS, koru = false) {
    if (gizli) return; // sekme kapalıyken çalınmaz; dönünce buraya yeniden gelinir
    const ad = istenen();
    if (!ad) {
      if (!aktif) return;
      const eski = aktif; aktif = null;
      suz(eski, 0, sure, () => { eski.pause(); if (!koru) eski.currentTime = 0; });
      return;
    }
    const yeni = parca(ad);
    if (aktif === yeni) { calistir(yeni); suz(yeni, hedefSes(), Math.min(sure, 0.3)); return; }
    if (aktif) { const eski = aktif; suz(eski, 0, sure, () => { eski.pause(); eski.currentTime = 0; }); }
    aktif = yeni;
    // Tek parçalı sahne (sakin, tur) kendi kendine döner: `ended` hiç gelmez, araya sessizlik girmez.
    yeni.loop = SAHNELER[sahneAdi].length < 2;
    yeni.volume = 0;
    calistir(yeni);
    suz(yeni, hedefSes(), sure);
  }

  /** Aynı sahnenin sıradaki parçası (gerilimde `Sessiz Kasaba` ↔ `Dosyalar`). */
  function sonraki() {
    const liste = SAHNELER[sahneAdi];
    if (!liste || liste.length < 2) { if (aktif) { aktif.currentTime = 0; calistir(aktif); } return; }
    sira++;
    uygula();
  }

  /** İlk kullanıcı girdisi: tarayıcı buradan sonra çalmaya izin verir. */
  function ilkDokunus() {
    if (kapali || dokunuldu) return;
    dokunuldu = true;
    uygula(0.8);
  }
  if (!kapali && MUZIK_VAR) {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, ilkDokunus, { passive: true });
    document.addEventListener('visibilitychange', () => {
      gizli = document.hidden;
      if (gizli) { if (aktif) aktif.pause(); return; }
      uygula(0.4);
    });
  }

  return {
    kapali,
    /** SAHNELER'de en az bir parça var mı (yoksa düğme gizlenir; bkz. MUZIK_VAR). */
    parcaVar: MUZIK_VAR,
    /** Sahneyi değiştirir ('sakin' | 'mac' | 'gerilim' | null). Aynı sahne yeniden verilirse hiçbir şey olmaz. */
    sahne(ad) {
      if (kapali || ad === sahneAdi) return;
      sahneAdi = ad; sira = 0;
      uygula();
    },
    get acik() { return acik; },
    get ses() { return ses; },
    /** Müzik açık / kapalı (verilmezse çevirir); seçim tarayıcıda saklanır. Yeni durumu döner. */
    ac(v) {
      acik = v === undefined ? !acik : Boolean(v);
      sakla('iz.muzik', acik ? 'on' : 'off');
      uygula(0.6, true); // kapatınca parça kaldığı yerde bekler: yeniden açılınca oradan sürer
      return acik;
    },
    /** Ses düzeyi (0-1); saklanır ve çalan parçaya anında uygulanır. */
    sesAyarla(v) {
      ses = kis(Number(v) || 0);
      sakla('iz.muzik.ses', String(ses));
      if (aktif && !suzulme.has(aktif)) aktif.volume = hedefSes();
      return ses;
    },
    /** Testler ve hata ayıklama için: hangi parça, hangi sahne, çalıyor mu. */
    durum() {
      return { kapali, acik, ses, sahne: sahneAdi, parca: aktif?.dataset.parca || null, caliyor: Boolean(aktif && !aktif.paused), ogeler: parcalar.size };
    },
  };
}
