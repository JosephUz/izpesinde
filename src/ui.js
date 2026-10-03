import { CFG, ROLE } from './config.js';
import { crateNear } from './crowd.js';
import { circleOf, markBy, marksFor, revealedProsecutors } from './marks.js';
import { dist, visible } from './physics.js';
import { active, contestants, criminals } from './roster.js';
import { objectiveOf } from './screens.js';
import { spectate } from './world.js';

/**
 * Oyun içi arayüz: üst bant (tur, süre, puan), rol kartı, suçlular kutusu, olay günlüğü, bağlam ipucu, eylem çubuğu,
 * dünya etiketleri, savcının kenar okları, işaretli suçlunun kızaran ekran kenarı ve kısa bildirimler.
 *
 * Titreme olmasın diye: içerik yalnızca değişince yazılır (setHTML), olay günlüğü anahtarlıdır (eski girişler yerinde
 * kalır, giriş animasyonu bir kez oynar), etiketler havuzdan gelir ve her karede yalnızca konumları güncellenir.
 * update() ~11 kez/sn, labels() her karede çağrılır.
 */
const USE_LABEL = { detective: 'İşaretle', prosecutor: 'Yakala', criminal: 'Öldür' };
const USE_RANGE = { detective: CFG.markRange, prosecutor: CFG.catchRange, criminal: CFG.reach };
const signed = n => (n > 0 ? '+' : '') + n;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function setHTML(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }

/** Öğe havuzu: etiketler her karede silinip yeniden kurulmaz, var olan span'ler taşınır. */
function pool(root, items) {
  while (root.children.length < items.length) root.append(document.createElement('span'));
  while (root.children.length > items.length) root.lastChild.remove();
  items.forEach((it, i) => {
    const el = root.children[i];
    if (el.className !== it.cls) el.className = it.cls;
    setHTML(el, it.html);
    el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
    if (it.rot !== undefined) el.firstChild.style.transform = `rotate(${it.rot}deg)`;
  });
}

