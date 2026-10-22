import { BOT_NAMES, CFG, LEVELS } from './config.js';
import { t } from './dil.js';
import { active, contestants } from './roster.js';
import { spectate } from './world.js';

/**
 * Ekranlar: rol seçimi (tek başına oyunda her turun başında), çevrim içi lobi, tur girişi, kontroller, duraklatma,
 * tur/maç sonu ve Tab skor tablosu. Hepsi aynı #overlay panelinde. Oyun akışına `hooks` ile dokunur: pick(role) turu
 * başlatır, quit() ana menüye döner; çevrim içi odada seat / move / level / privacy / startRoom / leaveRoom / lobbyBack
 * sunucuya gider.
 * Çevrim içi odada oyun durmaz: menü açıkken yalnızca senin karakterin durur, tur girişi ve tur sonu sunucunun
 * saatiyle kapanır.
 */
// Metinler sözlükte (src/diller/*.js): rolün amacı `rol.amac.<rol>`, tuşları `rol.tus.<rol>`, tur sonu `son.<bitiş>.*`.
const OBJECTIVE = role => t(`rol.amac.${role}`);
const ROLE = role => t(`rol.${role}`);
const LEVEL = level => (LEVELS[level] ? t(`zorluk.${level}`) : t('zorluk.normal'));
const ICON = { detective: '⌕', prosecutor: '⚖', criminal: '◇' };
export const KEYS = role => t(`rol.tus.${role}`);
const ENDINGS = kind => [t(`son.${kind}.baslik`), t(`son.${kind}.yazi`)];
export const objectiveOf = OBJECTIVE;
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
    const head = `<tr><th>${t('tablo.siraKisi')}</th>${reveal ? `<th>${t('tablo.buTur')}</th>` : ''}${world.history.map((_, i) => `<th>${t('tablo.tur', { n: i + 1 })}</th>`).join('')}<th>${t('tablo.toplam')}</th></tr>`;
    const me = world.player.id;
    const rows = order.map((a, i) => `<tr class="${a.id === me ? 'you' : ''}"><td>${i + 1}. ${esc(a.name)}${a.id === me ? t('tablo.sen') : ''}</td>${reveal ? `<td>${ROLE(a.role)}</td>` : ''}${world.history.map(h => `<td>${h.points[a.id] ? signed(h.points[a.id]) : '—'}</td>`).join('')}<td><b>${world.scores[a.id]}</b></td></tr>`).join('');
    return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  /** Tur başında rol seçimi: botlar kalan rolleri paylaşır, tur yine 2 suçlu / 6 dedektif / 2 savcıdır. */
  function roleChoice(round) {
    // Seçim modunda Esc ekranı kapatmaz: rol seçilmeden tur başlamaz.
    app.paused = true; app.choosing = true;
    const card = role => `<button class="role-pick" data-role="${role}"><span class="role-icon">${ICON[role]}</span><b>${ROLE(role)}</b><small>${OBJECTIVE(role)}</small></button>`;
    show(`<span class="eyebrow">${t('tur.dosyalar', { tur: pad(round), toplam: pad(CFG.rounds) })}</span><h2>${t('secim.baslik')}</h2><p>${t('secim.yazi')}</p><div class="role-picks">${['detective', 'prosecutor', 'criminal'].map(card).join('')}</div>`, "rol");
    overlay.querySelectorAll('[data-role]').forEach(b => { b.onclick = () => hooks.pick(b.dataset.role); });
  }

  function roundIntro() {
    app.paused = true; app.spectator = 0;
    const world = app.world, p = world.player, known = [...p.known].map(id => esc(world.actors[id].name)).join(', ');
    const countdown = app.online ? `<p class="result-note" id="introLeft">${introLeft()}</p>` : '';
    show(`<span class="eyebrow">${t('tur.dosyalar', { tur: pad(world.round), toplam: pad(CFG.rounds) })}</span><div class="role-icon">${ICON[p.role]}</div><h2>${t(`rol.busun.${p.role}`)}</h2><p>${OBJECTIVE(p.role)}</p><p>${t('giris.tanidik', { kisiler: known || t('giris.yok') })}</p><p class="result-note">${KEYS(p.role)}</p>${countdown}<div class="buttons"><button class="primary" id="beginRound">${t('giris.karis')}</button><button class="secondary" id="introHelp">${t('giris.kontroller')}</button></div>`, "giris");
    $('#beginRound').onclick = close;
    $('#introHelp').onclick = () => help(roundIntro);
  }
  /** Çevrim içi tur girişinin geri sayımı (sunucu saati; tur başlayınca giriş kendiliğinden kapanır). */
  function introLeft() {
    const w = app.world, left = Math.max(0, Math.ceil(w.left - (performance.now() - w.leftAt) / 1000));
    return w.phase === 'intro' ? t('giris.sayac', { n: left }) : t('giris.basladi');
  }
  /** Her kare: çevrim içi giriş ve tur sonu sayaçları; tur başlayınca giriş kapanır. */
  function tickOnline() {
    const w = app.world;
    if (overlay.hidden) return; // kapanan pencerenin içeriği DOM'da kalır: kapalıyken yeniden kapatılmaz (tuşları silerdi)
    const intro = overlay.querySelector('#introLeft');
    if (intro) { if (w.phase !== 'intro') close(); else intro.textContent = introLeft(); }
    const next = overlay.querySelector('#nextLeft');
    if (next) next.textContent = t('sonuc.sonrakiSayac', { n: Math.max(0, Math.ceil((w.nextAt - performance.now()) / 1000)) });
  }

  function help(back = null) {
    const wasPaused = app.paused;
    app.paused = true;
    const roles = t(app.online ? 'yardim.rollerCevrimIci' : 'yardim.rollerTek');
    show(`<span class="eyebrow">${t('yardim.ust')}</span><h2>${t('yardim.baslik')}</h2><div class="controls">${t('yardim.tuslar')}</div>${app.touch ? `<div class="controls touch-help">${t('yardim.dokunmatik')}</div>` : ''}<p>${t('yardim.kurallar')}</p><p>${roles} ${t('yardim.kazan')}</p><button class="primary" id="closeHelp">${t('yardim.anladim')}</button>`, "yardim");
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
      ? `<span class="eyebrow">${t('menu.cevrimIciUst')}</span><h2>${t('menu.cevrimIciBaslik')}</h2><p>${t('menu.cevrimIciYazi')}</p>`
      : `<span class="eyebrow">${t('menu.ust')}</span><h2>${t('menu.baslik')}</h2><p>${t('menu.yazi')}</p>`;
    // Gösteri / otomatik tarayıcı kipinde müzik hiç kurulmaz (muzik.js muzikKapali): düğme menüye girmez.
    const muzik = hooks.muzikVar()
      ? `<button class="secondary" id="pauseMuzik">${hooks.muzikLabel()}</button>`
      : '';
    show(`${head}<div class="menu-stack"><button class="primary" id="resume">${t('menu.devam')}</button><button class="secondary" id="pauseHelp">${t('ust.kontroller')}</button><button class="secondary" id="pauseSound">${hooks.soundLabel()}</button>${muzik}<button class="secondary" id="quit">${t(app.online ? 'oda.cik' : 'menu.anaMenu')}</button><a class="secondary" href="https://www.josephuz.com/">${t('menu.siteyeDon')}</a></div>`, 'mola');
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
    const world = app.world, final = world.round === CFG.rounds, [title, desc] = ENDINGS(world.result.kind);
    const max = Math.max(...world.scores), winners = contestants(world).filter(a => world.scores[a.id] === max).map(a => esc(a.name)).join(', ');
    const note = final ? t('son.kazananlar', { kazananlar: winners, puan: max }) + (winners.includes(',') ? ' ' + t('son.ortak') : '') : t('son.turNotu', { puan: signed(world.result.points[world.player.id]), toplam: world.scores[world.player.id] });
    // Çevrim içi: sonraki tur sunucunun saatiyle kendiliğinden başlar; maç sonunda oda lobiye döner.
    const next = !app.online ? `<button class="primary" id="next">${t(final ? 'son.yeniHikaye' : 'son.sonrakiTur')}</button>`
      : final ? `<button class="primary" id="next">${t('son.lobiyeDon')}</button><button class="secondary" id="quit">${t('oda.cik')}</button><a class="secondary" href="https://www.josephuz.com/">josephuz.com</a>` : '<p class="result-note" id="nextLeft"></p>';
    show(`<span class="eyebrow">${final ? t('son.macUst') : t('son.turUst', { n: world.round })}</span><h2>${final ? t('son.macBaslik') : title}</h2><p>${desc}</p><p class="result-note">${note}</p>${scoreTable(true)}<div class="buttons">${next}</div>`, "sonuc");
    if (app.online) { tickOnline(); if (final) { $('#next').onclick = () => hooks.lobbyBack(); $('#quit').onclick = () => { overlay.hidden = true; hooks.quit(); }; } return; }
    $('#next').onclick = () => (final ? hooks.newMatch() : roleChoice(world.round + 1));
  }

  /** Tab: basılıyken roller gizli skor tablosu; elenmişken izlenen takım arkadaşını değiştirir. */
  function scoreToggle(on) {
    if (!app.playing || app.paused) return;
    const world = app.world;
    if (!active(world.player)) { if (on) { if (app.online) hooks.command('cycle'); else app.spectator = spectate(world, app.spectator, true)?.id || 0; } return; }
    scores.hidden = !on;
    if (on) scores.innerHTML = `<div class="dialog"><span class="eyebrow">${t('skor.ust')}</span><h2>${t('skor.baslik')}</h2>` + scoreTable(false) + `<p>${t('skor.yazi')}</p></div>`;
  }

  /**
   * Çevrim içi lobi (bekleme odası, josephuz deposunda docs/oda-standardi.md): üstte `ODA · <özet>`, kod, Linki kopyala
   * ve görünürlük; 10 koltuk (taraf yok; boş koltuğa tıklayan oraya geçer, boşları botlar doldurur); kuran oyuncuyu
   * sürükleyip başka koltuğa bırakır ya da önce oyuncuya sonra koltuğa tıklar (dolu koltukta yer değiştirirler); botların
   * zorluğu ve oda görünürlüğü (yalnızca kuran), MAÇI BAŞLAT ↗ (yalnızca kuran) ve Odadan çık. Rol seçimi yoktur.
   */
  let moveFrom = null, lastLobby = null;
  function lobby(l, myId, error = '') {
    app.paused = true;
    if (lastLobby?.[0].code !== l.code || !l.seats.some(s => s && s.id === moveFrom)) moveFrom = null;
    lastLobby = [l, myId, error];
    const host = l.hostId === myId, link = location.origin + location.pathname + '?oda=' + l.code;
    const tags = s => [s.id === l.hostId && t('oda.kuran'), s.id === myId && t('oda.sen'), !s.online && t('oda.koptu')].filter(Boolean).join(' · ');
    const seat = (s, i) => s
      ? `<button class="seat${s.id === myId ? ' me' : ''}${s.online ? '' : ' offline'}${s.id === moveFrom ? ' moving' : ''}" data-seat="${i}" data-player="${s.id}" ${host ? `draggable="true" title="${t('oda.tasiBaslik')}"` : 'disabled'}><small>${i + 1}</small><b>${esc(s.nick)}</b><span>${tags(s) || '&nbsp;'}</span></button>`
      : `<button class="seat bot" data-seat="${i}" title="${t('oda.buraya')}"><small>${i + 1}</small><b>${BOT_NAMES[i]}</b><span class="seat-tag">${t('oda.botBos')}</span><span class="seat-sit">${t('oda.buraya')}</span></button>`;
    const levels = Object.keys(LEVELS).map(k => `<button data-lobby-level="${k}" class="${k === l.level ? 'selected' : ''}" ${host ? '' : 'disabled'}>${LEVEL(k)}</button>`).join('');
    const humans = l.seats.filter(Boolean).length;
    const privacy = [[false, t('oda.herkeseAcik')], [true, t('oda.ozel')]].map(([v, yazi]) => `<button data-lobby-private="${v ? 1 : 0}" class="${Boolean(l.private) === v ? 'selected' : ''}" ${host ? '' : 'disabled'}>${yazi}</button>`).join('');
    const visibility = t(l.private ? 'oda.ozelGorunur' : 'oda.acikGorunur');
    const hint = t(moveFrom != null ? 'oda.tasinacak' : host ? 'oda.kuranIpucu' : 'oda.ipucu');
    show(`<span class="eyebrow">${t('oda.ust', { zorluk: LEVEL(l.level) })}</span><div class="room-head"><h2 class="room-code">${l.code}</h2><button class="secondary" id="roomLink">${t('oda.linkKopyala')}</button></div><p class="room-visibility">${visibility}</p><p>${t('oda.tarafYok')}</p><div class="seats">${l.seats.map(seat).join('')}</div><p class="privacy-note" id="lobbyHint">${hint}</p><div class="lobby-opts"><div><span class="eyebrow">${t('oda.zorluk')}</span><div class="lobby-levels">${levels}</div></div><div><span class="eyebrow">${t('oda.oda')}</span><div class="lobby-levels">${privacy}</div></div></div>${error ? `<p class="lobby-error">${esc(error)}</p>` : ''}<p class="result-note">${t('oda.sayilar', { insan: humans, bot: 10 - humans })}</p><div class="buttons">${host ? `<button class="primary" id="roomStart">${t('oda.baslat')}</button>` : `<button class="primary" disabled>${t('oda.bekleniyor')}</button>`}<button class="secondary" id="roomLeave">${t('oda.cik')}</button></div>`, "lobi");
    const again = () => lobby(...lastLobby);
    const target = seatNo => {
      if (moveFrom != null) { const id = moveFrom; moveFrom = null; hooks.move(id, seatNo); again(); }
      else hooks.seat(seatNo);
    };
    overlay.querySelectorAll('.seat[data-seat]').forEach(b => {
      const seatNo = Number(b.dataset.seat), id = b.dataset.player ? Number(b.dataset.player) : null;
      b.onclick = () => {
        if (id == null) return target(seatNo);
        if (!host) return;
        if (moveFrom == null) { moveFrom = id; again(); } else if (moveFrom === id) { moveFrom = null; again(); } else target(seatNo);
      };
      if (!host) return;
      if (id != null) b.ondragstart = e => { e.dataTransfer.setData('text/plain', String(id)); e.dataTransfer.effectAllowed = 'move'; };
      b.ondragover = e => { e.preventDefault(); b.classList.add('drop'); };
      b.ondragleave = () => b.classList.remove('drop');
      b.ondrop = e => {
        e.preventDefault(); b.classList.remove('drop');
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isInteger(from) && from !== id) { moveFrom = null; hooks.move(from, seatNo); }
      };
    });
    overlay.querySelectorAll('[data-lobby-level]').forEach(b => { b.onclick = () => hooks.level(b.dataset.lobbyLevel); });
    overlay.querySelectorAll('[data-lobby-private]').forEach(b => { b.onclick = () => hooks.privacy(b.dataset.lobbyPrivate === '1'); });
    if (host) $('#roomStart').onclick = () => hooks.startRoom();
    $('#roomLink').onclick = () => {
      const b = $('#roomLink');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(() => { b.textContent = t('oda.linkKopyalandi'); }, () => { b.textContent = link; });
      else b.textContent = link;
    };
    $('#roomLeave').onclick = () => { moveFrom = null; hooks.leaveRoom(); };
  }

  /**
   * Tek başına hazırlık (Çayır Muhafızı'ndaki kurulum ekranı gibi): botların zorluğu seçilir, seçim tarayıcıda hatırlanır
   * (iz.level; ODA KUR ve HIZLI KATIL da odayı bu zorlukla kurar). Esc ya da Geri ana menüye döner.
   */
  function setup(go) {
    let level = 'normal';
    try { level = localStorage.getItem('iz.level') || 'normal'; } catch { /* yok */ }
    if (!LEVELS[level]) level = 'normal';
    const pick = Object.keys(LEVELS).map(k => `<button data-setup-level="${k}" class="${k === level ? 'selected' : ''}">${LEVEL(k)}</button>`).join('');
    show(`<span class="eyebrow">${t('kurulum.ust')}</span><h2>${t('kurulum.baslik')}</h2><p>${t('kurulum.yazi')}</p><span class="eyebrow">${t('oda.zorluk')}</span><div class="lobby-levels setup-levels">${pick}</div><div class="buttons"><button class="primary" id="setupGo">${t('kurulum.gir')}</button><button class="secondary" id="setupBack">${t('kurulum.geri')}</button></div>`, "hazirlik");
    overlay.querySelectorAll('[data-setup-level]').forEach(b => {
      b.onclick = () => { level = b.dataset.setupLevel; overlay.querySelectorAll('[data-setup-level]').forEach(x => x.classList.toggle('selected', x === b)); };
    });
    $('#setupGo').onclick = () => { try { localStorage.setItem('iz.level', level); } catch { /* yok */ } overlay.hidden = true; go(level); };
    $('#setupBack').onclick = () => { overlay.hidden = true; };
    $('#setupGo').focus();
  }

  /**
   * Ana ekrandaki AÇIK ODALAR listesi (ayrı pencere yok): lobideki herkese açık odalar; satırın tamamı bir düğme —
   * kuranın adı, "<zorluk> botlar · n/10 oyuncu", LOBİDE ve KATIL → (doluysa DOLU, kapalı). Sunucu, odada olmayan
   * bağlantıya liste değişince kendisi yollar. `connected` yanlışsa liste gizlenir.
   */
  function roomList(list, connected) {
    const block = $('#rooms-block'), box = $('#roomList');
    block.hidden = !connected;
    if (!connected) return;
    $('#roomsCount').textContent = list ? list.length : 0;
    if (!list) { box.innerHTML = `<div class="room-empty">${t('oda.yukleniyor')}</div>`; return; }
    if (!list.length) { box.innerHTML = `<div class="room-empty">${t('oda.yok')}</div>`; return; }
    box.innerHTML = list.map(r => {
      const full = r.n >= 10;
      return `<button class="room-row" data-room="${esc(r.code)}" ${full ? 'disabled' : ''}><span class="room-name"><b>${esc(r.host || t('oda.adsiz'))}</b><small>${t('oda.satir', { zorluk: LEVEL(r.level), n: r.n })}</small></span><span class="room-tag">${t('oda.lobide')}</span><span class="room-go">${t(full ? 'oda.dolu' : 'oda.katilOk')}</span></button>`;
    }).join('');
  }

  return {
    roleChoice, roundIntro, help, pauseMenu, showResult, scoreToggle, close, lobby, tickOnline, setup, roomList,
    get open() { return !overlay.hidden; },
    /** Açık pencerenin adı (kapalıysa null); müziğin sahnesi buna bakar (src/muzik.js sahneSec). */
    get perde() { return overlay.hidden ? null : perdeAd; },
  };
}
