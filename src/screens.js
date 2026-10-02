import { CFG, ROLE } from './config.js';
import { active, contestants } from './roster.js';
import { spectate } from './world.js';

/**
 * Ekranlar: rol seçimi (her turun başında), tur girişi, kontroller, duraklatma, tur/maç sonu ve Tab skor tablosu.
 * Hepsi aynı #overlay panelinde. Oyun akışına `hooks` ile dokunur: pick(role) turu başlatır, quit() ana menüye döner.
 */
const OBJECTIVE = {
  detective: 'Yalnızca dedektiflerin gördüğü izleri oku. Şüphelendiğini takip et, sol tıkla işaretle. Üç hakkın var.',
  prosecutor: 'Savcı izlerini ve haritadaki işaret dairelerini takip et. Doğru kişiyi sol tıkla yakala. Üç hakkın var.',
  criminal: 'Süre bitene kadar yakalanma. Tenhada iz bırakırsın; işaretlenirsen sol tıkla birinin kılığına gir.',
};
const ICON = { detective: '⌕', prosecutor: '⚖', criminal: '◇' };
export const KEYS = {
  detective: 'Sol tık: İşaretle · E: Kutu taşı · F: Çalış',
  prosecutor: 'Sol tık: Yakala · E: Kutu taşı · F: Çalış',
  criminal: 'Sol tık: Kılık değiştir (−1) · X: Ortak cinayet · E: Kutu · F: Çalış',
};
const ENDINGS = {
  capture: ['Kaçacak yer kalmadı.', 'İki suçlu da yakalandı. Kanun tarafı kazandı.'],
  timeout: ['Sır, kasabada kaldı.', 'Süre doldu. Serbest kalan suçlular kazandı.'],
  rights: ['Kelepçeler boşa gitti.', 'Savcıların yakalama hakları tükendi. Suçlular kazandı.'],
  marks: ['İzler soğudu.', 'Dedektiflerin işaret hakları tükendi. Suçlular kazandı.'],
  prosecutors: ['Kanun sustu.', 'İki savcı da öldü. Suçlular kazandı.'],
};
export const objectiveOf = role => OBJECTIVE[role];
const signed = n => (n > 0 ? '+' : '') + n;
const pad = n => String(n).padStart(2, '0');

