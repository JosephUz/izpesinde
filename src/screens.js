import { BOT_NAMES, CFG, LEVELS, ROLE } from './config.js';
import { active, contestants } from './roster.js';
import { spectate } from './world.js';

/**
 * Ekranlar: rol seçimi (tek başına oyunda her turun başında), çevrim içi lobi, tur girişi, kontroller, duraklatma,
 * tur/maç sonu ve Tab skor tablosu. Hepsi aynı #overlay panelinde. Oyun akışına `hooks` ile dokunur: pick(role) turu
 * başlatır, quit() ana menüye döner; çevrim içi odada seat / level / startRoom / leaveRoom / lobbyBack sunucuya gider.
 * Çevrim içi odada oyun durmaz: menü açıkken yalnızca senin karakterin durur, tur girişi ve tur sonu sunucunun
 * saatiyle kapanır.
 */
const OBJECTIVE = {
  detective: 'Yalnızca dedektiflerin gördüğü izleri oku. Şüphelendiğini takip et, sol tıkla işaretle. İşaret sınırsız ama yanlışı −1; yeni işaret kasabadaki diğer işaretleri kaldırır.',
  prosecutor: 'Savcı izlerini ve işaretleri takip et, doğru kişiyi sol tıkla yakala. Yakalama sınırsız ama yanlışı −1 ve her denemede kimliğin 10 sn suçlulara açılır.',
  criminal: 'Süre bitene kadar yakalanma. Tenhada iz bırakırsın; işaretlenirsen imleçteki kişinin kılığına Q ile gir. Sol tık öldürür.',
};
const ICON = { detective: '⌕', prosecutor: '⚖', criminal: '◇' };
export const KEYS = {
  detective: 'Sol tık: İşaretle · E: Kutu taşı · F: Çalış',
  prosecutor: 'Sol tık: Yakala · E: Kutu taşı · F: Çalış',
  criminal: 'Sol tık: Öldür · Q: Kılık değiştir (−1) · E: Kutu · F: Çalış',
};
const ENDINGS = {
  capture: ['Kaçacak yer kalmadı.', 'İki suçlu da yakalandı. Kanun tarafı kazandı.'],
  timeout: ['Sır, kasabada kaldı.', 'Süre doldu. Serbest kalan suçlular kazandı.'],
  prosecutors: ['Kanun sustu.', 'İki savcı da öldü. Suçlular kazandı.'],
};
export const objectiveOf = role => OBJECTIVE[role];
const signed = n => (n > 0 ? '+' : '') + n;
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createScreens(root, app, hooks) {
  const $ = s => root.querySelector(s);
  const overlay = $('#overlay'), scores = $('#scores');

  // Açık pencerenin adı; müzik hangi sahneyi çalacağını buradan bilir (src/muzik.js sahneSec). Pencere başka bir
  // yerden kapatılsa da (main.js `#overlay`.hidden) doğru kalsın diye perde yalnız görünürken okunur.
  let perdeAd = null;

  function show(html, ad = null) {
    overlay.innerHTML = '<div class="dialog">' + html + '</div>';
    overlay.hidden = false;
    perdeAd = ad;
    hooks.clearInput();
    overlay.querySelector('button')?.focus();
  }
  function close() { app.paused = false; overlay.hidden = true; hooks.clearInput(); hooks.focus(); }

  function scoreTable(reveal) {
    const world = app.world, order = contestants(world).slice().sort((a, b) => world.scores[b.id] - world.scores[a.id]);
    const head = `<tr><th>SIRA / KİŞİ</th>${reveal ? '<th>BU TUR</th>' : ''}${world.history.map((_, i) => `<th>T${i + 1}</th>`).join('')}<th>TOPLAM</th></tr>`;
    const me = world.player.id;
    const rows = order.map((a, i) => `<tr class="${a.id === me ? 'you' : ''}"><td>${i + 1}. ${esc(a.name)}${a.id === me ? ' · SEN' : ''}</td>${reveal ? `<td>${ROLE[a.role]}</td>` : ''}${world.history.map(h => `<td>${h.points[a.id] ? signed(h.points[a.id]) : '—'}</td>`).join('')}<td><b>${world.scores[a.id]}</b></td></tr>`).join('');
    return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  /** Tur başında rol seçimi: botlar kalan rolleri paylaşır, tur yine 2 suçlu / 6 dedektif / 2 savcıdır. */
  function roleChoice(round) {
    // Seçim modunda Esc ekranı kapatmaz: rol seçilmeden tur başlamaz.
    app.paused = true; app.choosing = true;
    const card = role => `<button class="role-pick" data-role="${role}"><span class="role-icon">${ICON[role]}</span><b>${ROLE[role]}</b><small>${OBJECTIVE[role]}</small></button>`;
    show(`<span class="eyebrow">KARAAĞAÇ DOSYALARI · TUR ${pad(round)} / ${pad(CFG.rounds)}</span><h2>Bu tur kim olacaksın?</h2><p>Kalan rolleri rakiplerin paylaşır. Puanın turlar boyunca birikir.</p><div class="role-picks">${['detective', 'prosecutor', 'criminal'].map(card).join('')}</div>`, "rol");
    overlay.querySelectorAll('[data-role]').forEach(b => { b.onclick = () => hooks.pick(b.dataset.role); });
  }

  function roundIntro() {
    app.paused = true; app.spectator = 0;
    const world = app.world, p = world.player, known = [...p.known].map(id => esc(world.actors[id].name)).join(', ');
    const countdown = app.online ? `<p class="result-note" id="introLeft">${introLeft()}</p>` : '';
    show(`<span class="eyebrow">KARAAĞAÇ DOSYALARI · TUR ${pad(world.round)} / ${pad(CFG.rounds)}</span><div class="role-icon">${ICON[p.role]}</div><h2>Bu tur ${{ detective: 'dedektifsin', prosecutor: 'savcısın', criminal: 'suçlusun' }[p.role]}.</h2><p>${OBJECTIVE[p.role]}</p><p>Tanıdığın kişiler: <strong>${known || 'Yok'}</strong>.<br>Bu kişiler dünyada yeşil bir halka ile görünür. Diğer herkes bir sır.</p><p class="result-note">${KEYS[p.role]}</p>${countdown}<div class="buttons"><button class="primary" id="beginRound">HİKÂYEYE KARIŞ →</button><button class="secondary" id="introHelp">Kontroller</button></div>`, "giris");
    $('#beginRound').onclick = close;
    $('#introHelp').onclick = () => help(roundIntro);
  }
  /** Çevrim içi tur girişinin geri sayımı (sunucu saati; tur başlayınca giriş kendiliğinden kapanır). */
  function introLeft() {
    const w = app.world, left = Math.max(0, Math.ceil(w.left - (performance.now() - w.leftAt) / 1000));
    return w.phase === 'intro' ? `Tur ${left} sn sonra başlıyor · rolün herkese rastgele dağıtıldı` : 'Tur başladı';
  }
  /** Her kare: çevrim içi giriş ve tur sonu sayaçları; tur başlayınca giriş kapanır. */
  function tickOnline() {
    const w = app.world;
    if (overlay.hidden) return; // kapanan pencerenin içeriği DOM'da kalır: kapalıyken yeniden kapatılmaz (tuşları silerdi)
    const intro = overlay.querySelector('#introLeft');
    if (intro) { if (w.phase !== 'intro') close(); else intro.textContent = introLeft(); }
    const next = overlay.querySelector('#nextLeft');
    if (next) next.textContent = `Sonraki tur ${Math.max(0, Math.ceil((w.nextAt - performance.now()) / 1000))} sn içinde başlıyor`;
  }

  function help(back = null) {
    const wasPaused = app.paused;
    app.paused = true;
    const roles = app.online ? 'Çevrim içi odada rolün her tur rastgele gelir, puanların kalır.' : 'Beş tur boyunca rolünü sen seçersin, puanların kalır.';
    show(`<span class="eyebrow">KASABADA HAYATTA KALMA REHBERİ</span><h2>Her adım bir iz.</h2><div class="controls"><div><kbd>W A S D</kbd> Hareket</div><div><kbd>SHIFT</kbd> Koş</div><div><kbd>SPACE</kbd> Çift zıpla</div><div><kbd>SAĞ TIK</kbd> Atıl</div><div><kbd>SOL TIK</kbd> Dedektif işaretler · Savcı yakalar · Suçlu öldürür</div><div><kbd>E</kbd> Kutuyu al / bırak</div><div><kbd>F</kbd> İş noktasında çalış</div><div><kbd>Q</kbd> Suçlu: imleçteki kişinin kılığı</div><div><kbd>M</kbd> Haritayı büyüt / küçült</div><div><kbd>TEKERLEK</kbd> Yaklaştır / uzaklaştır</div><div><kbd>TAB</kbd> Skor / izleyicide hedef</div><div><kbd>ESC</kbd> Duraklat</div></div>${app.touch ? '<div class="controls touch-help"><div><kbd>SOL YARI</kbd> Joystick · sonuna kadar it: koş</div><div><kbd>DOKUN</kbd> Dünyada hedef seç</div><div><kbd>BÜYÜK DÜĞME</kbd> Seçili hedefe rolün eylemi</div><div><kbd>KILIK</kbd> Suçlu: seçili kişinin kılığı (−1)</div><div><kbd>KUTU · ÇALIŞ</kbd> Kutu taşı · iş noktasında çalış</div><div><kbd>ZIPLA · ATIL</kbd> Çift zıpla · atıl</div><div><kbd>İKİ PARMAK</kbd> Yaklaştır / uzaklaştır</div><div><kbd>☰ · SKOR · HARİTA</kbd> Menü · basılı tut: skor · büyüt</div></div>' : ''}<p>Herkes yalnızca çevresindeki daireyi görür. Suçlular arkalarında iki saniye yerde kalan izler bırakır; izler başta 5 saniye arayla ve 5 saniye geriden düşer, tur ilerledikçe ikisi de kısalır. Dedektif izlerini yalnızca dedektifler, savcı izlerini yalnızca savcılar görür. İşaretleri herkes görür; işaretli suçlu kılık değiştirince işaret kalkar. Savcı her yakalamada 10 sn suçlulara görünür.</p><p>${roles} <b>Kazanmak için en yüksek kişisel skoru topla.</b></p><button class="primary" id="closeHelp">ANLADIM →</button>`, "yardim");
    $('#closeHelp').onclick = () => {
      if (back) back();
      else { close(); app.paused = wasPaused; if (wasPaused && app.playing) pauseMenu(); }
    };
  }

  /**
   * STANDART duraklatma (Esc) menüsü — bütün JosephUz oyunlarında aynı sıra, aynı yazılar:
   * `DEVAM ET →` · `Kontroller F1` · `Ses: …` · `Müzik: …` · `Ana menü`
   * (çevrim içinde `Odadan çık`) · `josephuz.com'a dön`. Alt alta, pencere düğme sütunu kadar dar.
   * Ses ve müzik düğmeleri üst çubuktakilerle **aynı durumu** gösterir (main.js setSound / setMuzik).
   */
  function pauseMenu() {
    if (!app.playing) return;
    app.paused = true;
    const head = app.online
      ? '<span class="eyebrow">ÇEVRİM İÇİ ODA</span><h2>Kasaba durmuyor.</h2><p>Bu ekran açıkken karakterin yerinde durur. Odadan çıkarsan karakterini tur sonuna kadar bir bot yönetir.</p>'
      : '<span class="eyebrow">ZAMAN SENİ BEKLİYOR</span><h2>Bir nefes arası.</h2><p>Kasaba duraklatıldı.</p>';
    // Gösteri / otomatik tarayıcı kipinde müzik hiç kurulmaz (muzik.js muzikKapali): düğme menüye girmez.
    const muzik = hooks.muzikVar()
      ? `<button class="secondary" id="pauseMuzik">${hooks.muzikLabel()}</button>`
      : '';
    show(`${head}<div class="menu-stack"><button class="primary" id="resume">DEVAM ET →</button><button class="secondary" id="pauseHelp">Kontroller <kbd>F1</kbd></button><button class="secondary" id="pauseSound">${hooks.soundLabel()}</button>${muzik}<button class="secondary" id="quit">${app.online ? 'Odadan çık' : 'Ana menü'}</button><a class="secondary" href="https://www.josephuz.com/">josephuz.com'a dön</a></div>`, 'mola');
    $('#pauseSound').onclick = () => hooks.toggleSound();
    if (hooks.muzikVar()) {
      $('#pauseMuzik').onclick = () => hooks.toggleMuzik();
      hooks.syncMenu(); // yazılar üst çubuktakiyle aynı durumu göstersin
    }
    $('#resume').onclick = close;
    $('#pauseHelp').onclick = () => help();
    $('#quit').onclick = () => { overlay.hidden = true; hooks.quit(); };
  }

  function showResult() {
    if (app.shownResult) return;
    app.shownResult = true; app.paused = true;
    const world = app.world, final = world.round === CFG.rounds, [title, desc] = ENDINGS[world.result.kind];
    const max = Math.max(...world.scores), winners = contestants(world).filter(a => world.scores[a.id] === max).map(a => esc(a.name)).join(', ');
    const note = final ? `${winners} · ${max} puan ${winners.includes(',') ? '· Ortak birincilik' : ''}` : `Bu tur ${signed(world.result.points[world.player.id])} puan · Toplam ${world.scores[world.player.id]}`;
    // Çevrim içi: sonraki tur sunucunun saatiyle kendiliğinden başlar; maç sonunda oda lobiye döner.
    const next = !app.online ? `<button class="primary" id="next">${final ? 'YENİ BİR HİKÂYE' : 'SONRAKİ TUR'} →</button>`
      : final ? '<button class="primary" id="next">LOBİYE DÖN →</button><button class="secondary" id="quit">Ana menü</button><a class="secondary" href="https://www.josephuz.com/">josephuz.com</a>' : '<p class="result-note" id="nextLeft"></p>';
    show(`<span class="eyebrow">${final ? 'BEŞ DOSYA KAPANDI · MAÇ SONU' : 'DOSYA KAPANDI · TUR ' + world.round}</span><h2>${final ? 'Kasaba seni hatırlayacak.' : title}</h2><p>${desc}</p><p class="result-note">${note}</p>${scoreTable(true)}<div class="buttons">${next}</div>`, "sonuc");
    if (app.online) { tickOnline(); if (final) { $('#next').onclick = () => hooks.lobbyBack(); $('#quit').onclick = () => { overlay.hidden = true; hooks.quit(); }; } return; }
    $('#next').onclick = () => (final ? hooks.newMatch() : roleChoice(world.round + 1));
  }

  /** Tab: basılıyken roller gizli skor tablosu; elenmişken izlenen takım arkadaşını değiştirir. */
  function scoreToggle(on) {
    if (!app.playing || app.paused) return;
    const world = app.world;
    if (!active(world.player)) { if (on) { if (app.online) hooks.command('cycle'); else app.spectator = spectate(world, app.spectator, true)?.id || 0; } return; }
    scores.hidden = !on;
    if (on) scores.innerHTML = '<div class="dialog"><span class="eyebrow">KİŞİSEL SIRALAMA · ROLLER GİZLİ</span><h2>Herkes kendi izinde.</h2>' + scoreTable(false) + '<p>Devam etmek için Tab tuşunu bırak.</p></div>';
  }

  /**
   * Çevrim içi lobi: oda kodu, 10 koltuk (taraf yok; boş koltuğa tıklayan oraya geçer, boşları botlar doldurur), botların
   * zorluğu ve Başlat (yalnızca kuran). Rol seçimi yoktur: her tur herkes rastgele rol alır.
   */
  function lobby(l, myId, error = '') {
    app.paused = true;
    const host = l.hostId === myId, link = location.origin + location.pathname + '?oda=' + l.code;
    const seat = (s, i) => s
      ? `<button class="seat${s.id === myId ? ' me' : ''}${s.online ? '' : ' offline'}" disabled><small>${i + 1}</small><b>${esc(s.nick)}</b><span>${s.id === l.hostId ? 'Kuran' : s.online ? 'Oyuncu' : 'Bağlantı yok'}${s.id === myId ? ' · Sen' : ''}</span></button>`
      : `<button class="seat bot" data-seat="${i}" title="Bu koltuğa geç"><small>${i + 1}</small><b>${BOT_NAMES[i]}</b><span>Bot · boş koltuk</span></button>`;
    const levels = Object.entries(LEVELS).map(([k, v]) => `<button data-lobby-level="${k}" class="${k === l.level ? 'selected' : ''}" ${host ? '' : 'disabled'}>${v.label}</button>`).join('');
    const humans = l.seats.filter(Boolean).length;
    show(`<span class="eyebrow">ÇEVRİM İÇİ ODA · KOD</span><h2 class="room-code">${l.code}</h2><p>Taraf yok: herkes her tur rastgele rol alır. Boş koltuklara bot oturur; boş bir koltuğa tıklayıp oraya geçebilirsin.</p><div class="seats">${l.seats.map(seat).join('')}</div><span class="eyebrow">BOTLARIN ZORLUĞU</span><div class="lobby-levels">${levels}</div>${error ? `<p class="lobby-error">${esc(error)}</p>` : ''}<p class="result-note">${humans} insan · ${10 - humans} bot · beş tur</p><div class="buttons">${host ? '<button class="primary" id="roomStart">BAŞLAT →</button>' : '<button class="primary" disabled>KURANIN BAŞLATMASI BEKLENİYOR</button>'}<button class="secondary" id="roomLink">Linki kopyala</button><button class="secondary" id="roomLeave">Ayrıl</button></div>`, "lobi");
    overlay.querySelectorAll('[data-seat]').forEach(b => { b.onclick = () => hooks.seat(Number(b.dataset.seat)); });
    overlay.querySelectorAll('[data-lobby-level]').forEach(b => { b.onclick = () => hooks.level(b.dataset.lobbyLevel); });
    if (host) $('#roomStart').onclick = () => hooks.startRoom();
    $('#roomLink').onclick = () => { navigator.clipboard?.writeText(link).then(() => { $('#roomLink').textContent = 'Kopyalandı'; }, () => { $('#roomLink').textContent = link; }); };
    $('#roomLeave').onclick = () => hooks.leaveRoom();
  }

  /**
   * Hazırlık (Çayır Muhafızı'ndaki kurulum ekranı gibi): Tek başına ve Oda kur'dan önce botların zorluğu seçilir.
   * Seçim tarayıcıda hatırlanır. Esc ya da Geri ana menüye döner.
   */
  function setup(kind, go) {
    let level = 'normal';
    try { level = localStorage.getItem('iz.level') || 'normal'; } catch { /* yok */ }
    if (!LEVELS[level]) level = 'normal';
    const pick = Object.entries(LEVELS).map(([k, v]) => `<button data-setup-level="${k}" class="${k === level ? 'selected' : ''}">${v.label}</button>`).join('');
    show(`<span class="eyebrow">${kind === 'room' ? 'ÇEVRİM İÇİ ODA' : 'TEK BAŞINA · 9 BOT'}</span><h2>${kind === 'room' ? 'Oda kur' : 'Kasabaya hazırlan'}</h2><p>${kind === 'room' ? 'Boş koltukları botlar doldurur; zorluğu lobide de değiştirebilirsin. Taraf yok, roller her tur rastgele.' : 'Rolünü her tur sen seçersin; kalan rolleri botlar paylaşır. Beş tur, en yüksek kişisel skor kazanır.'}</p><span class="eyebrow">BOTLARIN ZORLUĞU</span><div class="lobby-levels setup-levels">${pick}</div><div class="buttons"><button class="primary" id="setupGo">${kind === 'room' ? 'ODAYI KUR' : 'KASABAYA GİR'} →</button><button class="secondary" id="setupBack">Geri</button></div>`, "hazirlik");
    overlay.querySelectorAll('[data-setup-level]').forEach(b => {
      b.onclick = () => { level = b.dataset.setupLevel; overlay.querySelectorAll('[data-setup-level]').forEach(x => x.classList.toggle('selected', x === b)); };
    });
    $('#setupGo').onclick = () => { try { localStorage.setItem('iz.level', level); } catch { /* yok */ } overlay.hidden = true; go(level); };
    $('#setupBack').onclick = () => { overlay.hidden = true; };
    $('#setupGo').focus();
  }

  return {
    roleChoice, roundIntro, help, pauseMenu, showResult, scoreToggle, close, lobby, tickOnline, setup,
    get open() { return !overlay.hidden; },
    /** Açık pencerenin adı (kapalıysa null); müziğin sahnesi buna bakar (src/muzik.js sahneSec). */
    get perde() { return overlay.hidden ? null : perdeAd; },
  };
}