export function createUI(root, app, hooks) {
  const $ = s => root.querySelector(s);
  const els = {
    round: $('#round'), timer: $('#timer'), score: $('#score'), role: $('#role'), objective: $('#objective'), metrics: $('#rolemetrics'),
    clues: $('#clues'), pros: $('#pros'), dets: $('#dets'), status: $('#clueStatus'), log: $('#eventlog'), context: $('#context'), actions: $('#actionbar'),
    alert: $('#alert'), spectator: $('#spectator'), labels: $('#labels'), chase: $('#chase'), toast: $('#toast'),
  };
  let audio = null, toastTimer = 0, lastSound = 0, actionRole = '', contextAt = 0, sight = new Map();
  app.soundOn = false;

  function tone(freq = 440, length = 0.1) {
    if (!app.soundOn) return;
    audio ??= new AudioContext(); audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.045, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + length);
  }

  function toast(text) {
    els.toast.textContent = text; els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2400);
  }

  /** Son 13 saniyenin en fazla 3 olayı; mevcut girişler DOM'da kalır. */
  function eventLog(world) {
    const me = world.player.id, mine = world.events.filter(e => e.to == null || e.to === me);
    const shown = mine.filter(e => world.time - e.time < 13).slice(-3), ids = new Set(shown.map(e => String(e.id)));
    for (const el of [...els.log.children]) if (!ids.has(el.dataset.id)) el.remove();
    const have = new Set([...els.log.children].map(el => el.dataset.id));
    for (const e of shown) {
      if (have.has(String(e.id))) continue;
      const el = document.createElement('div');
      el.className = 'event ' + e.kind; el.dataset.id = e.id; el.innerHTML = e.text;
      els.log.append(el);
    }
    const last = mine.at(-1);
    if (last && last.id !== lastSound) { lastSound = last.id; tone(last.kind === 'danger' ? 150 : 520, 0.16); }
  }

  function actionBar(p) {
    if (actionRole === p.role) return;
    actionRole = p.role;
    const choices = [['SOL', USE_LABEL[p.role], 'use'], ...(p.role === 'criminal' ? [['Q', 'Kılık', 'swap']] : []), ['E', 'Kutu', 'carry'], ['F', 'Çalış', 'blend'], ['SPACE', 'Zıpla', 'jump'], ['SAĞ', 'Atıl', 'dash']];
    els.actions.innerHTML = choices.map(([key, label, type]) => `<button data-action="${type}" title="${label}"><kbd>${key}</kbd><span>${label}</span></button>`).join('');
    els.actions.querySelectorAll('button').forEach(b => { b.onclick = () => (b.dataset.action === 'use' || b.dataset.action === 'swap' ? toast('Hedefi dünyada imleçle seç.') : hooks.command(b.dataset.action)); });
  }

  function metrics(world, p) {
    if (p.role === 'criminal') return `Serbest süre: <b>${clock(world.time)}</b> · dakikası +1<br>Sol tık öldürür · Q kılık (−1)${world.marks.has(p.id) ? '<br><b class="warn">İŞARETLENDİN · KILIK DEĞİŞTİR</b>' : ''}`;
    if (p.role === 'prosecutor') return `Yakalama: <b>sınırsız</b> · yanlışı −1<br>${world.revealed.get(p.id) > world.time ? `<b class="warn">KİMLİĞİN AÇIK · ${Math.ceil(world.revealed.get(p.id) - world.time)} SN</b>` : `Haritadaki işaret: <b>${marksFor(world, p).filter(m => !m.cleared).length}</b>`}`;
    const other = world.marks.size && markBy(world, p.id) === null;
    return `İşaret: <b>sınırsız</b> · yanlışı −1<br>Kasabadaki işaret: <b>${markBy(world, p.id) !== null ? 'Senin' : other ? 'Başkasının' : 'Yok'}</b>`;
  }

  function context(world, p) {
    const hover = app.hover, work = world.env.work.find(w => dist(p, w) < 4);
    if (!active(p)) return '';
    if (hover && p.role === 'criminal') return (dist(p, hover) <= CFG.reach ? '<kbd>SOL TIK</kbd> Öldür · ' : '') + (dist(p, hover) <= CFG.disguiseRange ? '<kbd>Q</kbd> Kılığına gir (−1)' : 'Kılık için yaklaş');
    if (hover) return dist(p, hover) <= USE_RANGE[p.role] ? `<kbd>SOL TIK</kbd> ${USE_LABEL[p.role]}` : `${USE_LABEL[p.role]} için yaklaş`;
    if (p.crate !== null) return '<kbd>E</kbd> Kutuyu bırak';
    if (crateNear(world, p)) return '<kbd>E</kbd> Kutuyu al · Kalabalığa karış';
    if (work) return '<kbd>F</kbd> ' + work.job.replace('yor', '') + ' · Kalabalığa karış';
    return '<kbd>W A S D</kbd> Yürü · <kbd>SHIFT</kbd> Koş';
  }

  return {
    toast, tone,
    update() {
      const world = app.world, p = world.player;
      actionBar(p);
      els.round.textContent = `TUR ${String(world.round).padStart(2, '0')} / ${String(CFG.rounds).padStart(2, '0')}`;
      els.timer.textContent = clock(Math.max(0, Math.ceil(world.seconds - world.time)));
      els.score.textContent = world.scores[p.id] + ' PUAN' + (world.tally[p.id] ? ` · BU TUR ${signed(world.tally[p.id])}` : '');
      els.role.textContent = ROLE[p.role]; els.objective.textContent = objectiveOf(p.role);
      setHTML(els.metrics, metrics(world, p));
      // Çevrim içi kopyada roller gizli: serbest suçlu bayrakları sunucudan gelir.
      const free = world.remote ? world.crim.map(Boolean) : criminals(world).map(active);
      setHTML(els.clues, free.map(f => (f ? '<span title="Serbest">◇</span>' : '<span class="processed" title="Yakalandı">✓</span>')).join(''));
      // Kanun: kaç savcı / dedektif yaşıyor (sıra kimliği ele vermesin diye önce yaşayanlar, sonra ölenler ✗).
      const [pros, dets] = world.remote ? world.law : ['prosecutor', 'detective'].map(r => contestants(world).filter(a => a.role === r && a.alive).length);
      const boxes = (alive, n) => Array.from({ length: n }, (_, i) => (i < alive ? '<span title="Hayatta">◇</span>' : '<span class="dead" title="Öldü">✗</span>')).join('');
      setHTML(els.pros, boxes(pros, 2)); setHTML(els.dets, boxes(dets, 6));
      els.status.textContent = `Serbest suçlu ${free.filter(Boolean).length}/2 · Kasabada işaret ${world.marks.size ? 'var' : 'yok'}`;
      eventLog(world);
      // Kalabalık geçerken ipucu hızla değişmesin: imleçte hedef yoksa her ipucu en az 0,45 sn kalır.
      const hint = context(world, p), now = performance.now();
      if (hint !== els.context._html && (app.hover || !hint || now - contextAt > 450)) { contextAt = now; setHTML(els.context, hint); }
      els.alert.classList.toggle('on', p.role === 'criminal' && world.marks.has(p.id) && active(p));
      for (const type of ['dash', 'use']) {
        const off = type === 'dash' ? p.dashCd > 0 : p.role === 'criminal' ? p.killCd > 0 : false;
        els.actions.querySelector(`[data-action="${type}"]`)?.classList.toggle('cooldown', off);
      }
      els.spectator.hidden = active(p) || app.fateHold;
      if (!active(p)) {
        const t = spectate(world, app.spectator);
        app.spectator = t?.id || 0;
        setHTML(els.spectator, t ? `${p.caught ? 'Yakalandın' : 'Öldürüldün'} · ${esc(t.name)} izleniyor · Tab: kamera değiştir` : 'Bu tur elendin. Olay kamerasından izliyorsun.');
      }
    },
    /** Dünya etiketleri ve savcı okları; görüş hattı yalnızca refreshSight karelerinde yenilenir (pahalı). */
    labels(refreshSight) {
      if (!app.playing) return;
      const world = app.world, p = world.player, eyes = spectate(world, app.spectator) || p;
      const marks = new Map(marksFor(world, p).map(m => [m.target.id, m])), labels = [], arrows = [];
      // Suçlunun gözünde ele verilmiş savcılar da etiketlenir (hedef olsunlar).
      const exposed = new Set(p.role === 'criminal' ? revealedProsecutors(world).map(a => a.id) : []);
      if (refreshSight) sight = new Map(world.actors.filter(a => marks.has(a.id) || p.known.has(a.id) || exposed.has(a.id)).map(a => [a.id, visible(world.env, eyes, a)]));
      for (const a of world.actors) {
        if (a === p || !active(a)) continue;
        const known = p.known.has(a.id), mark = marks.get(a.id), target = exposed.has(a.id);
        if ((!known && !mark && !target) || dist(a, eyes) > CFG.vision) continue;
        const point = app.project(a.x, 3.3 + a.y, a.z);
        if (!point.inside || (!known && !sight.get(a.id))) continue;
        if (target) { labels.push({ cls: 'world-label danger', html: '⚖ SAVCI', x: point.x, y: point.y }); continue; }
        labels.push(mark
          ? { cls: 'world-label ' + (mark.cleared ? 'cleared' : 'mark'), html: mark.cleared ? 'Aklandı' : '◎ İşaretli', x: point.x, y: point.y }
          : { cls: 'world-label', html: ROLE[a.role] + ' · ' + esc(a.name), x: point.x, y: point.y });
      }
      if (p.role === 'prosecutor' && active(p)) {
        for (const m of marks.values()) {
          if (m.cleared || !active(m.target)) continue;
          const q = circleOf(m, m.target), point = app.project(q.x, 0, q.z);
          if (point.inside) continue;
          arrows.push({
            cls: 'arrow', html: `<span style="display:inline-block">▲</span> ${Math.round(dist(p, q))} m`,
            x: Math.max(30, Math.min(innerWidth - 30, point.x)), y: Math.max(85, Math.min(innerHeight - 120, point.y)),
            rot: Math.atan2(point.y - innerHeight / 2, point.x - innerWidth / 2) * 180 / Math.PI + 90,
          });
        }
      }
      pool(els.labels, labels); pool(els.chase, arrows);
    },
    clear() { pool(els.labels, []); pool(els.chase, []); els.alert.classList.remove('on'); actionRole = ''; },
    /** Kovalamaca sürüyor mu: savcının ekran kenarındaki işaret okları görünüyor. Müziğin gerilim sahnesi buna bakar. */
    get kovalamaca() { return els.chase.childElementCount > 0; },
  };
}