export function createScreens(root, app, hooks) {
  const $ = s => root.querySelector(s);
  const overlay = $('#overlay'), scores = $('#scores');

  function show(html) {
    overlay.innerHTML = '<div class="dialog">' + html + '</div>';
    overlay.hidden = false;
    hooks.clearInput();
    overlay.querySelector('button')?.focus();
  }
  function close() { app.paused = false; overlay.hidden = true; hooks.clearInput(); hooks.focus(); }

  function scoreTable(reveal) {
    const world = app.world, order = contestants(world).slice().sort((a, b) => world.scores[b.id] - world.scores[a.id]);
    const head = `<tr><th>SIRA / KİŞİ</th>${reveal ? '<th>BU TUR</th>' : ''}${world.history.map((_, i) => `<th>T${i + 1}</th>`).join('')}<th>TOPLAM</th></tr>`;
    const rows = order.map((a, i) => `<tr class="${a.id === 0 ? 'you' : ''}"><td>${i + 1}. ${a.name}${a.id === 0 ? ' · SEN' : ''}</td>${reveal ? `<td>${ROLE[a.role]}</td>` : ''}${world.history.map(h => `<td>${h.points[a.id] ? signed(h.points[a.id]) : '—'}</td>`).join('')}<td><b>${world.scores[a.id]}</b></td></tr>`).join('');
    return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  /** Tur başında rol seçimi: botlar kalan rolleri paylaşır, tur yine 2 suçlu / 6 dedektif / 2 savcıdır. */
  function roleChoice(round) {
    // Seçim modunda Esc ekranı kapatmaz: rol seçilmeden tur başlamaz.
    app.paused = true; app.choosing = true;
    const card = role => `<button class="role-pick" data-role="${role}"><span class="role-icon">${ICON[role]}</span><b>${ROLE[role]}</b><small>${OBJECTIVE[role]}</small></button>`;
    show(`<span class="eyebrow">KARAAĞAÇ DOSYALARI · TUR ${pad(round)} / ${pad(CFG.rounds)}</span><h2>Bu tur kim olacaksın?</h2><p>Kalan rolleri rakiplerin paylaşır. Puanın turlar boyunca birikir.</p><div class="role-picks">${['detective', 'prosecutor', 'criminal'].map(card).join('')}</div>`);
    overlay.querySelectorAll('[data-role]').forEach(b => { b.onclick = () => hooks.pick(b.dataset.role); });
  }

  function roundIntro() {
    app.paused = true; app.spectator = 0;
    const world = app.world, p = world.player, known = [...p.known].map(id => world.actors[id].name).join(', ');
    show(`<span class="eyebrow">KARAAĞAÇ DOSYALARI · TUR ${pad(world.round)} / ${pad(CFG.rounds)}</span><div class="role-icon">${ICON[p.role]}</div><h2>Bu tur ${{ detective: 'dedektifsin', prosecutor: 'savcısın', criminal: 'suçlusun' }[p.role]}.</h2><p>${OBJECTIVE[p.role]}</p><p>Tanıdığın kişiler: <strong>${known || 'Yok'}</strong>.<br>Bu kişiler dünyada yeşil bir halka ile görünür. Diğer herkes bir sır.</p><p class="result-note">${KEYS[p.role]}</p><div class="buttons"><button class="primary" id="beginRound">HİKÂYEYE KARIŞ →</button><button class="secondary" id="introHelp">Kontroller</button></div>`);
    $('#beginRound').onclick = close;
    $('#introHelp').onclick = () => help(roundIntro);
  }

  function help(back = null) {
    const wasPaused = app.paused;
    app.paused = true;
    show(`<span class="eyebrow">KASABADA HAYATTA KALMA REHBERİ</span><h2>Her adım bir iz.</h2><div class="controls"><div><kbd>W A S D</kbd> Hareket</div><div><kbd>SHIFT</kbd> Koş</div><div><kbd>SPACE</kbd> Çift zıpla</div><div><kbd>SAĞ TIK</kbd> Atıl</div><div><kbd>SOL TIK</kbd> Dedektif işaretler · Savcı yakalar · Suçlu kılığa girer</div><div><kbd>E</kbd> Kutuyu al / bırak</div><div><kbd>F</kbd> İş noktasında çalış</div><div><kbd>X</kbd> Suçlu: ortak cinayet hakkı</div><div><kbd>M</kbd> Haritayı büyüt / küçült</div><div><kbd>TAB</kbd> Skor / izleyicide hedef</div><div><kbd>ESC</kbd> Duraklat</div></div><p>Herkes yalnızca çevresindeki daireyi görür. Suçlular arkalarında iki saniye yerde kalan izler bırakır; izler başta 5 saniye arayla ve 5 saniye geriden düşer, tur ilerledikçe ikisi de kısalır. Dedektif izlerini yalnızca dedektifler, savcı izlerini yalnızca savcılar görür. İşaretlenen kişinin bölgesi savcıların haritasına düşer; kılık değiştirince işaret kalkar.</p><p>Beş tur boyunca rolünü sen seçersin, puanların kalır. <b>Kazanmak için en yüksek kişisel skoru topla.</b></p><button class="primary" id="closeHelp">ANLADIM →</button>`);
    $('#closeHelp').onclick = () => {
      if (back) back();
      else { close(); app.paused = wasPaused; if (wasPaused && app.playing) pauseMenu(); }
    };
  }

  function pauseMenu() {
    if (!app.playing) return;
    app.paused = true;
    show(`<span class="eyebrow">ZAMAN SENİ BEKLİYOR</span><h2>Bir nefes arası.</h2><p>Kasaba duraklatıldı.</p><div class="buttons"><button class="primary" id="resume">DEVAM ET →</button><button class="secondary" id="pauseHelp">Kontroller</button><button class="secondary" id="quit">Ana menü</button></div>`);
    $('#resume').onclick = close;
    $('#pauseHelp').onclick = () => help();
    $('#quit').onclick = () => { overlay.hidden = true; hooks.quit(); };
  }

  function showResult() {
    if (app.shownResult) return;
    app.shownResult = true; app.paused = true;
    const world = app.world, final = world.round === CFG.rounds, [title, desc] = ENDINGS[world.result.kind];
    const max = Math.max(...world.scores), winners = contestants(world).filter(a => world.scores[a.id] === max).map(a => a.name).join(', ');
    const note = final ? `${winners} · ${max} puan ${winners.includes(',') ? '· Ortak birincilik' : ''}` : `Bu tur ${signed(world.result.points[0])} puan · Toplam ${world.scores[0]}`;
    show(`<span class="eyebrow">${final ? 'BEŞ DOSYA KAPANDI · MAÇ SONU' : 'DOSYA KAPANDI · TUR ' + world.round}</span><h2>${final ? 'Kasaba seni hatırlayacak.' : title}</h2><p>${desc}</p><p class="result-note">${note}</p>${scoreTable(true)}<div class="buttons"><button class="primary" id="next">${final ? 'YENİ BİR HİKÂYE' : 'SONRAKİ TUR'} →</button></div>`);
    $('#next').onclick = () => (final ? hooks.newMatch() : roleChoice(world.round + 1));
  }

  /** Tab: basılıyken roller gizli skor tablosu; elenmişken izlenen takım arkadaşını değiştirir. */
  function scoreToggle(on) {
    if (!app.playing || app.paused) return;
    const world = app.world;
    if (!active(world.player)) { if (on) app.spectator = spectate(world, app.spectator, true)?.id || 0; return; }
    scores.hidden = !on;
    if (on) scores.innerHTML = '<div class="dialog"><span class="eyebrow">KİŞİSEL SIRALAMA · ROLLER GİZLİ</span><h2>Herkes kendi izinde.</h2>' + scoreTable(false) + '<p>Devam etmek için Tab tuşunu bırak.</p></div>';
  }

  return { roleChoice, roundIntro, help, pauseMenu, showResult, scoreToggle, close, get open() { return !overlay.hidden; } };
}
